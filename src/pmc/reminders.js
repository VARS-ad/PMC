// ==================== REMINDERS PAGE ====================
// Central view of every upcoming contract expiration the PMC needs to act on:
//   - Resident lease ends (resident_assignments.lease_end)
//   - Vendor maintenance contracts (vendors.contract_end)
//   - Generic contracts (contracts.end_date — insurance, government, utilities, etc.)
//
// A reminder fires when a source's end_date crosses one of four lead-day
// thresholds: 90, 60, 30, 7. The lead-day with the lowest absolute distance
// to today is the "current" one shown. Past-due items keep firing at lead=0.
//
// Reminders can be dismissed ("Mark handled"); the dismissal stores the
// end_date at the time of dismissal (`dismissal_anchor`). If the source's
// end_date later moves (the contract is renewed), the anchor no longer
// matches and future reminders re-open automatically.

// Thresholds shown in priority order (most urgent first).
const REMINDER_LEAD_DAYS = [0, 7, 30, 60, 90];

// Lead-day label + colour for the status badge.
const _leadBadge = (lead) => {
  if (lead === 0)  return { label: 'Overdue',   bg: '#fdf2f1', fg: '#8b4a42' };
  if (lead <= 7)   return { label: 'Urgent',    bg: '#fdf2dc', fg: '#7a5a1f' };
  if (lead <= 30)  return { label: 'Action',    bg: '#fdf2dc', fg: '#7a5a1f' };
  if (lead <= 60)  return { label: 'Planning',  bg: '#E6EAE9', fg: '#61707D' };
  return { label: 'Heads-up', bg: '#E6EAE9', fg: '#61707D' };
};
const _typeBadge = (sourceType) => ({
  lease:    { label: 'Lease',          bg: '#e8edf0', fg: '#3E4C59' },
  vendor:   { label: 'Vendor',         bg: '#f0e8de', fg: '#7a5a1f' },
  contract: { label: 'Contract',       bg: '#e6efe1', fg: '#5a6b4f' },
})[sourceType] || { label: sourceType, bg:'#E6EAE9', fg:'#61707D' };

// Build the reminder set from the three data sources.
const buildReminders = ({ leases, vendors, contracts, dismissals }) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const dayMs = 24 * 60 * 60 * 1000;

  // Index dismissals by (source_type, source_id, lead_days)
  const dismissalIndex = {};
  (dismissals || []).forEach(d => {
    const k = d.source_type + '|' + d.source_id + '|' + d.lead_days;
    // Keep most recent dismissal for the same key
    if (!dismissalIndex[k] || (d.dismissed_at > dismissalIndex[k].dismissed_at)) {
      dismissalIndex[k] = d;
    }
  });

  const reminders = [];
  const pushReminder = (sourceType, sourceId, endDate, payload) => {
    if (!endDate) return;
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return;
    const daysUntilEnd = Math.floor((end.getTime() - today.getTime()) / dayMs);

    // Determine which lead-day window we're currently in.
    // Past-due → lead = 0. Otherwise pick the smallest lead >= daysUntilEnd.
    let lead;
    if (daysUntilEnd < 0) lead = 0;
    else if (daysUntilEnd <= 7)  lead = 7;
    else if (daysUntilEnd <= 30) lead = 30;
    else if (daysUntilEnd <= 60) lead = 60;
    else if (daysUntilEnd <= 90) lead = 90;
    else return; // Outside the reminder window — not actionable yet.

    // If dismissed at the same lead with the same end_date anchor, suppress.
    const k = sourceType + '|' + sourceId + '|' + lead;
    const d = dismissalIndex[k];
    if (d && d.dismissal_anchor === endDate) return;

    reminders.push({
      key:         sourceType + '_' + sourceId + '_' + lead,
      source_type: sourceType,
      source_id:   sourceId,
      end_date:    endDate,
      days_until:  daysUntilEnd,
      lead_days:   lead,
      ...payload,
    });
  };

  (leases || []).forEach(r => {
    // For leases the source_id is the unit_id — unique per active assignment
    // and a valid uuid (the DB column requires uuid).
    pushReminder('lease', r.unit_id, r.lease_end, {
      title:    (r.resident_name || 'Tenant') + ' · ' + (r.unit_number ? 'Unit ' + r.unit_number : 'Unit ?'),
      subtitle: r.building_name || '—',
      meta:     { profile_id: r.profile_id, unit_id: r.unit_id },
    });
  });
  (vendors || []).forEach(v => {
    pushReminder('vendor', v.id, v.contract_end, {
      title:    v.name || 'Vendor',
      subtitle: v.service_category || 'Maintenance contract',
      meta:     { vendor_id: v.id },
    });
  });
  (contracts || []).forEach(c => {
    pushReminder('contract', c.id, c.end_date, {
      title:    c.name || 'Contract',
      subtitle: (c.contract_type || 'Contract') + (c.counterparty ? ' · ' + c.counterparty : ''),
      meta:     { contract_id: c.id, building_id: c.building_id },
    });
  });

  // Sort by days_until ascending (Overdue first, then most urgent).
  reminders.sort((a, b) => a.days_until - b.days_until);
  return reminders;
};

