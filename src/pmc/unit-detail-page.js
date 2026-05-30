// ==================== UNIT DETAIL PAGE (Phase 1A trial) =====================
// Full-screen landlord deep-dive on one unit. Currently gated to
// buildings whose name === 'Al Qurm View' so we can validate the
// design against the user before rolling it out to every asset.
//
// Surfaces (top → bottom):
//   1. Sticky header — back · breadcrumb (Asset / Unit) · close
//   2. Status strip — Occupied / Vacant / Owner-occupied chip + property type
//   3. Current tenant card — name + phone + lease end + monthly
//   4. Period selector — Last 3 / 6 / 12 / 24 months
//   5. Big-number row — Billed · Collected · Outstanding · Net
//   6. 12-month income chart — Chart.js stacked bars
//   7. Invoice ledger — every invoice ever for this unit, sortable
//   8. Service request history — every SR ever for this unit
//
// Data shape kept local; no app-wide route added so the rest of the
// navigation stays intact. The component returns a fixed-position
// overlay so the existing UnitDetailModal callers don't need to
// know the difference.
const UnitDetailPage = ({ unit, building, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [profile, setProfile] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [srs, setSrs] = useState([]);
  // Period (months back) — local to this page.
  const [monthsBack, setMonthsBack] = useState(12);
  const chartCanvasRef = useRef(null);
  const chartInstance  = useRef(null);

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const fmtDate = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
    catch (_) { return s; }
  };

  // ---- Initial load ---------------------------------------------------
  useEffect(() => {
    let mounted = true;
    if (!supabaseClient) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [{ data: a }, { data: invs }, { data: srRows }] = await Promise.all([
          supabaseClient.from('resident_assignments')
            .select('profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, ownership_start, cheques_per_year, contract_number')
            .eq('unit_id', unit.id)
            .maybeSingle(),
          supabaseClient.from('invoices')
            .select('id, invoice_number, description, amount_aed, due_date, status, created_at, source_type')
            .eq('unit_id', unit.id)
            .order('due_date', { ascending: false }),
          supabaseClient.from('service_requests')
            .select('id, category, description, status, priority, created_at, resolved_at, preferred_date, notes')
            .eq('unit_id', unit.id)
            .order('created_at', { ascending: false }),
        ]);
        let p = null;
        if (a && a.profile_id) {
          const { data: pr } = await supabaseClient
            .from('profiles')
            .select('id, full_name, phone, date_of_birth, passport_number, emirates_id, employer, occupation')
            .eq('id', a.profile_id)
            .maybeSingle();
          p = pr || null;
        }
        if (!mounted) return;
        setAssignment(a || null);
        setProfile(p);
        setInvoices(invs || []);
        setSrs(srRows || []);
      } catch (e) {
        if (mounted) setError(String(e.message || e));
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [unit.id]);

  // ---- Period bounds + filtered invoices -----------------------------
  const today = new Date();
  const periodStart = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1);
  const periodStartIso = periodStart.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const periodInvoices = invoices.filter(i => {
    const d = (i.created_at || '').slice(0, 10);
    return d >= periodStartIso && d <= todayIso;
  });

  // Effective status (same rule used everywhere else in the app).
  const _effective = (i) => {
    if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
    if (!i.due_date) return i.status;
    const due = new Date(i.due_date);
    if (isNaN(due.getTime())) return i.status;
    const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / (24*60*60*1000));
    if (daysUntilDue < 0)  return 'Pending';   // past due
    if (daysUntilDue > 30) return 'Future';
    return 'Upcoming';
  };

  // Big-number row stats
  const billed     = periodInvoices.reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const collected  = periodInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const outstanding = periodInvoices.filter(i => {
    const eff = _effective(i);
    return eff === 'Pending' || eff === 'Upcoming';
  }).reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const netCash = collected; // Phase 1A: no cost tracking yet.

  // ---- 12-month chart series -----------------------------------------
  const series = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    series.push({ month: key, label: d.toLocaleString('en-GB', { month: 'short' }), collected: 0, outstanding: 0 });
  }
  const byMonth = Object.fromEntries(series.map(s => [s.month, s]));
  for (const i of invoices) {
    const m = (i.created_at || '').slice(0, 7);
    const bucket = byMonth[m];
    if (!bucket) continue;
    const eff = _effective(i);
    if (i.status === 'Paid') bucket.collected += Number(i.amount_aed || 0);
    else if (eff === 'Pending' || eff === 'Upcoming') bucket.outstanding += Number(i.amount_aed || 0);
  }

  // ---- Render Chart.js once data is ready ----------------------------
  useEffect(() => {
    if (loading || !chartCanvasRef.current || !window.Chart) return;
    if (chartInstance.current) chartInstance.current.destroy();
    const ctx = chartCanvasRef.current.getContext('2d');
    chartInstance.current = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: series.map(m => m.label),
        datasets: [
          { label: 'Collected',   data: series.map(m => Math.round(m.collected)),   backgroundColor: 'rgba(90,107,79,0.85)',  borderRadius: 4, stack: 'rent' },
          { label: 'Outstanding', data: series.map(m => Math.round(m.outstanding)), backgroundColor: 'rgba(139,74,66,0.65)', borderRadius: 4, stack: 'rent' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#61707D' } },
          tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': AED ' + (ctx.parsed.y || 0).toLocaleString() } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#61707D' } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 }, color: '#61707D', callback: (v) => v >= 1000 ? (v / 1000) + 'k' : v } },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [loading, JSON.stringify(series)]);

  // ---- Status chip ----------------------------------------------------
  const isVacant   = !assignment && !unit.tenant_name;
  const isOwnerOcc = assignment && assignment.tenure === 'Owner';
  const statusChip = isVacant
    ? { label: 'Vacant',          fg: '#a07d3c', bg: '#fdf5e6' }
    : isOwnerOcc
      ? { label: 'Owner-occupied', fg: '#3E4C59', bg: '#E6EAE9' }
      : { label: 'Occupied',       fg: '#5a6b4f', bg: '#e6efe1' };

  // ---- Tenant info (residential assignment or non-residential tenant) ----
  const tenant = profile
    ? { name: profile.full_name, phone: profile.phone, monthly: assignment?.monthly_payment_aed, lease_end: assignment?.lease_end, tenure: assignment?.tenure, contract: assignment?.contract_number, cheques: assignment?.cheques_per_year }
    : (unit.tenant_name
        ? { name: unit.tenant_name, phone: unit.tenant_phone, monthly: unit.tenant_monthly_payment_aed, lease_end: unit.tenant_lease_end, tenure: unit.tenant_tenure, contract: unit.tenant_contract_number, cheques: null }
        : null);
  // ---- Invoice status pill colour ------------------------------------
  const invoiceStatusPill = (eff) => {
    const map = {
      'Paid':     { bg:'#e6efe1', fg:'#5a6b4f' },
      'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },
      'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },
      'Future':   { bg:'#E6EAE9', fg:'#61707D' },
      'Cancelled':{ bg:'#E6EAE9', fg:'#61707D' },
    };
    return map[eff] || map['Future'];
  };

  return (
    <div style={{position:'fixed',inset:0,background:'var(--bg-page)',zIndex:1000,overflowY:'auto'}}>
      {/* ---- Sticky header ---- */}
      <div style={{position:'sticky',top:0,zIndex:5,background:'#fff',borderBottom:'1px solid var(--border-light)',padding:'14px 26px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <button onClick={onClose} type="button"
          style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:500,color:'var(--text-secondary)',background:'transparent',border:'none',cursor:'pointer',padding:'6px 10px',borderRadius:6}}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-page)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--text-muted)'}}>
          <span style={{cursor:'pointer'}} onClick={onClose}>{building.name}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          <span style={{color:'var(--text-dark)',fontWeight:600}}>Unit {unit.unit_number}</span>
          {unit.floor != null && <span style={{color:'var(--text-muted)'}}>· Floor {unit.floor}</span>}
        </div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:statusChip.fg,background:statusChip.bg,padding:'4px 9px',borderRadius:3,fontWeight:700}}>{statusChip.label}</span>
          <span style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#fff',background:'#3E4C59',padding:'4px 9px',borderRadius:3,fontWeight:700}}>{building.property_type}</span>
          <button type="button" onClick={onClose}
            style={{width:32,height:32,borderRadius:'50%',border:'none',background:'transparent',cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center',marginLeft:6}}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-page)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{padding:80,textAlign:'center',color:'var(--text-muted)',fontSize:14}}>Loading…</div>
      ) : error ? (
        <div style={{padding:60,maxWidth:600,margin:'0 auto'}}>
          <div className="card"><div style={{padding:24,color:'#8b4a42',fontSize:13}}>Error: {error}</div></div>
        </div>
      ) : (
        <div style={{padding:'24px 32px 60px',maxWidth:1280,margin:'0 auto'}}>
          {/* ---- Page title ---- */}
          <div style={{marginBottom:24}}>
            <h1 style={{fontSize:34,fontWeight:600,letterSpacing:'-0.02em',margin:0,color:'var(--text-dark)'}}>Unit {unit.unit_number}</h1>
            <div style={{fontSize:14,color:'var(--text-muted)',marginTop:6}}>
              {building.name} · {building.address || '—'}{unit.floor != null ? ' · Floor ' + unit.floor : ''}
            </div>
          </div>

          {/* ---- Current tenant card ---- */}
          <div className="card" style={{padding:'20px 22px',marginBottom:18}}>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:14}}>Current {building.property_type === 'Commercial' || building.property_type === 'Commercial Land' ? 'Client' : 'Tenant'}</div>
            {tenant ? (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:18}}>
                <div>
                  <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Name</div>
                  <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)'}}>{tenant.name || '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Phone</div>
                  <div style={{fontSize:14,fontWeight:500}}>{tenant.phone || '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Tenure</div>
                  <div style={{fontSize:14,fontWeight:500,color:'var(--text-dark)'}}>{tenant.tenure || '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Monthly rent</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>{tenant.monthly ? fmt(tenant.monthly) : '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Lease end</div>
                  <div style={{fontSize:14,fontWeight:500,color:'var(--text-dark)'}}>{fmtDate(tenant.lease_end)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Contract #</div>
                  <div style={{fontSize:14,fontWeight:500,color:'var(--text-dark)'}}>{tenant.contract || '—'}</div>
                </div>
              </div>
            ) : (
              <div style={{padding:'14px 0',color:'var(--text-muted)',fontSize:13}}>Vacant — no current {building.property_type === 'Commercial' || building.property_type === 'Commercial Land' ? 'client' : 'tenant'}.</div>
            )}
          </div>

          {/* ---- Period selector ---- */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:12}}>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Financial summary</div>
            <div style={{display:'flex',gap:4,background:'#fff',border:'1px solid var(--border-light)',borderRadius:6,padding:3}}>
              {[
                { m: 3,  label: '3 months' },
                { m: 6,  label: '6 months' },
                { m: 12, label: '12 months' },
                { m: 24, label: '24 months' },
              ].map(opt => {
                const active = monthsBack === opt.m;
                return (
                  <button key={opt.m} type="button" onClick={() => setMonthsBack(opt.m)}
                    style={{padding:'6px 14px',fontSize:12,fontWeight: active ? 600 : 400,color: active ? '#fff' : 'var(--text-secondary)',background: active ? '#3E4C59' : 'transparent',border:'none',borderRadius:4,cursor:'pointer',transition:'background 0.12s'}}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- Big number row ---- */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:14,marginBottom:22}}>
            {[
              { label: 'Billed',      value: fmt(billed) },
              { label: 'Collected',   value: fmt(collected),   color:'#5a6b4f' },
              { label: 'Outstanding', value: fmt(outstanding), color: outstanding > 0 ? '#8b4a42' : null },
              { label: 'Net cash',    value: fmt(netCash),     color:'#5a6b4f', sub:'collected − costs (cost tracking next phase)' },
            ].map((it, i) => (
              <div key={i} className="card" style={{padding:'18px 20px'}}>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>{it.label}</div>
                <div style={{fontSize:26,fontWeight:600,color:it.color || 'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1}}>{it.value}</div>
                {it.sub && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6,lineHeight:1.4}}>{it.sub}</div>}
              </div>
            ))}
          </div>

          {/* ---- 12-month income chart ---- */}
          <div className="card" style={{padding:'20px 22px',marginBottom:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>12-month income</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>Collected vs outstanding · monthly</div>
            </div>
            <div style={{height:240,position:'relative'}}>
              <canvas ref={chartCanvasRef}/>
            </div>
          </div>

          {/* ---- Invoice ledger ---- */}
          <div className="card" style={{padding:'20px 22px',marginBottom:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>Invoices · {invoices.length}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>Every invoice ever issued for this unit</div>
            </div>
            {invoices.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No invoices yet for this unit.</div>
            ) : (
              <div style={{maxHeight:420,overflowY:'auto'}}>
                <table className="data-table" style={{fontSize:12,width:'100%'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Number</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Description</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Due</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Status</th>
                      <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(i => {
                      const eff = _effective(i);
                      const pill = invoiceStatusPill(eff);
                      return (
                        <tr key={i.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                          <td style={{padding:'9px 10px',fontWeight:500,color:'var(--text-dark)'}}>{i.invoice_number || i.id.slice(0, 8)}</td>
                          <td style={{padding:'9px 10px',color:'var(--text-secondary)'}}>{i.description || '—'}</td>
                          <td style={{padding:'9px 10px',color:'var(--text-muted)'}}>{fmtDate(i.due_date)}</td>
                          <td style={{padding:'9px 10px'}}>
                            <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',color:pill.fg,background:pill.bg,padding:'3px 8px',borderRadius:3}}>{eff}</span>
                          </td>
                          <td style={{padding:'9px 10px',textAlign:'right',fontWeight:600,color:'var(--text-dark)'}}>{fmt(i.amount_aed)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Service request history ---- */}
          <div className="card" style={{padding:'20px 22px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>Service requests · {srs.length}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>Every request ever logged for this unit</div>
            </div>
            {srs.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No service requests yet for this unit ✓</div>
            ) : (
              <div style={{maxHeight:380,overflowY:'auto'}}>
                <table className="data-table" style={{fontSize:12,width:'100%'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Created</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Category</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Description</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Priority</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Status</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {srs.map(s => (
                      <tr key={s.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                        <td style={{padding:'9px 10px',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{fmtDate(s.created_at)}</td>
                        <td style={{padding:'9px 10px',fontWeight:500,color:'var(--text-dark)'}}>{s.category}</td>
                        <td style={{padding:'9px 10px',color:'var(--text-secondary)',maxWidth:380,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.description}>{s.description}</td>
                        <td style={{padding:'9px 10px'}}>
                          <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',color: s.priority === 'Urgent' ? '#8b4a42' : s.priority === 'High' ? '#a07d3c' : 'var(--text-secondary)'}}>{s.priority}</span>
                        </td>
                        <td style={{padding:'9px 10px'}}>
                          <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',color: ['Closed','Done'].includes(s.status) ? '#5a6b4f' : 'var(--text-secondary)'}}>{s.status}</span>
                        </td>
                        <td style={{padding:'9px 10px',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{fmtDate(s.resolved_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
