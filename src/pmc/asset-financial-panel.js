// ==================== ASSET FINANCIAL MODAL (Al Qurm trial) ====================
// Asset-level deep-dive. Styled to match UnitDetailModal so both
// deep-dives feel like a pair.
//
// Layout:
//   1. Header — eyebrow + asset name + address + (Download / close)
//   2. Period pills (This month / 3 / 6 / 12 / 24 months)
//   3. Financial summary — 5 KPI tiles (same shape as the Assets page)
//   4. Income timeline — Chart.js 12-month stacked bars (always last 12)
//   5. Per-unit breakdown — click a row → UnitDetailModal
//   6. Invoices — sortable, truncated INV #, centred status + slots
//   7. ExportPrintModal-driven download (PDF / Excel / CSV + date range)
//
// Data: fetches every invoice for the building's units on mount (no
// period filter) so the period pills can rebucket internally without
// going back to Supabase.
const AssetFinancialPanel = ({ building, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [monthsBack, setMonthsBack] = useState(12);
  const [showDownload, setShowDownload] = useState(false);
  const [openUnit, setOpenUnit] = useState(null);    // row click → UnitDetailModal
  const [invoiceSort, setInvoiceSort] = useState({ key: 'due_date', dir: 'desc' });
  const chartCanvasRef = useRef(null);
  const chartInstance  = useRef(null);
  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const fmtDate = (s) => { try { return s ? new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'; } catch (_) { return s; } };

  // Esc closes (only when no nested modal is showing)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !showDownload && !openUnit) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDownload, openUnit]);

  const unitIds = (building.units || []).map(u => u.id);
  const unitMap = Object.fromEntries((building.units || []).map(u => [u.id, u]));
  const tenantByUnit = {};
  for (const t of (building.tenants || [])) tenantByUnit[t.unit_id] = t;

  // ---- Fetch all invoices once ---------------------------------------
  useEffect(() => {
    let mounted = true;
    if (!supabaseClient || unitIds.length === 0) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data: invs } = await supabaseClient
        .from('invoices')
        .select('id, unit_id, invoice_number, description, amount_aed, due_date, status, created_at')
        .in('unit_id', unitIds)
        .order('due_date', { ascending: false });
      if (!mounted) return;
      setRawInvoices(invs || []);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [building.id]);

  // ---- Effective status (same rule used app-wide) --------------------
  const _now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const effectiveStatusOf = (i) => {
    if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
    if (!i.due_date) return i.status;
    const due = new Date(i.due_date);
    if (isNaN(due.getTime())) return i.status;
    const days = Math.floor((due.getTime() - _now) / dayMs);
    if (days < 0)  return 'Pending';
    if (days > 30) return 'Future';
    return 'Upcoming';
  };

  // ---- Period filter --------------------------------------------------
  const today = new Date();
  const periodStart = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1);
  const periodStartIso = periodStart.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  const annotated = rawInvoices.map(i => {
    const u = unitMap[i.unit_id];
    const t = tenantByUnit[i.unit_id];
    return {
      ...i,
      effective_status: effectiveStatusOf(i),
      unit_number: u ? u.unit_number : '—',
      floor: u ? u.floor : null,
      resident_name: t ? t.resident_name : (u && u.tenant_name) || '—',
      building_name: building.name,
    };
  });
  const periodInvoices = annotated.filter(i => {
    const d = (i.created_at || '').slice(0, 10);
    return d >= periodStartIso && d <= todayIso;
  });

  // ---- Period totals --------------------------------------------------
  const totalBilled    = periodInvoices.reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const totalCollected = periodInvoices.filter(i => i.effective_status === 'Paid').reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const totalOverdue   = periodInvoices.filter(i => i.effective_status === 'Pending').reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const totalUpcoming  = periodInvoices.filter(i => i.effective_status === 'Upcoming').reduce((s, i) => s + Number(i.amount_aed || 0), 0);
  const totalFuture    = periodInvoices.filter(i => i.effective_status === 'Future').reduce((s, i) => s + Number(i.amount_aed || 0), 0);

  // ---- Per-unit breakdown --------------------------------------------
  const perUnit = {};
  for (const u of (building.units || [])) {
    perUnit[u.id] = { unit: u, tenant_name: tenantByUnit[u.id]?.resident_name || (u.tenant_name || null), billed: 0, collected: 0, outstanding: 0 };
  }
  for (const i of periodInvoices) {
    const row = perUnit[i.unit_id];
    if (!row) continue;
    row.billed += Number(i.amount_aed || 0);
    if (i.effective_status === 'Paid') row.collected += Number(i.amount_aed || 0);
    else if (i.effective_status === 'Pending' || i.effective_status === 'Upcoming') row.outstanding += Number(i.amount_aed || 0);
  }
  const perUnitRows = Object.values(perUnit)
    .map(r => ({ ...r, paid_pct: r.billed > 0 ? Math.round(100 * r.collected / r.billed) : null }))
    .sort((a, b) => b.billed - a.billed);

  // ---- 12-month chart series (independent of period) -----------------
  const series = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    series.push({ month: key, label: d.toLocaleString('en-GB', { month: 'short' }), collected: 0, outstanding: 0 });
  }
  const byMonth = Object.fromEntries(series.map(s => [s.month, s]));
  for (const i of annotated) {
    const m = (i.created_at || '').slice(0, 7);
    const bucket = byMonth[m];
    if (!bucket) continue;
    if (i.effective_status === 'Paid') bucket.collected += Number(i.amount_aed || 0);
    else if (i.effective_status === 'Pending' || i.effective_status === 'Upcoming') bucket.outstanding += Number(i.amount_aed || 0);
  }

  // Chart render — defer one tick so modal layout settles before
  // Chart.js measures the canvas. This was the 'empty graph' bug.
  useEffect(() => {
    if (loading || !window.Chart) return;
    const t = setTimeout(() => {
      if (!chartCanvasRef.current) return;
      if (chartInstance.current) chartInstance.current.destroy();
      const ctx = chartCanvasRef.current.getContext('2d');
      chartInstance.current = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: series.map(m => m.label),
          datasets: [
            { label: 'Collected',   data: series.map(m => Math.round(m.collected)),   backgroundColor: 'rgba(90,107,79,0.9)',  borderRadius: 6, stack: 'rent', maxBarThickness: 36 },
            { label: 'Outstanding', data: series.map(m => Math.round(m.outstanding)), backgroundColor: 'rgba(139,74,66,0.75)', borderRadius: 6, stack: 'rent', maxBarThickness: 36 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 12, family: 'inherit' }, color: '#61707D', boxWidth: 12, boxHeight: 12, padding: 16 } },
            tooltip: { backgroundColor:'#131F23', padding: 10, cornerRadius: 6, callbacks: { label: (ctx) => ctx.dataset.label + ': AED ' + (ctx.parsed.y || 0).toLocaleString() } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#61707D' } },
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { font: { size: 11 }, color: '#8a98a2', callback: (v) => v >= 1000 ? (v / 1000) + 'k' : v } },
          },
          animation: { duration: 350 },
        },
      });
    }, 60);
    return () => { clearTimeout(t); if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [loading, rawInvoices.length]);

  // ---- Invoice sorting -----------------------------------------------
  const toggleSort = (key) => {
    setInvoiceSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: ['amount_aed','due_date','created_at'].includes(key) ? 'desc' : 'asc' }
    );
  };
  const sortedInvoices = periodInvoices.slice().sort((a, b) => {
    const k = invoiceSort.key;
    const sign = invoiceSort.dir === 'asc' ? 1 : -1;
    let av = a[k]; let bv = b[k];
    if (k === 'amount_aed') { av = Number(av || 0); bv = Number(bv || 0); }
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (av < bv) return -1 * sign;
    if (av > bv) return  1 * sign;
    return 0;
  });
  const SortArrow = ({ active, dir }) => (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={active ? '#131F23' : '#c0c8cd'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:4,verticalAlign:'middle',transform: active && dir === 'asc' ? 'rotate(180deg)' : 'none'}}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );

  // ---- Truncate long auto-generated invoice numbers -------------------
  const shortInv = (n) => {
    if (!n) return '—';
    const s = String(n);
    return s.length > 14 ? s.slice(0, 12) + '…' : s;
  };

  // ---- Shared Section wrapper -----------------------------------------
  const Section = ({ label, children, right }) => (
    <div style={{marginBottom:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>{label}</div>
        {right}
      </div>
      {children}
    </div>
  );

  // ---- KPI tile (used for the 5 financial cards) ----------------------
  const KpiTile = ({ label, value, color, subline }) => (
    <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'16px 18px'}}>
      <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:8}}>{label}</div>
      <div style={{fontSize:22,fontWeight:600,letterSpacing:'-0.02em',color:color || 'var(--text-dark)',lineHeight:1}}>{value}</div>
      {subline && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>{subline}</div>}
    </div>
  );

  // ---- Invoice status pill colour ------------------------------------
  const statusPill = (eff) => ({
    'Paid':     { bg:'#e6efe1', fg:'#5a6b4f' },
    'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },
    'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },
    'Future':   { bg:'#E6EAE9', fg:'#61707D' },
    'Cancelled':{ bg:'#E6EAE9', fg:'#61707D' },
  }[eff] || { bg:'#E6EAE9', fg:'#61707D' });

  const periodLabel = (monthsBack === 1)
    ? new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    : 'Last ' + monthsBack + ' months';

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1180,maxHeight:'92vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header */}
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Asset · Financial summary</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">{building.address || '—'}{building.property_type ? ' · ' + building.property_type : ''}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="btn btn-sm" type="button" onClick={() => setShowDownload(true)} title="Export as PDF, Excel or CSV — with a date-range picker.">
              Download data
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
          {/* Period pills */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:12}}>
            <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Period</div>
            <div style={{display:'flex',gap:4,background:'#fff',border:'1px solid var(--border-light)',borderRadius:8,padding:3}}>
              {[
                { m: 1,  label: 'This month' },
                { m: 3,  label: '3 months' },
                { m: 6,  label: '6 months' },
                { m: 12, label: '12 months' },
                { m: 24, label: '24 months' },
              ].map(opt => {
                const active = monthsBack === opt.m;
                return (
                  <button key={opt.m} type="button" onClick={() => setMonthsBack(opt.m)}
                    style={{padding:'6px 14px',fontSize:12,fontWeight: active ? 600 : 500,color: active ? '#fff' : 'var(--text-secondary)',background: active ? '#3E4C59' : 'transparent',border:'none',borderRadius:6,cursor:'pointer',transition:'background 0.12s,color 0.12s'}}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div style={{padding:60,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading…</div>
          ) : (<>
            {/* Financial Summary — 5 KPI tiles in a single row */}
            <Section label="Financial Summary">
              <div style={{display:'grid',gridTemplateColumns:'repeat(5, minmax(0, 1fr))',gap:12}}>
                <KpiTile label="Total Billed" value={fmt(totalBilled)}/>
                <KpiTile label="Collected"    value={fmt(totalCollected)} color="#5a6b4f"/>
                <KpiTile label="Outstanding"  value={fmt(totalOverdue)}   color={totalOverdue > 0 ? '#8b4a42' : null}/>
                <KpiTile label="Upcoming"     value={fmt(totalUpcoming)}  color={totalUpcoming > 0 ? '#a07d3c' : null}/>
                <KpiTile label="Future"       value={fmt(totalFuture)}    color="#61707D"/>
              </div>
            </Section>

            {/* 12-month chart */}
            <Section label="Income Timeline · 12 months" right={<span style={{fontSize:11,color:'var(--text-muted)'}}>Collected vs outstanding</span>}>
              <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'20px 22px'}}>
                <div style={{height:260,position:'relative'}}>
                  <canvas ref={chartCanvasRef}/>
                </div>
              </div>
            </Section>

            {/* Per-unit breakdown — clickable rows open UnitDetailModal */}
            <Section label={'Per-unit breakdown · ' + perUnitRows.length + ' unit' + (perUnitRows.length===1?'':'s')} right={<span style={{fontSize:11,color:'var(--text-muted)'}}>Click a row to open the unit</span>}>
              <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,overflow:'hidden'}}>
                {perUnitRows.length === 0 ? (
                  <div style={{padding:24,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No units yet for this asset.</div>
                ) : (
                  <div style={{maxHeight:380,overflowY:'auto'}}>
                    <table className="data-table" style={{fontSize:12,width:'100%'}}>
                      <thead>
                        <tr>
                          <th style={{textAlign:'left',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Unit</th>
                          <th style={{textAlign:'left',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Tenant</th>
                          <th style={{textAlign:'right',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Billed</th>
                          <th style={{textAlign:'right',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Collected</th>
                          <th style={{textAlign:'right',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Outstanding</th>
                          <th style={{textAlign:'right',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600,minWidth:140}}>% Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perUnitRows.map(r => {
                          const isVacant = !r.tenant_name;
                          const pct = r.paid_pct == null ? 0 : Math.min(100, Math.max(0, r.paid_pct));
                          const pctColor = pct >= 80 ? '#5a6b4f' : pct >= 50 ? '#a07d3c' : '#8b4a42';
                          return (
                            <tr key={r.unit.id}
                              onClick={() => setOpenUnit({ unit: r.unit })}
                              style={{borderBottom:'1px solid #f0f0f0',background: isVacant ? '#fafafa' : '#fff',cursor:'pointer',transition:'background 0.12s'}}
                              onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                              onMouseLeave={e => e.currentTarget.style.background = isVacant ? '#fafafa' : '#fff'}>
                              <td style={{padding:'12px 14px',fontWeight:500,color:'#131F23'}}>{r.unit.unit_number}{r.unit.floor != null ? ' · F' + r.unit.floor : ''}</td>
                              <td style={{padding:'12px 14px',color: isVacant ? '#61707D' : '#131F23'}}>{isVacant ? <em>Vacant</em> : r.tenant_name}</td>
                              <td style={{padding:'12px 14px',textAlign:'right',color:'#131F23',fontWeight:500}}>{r.billed > 0 ? fmt(r.billed) : '—'}</td>
                              <td style={{padding:'12px 14px',textAlign:'right',color:'#5a6b4f',fontWeight:500}}>{r.collected > 0 ? fmt(r.collected) : '—'}</td>
                              <td style={{padding:'12px 14px',textAlign:'right',color: r.outstanding > 0 ? '#8b4a42' : '#61707D',fontWeight: r.outstanding > 0 ? 600 : 500}}>{r.outstanding > 0 ? fmt(r.outstanding) : '—'}</td>
                              <td style={{padding:'12px 14px',textAlign:'right'}}>
                                {r.paid_pct == null ? (
                                  <span style={{color:'#61707D'}}>—</span>
                                ) : (
                                  <div style={{display:'flex',alignItems:'center',gap:10,justifyContent:'flex-end'}}>
                                    <div style={{width:64,height:6,background:'#E6EAE9',borderRadius:3,overflow:'hidden'}}>
                                      <div style={{width: pct + '%',height:'100%',background:pctColor,transition:'width 0.2s ease'}}/>
                                    </div>
                                    <span style={{fontSize:12,fontWeight:600,color:pctColor,minWidth:36,textAlign:'right'}}>{pct}%</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Section>

            {/* Invoices — sortable, centered status + slots, truncated INV # */}
            <Section label={'Invoices · ' + sortedInvoices.length + ' in period'} right={<span style={{fontSize:11,color:'var(--text-muted)'}}>{periodLabel}</span>}>
              <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,overflow:'hidden'}}>
                {sortedInvoices.length === 0 ? (
                  <div style={{padding:24,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No invoices in the selected period.</div>
                ) : (
                  <div style={{maxHeight:480,overflowY:'auto'}}>
                    <table className="data-table" style={{fontSize:12,width:'100%',tableLayout:'fixed'}}>
                      <colgroup>
                        <col style={{width:'10%'}}/>
                        <col style={{width:'14%'}}/>
                        <col style={{width:'22%'}}/>
                        <col style={{width:'10%'}}/>
                        <col style={{width:'10%'}}/>
                        <col style={{width:'9%'}}/>
                        <col style={{width:'12%'}}/>
                        <col style={{width:'13%'}}/>
                      </colgroup>
                      <thead>
                        <tr>
                          {/* Sortable columns up to Status */}
                          {[
                            { key: 'unit_number',    label: 'Unit',        align: 'left'   },
                            { key: 'invoice_number', label: 'Number',      align: 'left'   },
                            { key: 'description',    label: 'Description', align: 'left'   },
                            { key: 'due_date',       label: 'Due',         align: 'left'   },
                            { key: 'effective_status', label: 'Status',    align: 'center' },
                          ].map(col => {
                            const active = invoiceSort.key === col.key;
                            return (
                              <th key={col.key} onClick={() => toggleSort(col.key)}
                                style={{textAlign:col.align,padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color: active ? '#131F23' : '#61707D',fontWeight:600,cursor:'pointer',userSelect:'none'}}>
                                <span style={{display:'inline-flex',alignItems:'center'}}>{col.label}<SortArrow active={active} dir={invoiceSort.dir}/></span>
                              </th>
                            );
                          })}
                          {/* Non-sortable slot columns, centred */}
                          <th style={{textAlign:'center',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Invoice</th>
                          <th style={{textAlign:'center',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Proof of payment</th>
                          {/* Amount — sortable, rightmost */}
                          {(() => {
                            const active = invoiceSort.key === 'amount_aed';
                            return (
                              <th onClick={() => toggleSort('amount_aed')}
                                style={{textAlign:'right',padding:'10px 14px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color: active ? '#131F23' : '#61707D',fontWeight:600,cursor:'pointer',userSelect:'none'}}>
                                <span style={{display:'inline-flex',alignItems:'center'}}>Amount<SortArrow active={active} dir={invoiceSort.dir}/></span>
                              </th>
                            );
                          })()}
                        </tr>
                      </thead>
                      {/* Re-order columns visually: Unit, Number, Description, Due, Status, Invoice, Proof, Amount */}
                      <tbody>
                        {sortedInvoices.map(i => {
                          const pill = statusPill(i.effective_status);
                          return (
                            <tr key={i.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                              <td style={{padding:'12px 14px',fontWeight:500,color:'#131F23',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{i.unit_number}{i.floor != null ? ' · F' + i.floor : ''}</td>
                              <td style={{padding:'12px 14px',fontWeight:500,color:'#131F23',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={i.invoice_number}>{shortInv(i.invoice_number || i.id.slice(0, 8))}</td>
                              <td style={{padding:'12px 14px',color:'#61707D',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={i.description}>{i.description || '—'}</td>
                              <td style={{padding:'12px 14px',color:'#61707D',whiteSpace:'nowrap'}}>{fmtDate(i.due_date)}</td>
                              <td style={{padding:'12px 14px',textAlign:'center'}}>
                                <span style={{display:'inline-block',fontSize:10,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',color:pill.fg,background:pill.bg,padding:'3px 10px',borderRadius:4}}>{i.effective_status}</span>
                              </td>
                              <td style={{padding:'12px 14px',textAlign:'center'}}>
                                <div style={{display:'flex',justifyContent:'center'}}>{typeof InvoiceSlotCell !== 'undefined' ? <InvoiceSlotCell invoice={i} slot="invoice"/> : '—'}</div>
                              </td>
                              <td style={{padding:'12px 14px',textAlign:'center'}}>
                                <div style={{display:'flex',justifyContent:'center'}}>{typeof InvoiceSlotCell !== 'undefined' ? <InvoiceSlotCell invoice={i} slot="payment_proof"/> : '—'}</div>
                              </td>
                              <td style={{padding:'12px 14px',textAlign:'right',color: i.effective_status === 'Pending' ? '#8b4a42' : '#131F23',fontWeight:600,whiteSpace:'nowrap'}}>{fmt(i.amount_aed)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Section>
          </>)}
        </div>
      </div>
    </div>

    {/* Nested unit modal opened from per-unit row click */}
    {openUnit && typeof UnitDetailModal !== 'undefined' && (
      <UnitDetailModal unit={openUnit.unit} building={building} onClose={() => setOpenUnit(null)}/>
    )}

    {/* Standard download flow — PDF / Excel / CSV + date range */}
    {typeof ExportPrintModal !== 'undefined' && (
      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id: 'invoices', label: 'Invoices',
            title: building.name + ' · Invoices',
            sheetName: 'Invoices', filenameBase: building.name.replace(/[^A-Za-z0-9._-]/g, '_') + '-invoices',
            dateField: 'created_at', rows: annotated,
            columns: [
              { key: 'invoice_number', header: 'Invoice #',    width: 16 },
              { key: 'unit_number',    header: 'Unit',         width: 10 },
              { key: 'resident_name',  header: 'Tenant',       width: 22 },
              { key: 'description',    header: 'Description',  width: 30 },
              { key: 'amount_aed',     header: 'Amount (AED)', width: 14, halign: 'right', numeric: true },
              { key: 'effective_status', header: 'Status',     width: 12 },
              { key: 'due_date',       header: 'Due',          width: 12 },
              { key: 'created_at',     header: 'Issued',       width: 12, value: (r) => r.created_at ? r.created_at.slice(0, 10) : '' },
            ],
            extraMetadata: {
              'Asset':            building.name,
              'Address':          building.address || '—',
              'Period':           periodLabel,
              'Total Billed':     fmt(totalBilled),
              'Collected':        fmt(totalCollected),
              'Outstanding':      fmt(totalOverdue),
              'Upcoming':         fmt(totalUpcoming),
              'Future':           fmt(totalFuture),
            },
          },
          {
            id: 'per_unit', label: 'Per-unit breakdown',
            title: building.name + ' · Per-unit breakdown',
            sheetName: 'PerUnit', filenameBase: building.name.replace(/[^A-Za-z0-9._-]/g, '_') + '-per-unit',
            rows: perUnitRows.map(r => ({
              unit: r.unit.unit_number, floor: r.unit.floor != null ? r.unit.floor : '',
              tenant: r.tenant_name || 'Vacant',
              billed: Math.round(r.billed), collected: Math.round(r.collected), outstanding: Math.round(r.outstanding),
              paid_pct: r.paid_pct == null ? '' : r.paid_pct,
            })),
            columns: [
              { key: 'unit',        header: 'Unit',         width: 10 },
              { key: 'floor',       header: 'Floor',        width: 8,  halign: 'right' },
              { key: 'tenant',      header: 'Tenant',       width: 24 },
              { key: 'billed',      header: 'Billed (AED)', width: 14, halign: 'right', numeric: true },
              { key: 'collected',   header: 'Collected (AED)', width: 14, halign: 'right', numeric: true },
              { key: 'outstanding', header: 'Outstanding (AED)', width: 14, halign: 'right', numeric: true },
              { key: 'paid_pct',    header: '% Paid',       width: 10, halign: 'right' },
            ],
            extraMetadata: { 'Asset': building.name, 'Period': periodLabel, 'Units': perUnitRows.length },
          },
          {
            id: 'timeline', label: 'Monthly timeline',
            title: building.name + ' · 12-month income',
            sheetName: 'Timeline', filenameBase: building.name.replace(/[^A-Za-z0-9._-]/g, '_') + '-12mo-timeline',
            rows: series.map(s => ({ month: s.label, collected: Math.round(s.collected), outstanding: Math.round(s.outstanding) })),
            columns: [
              { key: 'month',       header: 'Month',           width: 10 },
              { key: 'collected',   header: 'Collected (AED)', width: 16, halign: 'right', numeric: true },
              { key: 'outstanding', header: 'Outstanding (AED)', width: 16, halign: 'right', numeric: true },
            ],
            extraMetadata: { 'Asset': building.name },
          },
        ]}
      />
    )}
    </>
  );
};