const PMCRemindersPage = ({ setPage }) => {
  const [leases, setLeases]       = useState(null);
  const [vendorsList, setVendorsList] = useState([]);
  const [contractsList, setContractsList] = useState([]);
  const [dismissals, setDismissals] = useState([]);
  const [unitsList, setUnitsList] = useState([]);
  const [buildingsList, setBuildingsList] = useState([]);
  const [error, setError]         = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [dismissTarget, setDismissTarget] = useState(null); // reminder being dismissed
  const [dismissNote, setDismissNote] = useState('');
  // Drill-down state — opening a reminder mounts the matching detail modal.
  const [openUnit, setOpenUnit] = useState(null);         // { unit, building } for lease
  const [openContract, setOpenContract] = useState(null); // contract row for contract

  const reload = async () => {
    setError(null);
    if (!supabaseClient) return;
    try {
      const [{ data: ras }, { data: vs }, { data: cs }, { data: ds }, { data: us }, { data: bs }, { data: profs }] = await Promise.all([
        supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,lease_end').not('lease_end','is',null),
        supabaseClient.from('vendors').select('id,name,service_category,contract_end').not('contract_end','is',null),
        supabaseClient.from('contracts').select('id,name,counterparty,contract_type,end_date,building_id'),
        supabaseClient.from('reminder_dismissals').select('id,source_type,source_id,lead_days,dismissal_anchor,dismissed_at,dismissed_by,note'),
        supabaseClient.from('units').select('id,unit_number,floor,building_id'),
        supabaseClient.from('buildings').select('id,name'),
        supabaseClient.from('profiles').select('id,full_name').eq('role','resident'),
      ]);
      const uMap = Object.fromEntries((us || []).map(u => [u.id, u]));
      const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
      const pMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
      const leasesEnriched = (ras || []).map(r => ({
        ...r,
        resident_name: pMap[r.profile_id]?.full_name || '—',
        unit_number:   uMap[r.unit_id]?.unit_number || '—',
        building_name: uMap[r.unit_id] && bMap[uMap[r.unit_id].building_id] ? bMap[uMap[r.unit_id].building_id].name : '—',
      }));
      setLeases(leasesEnriched);
      setVendorsList(vs || []);
      setContractsList(cs || []);
      setDismissals(ds || []);
      setUnitsList(us || []);
      setBuildingsList(bs || []);
    } catch (e) { setError(e.message || String(e)); }
  };
  useEffect(() => { reload(); }, []);

  const reminders = (leases !== null)
    ? buildReminders({ leases, vendors: vendorsList, contracts: contractsList, dismissals })
    : [];

  const filtered = reminders.filter(r => {
    if (typeFilter !== 'all' && r.source_type !== typeFilter) return false;
    if (leadFilter !== 'all' && r.lead_days !== Number(leadFilter)) return false;
    return true;
  });

  const counts = {
    total:    reminders.length,
    overdue:  reminders.filter(r => r.lead_days === 0).length,
    urgent:   reminders.filter(r => r.lead_days === 7).length,
    action:   reminders.filter(r => r.lead_days === 30).length,
    upcoming: reminders.filter(r => r.lead_days === 60 || r.lead_days === 90).length,
  };

  const openSource = (r) => {
    // Drill straight into the matching record so the user can renew / extend
    // without hunting for it.
    if (r.source_type === 'lease') {
      // source_id is the unit_id. Mount UnitDetailModal scoped to that unit.
      const unit     = (unitsList || []).find(u => u.id === r.source_id);
      const building = unit && (buildingsList || []).find(b => b.id === unit.building_id);
      if (unit && building) {
        setOpenUnit({ unit, building });
        return;
      }
    }
    if (r.source_type === 'contract') {
      const contract = (contractsList || []).find(c => c.id === r.source_id);
      if (contract) {
        setOpenContract(contract);
        return;
      }
    }
    if (r.source_type === 'vendor' && setPage) {
      // No global vendor modal — fall back to the Vendors page with a hint
      // pinned to localStorage so the page can highlight the row when it mounts
      // (read by vendors.js).
      try { localStorage.setItem('varspm_open_vendor', r.source_id); } catch (_) {}
      setPage('vendors');
      return;
    }
  };

  const submitDismiss = async () => {
    const r = dismissTarget;
    if (!r || !supabaseClient) { setDismissTarget(null); return; }
    const { data: u } = await supabaseClient.auth.getUser();
    const { error: e } = await supabaseClient.from('reminder_dismissals').insert([{
      source_type:      r.source_type,
      source_id:        r.source_id,            // unit_id for leases, vendor_id for vendors, contract_id for contracts
      lead_days:        r.lead_days,
      dismissal_anchor: r.end_date,             // when end_date later changes, this no longer matches → reminder re-opens
      dismissed_by:     u?.user?.id || null,
      note:             dismissNote || null,
    }]);
    if (e) { setError(e.message); }
    setDismissTarget(null); setDismissNote('');
    reload();
  };

  const fmtRemain = (d) => d < 0
    ? Math.abs(d) + ' days overdue'
    : d === 0 ? 'Due today' : d + ' day' + (d === 1 ? '' : 's') + ' remaining';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reminders</h1>
          <div className="modal-sub" style={{marginTop:4,fontSize:12,color:'var(--text-muted)'}}>
            Contracts and leases approaching their expiration date. Mark handled once renewed or actioned.
          </div>
        </div>
        <div className="btn-group">
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
      </div>

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))'}}>
        <div className="kpi-card"><div className="label">Total open</div><div className="value">{counts.total}</div></div>
        <div className="kpi-card"><div className="label">Overdue</div><div className="value" style={{color:'#8b4a42'}}>{counts.overdue}</div></div>
        <div className="kpi-card" title="Due within 7 days"><div className="label">Urgent (≤7d)</div><div className="value" style={{color:'#7a5a1f'}}>{counts.urgent}</div></div>
        <div className="kpi-card" title="Due within 30 days"><div className="label">Action (≤30d)</div><div className="value" style={{color:'#a07d3c'}}>{counts.action}</div></div>
        <div className="kpi-card" title="Due in 60 or 90 days"><div className="label">Upcoming</div><div className="value" style={{color:'#61707D'}}>{counts.upcoming}</div></div>
      </div>

      <div className="card">
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',marginBottom:14}}>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Type</label>
            <select className="form-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              <option value="lease">Leases</option>
              <option value="vendor">Vendors</option>
              <option value="contract">Contracts</option>
            </select>
          </div>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Window</label>
            <select className="form-input" value={leadFilter} onChange={e => setLeadFilter(e.target.value)}>
              <option value="all">All windows</option>
              <option value="0">Overdue</option>
              <option value="7">Urgent (≤7d)</option>
              <option value="30">Action (≤30d)</option>
              <option value="60">Planning (≤60d)</option>
              <option value="90">Heads-up (≤90d)</option>
            </select>
          </div>
          <button className="btn btn-sm" onClick={() => { setTypeFilter('all'); setLeadFilter('all'); }}>Clear</button>
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {leases === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>
            {reminders.length === 0
              ? 'Nothing expiring in the next 90 days ✓'
              : 'No reminders match the current filters.'}
          </div>
        ) : (
          <table className="data-table" style={{fontSize:13}}>
            <thead>
              <tr>
                <th style={{width:'8%'}}>Type</th>
                <th style={{width:'26%'}}>What</th>
                <th style={{width:'18%'}}>Context</th>
                <th style={{width:'10%'}}>Expires</th>
                <th style={{width:'14%'}}>Remaining</th>
                <th style={{width:'10%'}}>Window</th>
                <th style={{width:'14%',textAlign:'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const tb = _typeBadge(r.source_type);
                const lb = _leadBadge(r.lead_days);
                const remColor = r.lead_days === 0 ? '#8b4a42' : r.lead_days <= 7 ? '#7a5a1f' : 'var(--text-dark)';
                return (
                  <tr key={r.key}>
                    <td><span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:tb.bg,color:tb.fg,whiteSpace:'nowrap'}}>{tb.label}</span></td>
                    <td style={{fontWeight:500}}>{r.title}</td>
                    <td style={{color:'var(--text-secondary)'}}>{r.subtitle}</td>
                    <td style={{whiteSpace:'nowrap'}}>{r.end_date}</td>
                    <td style={{whiteSpace:'nowrap',color:remColor,fontWeight:500}}>{fmtRemain(r.days_until)}</td>
                    <td style={{whiteSpace:'nowrap'}}><span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:lb.bg,color:lb.fg}}>{lb.label}</span></td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                      <button className="btn btn-sm" style={{padding:'4px 10px',fontSize:11}} onClick={() => openSource(r)} title="Open the source record">Open</button>
                      <button className="btn btn-sm" style={{marginLeft:6,padding:'4px 10px',fontSize:11}} onClick={() => setDismissTarget(r)} title="Mark this reminder as handled">Handled</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openUnit && (
        <UnitDetailModal unit={openUnit.unit} building={openUnit.building} onClose={() => setOpenUnit(null)}/>
      )}
      {openContract && (
        <ContractDetailModal contract={openContract} onClose={() => setOpenContract(null)}/>
      )}

      {dismissTarget && (
        <div className="modal-overlay" onClick={() => setDismissTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:480}}>
            <div className="modal-header">
              <div>
                <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Mark Handled</div>
                <h2 style={{fontSize:17}}>{dismissTarget.title}</h2>
                <div className="modal-sub">{dismissTarget.subtitle} · expires {dismissTarget.end_date}</div>
              </div>
              <button className="modal-close" onClick={() => setDismissTarget(null)}>×</button>
            </div>
            <div style={{padding:'4px 0 14px',fontSize:13,color:'var(--text-secondary)'}}>
              This will suppress the reminder for this contract. If the end date changes later (renewal), the reminder will re-open automatically.
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Note (optional)</label>
              <textarea className="form-input" rows={3} placeholder="e.g. Renewal agreed verbally, signing next week" value={dismissNote} onChange={e => setDismissNote(e.target.value)}/>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn btn-sm" onClick={() => setDismissTarget(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submitDismiss}>Mark handled</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
