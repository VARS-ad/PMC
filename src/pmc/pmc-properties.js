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
// Display labels follow the Operating Income vocabulary used everywhere:
// past due → 'Pending', within 30d → 'Upcoming', >30d → 'Future'.
const propertiesEffectiveStatus = (i, nowMs) => {
  if (!i) return 'Upcoming';
  if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
  if (!i.due_date) return i.status;
  const due = new Date(i.due_date);
  if (isNaN(due.getTime())) return i.status;
  const daysUntilDue = Math.floor((due.getTime() - nowMs) / _PROPERTIES_DAY_MS);
  if (daysUntilDue < 0)  return 'Pending';   // past due
  if (daysUntilDue > 30) return 'Future';    // beyond 30 days
  return 'Upcoming';                          // within next 30 days
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
    pending:     { label: 'Pending',       page: 'payment', kind: 'invoices' },
    upcoming:    { label: 'Upcoming',      page: 'payment', kind: 'invoices' },
    future:      { label: 'Future',        page: 'payment', kind: 'invoices' },
    srs:         { label: 'Open Service Requests', page: 'service', kind: 'srs' },
    tenants:     { label: 'Tenants',       page: 'profileCreation', kind: 'tenants' },
  };
  const v = VIEWS[view] || VIEWS.invoices;

  let rows = [];
  if (v.kind === 'invoices') {
    rows = (localInvoices || []).map(i => ({ ...i, effective_status: effectiveStatusOf(i) }));
    if (view === 'collected') rows = rows.filter(r => r.effective_status === 'Paid');
    if (view === 'pending')   rows = rows.filter(r => r.effective_status === 'Pending');
    if (view === 'upcoming')  rows = rows.filter(r => r.effective_status === 'Upcoming');
    if (view === 'future')    rows = rows.filter(r => r.effective_status === 'Future');
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
    'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },  // past due
    'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },  // within 30 days
    'Future':   { bg:'#E6EAE9', fg:'#61707D' },  // beyond 30 days
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
  const { selectedProperties = [], timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd } = useApp();
  const [buildings, setBuildings] = useState(null);
  const [error, setError] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [drill, setDrill] = useState(null); // { building, view }
  const [showDownload, setShowDownload] = useState(false);
  // Inner tab selector — the four asset types used to stack; now they
  // sit behind tabs so the user can focus on one type at a time.
  // sessionStorage hand-off from Overview lets a click on a type-level
  // KPI land directly on that tab.
  const [activeAssetType, setActiveAssetType] = useState(() => {
    try {
      const fromOverview = sessionStorage.getItem('vars:scroll-to-asset-type');
      if (fromOverview) {
        sessionStorage.removeItem('vars:scroll-to-asset-type');
        if (['Residential','Commercial','Villa','Commercial Land'].includes(fromOverview)) return fromOverview;
      }
    } catch (_) {}
    return 'Residential';
  });
  const monthsBack = ({ '1m': 1, '2m': 2, '3m': 3, '12m': 12 })[timeRange] || 1;

  // Same period bounds as Overview / Service Charges.
  const periodBounds = (() => {
    if (timeRange === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    const _now = new Date();
    const start = new Date(_now.getFullYear(), _now.getMonth() - monthsBack + 1, 1).toISOString().slice(0, 10);
    const end   = _now.toISOString().slice(0, 10);
    return { start, end };
  })();

  const explicitRange = (() => {
    const fmtDay = (d, withYear) => {
      const day = d.getDate();
      const mon = d.toLocaleString('en-GB', { month: 'long' });
      return withYear ? (day + ' ' + mon + ' ' + d.getFullYear()) : (day + ' ' + mon);
    };
    let start, end;
    if (timeRange === 'custom') {
      if (!customStart || !customEnd) return 'Pick start and end dates';
      start = new Date(customStart);
      end   = new Date(customEnd);
    } else {
      const _now = new Date();
      start = new Date(_now.getFullYear(), _now.getMonth() - monthsBack + 1, 1);
      end   = _now;
    }
    const sameYear = start.getFullYear() === end.getFullYear();
    return fmtDay(start, !sameYear) + ' – ' + fmtDay(end, true);
  })();

  useEffect(() => {
    let mounted = true;
    setBuildings(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const [{ data: bs }, { data: units }, { data: ras }, { data: invoices }, { data: srs }, { data: profiles }] = await Promise.all([
          supabaseClient.from('buildings').select('id,name,address,notes,property_type,created_at,purchase_price,current_value,acquired_on').order('name'),
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
            // Honour the shared time range. Same created_at rule the
            // Overview and Service Charges pages use.
            .filter(i => {
              const issued = (i.created_at || '').slice(0, 10);
              return issued && issued >= periodBounds.start && issued <= periodBounds.end;
            })
            .map(i => ({
              ...i,
              resident_name: i.resident_profile_id && profileMap[i.resident_profile_id] ? profileMap[i.resident_profile_id].full_name : '—',
              unit_number: unitMap[i.unit_id]?.unit_number || '—',
              effective_status: propertiesEffectiveStatus(i, _nowMs),
            }));
          const collected = bInvoices.filter(i => i.effective_status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
          const pending   = bInvoices.filter(i => i.effective_status === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);   // past due
          const upcoming  = bInvoices.filter(i => i.effective_status === 'Upcoming').reduce((s, i) => s + Number(i.amount_aed), 0);  // within 30 days
          const future    = bInvoices.filter(i => i.effective_status === 'Future').reduce((s, i) => s + Number(i.amount_aed), 0);    // beyond 30 days
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
            monthlyRev, collected, pending, upcoming, future, openSRs, totalSRs: bSRs.length,
          };
        });
        setBuildings(result);
        // If the user clicked an asset card on Overview, sessionStorage
        // carries its id — scroll it into view + briefly highlight so
        // they land on the right card without hunting.
        try {
          const scrollId = sessionStorage.getItem('vars:scroll-to-asset');
          if (scrollId) {
            sessionStorage.removeItem('vars:scroll-to-asset');
            setTimeout(() => {
              const el = document.querySelector('[data-asset-id="' + scrollId + '"]');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                el.style.transition = 'box-shadow 0.4s ease, transform 0.4s ease';
                el.style.boxShadow = '0 0 0 3px rgba(160, 125, 60, 0.45)';
                setTimeout(() => { el.style.boxShadow = 'none'; }, 1800);
              }
            }, 200);
          }
        } catch (_) {}
      } catch (e) { if (mounted) setError(String(e.message || e)); }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(','), timeRange, customStart, customEnd]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Assets</h1>
          <div style={{marginTop:6,fontSize:14,color:'var(--text-secondary)',fontWeight:500,letterSpacing:'-0.01em'}}>
            {explicitRange}
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <TimeRangePicker/>
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
              { key: 'collected', header: 'Collected (AED)', width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.collected || 0) },
              { key: 'pending',   header: 'Pending (AED)',   width: 14, halign: 'right', numeric: true,
                value: (r) => Math.round(r.pending || 0) },
              { key: 'upcoming',  header: 'Upcoming (AED)',  width: 14, halign: 'right', numeric: true,
                value: (r) => Math.round(r.upcoming || 0) },
              { key: 'future',    header: 'Future (AED)',    width: 14, halign: 'right', numeric: true,
                value: (r) => Math.round(r.future || 0) },
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
          // Section heading sits between page-title and card-titles in the
          // hierarchy: bigger than the 11px eyebrow it used to be, so the
          // boundary between Residential / Commercial / Villas / Plots is
          // visually obvious when scrolling the Assets page.
          const sectionEyebrow = { fontSize:18, letterSpacing:'0.04em', textTransform:'uppercase', color:'var(--text-dark)', fontWeight:700 };

          // Render a single building card. `kind` controls whether
          // Commercial gets the extra Monthly Run-Rate column (6 cards
          // instead of 5).
          const renderBuildingCard = (b, kind) => {
            const occupancyPct = b.unitCount > 0 ? Math.round((b.occupiedCount / b.unitCount) * 100) : 0;
            const totalBilled = b.collected + b.pending + b.upcoming + b.future;
            const open = () => setSelectedBuilding(b);
            const isCommercial = kind === 'Commercial';
            const cols = isCommercial ? 7 : 6;
            // Per-asset "Needs your attention" list. Mirrors the page-level
            // attention bar (overview eyebrow) but scoped to this building
            // so the user sees the urgent items without scanning the KPIs.
            const todayIso = new Date().toISOString().slice(0, 10);
            const cutoff60Iso = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
            const overdueInvoices = (b.invoices || []).filter(i => i.effective_status === 'Pending');
            const bOverdue = overdueInvoices.length;
            const bOverdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.amount_aed || 0), 0);
            const bExpiringLeases = (b.tenants || []).filter(t => t.lease_end && t.lease_end >= todayIso && t.lease_end <= cutoff60Iso).length;
            const bVacant = Math.max(0, b.unitCount - b.occupiedCount);
            const bUrgentSRs = (b.srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status) && ['High','Urgent'].includes(s.priority)).length;
            const attentionItems = [];
            if (bOverdue > 0) attentionItems.push({ color:'#8b4a42', text: bOverdue + ' overdue tenant' + (bOverdue === 1 ? '' : 's') + ' · AED ' + Math.round(bOverdueTotal).toLocaleString() + ' at risk' });
            if (bUrgentSRs > 0) attentionItems.push({ color:'#8b4a42', text: bUrgentSRs + ' high-priority service request' + (bUrgentSRs === 1 ? '' : 's') + ' open' });
            if (bExpiringLeases > 0) attentionItems.push({ color:'#a07d3c', text: bExpiringLeases + ' lease' + (bExpiringLeases === 1 ? '' : 's') + ' expiring within 60 days' });
            if (bVacant > 0) attentionItems.push({ color:'#a07d3c', text: bVacant + ' vacant unit' + (bVacant === 1 ? '' : 's') });
            return (
              <div key={b.id} className="card" data-asset-id={b.id}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={open}>
                    <div style={{fontSize:20,fontWeight:500,color:'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1.15}}>{b.name}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{b.address || '—'}</div>
                  </div>
                </div>
                {attentionItems.length > 0 && (
                  <div style={{background:'#fdf6e6', border:'1px solid #efe1be', borderRadius:8, padding:'10px 14px', marginBottom:14}}>
                    <div style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'#7a5a1f', fontWeight:700, marginBottom:6}}>Needs your attention</div>
                    {attentionItems.map((it, idx) => (
                      <div key={idx} style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-dark)', padding:'3px 0'}}>
                        <span style={{width:6, height:6, borderRadius:3, background:it.color, flexShrink:0}}/>
                        <span>{it.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:`repeat(${cols}, minmax(0, 1fr))`,gap:8,marginTop:14}}>
                  {/* Custom Units stat. Matches PMCStat exactly so the
                      tile row lines up. The "View floors & units" tail
                      caption is gone; the whole tile is clickable. */}
                  <div
                    onClick={(e) => { e.stopPropagation(); open(); }}
                    title="View floors & units"
                    style={{padding:'14px 16px',background:'var(--bg-surface)',borderRadius:6,border:'1px solid var(--border-light)',cursor:'pointer',transition:'background 0.15s, border-color 0.15s'}}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-warm-light)'; e.currentTarget.style.borderColor = 'var(--accent-warm)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                  >
                    <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>Units</div>
                    <div style={{fontSize:16,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.015em'}}>{b.unitCount} <span style={{fontSize:12,fontWeight:400,color:'var(--text-muted)',letterSpacing:0}}>· {occupancyPct}% occupied</span></div>
                  </div>
                  {isCommercial && (
                    <PMCStat label="Monthly Run-Rate"  value={'AED ' + Math.round(b.monthlyRev).toLocaleString()}          onClick={() => setDrill({ building: b, view: 'tenants' })}        hint="Tenants + lease rates"/>
                  )}
                  <PMCStat label="Total Billed" value={'AED ' + Math.round(totalBilled).toLocaleString()}  onClick={() => setDrill({ building: b, view: 'invoices' })}  hint="All invoices for this building"/>
                  <PMCStat label="Collected"    value={'AED ' + Math.round(b.collected).toLocaleString()} onClick={() => setDrill({ building: b, view: 'collected' })} color="#5a6b4f" hint="Paid invoices"/>
                  <PMCStat label="Pending"      value={'AED ' + Math.round(b.pending).toLocaleString()}   onClick={() => setDrill({ building: b, view: 'pending' })}   color={b.pending  > 0 ? '#8b4a42' : null} hint="Past due — not paid yet"/>
                  <PMCStat label="Upcoming"     value={'AED ' + Math.round(b.upcoming).toLocaleString()}  onClick={() => setDrill({ building: b, view: 'upcoming' })}  color={b.upcoming > 0 ? '#a07d3c' : null} hint="Due within next 30 days"/>
                  <PMCStat label="Future"       value={'AED ' + Math.round(b.future).toLocaleString()}    onClick={() => setDrill({ building: b, view: 'future' })}    color={b.future   > 0 ? '#61707D' : null} hint="Due more than 30 days out"/>
                  <PMCStat label="Open SRs"     value={b.openSRs + ' open · ' + b.totalSRs + ' total'}    onClick={() => setDrill({ building: b, view: 'srs' })}       hint="Service requests"/>
                </div>
              </div>
            );
          };

          // Section block: single-line header + cards. The old design
          // stacked "RESIDENTIAL" + "2 buildings" on two rows; we now
          // append the count as a quiet suffix on the eyebrow itself.
          const renderSection = (label, kind, list) => (
            <div style={{marginBottom:40}}>
              <div style={{...sectionEyebrow, marginBottom:18, display:'flex', alignItems:'baseline', gap:12, paddingBottom:8, borderBottom:'1px solid var(--border-light)'}}>
                <span>{label}</span>
                <span style={{color:'var(--text-muted)',fontWeight:400,letterSpacing:0,textTransform:'none',fontSize:13}}>· {list.length} {list.length === 1 ? 'building' : 'buildings'}</span>
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

          const residential    = buildings.filter(b => b.property_type === 'Residential');
          const commercial     = buildings.filter(b => b.property_type === 'Commercial');
          const villas         = buildings.filter(b => b.property_type === 'Villa');
          const commercialLand = buildings.filter(b => b.property_type === 'Commercial Land');

          const tabs = [
            { key:'Residential',     label:'Residential',          count: residential.length },
            { key:'Commercial',      label:'Commercial buildings', count: commercial.length },
            { key:'Villa',           label:'Villas',               count: villas.length },
            { key:'Commercial Land', label:'Lands',                count: commercialLand.length },
          ];
          return (
            <>
              <div style={{display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border-light)'}}>
                {tabs.map(t => {
                  const active = activeAssetType === t.key;
                  return (
                    <button key={t.key} type="button"
                      onClick={() => setActiveAssetType(t.key)}
                      style={{
                        padding:'10px 18px', background:'transparent',
                        border:'none', borderBottom: active ? '2px solid var(--accent-warm-dark)' : '2px solid transparent',
                        marginBottom:-1, cursor:'pointer',
                        fontSize:13, fontWeight: active ? 600 : 400,
                        color: active ? 'var(--text-dark)' : 'var(--text-secondary)',
                        letterSpacing:'-0.005em',
                      }}>
                      {t.label} <span style={{fontSize:11, color:'var(--text-muted)', marginLeft:6, fontWeight:400}}>· {t.count}</span>
                    </button>
                  );
                })}
              </div>
              {activeAssetType === 'Residential'     && renderSection('Residential',     'Residential',     residential)}
              {activeAssetType === 'Commercial'      && renderSection('Commercial',      'Commercial',      commercial)}
              {activeAssetType === 'Villa'           && renderSection('Villas',          'Villa',           villas)}
              {activeAssetType === 'Commercial Land' && renderSection('Commercial Land', 'Commercial Land', commercialLand)}
            </>
          );
        })()
      }

      {selectedBuilding && <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)}/>}
      {drill && <BuildingDrillModal building={drill.building} view={drill.view} setPage={setPage} onClose={() => setDrill(null)}/>}
    </div>
  );
};

