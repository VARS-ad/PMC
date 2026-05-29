// ==================== ASSET FINANCIAL MODAL (Al Qurm trial) ====================
// Asset-level deep-dive opened from the Assets page's consolidated
// 'Total Billed' tile. Styled to match UnitDetailModal so the two
// deep-dives feel like a pair.
//
// What lives here:
//   1. Header — eyebrow + asset name + address + (Range + Download)
//   2. Period selector (3/6/12/24 months) that re-runs every aggregate
//      on this page — Total Billed, Collected, Outstanding, Upcoming,
//      Future, the chart series, the invoice list, the per-unit %.
//   3. Financial summary card — five Field rows in Unit-modal language
//   4. 12-month income chart — always shows the trailing 12 months
//      regardless of the period selector (the chart IS the timeline)
//   5. Per-unit breakdown — read-only table with % paid bars
//   6. Invoices table — Unit · Number · Description · Due · Status ·
//      Invoice slot · Proof of payment slot · Amount.
//      Uses <InvoiceSlotCell> so the user can view / download / upload
//      both files exactly like everywhere else in the app.
//   7. ExportPrintModal-driven Download (PDF / xlsx / CSV) — multi-
//      dataset: Invoices, Per-unit breakdown, Monthly timeline.
//
// Data: we fetch all invoices for the building's units once (without
// the page's outer time-range filter) so the modal can re-bucket
// internally as the user changes the period selector.
const AssetFinancialPanel = ({ building, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [rawInvoices, setRawInvoices] = useState([]);
  const [monthsBack, setMonthsBack] = useState(12);
  const [showDownload, setShowDownload] = useState(false);
  const chartCanvasRef = useRef(null);
  const chartInstance  = useRef(null);
  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const fmtDate = (s) => { try { return s ? new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'; } catch (_) { return s; } };

  // Esc closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Maps the building.units → quick lookups
  const unitIds = (building.units || []).map(u => u.id);
  const unitMap = Object.fromEntries((building.units || []).map(u => [u.id, u]));
  const tenantByUnit = {};
  for (const t of (building.tenants || [])) tenantByUnit[t.unit_id] = t;

  // ---- Independent fetch: all invoices for this building's units -----
  // Bypasses the page-level time range so the modal can rebucket
  // freely. ~80 units × ~6 invoices each = ~480 rows for Al Qurm — well
  // within a single round-trip.
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

  // ---- Effective status helper (same rule used everywhere) -----------
  const _now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const effectiveStatusOf = (i) => {
    if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
    if (!i.due_date) return i.status;
    const due = new Date(i.due_date);
    if (isNaN(due.getTime())) return i.status;
    const daysUntilDue = Math.floor((due.getTime() - _now) / dayMs);
    if (daysUntilDue < 0)  return 'Pending';
    if (daysUntilDue > 30) return 'Future';
    return 'Upcoming';
  };

  // ---- Period filter --------------------------------------------------
  const today = new Date();
  const periodStart = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1);
  const periodStartIso = periodStart.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  // Annotate every invoice once + filter for the selected period.
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

  // ---- Per-unit breakdown (uses period-filtered data) ----------------
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

  // ---- 12-month chart (independent of the period selector) -----------
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

  // ---- Shared display helpers (mirror UnitDetailModal exactly) -------
  const Section = ({ label, children, right }) => (
    <div style={{marginBottom:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>{label}</div>
        {right}
      </div>
      <div style={{background:'#fff',border:'1px solid #E6EAE9',borderRadius:8,padding:'14px 16px'}}>{children}</div>
    </div>
  );
  const Field = ({ label, children, color }) => (
    <div style={{display:'flex',gap:12,padding:'4px 0',fontSize:13}}>
      <div style={{width:160,color:'#61707D'}}>{label}</div>
      <div style={{flex:1,color:color || '#131F23',fontWeight:600}}>{children == null || children === '' ? '—' : children}</div>
    </div>
  );

  // ---- Invoice status pill colour ------------------------------------
  const invoiceStatusPill = (eff) => ({
    'Paid':     { bg:'#e6efe1', fg:'#5a6b4f' },
    'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },
    'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },
    'Future':   { bg:'#E6EAE9', fg:'#61707D' },
    'Cancelled':{ bg:'#E6EAE9', fg:'#61707D' },
  }[eff] || { bg:'#E6EAE9', fg:'#61707D' });

  // Period range label for download metadata
  const periodLabel = (monthsBack === 1)
    ? new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    : 'Last ' + monthsBack + ' months';

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1180,maxHeight:'90vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header — matches UnitDetailModal shape */}
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Asset · Financial summary</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">{building.address || '—'}{building.property_type ? ' · ' + building.property_type : ''}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="btn btn-sm" type="button" onClick={() => setShowDownload(true)} title="Export as PDF, Excel or CSV — with a date-range picker.">
              ↓ Download data
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
          {/* Period pills */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:12}}>
            <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Period</div>
            <div style={{display:'flex',gap:4,background:'#fff',border:'1px solid var(--border-light)',borderRadius:6,padding:3}}>
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
                    style={{padding:'6px 14px',fontSize:12,fontWeight: active ? 600 : 400,color: active ? '#fff' : 'var(--text-secondary)',background: active ? '#3E4C59' : 'transparent',border:'none',borderRadius:4,cursor:'pointer',transition:'background 0.12s'}}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div style={{padding:60,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading…</div>
          ) : (<>
            {/* Financial summary card */}
            <Section label="Financial Summary">
              <Field label="Total Billed">{fmt(totalBilled)}</Field>
              <Field label="Collected"    color="#5a6b4f">{fmt(totalCollected)}</Field>
              <Field label="Outstanding"  color={totalOverdue > 0 ? '#8b4a42' : null}>{fmt(totalOverdue)}</Field>
              <Field label="Upcoming"     color={totalUpcoming > 0 ? '#a07d3c' : null}>{fmt(totalUpcoming)}</Field>
              <Field label="Future"       color={totalFuture   > 0 ? '#61707D' : null}>{fmt(totalFuture)}</Field>
            </Section>

            {/* 12-month income chart (always trailing 12 months, independent
                of the period selector so the timeline view is consistent) */}
            <Section label="Income Timeline · 12 months" right={<span style={{fontSize:11,color:'var(--text-muted)'}}>Collected vs outstanding</span>}>
              <div style={{height:240,position:'relative'}}>
                <canvas ref={chartCanvasRef}/>
              </div>
            </Section>

            {/* Per-unit breakdown — read-only with % paid traffic-light bars */}
            <Section label={'Per-unit breakdown · ' + perUnitRows.length + ' unit' + (perUnitRows.length===1?'':'s')}>
              {perUnitRows.length === 0 ? (
                <div style={{padding:18,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No units yet for this asset.</div>
              ) : (
                <div style={{maxHeight:380,overflowY:'auto',margin:'-4px -4px',padding:'4px 4px'}}>
                  <table className="data-table" style={{fontSize:12,width:'100%'}}>
                    <thead>
                      <tr>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Unit</th>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Tenant</th>
                        <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Billed</th>
                        <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Collected</th>
                        <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Outstanding</th>
                        <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600,minWidth:130}}>% Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perUnitRows.map(r => {
                        const isVacant = !r.tenant_name;
                        const pct = r.paid_pct == null ? 0 : Math.min(100, Math.max(0, r.paid_pct));
                        const pctColor = pct >= 80 ? '#5a6b4f' : pct >= 50 ? '#a07d3c' : '#8b4a42';
                        return (
                          <tr key={r.unit.id} style={{borderBottom:'1px solid #f0f0f0',background: isVacant ? '#fafafa' : '#fff'}}>
                            <td style={{padding:'10px 10px',fontWeight:500,color:'#131F23'}}>{r.unit.unit_number}{r.unit.floor != null ? ' · F' + r.unit.floor : ''}</td>
                            <td style={{padding:'10px 10px',color: isVacant ? '#61707D' : '#131F23'}}>{isVacant ? <em>Vacant</em> : r.tenant_name}</td>
                            <td style={{padding:'10px 10px',textAlign:'right',color:'#131F23',fontWeight:500}}>{r.billed > 0 ? fmt(r.billed) : '—'}</td>
                            <td style={{padding:'10px 10px',textAlign:'right',color:'#5a6b4f',fontWeight:500}}>{r.collected > 0 ? fmt(r.collected) : '—'}</td>
                            <td style={{padding:'10px 10px',textAlign:'right',color: r.outstanding > 0 ? '#8b4a42' : '#61707D',fontWeight: r.outstanding > 0 ? 600 : 500}}>{r.outstanding > 0 ? fmt(r.outstanding) : '—'}</td>
                            <td style={{padding:'10px 10px',textAlign:'right'}}>
                              {r.paid_pct == null ? (
                                <span style={{color:'#61707D'}}>—</span>
                              ) : (
                                <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>
                                  <div style={{width:60,height:6,background:'#E6EAE9',borderRadius:3,overflow:'hidden'}}>
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
            </Section>

            {/* Invoices section — view / download / upload invoice + payment proof */}
            <Section label={'Invoices · ' + periodInvoices.length + ' in period'} right={<span style={{fontSize:11,color:'var(--text-muted)'}}>{periodLabel}</span>}>
              {periodInvoices.length === 0 ? (
                <div style={{padding:18,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No invoices in the selected period.</div>
              ) : (
                <div style={{maxHeight:420,overflowY:'auto',margin:'-4px -4px',padding:'4px 4px'}}>
                  <table className="data-table" style={{fontSize:12,width:'100%'}}>
                    <thead>
                      <tr>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Unit</th>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Number</th>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Description</th>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Due</th>
                        <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Status</th>
                        <th style={{textAlign:'center',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Invoice</th>
                        <th style={{textAlign:'center',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Proof of payment</th>
                        <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodInvoices.map(i => {
                        const pill = invoiceStatusPill(i.effective_status);
                        return (
                          <tr key={i.id} style={{borderBottom:'1px solid #f0f0f0'}}>
                            <td style={{padding:'10px 10px',fontWeight:500,color:'#131F23',whiteSpace:'nowrap'}}>{i.unit_number}{i.floor != null ? ' · F' + i.floor : ''}</td>
                            <td style={{padding:'10px 10px',fontWeight:500,color:'#131F23',whiteSpace:'nowrap'}}>{i.invoice_number || i.id.slice(0, 8)}</td>
                            <td style={{padding:'10px 10px',color:'#61707D',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description || '—'}</td>
                            <td style={{padding:'10px 10px',color:'#61707D',whiteSpace:'nowrap'}}>{fmtDate(i.due_date)}</td>
                            <td style={{padding:'10px 10px',whiteSpace:'nowrap'}}>
                              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',color:pill.fg,background:pill.bg,padding:'3px 8px',borderRadius:3}}>{i.effective_status}</span>
                            </td>
                            <td style={{padding:'10px 10px',textAlign:'center'}}>
                              {typeof InvoiceSlotCell !== 'undefined' ? <InvoiceSlotCell invoice={i} slot="invoice"/> : '—'}
                            </td>
                            <td style={{padding:'10px 10px',textAlign:'center'}}>
                              {typeof InvoiceSlotCell !== 'undefined' ? <InvoiceSlotCell invoice={i} slot="payment_proof"/> : '—'}
                            </td>
                            <td style={{padding:'10px 10px',textAlign:'right',color: i.effective_status === 'Pending' ? '#8b4a42' : '#131F23',fontWeight:600,whiteSpace:'nowrap'}}>{fmt(i.amount_aed)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>)}
        </div>
      </div>
    </div>

    {/* Standard download flow — same component used everywhere else
        (PDF / xlsx / CSV / Word with a date-range picker). Three
        datasets: Invoices, Per-unit breakdown, Monthly timeline. */}
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
              unit:    r.unit.unit_number,
              floor:   r.unit.floor != null ? r.unit.floor : '',
              tenant:  r.tenant_name || 'Vacant',
              billed:  Math.round(r.billed),
              collected: Math.round(r.collected),
              outstanding: Math.round(r.outstanding),
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
            extraMetadata: {
              'Asset':  building.name,
              'Period': periodLabel,
              'Units':  perUnitRows.length,
            },
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
