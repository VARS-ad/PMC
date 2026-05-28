// ==================== PMC PROPERTIES PAGE ====================
// Grouped into three sections (Residential, Commercial, Villas) driven
// by the `property_type` column on `buildings`. Each card aggregates:
// units count · occupancy (subline) · billed · collected · outstanding · open SRs.
// Commercial cards additionally show monthly run-rate.
// Click the building header → BuildingDetailModal (reused from Profile Creation).
// Click a KPI tile → BuildingDrillModal scoped to that data type.

// Same Pending/Upcoming/Overdue rule used in Unit modal + Service Charges.
// Hoisted to module scope so the property-card aggregates can use it too,
// not just the drill modal.
const _PROPERTIES_DAY_MS = 24 * 60 * 60 * 1000;
const propertiesEffectiveStatus = (i, nowMs) => {
  if (!i) return 'Pending';
  if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
  if (!i.due_date) return i.status;
  const due = new Date(i.due_date);
  if (isNaN(due.getTime())) return i.status;
  const daysUntilDue = Math.floor((due.getTime() - nowMs) / _PROPERTIES_DAY_MS);
  if (daysUntilDue < 0)  return 'Overdue';
  if (daysUntilDue > 30) return 'Upcoming';
  return 'Pending';
};

// ---- BuildingDrillModal ----------------------------------------------------
// Opens when a KPI tile on a building card is clicked. Shows the underlying
// rows (invoices or service requests) filtered by the picked status, with a
// link out to the full Service Charges / Service Requests page if the user
// needs more controls.
const BuildingDrillModal = ({ building, view, onClose, setPage }) => {
  const now = Date.now();
  const effectiveStatusOf = (i) => propertiesEffectiveStatus(i, now);
  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();

  // Keep a local copy of the invoices so the Mark-as-Paid event can
  // re-bucket rows immediately without us having to lift state up to
  // the parent page.
  const [localInvoices, setLocalInvoices] = useState(building.invoices || []);
  useEffect(() => { setLocalInvoices(building.invoices || []); }, [building.id]);
  useEffect(() => {
    const handler = (e) => {
      const { invoice_id, new_status } = (e && e.detail) || {};
      if (!invoice_id) return;
      setLocalInvoices(prev => (prev || []).map(i => i.id === invoice_id ? { ...i, status: new_status } : i));
    };
    window.addEventListener('vars:invoice-status-changed', handler);
    return () => window.removeEventListener('vars:invoice-status-changed', handler);
  }, []);

  const VIEWS = {
    invoices:    { label: 'Total Billed',  page: 'payment', kind: 'invoices' },
    collected:   { label: 'Collected',     page: 'payment', kind: 'invoices' },
    outstanding: { label: 'Outstanding',   page: 'payment', kind: 'invoices' },
    upcoming:    { label: 'Upcoming',      page: 'payment', kind: 'invoices' },
    srs:         { label: 'Open Service Requests', page: 'service', kind: 'srs' },
    tenants:     { label: 'Tenants',       page: 'profileCreation', kind: 'tenants' },
  };
  const v = VIEWS[view] || VIEWS.invoices;

  let rows = [];
  if (v.kind === 'invoices') {
    rows = (localInvoices || []).map(i => ({ ...i, effective_status: effectiveStatusOf(i) }));
    if (view === 'collected')   rows = rows.filter(r => r.effective_status === 'Paid');
    if (view === 'outstanding') rows = rows.filter(r => r.effective_status === 'Pending' || r.effective_status === 'Overdue');
    if (view === 'upcoming')    rows = rows.filter(r => r.effective_status === 'Upcoming');
  } else if (v.kind === 'srs') {
    rows = (building.srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status));
  } else if (v.kind === 'tenants') {
    rows = (building.tenants || []);
  }

  const total = v.kind === 'invoices'
    ? rows.reduce((s, r) => s + Number(r.amount_aed || 0), 0)
    : null;

  const statusStyles = {
    'Paid':     { bg:'#e6efe1', fg:'#5a6b4f' },
    'Pending':  { bg:'#fdf2dc', fg:'#7a5a1f' },
    'Overdue':  { bg:'#fdf2f1', fg:'#8b4a42' },
    'Upcoming': { bg:'#E6EAE9', fg:'#61707D' },
    'Cancelled':{ bg:'#E6EAE9', fg:'#61707D' },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:1100,maxHeight:'88vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{v.label}</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">
              {rows.length} {v.kind === 'srs' ? (rows.length === 1 ? 'request' : 'requests') : (v.kind === 'tenants' ? (rows.length === 1 ? 'tenant' : 'tenants') : (rows.length === 1 ? 'invoice' : 'invoices'))}
              {total != null && ' · ' + fmt(total)}
            </div>
          </div>
          <div className="btn-group">
            {setPage && (
              <button className="btn btn-sm" onClick={() => { onClose(); setPage(v.page); }}>
                View in {v.page === 'payment' ? 'Service Charges' : v.page === 'service' ? 'Service Requests' : 'Profile Creation'} →
              </button>
            )}
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>
            {v.kind === 'srs' ? 'No open service requests for this building ✓'
             : v.kind === 'tenants' ? 'No tenants in this building yet.'
             : 'No matching invoices for this building ✓'}
          </div>
        ) : v.kind === 'srs' ? (
          <table className="data-table" style={{fontSize:12}}>
            <thead>
              <tr>
                <th style={{width:'18%'}}>Category</th>
                <th style={{width:'36%'}}>Description</th>
                <th style={{width:'14%'}}>Resident</th>
                <th style={{width:'10%'}}>Unit</th>
                <th style={{width:'10%'}}>Priority</th>
                <th style={{width:'12%'}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td style={{fontWeight:500}}>{s.category}</td>
                  <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.description}>{s.description}</td>
                  <td>{s.resident_name}</td>
                  <td>{s.unit_number}</td>
                  <td>{s.priority}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : v.kind === 'tenants' ? (
          <table className="data-table" style={{fontSize:12}}>
            <thead>
              <tr>
                <th style={{width:'30%'}}>Resident</th>
                <th style={{width:'12%'}}>Unit</th>
                <th style={{width:'8%'}}>Floor</th>
                <th style={{width:'14%'}}>Tenure</th>
                <th style={{width:'18%',textAlign:'right'}}>Monthly</th>
                <th style={{width:'18%'}}>Lease</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.profile_id + '_' + t.unit_id}>
                  <td style={{fontWeight:500}}>{t.resident_name}</td>
                  <td>{t.unit_number}</td>
                  <td>{t.floor ?? '—'}</td>
                  <td>{t.tenure}</td>
                  <td style={{textAlign:'right'}}>{t.monthly_payment_aed ? fmt(t.monthly_payment_aed) : '—'}</td>
                  <td>{t.lease_start ? (t.lease_start + ' → ' + (t.lease_end || '…')) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="data-table" style={{fontSize:12}}>
            <thead>
              <tr>
                <th style={{width:'12%'}}>Invoice #</th>
                <th style={{width:'22%'}}>Description</th>
                <th style={{width:'15%'}}>Resident</th>
                <th style={{width:'8%'}}>Unit</th>
                <th style={{width:'10%'}}>Due</th>
                <th style={{width:'9%'}}>Status</th>
                <th style={{width:'7%',textAlign:'center'}}>Invoice</th>
                <th style={{width:'10%',textAlign:'center'}}>Proof of payment</th>
                <th style={{width:'12%',textAlign:'right'}}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(i => {
                const c = statusStyles[i.effective_status] || { bg:'#E6EAE9', fg:'#61707D' };
                return (
                  <tr key={i.id}>
                    <td style={{fontWeight:500}}>{i.invoice_number || '—'}</td>
                    <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                    <td>{i.resident_name}</td>
                    <td>{i.unit_number}</td>
                    <td style={{whiteSpace:'nowrap'}}>{i.due_date || '—'}</td>
                    <td style={{whiteSpace:'nowrap'}}>
                      <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:c.bg,color:c.fg,whiteSpace:'nowrap'}}>
                        {i.effective_status}
                      </span>
                    </td>
                    <InvoiceSlotCell invoice={i} slot="invoice"/>
                    <InvoiceSlotCell invoice={i} slot="payment_proof"/>
                    <td style={{textAlign:'right',fontWeight:600,whiteSpace:'nowrap'}}>{fmt(i.amount_aed)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const PMCPropertiesPage = ({ setPage }) => {
  const { selectedProperties = [] } = useApp();
  const [buildings, setBuildings] = useState(null);
  const [error, setError] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [drill, setDrill] = useState(null); // { building, view }
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    let mounted = true;
    setBuildings(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const [{ data: bs }, { data: units }, { data: ras }, { data: invoices }, { data: srs }, { data: profiles }] = await Promise.all([
          supabaseClient.from('buildings').select('id,name,address,notes,property_type,created_at').order('name'),
          supabaseClient.from('units').select('id,building_id,floor,unit_number'),
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start'),
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,source_type,unit_id,resident_profile_id,created_at'),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,unit_id,resident_profile_id,preferred_date'),
          supabaseClient.from('profiles').select('id,full_name,phone'),
        ]);
        if (!mounted) return;
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const result = (bs || []).filter(b => !filterB || filterB.includes(b.id)).map(b => {
          const bUnits = (units || []).filter(u => u.building_id === b.id);
          const unitMap = Object.fromEntries(bUnits.map(u => [u.id, u]));
          const unitIds = bUnits.map(u => u.id);
          const occupied = (ras || [])
            .filter(r => unitIds.includes(r.unit_id))
            .map(r => ({
              ...r,
              resident_name: profileMap[r.profile_id]?.full_name || '—',
              resident_phone: profileMap[r.profile_id]?.phone || null,
              unit_number: unitMap[r.unit_id]?.unit_number || '—',
              floor: unitMap[r.unit_id]?.floor ?? null,
            }));
          const tenants = occupied.filter(o => o.tenure === 'Tenant');
          const monthlyRev = tenants.reduce((s, t) => s + Number(t.monthly_payment_aed || 0), 0);
          const _nowMs = Date.now();
          const bInvoices = (invoices || [])
            .filter(i => unitIds.includes(i.unit_id))
            .map(i => ({
              ...i,
              resident_name: i.resident_profile_id && profileMap[i.resident_profile_id] ? profileMap[i.resident_profile_id].full_name : '—',
              unit_number: unitMap[i.unit_id]?.unit_number || '—',
              effective_status: propertiesEffectiveStatus(i, _nowMs),
            }));
          const collected   = bInvoices.filter(i => i.effective_status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
          const outstanding = bInvoices.filter(i => i.effective_status === 'Pending' || i.effective_status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
          const upcoming    = bInvoices.filter(i => i.effective_status === 'Upcoming').reduce((s, i) => s + Number(i.amount_aed), 0);
          const bSRs = (srs || [])
            .filter(s => unitIds.includes(s.unit_id))
            .map(s => ({
              ...s,
              resident_name: s.resident_profile_id && profileMap[s.resident_profile_id] ? profileMap[s.resident_profile_id].full_name : '—',
              unit_number: unitMap[s.unit_id]?.unit_number || '—',
            }));
          const openSRs = bSRs.filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).length;
          return {
            ...b,
            units: bUnits,
            assignments: occupied, // alias for residents
            tenants, // resident_assignments filtered to Tenant
            invoices: bInvoices,
            srs: bSRs,
            unitCount: bUnits.length, occupiedCount: occupied.length,
            monthlyRev, collected, outstanding, upcoming, openSRs, totalSRs: bSRs.length,
          };
        });
        setBuildings(result);
      } catch (e) { if (mounted) setError(String(e.message || e)); }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Properties</h1>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!buildings || buildings.length === 0}>Download Data</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id:           'buildings',
            label:        'Buildings',
            title:        'Buildings',
            sheetName:    'Buildings',
            filenameBase: 'buildings',
            rows:         buildings || [],
            columns: [
              { key: 'name',           header: 'Building',      width: 28 },
              { key: 'address',        header: 'Address',       width: 36 },
              { key: 'property_type',  header: 'Type',          width: 12 },
              { key: 'unitCount',      header: 'Units',         width: 8,  halign: 'right', numeric: true },
              { key: 'occupiedCount',  header: 'Occupied',      width: 10, halign: 'right', numeric: true },
              { key: 'monthlyRev',     header: 'Monthly Rev (AED)',  width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.monthlyRev || 0) },
              { key: 'collected',      header: 'Collected (AED)',    width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.collected || 0) },
              { key: 'outstanding',    header: 'Outstanding (AED)',  width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.outstanding || 0) },
              { key: 'openSRs',        header: 'Open SRs',      width: 10, halign: 'right', numeric: true },
              { key: 'totalSRs',       header: 'Total SRs',     width: 10, halign: 'right', numeric: true },
              { key: 'notes',          header: 'Notes',         width: 30 },
            ],
            extraMetadata: {
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Total Buildings': String((buildings || []).length),
            },
          },
          {
            id:           'tenants',
            label:        'Tenants',
            title:        'Tenants',
            sheetName:    'Tenants',
            filenameBase: 'tenants',
            dateField:    'lease_start',
            rows: (buildings || []).flatMap(b => (b.assignments || []).map(a => ({
              ...a,
              building_name: b.name,
            }))),
            columns: [
              { key: 'resident_name',       header: 'Resident',          width: 26 },
              { key: 'resident_phone',      header: 'Phone',             width: 18 },
              { key: 'building_name',       header: 'Building',          width: 24 },
              { key: 'unit_number',         header: 'Unit',              width: 10 },
              { key: 'floor',               header: 'Floor',             width: 8,  halign: 'right', numeric: true },
              { key: 'tenure',              header: 'Tenure',            width: 10 },
              { key: 'monthly_payment_aed', header: 'Monthly (AED)',     width: 14, halign: 'right', numeric: true },
              { key: 'lease_start',         header: 'Lease Start',       width: 12 },
              { key: 'lease_end',           header: 'Lease End',         width: 12 },
              { key: 'ownership_start',     header: 'Ownership Start',   width: 14 },
            ],
            extraMetadata: {
              'Property Filter':  selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
            },
          },
        ]}
      />

      {error && <div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div>}
      {buildings === null ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : buildings.length === 0 ? (
        <div className="card"><div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No buildings in your portfolio yet. Add some via <strong>Profile Creation → Buildings</strong>.</div></div>
      ) : (() => {
          // Shared eyebrow header style (mirrors pmc-overview.js groupEyebrow)
          const sectionEyebrow = { fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-secondary)', fontWeight:600 };

          // Render a single building card. `kind` controls whether
          // Commercial gets the extra Monthly Run-Rate column (6 cards
          // instead of 5).
          const renderBuildingCard = (b, kind) => {
            const occupancyPct = b.unitCount > 0 ? Math.round((b.occupiedCount / b.unitCount) * 100) : 0;
            const totalBilled = b.collected + b.outstanding + b.upcoming;
            const open = () => setSelectedBuilding(b);
            const isCommercial = kind === 'Commercial';
            const cols = isCommercial ? 6 : 5;
            return (
              <div key={b.id} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={open}>
                    <div style={{fontSize:18,fontWeight:600,color:'var(--text-dark)'}}>{b.name}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{b.address || '—'}</div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:`repeat(${cols}, minmax(0, 1fr))`,gap:8,marginTop:14}}>
                  {/* Custom Units stat: value · % occupied subline · existing hint.
                      Mirrors PMCStat styling so it lines up with the rest. */}
                  <div
                    onClick={(e) => { e.stopPropagation(); open(); }}
                    style={{padding:'12px 14px',background:'var(--bg-surface)',borderRadius:6,border:'1px solid var(--border-light)',cursor:'pointer',transition:'background 0.15s, border-color 0.15s'}}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-warm-light)'; e.currentTarget.style.borderColor = 'var(--accent-warm)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                  >
                    <div style={{fontSize:10,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Units</div>
                    <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)'}}>{b.unitCount}</div>
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{occupancyPct}% occupied</div>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>View floors & units</div>
                  </div>
                  {isCommercial && (
                    <PMCStat label="Monthly Run-Rate"  value={'AED ' + Math.round(b.monthlyRev).toLocaleString()}          onClick={() => setDrill({ building: b, view: 'tenants' })}        hint="Tenants + lease rates"/>
                  )}
                  <PMCStat label="Total Billed"      value={'AED ' + Math.round(totalBilled).toLocaleString()}           onClick={() => setDrill({ building: b, view: 'invoices' })}       hint="All invoices for this building"/>
                  <PMCStat label="Collected"         value={'AED ' + Math.round(b.collected).toLocaleString()}           onClick={() => setDrill({ building: b, view: 'collected' })}      color="#5a6b4f" hint="Paid invoices only"/>
                  <PMCStat label="Outstanding"       value={'AED ' + Math.round(b.outstanding).toLocaleString()}         onClick={() => setDrill({ building: b, view: 'outstanding' })}    color={b.outstanding > 0 ? '#8b4a42' : null} hint="Pending + Overdue"/>
                  <PMCStat label="Upcoming"          value={'AED ' + Math.round(b.upcoming).toLocaleString()}            onClick={() => setDrill({ building: b, view: 'upcoming' })}       color={b.upcoming > 0 ? '#a07d3c' : null} hint="Due more than 30 days out"/>
                  <PMCStat label="Open SRs"          value={b.openSRs + ' open · ' + b.totalSRs + ' total'}              onClick={() => setDrill({ building: b, view: 'srs' })}            hint="Service requests for this building"/>
                </div>
              </div>
            );
          };

          // Section block: eyebrow + count subline + cards (or empty state).
          const renderSection = (label, kind, list) => (
            <div style={{marginBottom:32}}>
              <div style={{...sectionEyebrow, marginBottom:4}}>{label}</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14}}>
                {list.length} {list.length === 1 ? 'building' : 'buildings'}
              </div>
              {list.length === 0 ? (
                <div className="card"><div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No {label.toLowerCase()} buildings yet. Add via <strong>Profile Creation → Buildings</strong>.</div></div>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18}}>
                  {list.map(b => renderBuildingCard(b, kind))}
                </div>
              )}
            </div>
          );

          const residential = buildings.filter(b => b.property_type === 'Residential');
          const commercial  = buildings.filter(b => b.property_type === 'Commercial');
          const villas      = buildings.filter(b => b.property_type === 'Villa');

          return (
            <>
              {renderSection('Residential', 'Residential', residential)}
              {renderSection('Commercial',  'Commercial',  commercial)}
              {renderSection('Villas',      'Villa',       villas)}
            </>
          );
        })()
      }

      {selectedBuilding && <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)}/>}
      {drill && <BuildingDrillModal building={drill.building} view={drill.view} setPage={setPage} onClose={() => setDrill(null)}/>}
    </div>
  );
};

