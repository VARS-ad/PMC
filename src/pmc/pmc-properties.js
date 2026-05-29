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

  // SR interactivity — row click opens the detail modal, plus
  // priority / status / date filters and sortable headers. Mirrors the
  // invoice table inside AssetFinancialPanel so the behavior matches.
  const [openSr, setOpenSr] = useState(null);
  const [srPriorityFilter, setSrPriorityFilter] = useState('all');
  const [srStatusFilter, setSrStatusFilter] = useState('all');
  const [srDateStart, setSrDateStart] = useState('');
  const [srDateEnd, setSrDateEnd] = useState('');
  const [srSort, setSrSort] = useState({ key: 'created_at', dir: 'desc' });
  const toggleSrSort = (key) => setSrSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  const SrSortArrow = ({ col }) => srSort.key !== col ? <span style={{opacity:0.25,marginLeft:4}}>↕</span> : <span style={{marginLeft:4}}>{srSort.dir === 'asc' ? '↑' : '↓'}</span>;
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
    invoices:         { label: 'Total Billed',                 page: 'payment',         kind: 'invoices' },
    collected:        { label: 'Collected',                    page: 'payment',         kind: 'invoices' },
    pending:          { label: 'Pending',                      page: 'payment',         kind: 'invoices' },
    upcoming:         { label: 'Upcoming',                     page: 'payment',         kind: 'invoices' },
    future:           { label: 'Future',                       page: 'payment',         kind: 'invoices' },
    srs:              { label: 'Open Service Requests',        page: 'service',         kind: 'srs' },
    'srs-urgent':     { label: 'High-Priority Service Requests', page: 'service',       kind: 'srs' },
    tenants:          { label: 'Tenants',                      page: 'profileCreation', kind: 'tenants' },
    'leases-expiring':{ label: 'Leases Expiring · 60 days',    page: 'profileCreation', kind: 'tenants' },
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
    // Start from the building's full SR list — drill view picks the
    // "open" subset, then user-facing filters narrow further.
    rows = (building.srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status));
    if (view === 'srs-urgent') rows = rows.filter(s => ['High','Urgent'].includes(s.priority));
    if (srPriorityFilter !== 'all') rows = rows.filter(s => s.priority === srPriorityFilter);
    if (srStatusFilter   !== 'all') rows = rows.filter(s => s.status   === srStatusFilter);
    if (srDateStart)   rows = rows.filter(s => (s.created_at || '').slice(0,10) >= srDateStart);
    if (srDateEnd)     rows = rows.filter(s => (s.created_at || '').slice(0,10) <= srDateEnd);
    // Sort
    const priorityRank = { 'Urgent':0, 'High':1, 'Normal':2, 'Low':3 };
    const statusRank   = { 'New':0, 'Acknowledged':1, 'In Progress':2, 'Done':3, 'Closed':4, 'Rejected':5 };
    rows = [...rows].sort((a, b) => {
      const k = srSort.key;
      let av, bv;
      if (k === 'priority') { av = priorityRank[a.priority] ?? 99; bv = priorityRank[b.priority] ?? 99; }
      else if (k === 'status') { av = statusRank[a.status] ?? 99; bv = statusRank[b.status] ?? 99; }
      else { av = a[k] || ''; bv = b[k] || ''; }
      if (av < bv) return srSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return srSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  } else if (v.kind === 'tenants') {
    rows = (building.tenants || []);
    if (view === 'leases-expiring') {
      const todayIso = new Date().toISOString().slice(0, 10);
      const cutoff60Iso = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      rows = rows.filter(t => t.lease_end && t.lease_end >= todayIso && t.lease_end <= cutoff60Iso);
    }
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
          <div>
            {/* Filter bar */}
            <div style={{display:'flex', gap:10, alignItems:'center', padding:'10px 16px 14px', flexWrap:'wrap', borderBottom:'1px solid var(--border-light)'}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:11, color:'var(--text-muted)', letterSpacing:'0.04em', textTransform:'uppercase'}}>Priority</span>
                <select value={srPriorityFilter} onChange={e => setSrPriorityFilter(e.target.value)} style={{padding:'6px 10px', fontSize:12, border:'1px solid var(--border-light)', borderRadius:6, background:'#fff', cursor:'pointer'}}>
                  <option value="all">All</option>
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Normal">Normal</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:11, color:'var(--text-muted)', letterSpacing:'0.04em', textTransform:'uppercase'}}>Status</span>
                <select value={srStatusFilter} onChange={e => setSrStatusFilter(e.target.value)} style={{padding:'6px 10px', fontSize:12, border:'1px solid var(--border-light)', borderRadius:6, background:'#fff', cursor:'pointer'}}>
                  <option value="all">All</option>
                  <option value="New">New</option>
                  <option value="Acknowledged">Acknowledged</option>
                  <option value="In Progress">In Progress</option>
                </select>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:11, color:'var(--text-muted)', letterSpacing:'0.04em', textTransform:'uppercase'}}>Created</span>
                <input type="date" value={srDateStart} onChange={e => setSrDateStart(e.target.value)} style={{padding:'6px 8px', fontSize:12, border:'1px solid var(--border-light)', borderRadius:6, background:'#fff'}}/>
                <span style={{fontSize:11, color:'var(--text-muted)'}}>→</span>
                <input type="date" value={srDateEnd} onChange={e => setSrDateEnd(e.target.value)} style={{padding:'6px 8px', fontSize:12, border:'1px solid var(--border-light)', borderRadius:6, background:'#fff'}}/>
              </div>
              {(srPriorityFilter !== 'all' || srStatusFilter !== 'all' || srDateStart || srDateEnd) && (
                <button onClick={() => { setSrPriorityFilter('all'); setSrStatusFilter('all'); setSrDateStart(''); setSrDateEnd(''); }} style={{padding:'6px 10px', fontSize:11, background:'transparent', border:'1px solid var(--border-light)', borderRadius:6, cursor:'pointer', color:'var(--text-muted)'}}>Clear</button>
              )}
              <div style={{flex:1}}/>
              <div style={{fontSize:11, color:'var(--text-muted)'}}>{rows.length} {rows.length === 1 ? 'request' : 'requests'}</div>
            </div>

            {rows.length === 0 ? (
              <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No requests match the current filters.</div>
            ) : (
              <table className="data-table" style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th style={{width:'18%', cursor:'pointer', userSelect:'none'}} onClick={() => toggleSrSort('category')}>Category<SrSortArrow col="category"/></th>
                    <th style={{width:'30%'}}>Description</th>
                    <th style={{width:'14%'}}>Resident</th>
                    <th style={{width:'8%'}}>Unit</th>
                    <th style={{width:'10%', cursor:'pointer', userSelect:'none'}} onClick={() => toggleSrSort('priority')}>Priority<SrSortArrow col="priority"/></th>
                    <th style={{width:'10%', cursor:'pointer', userSelect:'none'}} onClick={() => toggleSrSort('status')}>Status<SrSortArrow col="status"/></th>
                    <th style={{width:'10%', cursor:'pointer', userSelect:'none'}} onClick={() => toggleSrSort('created_at')}>Created<SrSortArrow col="created_at"/></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => {
                    const prChip = ({
                      'Urgent':{ bg:'#fdf2f1', fg:'#8b4a42' },
                      'High':  { bg:'#fdf2dc', fg:'#a07d3c' },
                      'Normal':{ bg:'#E6EAE9', fg:'#3E4C59' },
                      'Low':   { bg:'#E6EAE9', fg:'#61707D' },
                    })[s.priority] || { bg:'#E6EAE9', fg:'#61707D' };
                    const stChip = ({
                      'New':         { bg:'#fdf5e6', fg:'#7a5a1f' },
                      'Acknowledged':{ bg:'#E6EAE9', fg:'#3E4C59' },
                      'In Progress': { bg:'#fdf2dc', fg:'#a07d3c' },
                    })[s.status] || { bg:'#E6EAE9', fg:'#61707D' };
                    return (
                      <tr key={s.id} onClick={() => setOpenSr(s)}
                        style={{cursor:'pointer', transition:'background 0.12s'}}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(160,125,60,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        title="Open full request details">
                        <td style={{fontWeight:500}}>{s.category}</td>
                        <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.description}>{s.description}</td>
                        <td>{s.resident_name}</td>
                        <td>{s.unit_number}</td>
                        <td><span style={{display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, background:prChip.bg, color:prChip.fg}}>{s.priority || '—'}</span></td>
                        <td><span style={{display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, background:stChip.bg, color:stChip.fg}}>{s.status}</span></td>
                        <td style={{whiteSpace:'nowrap', color:'var(--text-muted)'}}>{(s.created_at || '').slice(0,10) || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {openSr && <ServiceRequestDetailModal sr={openSr} building={building} onClose={() => setOpenSr(null)}/>}
          </div>
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

// ---- PortfolioBillingDrillModal -------------------------------------------
// Opens when a KPI tile on the Summary tab is clicked. Shows the underlying
// records for the four portfolio views: Billed / Collected / Outstanding /
// Future. Single shared table layout with a building filter on top.
const PortfolioBillingDrillModal = ({ view, allInvoices, futureProjections, buildings, onClose }) => {
  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'amount_aed', dir: 'desc' });
  const toggleSort = (key) => setSort(p => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  const Arrow = ({ col }) => sort.key !== col ? <span style={{opacity:0.25,marginLeft:4}}>↕</span> : <span style={{marginLeft:4}}>{sort.dir === 'asc' ? '↑' : '↓'}</span>;

  // Esc closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isFuture = view === 'future';
  const titles = {
    billed:      'Total Revenue Billed',
    collected:   'Collected',
    outstanding: 'Outstanding',
    future:      'Future revenue · next 12 months',
  };

  let rows;
  if (isFuture) {
    rows = (futureProjections || []).filter(r => buildingFilter === 'all' || r.building_id === buildingFilter);
    rows = [...rows].sort((a, b) => {
      const k = sort.key === 'amount_aed' ? 'projected' : sort.key;
      const av = a[k] ?? ''; const bv = b[k] ?? '';
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  } else {
    rows = (allInvoices || []).filter(i => {
      if (view === 'collected'   && i.effective_status !== 'Paid') return false;
      if (view === 'outstanding' && !['Pending','Upcoming','Future'].includes(i.effective_status)) return false;
      if (buildingFilter !== 'all' && i.building_id !== buildingFilter) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? '';
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  const total = isFuture
    ? rows.reduce((s, r) => s + Number(r.projected || 0), 0)
    : rows.reduce((s, r) => s + Number(r.amount_aed || 0), 0);

  const statusStyles = {
    'Paid':     { bg:'#e6efe1', fg:'#5a6b4f' },
    'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },
    'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },
    'Future':   { bg:'#E6EAE9', fg:'#61707D' },
    'Cancelled':{ bg:'#E6EAE9', fg:'#61707D' },
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1100}}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{maxWidth:1180, maxHeight:'88vh', overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Portfolio</div>
            <h2>{titles[view] || 'Records'}</h2>
            <div className="modal-sub">{rows.length} {isFuture ? (rows.length === 1 ? 'lease' : 'leases') : (rows.length === 1 ? 'invoice' : 'invoices')} · {fmt(total)}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Building filter */}
        <div style={{padding:'10px 16px 14px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', borderBottom:'1px solid var(--border-light)'}}>
          <span style={{fontSize:11, color:'var(--text-muted)', letterSpacing:'0.04em', textTransform:'uppercase'}}>Building</span>
          <select value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)} style={{padding:'6px 10px', fontSize:12, border:'1px solid var(--border-light)', borderRadius:6, background:'#fff', cursor:'pointer'}}>
            <option value="all">All buildings</option>
            {(buildings || []).map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
          {buildingFilter !== 'all' && (
            <button onClick={() => setBuildingFilter('all')} style={{padding:'6px 10px', fontSize:11, background:'transparent', border:'1px solid var(--border-light)', borderRadius:6, cursor:'pointer', color:'var(--text-muted)'}}>Clear</button>
          )}
        </div>

        {rows.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>
            {isFuture ? 'No future lease revenue projected.' : view === 'collected' ? 'No paid invoices.' : view === 'outstanding' ? 'Nothing outstanding ✓' : 'No invoices in this period.'}
          </div>
        ) : isFuture ? (
          <table className="data-table" style={{fontSize:12}}>
            <thead>
              <tr>
                <th style={{width:'22%', cursor:'pointer'}} onClick={() => toggleSort('building_name')}>Building<Arrow col="building_name"/></th>
                <th style={{width:'8%'}}>Unit</th>
                <th style={{width:'22%'}}>Tenant</th>
                <th style={{width:'14%', textAlign:'right', cursor:'pointer'}} onClick={() => toggleSort('monthly')}>Monthly<Arrow col="monthly"/></th>
                <th style={{width:'12%', cursor:'pointer'}} onClick={() => toggleSort('lease_end')}>Lease end<Arrow col="lease_end"/></th>
                <th style={{width:'10%', textAlign:'right', cursor:'pointer'}} onClick={() => toggleSort('monthsRemaining')}>Months<Arrow col="monthsRemaining"/></th>
                <th style={{width:'14%', textAlign:'right', cursor:'pointer'}} onClick={() => toggleSort('amount_aed')}>Projected<Arrow col="amount_aed"/></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.building_id + '_' + r.unit_number + '_' + idx}>
                  <td style={{fontWeight:500}}>{r.building_name}</td>
                  <td>{r.unit_number}</td>
                  <td>{r.tenant_name || '—'}</td>
                  <td style={{textAlign:'right'}}>{fmt(r.monthly)}</td>
                  <td style={{whiteSpace:'nowrap'}}>{r.lease_end || '—'}</td>
                  <td style={{textAlign:'right'}}>{r.monthsRemaining}</td>
                  <td style={{textAlign:'right', fontWeight:600}}>{fmt(r.projected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="data-table" style={{fontSize:12}}>
            <thead>
              <tr>
                <th style={{width:'18%', cursor:'pointer'}} onClick={() => toggleSort('building_name')}>Building<Arrow col="building_name"/></th>
                <th style={{width:'8%'}}>Unit</th>
                <th style={{width:'12%', cursor:'pointer'}} onClick={() => toggleSort('invoice_number')}>Invoice #<Arrow col="invoice_number"/></th>
                <th style={{width:'24%'}}>Description</th>
                <th style={{width:'10%', cursor:'pointer'}} onClick={() => toggleSort('due_date')}>Due<Arrow col="due_date"/></th>
                <th style={{width:'10%', cursor:'pointer'}} onClick={() => toggleSort('effective_status')}>Status<Arrow col="effective_status"/></th>
                <th style={{width:'14%', textAlign:'right', cursor:'pointer'}} onClick={() => toggleSort('amount_aed')}>Amount<Arrow col="amount_aed"/></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(i => {
                const c = statusStyles[i.effective_status] || { bg:'#E6EAE9', fg:'#61707D' };
                return (
                  <tr key={i.id}>
                    <td style={{fontWeight:500}}>{i.building_name}</td>
                    <td>{i.unit_number}</td>
                    <td style={{fontWeight:500}}>{i.invoice_number || '—'}</td>
                    <td style={{maxWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                    <td style={{whiteSpace:'nowrap'}}>{i.due_date || '—'}</td>
                    <td style={{whiteSpace:'nowrap'}}>
                      <span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:c.bg,color:c.fg}}>
                        {i.effective_status}
                      </span>
                    </td>
                    <td style={{textAlign:'right', fontWeight:600, whiteSpace:'nowrap'}}>{fmt(i.amount_aed)}</td>
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
  // Al Qurm View trial: the consolidated Total Billed tile opens this
  // slide-in financial panel instead of the usual BuildingDrillModal.
  const [financialAsset, setFinancialAsset] = useState(null);
  // Portfolio-level drill modal — Summary tab KPIs (Billed / Collected /
  // Outstanding / Future) open this with the matching view.
  const [portfolioDrill, setPortfolioDrill] = useState(null);
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
        if (['Summary','Residential','Commercial','Villa','Commercial Land'].includes(fromOverview)) return fromOverview;
      }
    } catch (_) {}
    return 'Summary';
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
        const [{ data: bs }, { data: units }, { data: ras }, { data: invoices }, { data: srs }, { data: profiles }, { data: photoAtts }] = await Promise.all([
          supabaseClient.from('buildings').select('id,name,address,notes,property_type,created_at,purchase_price,current_value,acquired_on').order('name'),
          supabaseClient.from('units').select('id,building_id,floor,unit_number,tenant_name,tenant_email,tenant_phone,tenant_tenure,tenant_contract_number,tenant_lease_start,tenant_lease_end,tenant_monthly_payment_aed'),
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start'),
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,source_type,unit_id,resident_profile_id,created_at'),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,unit_id,resident_profile_id,preferred_date'),
          supabaseClient.from('profiles').select('id,full_name,phone'),
          // First photo per unit so each building card can pick a real
          // hero image (falls back to Unsplash stock when nothing's been
          // uploaded for any of the building's units).
          supabaseClient.from('unit_attachments').select('unit_id,storage_path,created_at').eq('kind', 'photo').order('created_at', { ascending: true }),
        ]);
        if (!mounted) return;
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        // unit_id → building_id, used to bucket the per-unit photo
        // attachments back onto their building so each card can show
        // the first available hero shot.
        const unitToBuilding = Object.fromEntries((units || []).map(u => [u.id, u.building_id]));
        const photoByBuilding = {};
        for (const a of (photoAtts || [])) {
          const bId = unitToBuilding[a.unit_id];
          if (bId && !photoByBuilding[bId]) photoByBuilding[bId] = a.storage_path;
        }
        const result = (bs || []).filter(b => !filterB || filterB.includes(b.id)).map(b => {
          const bUnits = (units || []).filter(u => u.building_id === b.id);
          const unitMap = Object.fromEntries(bUnits.map(u => [u.id, u]));
          const unitIds = bUnits.map(u => u.id);
          // Residential occupants (resident_assignments)
          const occupied = (ras || [])
            .filter(r => unitIds.includes(r.unit_id))
            .map(r => ({
              ...r,
              resident_name: profileMap[r.profile_id]?.full_name || '—',
              resident_phone: profileMap[r.profile_id]?.phone || null,
              unit_number: unitMap[r.unit_id]?.unit_number || '—',
              floor: unitMap[r.unit_id]?.floor ?? null,
            }));
          // Non-residential occupants (units.tenant_*). These are
          // commercial / villa / commercial-land clients — same shape
          // as a Tenant assignment for roster + occupancy purposes
          // so the rest of the card (vacancy chip, tenants drill,
          // monthly run-rate) works uniformly.
          const nonResOccupants = bUnits
            .filter(u => u.tenant_name)
            .map(u => ({
              profile_id: null,
              unit_id: u.id,
              resident_name: u.tenant_name,
              resident_phone: u.tenant_phone || null,
              unit_number: u.unit_number,
              floor: u.floor,
              tenure: u.tenant_tenure || 'Tenant',
              lease_start: u.tenant_lease_start || null,
              lease_end: u.tenant_lease_end || null,
              monthly_payment_aed: u.tenant_monthly_payment_aed || 0,
              contract_number: u.tenant_contract_number || null,
            }));
          // Combined tenants list — what landlords actually see as
          // 'occupied' regardless of property type.
          const tenants = occupied.filter(o => o.tenure === 'Tenant').concat(nonResOccupants);
          const monthlyRev = tenants.reduce((s, t) => s + Number(t.monthly_payment_aed || 0), 0);
          // Combined occupancy count: residential assignments + non-
          // residential tenants from units.tenant_name.
          const occupiedCount = occupied.length + nonResOccupants.length;
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
            unitCount: bUnits.length, occupiedCount,
            monthlyRev, collected, pending, upcoming, future, openSRs, totalSRs: bSRs.length,
            photo_path: photoByBuilding[b.id] || null,
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
            // Each priority action carries an onAction so the row drills
            // into the same modal the matching KPI tile would open.
            const typeChip = ({ 'Residential':'#5a6b4f', 'Commercial':'#3E4C59', 'Villa':'#a07d3c', 'Commercial Land':'#61707D' })[b.property_type] || '#61707D';
            const attentionItems = [];
            if (bOverdue > 0) attentionItems.push({ color:'#8b4a42', text: bOverdue + ' overdue tenant' + (bOverdue === 1 ? '' : 's') + ' · AED ' + Math.round(bOverdueTotal).toLocaleString() + ' at risk', onAction: () => setDrill({ building: b, view: 'pending' }) });
            if (bUrgentSRs > 0) attentionItems.push({ color:'#8b4a42', text: bUrgentSRs + ' high-priority service request' + (bUrgentSRs === 1 ? '' : 's') + ' open', onAction: () => setDrill({ building: b, view: 'srs-urgent' }) });
            if (bExpiringLeases > 0) attentionItems.push({ color:'#a07d3c', text: bExpiringLeases + ' lease' + (bExpiringLeases === 1 ? '' : 's') + ' expiring within 60 days', onAction: () => setDrill({ building: b, view: 'leases-expiring' }) });
            if (bVacant > 0) attentionItems.push({ color:'#a07d3c', text: bVacant + ' vacant unit' + (bVacant === 1 ? '' : 's'), onAction: open });
            return (
              <div key={b.id} className="card" data-asset-id={b.id} style={{padding:0,overflow:'hidden'}}>
                {/* Hero photo strip — real upload → Unsplash stock → designed cover */}
                <div onClick={open} style={{cursor:'pointer'}}>
                  <AssetCardPhoto storagePath={b.photo_path} assetId={b.id} typeChipColor={typeChip} propertyType={b.property_type} name={b.name} height={160}/>
                </div>
                <div style={{padding:'18px 20px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={open}>
                    <div style={{fontSize:20,fontWeight:500,color:'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1.15}}>{b.name}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{b.address || '—'}</div>
                  </div>
                </div>
                {attentionItems.length > 0 && (
                  <div style={{background:'#fdf6e6', border:'1px solid #efe1be', borderRadius:8, padding:'10px 14px', marginBottom:14}}>
                    <div style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'#7a5a1f', fontWeight:700, marginBottom:6}}>Top Priority Actions</div>
                    {attentionItems.map((it, idx) => (
                      <div key={idx}
                        onClick={(e) => { e.stopPropagation(); if (it.onAction) it.onAction(); }}
                        style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-dark)', padding:'5px 0', cursor: it.onAction ? 'pointer' : 'default', borderRadius:4, transition:'background 0.12s'}}
                        onMouseEnter={e => { if (it.onAction) e.currentTarget.style.background = 'rgba(122,90,31,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{width:6, height:6, borderRadius:3, background:it.color, flexShrink:0}}/>
                        <span style={{flex:1}}>{it.text}</span>
                        {it.onAction && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a98a2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(() => {
                  // 2-tile layout: Units · Open Service Requests.
                  // The Operating Revenue tile used to live in the middle —
                  // removed in favour of the new Assets → Summary tab,
                  // which carries the portfolio-wide financial rollup
                  // (and clickable drill into per-asset AssetFinancialPanel
                  // via the Top revenue contributors list).
                  return (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0, 1fr))',gap:8,marginTop:14}}>
                      {/* Units tile (custom render — matches PMCStat shape) */}
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
                      <PMCStat label="Open Service Requests"   value={b.openSRs + ' open · ' + b.totalSRs + ' total'}    onClick={() => setDrill({ building: b, view: 'srs' })} hint="Service requests"/>
                    </div>
                  );
                })()}
                </div>{/* padded body */}
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
            { key:'Summary',         label:'Summary',              count: buildings.length },
            { key:'Residential',     label:'Residential',          count: residential.length },
            { key:'Commercial',      label:'Commercial buildings', count: commercial.length },
            { key:'Villa',           label:'Villas',               count: villas.length },
            { key:'Commercial Land', label:'Lands',                count: commercialLand.length },
          ];

          // ===== Portfolio summary (Summary tab) =====
          // Three KPI tiles + revenue-by-type + two ranking lists. The
          // numbers honour the same period bounds the type tabs use, so
          // the time-range picker still drives everything you see here.
          const renderSummary = () => {
            const fmtMoney = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
            // Roll up every building's invoices into portfolio totals.
            const allInvoices = (buildings || []).flatMap(b =>
              (b.invoices || []).map(i => ({ ...i, building_id: b.id, building_name: b.name, building_ref: b }))
            );
            const billed      = allInvoices.reduce((s, i) => s + Number(i.amount_aed || 0), 0);
            const collected   = allInvoices.filter(i => i.effective_status === 'Paid').reduce((s, i) => s + Number(i.amount_aed || 0), 0);
            const outstanding = allInvoices.filter(i => ['Pending','Upcoming','Future'].includes(i.effective_status)).reduce((s, i) => s + Number(i.amount_aed || 0), 0);
            const overduePast = allInvoices.filter(i => i.effective_status === 'Pending').reduce((s, i) => s + Number(i.amount_aed || 0), 0);
            const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;

            // Future revenue = next 12 months of contracted lease income
            // from active tenants. Anchored to today, capped at horizon
            // so a 5-year lease doesn't drown the rest of the KPIs.
            const futureProjections = (() => {
              const today = new Date();
              const horizonEnd = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
              const rows = [];
              (buildings || []).forEach(b => {
                (b.tenants || []).filter(t => t.lease_end && Number(t.monthly_payment_aed) > 0).forEach(t => {
                  const end = new Date(t.lease_end);
                  if (isNaN(end.getTime()) || end <= today) return;
                  const effectiveEnd = end < horizonEnd ? end : horizonEnd;
                  const monthsRemaining = Math.max(0,
                    (effectiveEnd.getFullYear() - today.getFullYear()) * 12 +
                    (effectiveEnd.getMonth() - today.getMonth())
                  );
                  if (monthsRemaining === 0) return;
                  const monthly = Number(t.monthly_payment_aed);
                  rows.push({
                    building_id: b.id, building_name: b.name, property_type: b.property_type,
                    unit_number: t.unit_number, tenant_name: t.resident_name, tenant_phone: t.resident_phone,
                    monthly, monthsRemaining, lease_end: t.lease_end, projected: monthly * monthsRemaining,
                  });
                });
              });
              return rows;
            })();
            const futureRevenue = futureProjections.reduce((s, r) => s + r.projected, 0);

            // Outstanding suffix — fix duplicate-number bug. If overdue
            // equals the whole outstanding total, show "all overdue"
            // instead of repeating the amount.
            const outstandingSuffix = overduePast > 0
              ? (overduePast >= outstanding ? '  ·  all overdue' : '  ·  ' + fmtMoney(overduePast) + ' overdue')
              : '';

            // Revenue by construction type — billed + collected per type
            // so the user can compare which segment converts best.
            const typeBreakdown = [
              { key:'Residential',     label:'Residential',          color:'#5a6b4f', list: residential },
              { key:'Commercial',      label:'Commercial buildings', color:'#3E4C59', list: commercial },
              { key:'Villa',           label:'Villas',               color:'#a07d3c', list: villas },
              { key:'Commercial Land', label:'Lands',                color:'#61707D', list: commercialLand },
            ].map(t => {
              const tBilled = t.list.reduce((s, b) => s + (b.collected + b.pending + b.upcoming + b.future), 0);
              const tCollected = t.list.reduce((s, b) => s + b.collected, 0);
              return { ...t, billed: tBilled, collected: tCollected, share: billed > 0 ? (tBilled / billed) : 0, collectionRate: tBilled > 0 ? Math.round((tCollected / tBilled) * 100) : 0 };
            }).sort((a, b) => b.billed - a.billed);

            // Top revenue contributors — buildings ranked by billed.
            const topContributors = [...buildings]
              .map(b => ({ ...b, billed: b.collected + b.pending + b.upcoming + b.future }))
              .filter(b => b.billed > 0)
              .sort((a, b) => b.billed - a.billed)
              .slice(0, 6);
            const topMax = topContributors[0]?.billed || 1;

            // Main outstanding invoices — past-due first (descending amount),
            // then upcoming, then future. Cap at 6 so the strip stays compact.
            const outstandingInvoices = allInvoices
              .filter(i => ['Pending','Upcoming','Future'].includes(i.effective_status))
              .sort((a, b) => {
                const rank = { 'Pending': 0, 'Upcoming': 1, 'Future': 2 };
                if (rank[a.effective_status] !== rank[b.effective_status]) return rank[a.effective_status] - rank[b.effective_status];
                return Number(b.amount_aed || 0) - Number(a.amount_aed || 0);
              })
              .slice(0, 6);
            const statusStyles = {
              'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },
              'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },
              'Future':   { bg:'#E6EAE9', fg:'#61707D' },
            };

            const sectionEyebrowSmall = { fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-secondary)', fontWeight:600, marginBottom:12 };

            return (
              <div style={{marginBottom:40}}>
                <div style={{...sectionEyebrow, marginBottom:18, display:'flex', alignItems:'baseline', gap:12, paddingBottom:8, borderBottom:'1px solid var(--border-light)'}}>
                  <span>Portfolio summary</span>
                  <span style={{color:'var(--text-muted)',fontWeight:400,letterSpacing:0,textTransform:'none',fontSize:13}}>· {buildings.length} {buildings.length === 1 ? 'asset' : 'assets'} across {typeBreakdown.filter(t => t.list.length > 0).length} types</span>
                </div>

                {/* 4 portfolio KPI tiles — all clickable, open the portfolio drill modal */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:12,marginBottom:24}}>
                  <PMCStat label="Total Revenue Billed" value={fmtMoney(billed)}
                    onClick={() => setPortfolioDrill({ view: 'billed', allInvoices, futureProjections })}
                    hint="Every billed invoice across the portfolio in the selected period."/>
                  <PMCStat label="Collected" value={fmtMoney(collected) + ' · ' + collectionRate + '%'} color="#5a6b4f"
                    onClick={() => setPortfolioDrill({ view: 'collected', allInvoices, futureProjections })}
                    hint="Paid invoices in the selected period."/>
                  <PMCStat label="Outstanding" value={fmtMoney(outstanding) + outstandingSuffix} color={overduePast > 0 ? '#8b4a42' : 'var(--text-dark)'}
                    onClick={() => setPortfolioDrill({ view: 'outstanding', allInvoices, futureProjections })}
                    hint="Pending + Upcoming + Future invoices — unpaid."/>
                  <PMCStat label="Future · next 12 months" value={fmtMoney(futureRevenue)} color="#a07d3c"
                    onClick={() => setPortfolioDrill({ view: 'future', allInvoices, futureProjections })}
                    hint="Projected revenue from active leases — monthly × remaining months, capped at 12."/>
                </div>

                {/* Revenue by construction type */}
                <div className="card" style={{padding:'18px 22px', marginBottom:18}}>
                  <div style={sectionEyebrowSmall}>Revenue by construction type</div>
                  {typeBreakdown.every(t => t.billed === 0) ? (
                    <div style={{color:'var(--text-muted)', fontSize:13, padding:'8px 0'}}>No revenue recorded in the selected period.</div>
                  ) : typeBreakdown.map(t => {
                    if (t.list.length === 0) return null;
                    const sharePct = Math.round(t.share * 100);
                    return (
                      <div key={t.key}
                        onClick={() => setActiveAssetType(t.key)}
                        style={{display:'grid', gridTemplateColumns:'160px 1fr 130px 90px', gap:14, alignItems:'center', padding:'10px 6px', cursor:'pointer', borderRadius:6, transition:'background 0.12s'}}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(160,125,60,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        title={'Open the ' + t.label + ' tab'}>
                        <div style={{display:'flex', alignItems:'center', gap:8}}>
                          <span style={{width:8, height:8, borderRadius:2, background:t.color, flexShrink:0}}/>
                          <span style={{fontSize:13, fontWeight:500, color:'var(--text-dark)'}}>{t.label}</span>
                          <span style={{fontSize:11, color:'var(--text-muted)'}}>· {t.list.length}</span>
                        </div>
                        <div style={{height:8, background:'#f4f1ec', borderRadius:4, overflow:'hidden', position:'relative'}}>
                          <div style={{position:'absolute', left:0, top:0, bottom:0, width:(sharePct + '%'), background:t.color, transition:'width 0.3s', borderRadius:4}}/>
                        </div>
                        <div style={{fontSize:13, fontWeight:600, color:'var(--text-dark)', textAlign:'right'}}>{fmtMoney(t.billed)}</div>
                        <div style={{fontSize:11, color:'var(--text-muted)', textAlign:'right'}}>
                          {sharePct}% · {t.collectionRate}% coll
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Two-up: Top contributors / Outstanding invoices */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
                  {/* Top revenue contributors */}
                  <div className="card" style={{padding:'18px 22px'}}>
                    <div style={sectionEyebrowSmall}>Top revenue contributors</div>
                    {topContributors.length === 0 ? (
                      <div style={{color:'var(--text-muted)', fontSize:13, padding:'8px 0'}}>No billed revenue yet.</div>
                    ) : topContributors.map(b => {
                      const widthPct = Math.max(4, Math.round((b.billed / topMax) * 100));
                      const tColor = ({ 'Residential':'#5a6b4f', 'Commercial':'#3E4C59', 'Villa':'#a07d3c', 'Commercial Land':'#61707D' })[b.property_type] || '#61707D';
                      return (
                        <div key={b.id}
                          onClick={() => setFinancialAsset(b)}
                          style={{display:'grid', gridTemplateColumns:'1fr 110px', gap:14, alignItems:'center', padding:'9px 6px', cursor:'pointer', borderRadius:6, transition:'background 0.12s'}}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(160,125,60,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          title={'Open the financial summary for ' + b.name}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13, fontWeight:500, color:'var(--text-dark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{b.name}</div>
                            <div style={{height:6, background:'#f4f1ec', borderRadius:3, overflow:'hidden', marginTop:5}}>
                              <div style={{height:'100%', width:(widthPct + '%'), background:tColor, borderRadius:3}}/>
                            </div>
                          </div>
                          <div style={{fontSize:13, fontWeight:600, color:'var(--text-dark)', textAlign:'right'}}>{fmtMoney(b.billed)}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Main outstanding invoices */}
                  <div className="card" style={{padding:'18px 22px'}}>
                    <div style={sectionEyebrowSmall}>Main outstanding invoices</div>
                    {outstandingInvoices.length === 0 ? (
                      <div style={{color:'#5a6b4f', fontSize:13, padding:'8px 0'}}>Nothing outstanding ✓</div>
                    ) : outstandingInvoices.map(i => {
                      const c = statusStyles[i.effective_status] || { bg:'#E6EAE9', fg:'#61707D' };
                      return (
                        <div key={i.id}
                          onClick={() => setFinancialAsset(i.building_ref)}
                          style={{display:'grid', gridTemplateColumns:'1fr 80px 110px', gap:10, alignItems:'center', padding:'9px 6px', cursor:'pointer', borderRadius:6, transition:'background 0.12s'}}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(160,125,60,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          title={'Open ' + i.building_name + ' financial summary'}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13, fontWeight:500, color:'var(--text-dark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{i.building_name}</div>
                            <div style={{fontSize:11, color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{i.description || i.invoice_number || '—'}</div>
                          </div>
                          <span style={{display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, background:c.bg, color:c.fg, textAlign:'center', whiteSpace:'nowrap'}}>{i.effective_status}</span>
                          <div style={{fontSize:13, fontWeight:600, color:'var(--text-dark)', textAlign:'right'}}>{fmtMoney(i.amount_aed)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          };

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
              {activeAssetType === 'Summary'         && renderSummary()}
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
      {financialAsset && <AssetFinancialPanel building={financialAsset} onClose={() => setFinancialAsset(null)}/>}
    </div>
  );
};

