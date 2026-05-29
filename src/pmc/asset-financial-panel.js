// ==================== ASSET FINANCIAL MODAL (Al Qurm trial) ====================
// Centered modal styled to match UnitDetailModal — same Section / Field
// language so the asset deep-dive feels like a natural sibling of the
// unit deep-dive. Opens when the user clicks the consolidated 'Total
// Billed' tile on the Assets page.
//
// Surfaces (top → bottom):
//   1. Header — 'Asset' eyebrow + building name + address breadcrumb
//   2. Financial summary section — Total Billed / Collected / Outstanding /
//      Upcoming / Future for the period currently filtered on the page
//   3. Income timeline section — Chart.js 12-month stacked bars
//   4. Per-unit breakdown table — Unit / Tenant / Billed / Collected /
//      Outstanding / % paid. Read-only (no nested click-through).
//   5. Download Data button — exports the breakdown as an xlsx
//      using the same helper Profile Creation uses for templates.
//
// Receives a pre-aggregated `building` from the Assets page so no
// extra Supabase round-trip is needed.
const AssetFinancialPanel = ({ building, onClose }) => {
  const chartCanvasRef = useRef(null);
  const chartInstance  = useRef(null);
  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Per-unit breakdown -----------------------------------------------
  const tenantByUnit = {};
  for (const t of (building.tenants || [])) tenantByUnit[t.unit_id] = t;
  const perUnit = {};
  for (const u of (building.units || [])) {
    perUnit[u.id] = { unit: u, tenant_name: tenantByUnit[u.id]?.resident_name || null, billed: 0, collected: 0, outstanding: 0 };
  }
  for (const i of (building.invoices || [])) {
    const row = perUnit[i.unit_id];
    if (!row) continue;
    row.billed += Number(i.amount_aed || 0);
    if (i.effective_status === 'Paid') row.collected += Number(i.amount_aed || 0);
    else if (i.effective_status === 'Pending' || i.effective_status === 'Upcoming') row.outstanding += Number(i.amount_aed || 0);
  }
  const perUnitRows = Object.values(perUnit)
    .map(r => ({ ...r, paid_pct: r.billed > 0 ? Math.round(100 * r.collected / r.billed) : null }))
    .sort((a, b) => b.billed - a.billed);

  // ---- 12-month chart series -------------------------------------------
  const today = new Date();
  const series = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    series.push({ month: key, label: d.toLocaleString('en-GB', { month: 'short' }), collected: 0, outstanding: 0 });
  }
  const byMonth = Object.fromEntries(series.map(s => [s.month, s]));
  for (const i of (building.invoices || [])) {
    const m = (i.created_at || '').slice(0, 7);
    const bucket = byMonth[m];
    if (!bucket) continue;
    if (i.effective_status === 'Paid') bucket.collected += Number(i.amount_aed || 0);
    else if (i.effective_status === 'Pending' || i.effective_status === 'Upcoming') bucket.outstanding += Number(i.amount_aed || 0);
  }

  useEffect(() => {
    if (!chartCanvasRef.current || !window.Chart) return;
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
  }, [JSON.stringify(series)]);

  // ---- Totals ----------------------------------------------------------
  const totalBilled = (building.collected || 0) + (building.pending || 0) + (building.upcoming || 0) + (building.future || 0);
  const totalOutstanding = (building.pending || 0);

  // ---- Download as xlsx -----------------------------------------------
  // Reuses the same downloadAsXlsx helper Profile Creation uses for
  // template exports. Top rows are the aggregate; then a blank row;
  // then the per-unit breakdown. One sheet, one file.
  const onDownload = () => {
    if (!window.XLSX) { alert('XLSX library not available'); return; }
    const safeName = (building.name || 'asset').replace(/[^A-Za-z0-9._-]/g, '_');
    const stamp = new Date().toISOString().slice(0, 10);
    const rows = [];
    rows.push(['Asset', building.name || '']);
    rows.push(['Address', building.address || '']);
    rows.push(['Property type', building.property_type || '']);
    rows.push([]);
    rows.push(['Total Billed', Math.round(totalBilled)]);
    rows.push(['Collected',    Math.round(building.collected || 0)]);
    rows.push(['Outstanding',  Math.round(totalOutstanding)]);
    rows.push(['Upcoming',     Math.round(building.upcoming || 0)]);
    rows.push(['Future',       Math.round(building.future || 0)]);
    rows.push([]);
    rows.push(['12-month income (collected vs outstanding)']);
    rows.push(['Month', 'Collected', 'Outstanding']);
    series.forEach(s => rows.push([s.label, Math.round(s.collected), Math.round(s.outstanding)]));
    rows.push([]);
    rows.push(['Per-unit breakdown']);
    rows.push(['Unit', 'Floor', 'Tenant', 'Billed', 'Collected', 'Outstanding', '% Paid']);
    perUnitRows.forEach(r => rows.push([
      r.unit.unit_number, r.unit.floor != null ? r.unit.floor : '',
      r.tenant_name || 'Vacant',
      Math.round(r.billed), Math.round(r.collected), Math.round(r.outstanding),
      r.paid_pct == null ? '' : r.paid_pct,
    ]));
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Financials');
    window.XLSX.writeFile(wb, safeName + '-financials-' + stamp + '.xlsx');
  };

  // Shared section / field language (mirrors UnitDetailModal exactly so
  // the two deep-dives feel like a pair).
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1100,maxHeight:'90vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Header — matches UnitDetailModal shape */}
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Asset · Financial summary</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">{building.address || '—'}{building.property_type ? ' · ' + building.property_type : ''}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="btn btn-sm" type="button" onClick={onDownload} title="Export this asset's financials as xlsx">
              ↓ Download data
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{padding:'20px 32px 32px',overflowY:'auto',flex:1}}>
          {/* Financial summary — 5 named rows in one card, same Field
              shape the Unit modal uses so the eye reads them at the
              same speed. */}
          <Section label="Financial Summary">
            <Field label="Total Billed">{fmt(totalBilled)}</Field>
            <Field label="Collected"    color="#5a6b4f">{fmt(building.collected || 0)}</Field>
            <Field label="Outstanding"  color={totalOutstanding > 0 ? '#8b4a42' : null}>{fmt(totalOutstanding)}</Field>
            <Field label="Upcoming"     color={(building.upcoming || 0) > 0 ? '#a07d3c' : null}>{fmt(building.upcoming || 0)}</Field>
            <Field label="Future"       color={(building.future || 0) > 0 ? '#61707D' : null}>{fmt(building.future || 0)}</Field>
          </Section>

          {/* 12-month chart */}
          <Section label="Income Timeline · 12 months" right={<span style={{fontSize:11,color:'var(--text-muted)'}}>Collected vs outstanding</span>}>
            <div style={{height:240,position:'relative'}}>
              <canvas ref={chartCanvasRef}/>
            </div>
          </Section>

          {/* Per-unit breakdown — read-only table with % paid */}
          <Section label={'Per-unit breakdown · ' + perUnitRows.length + ' unit' + (perUnitRows.length===1?'':'s')}>
            {perUnitRows.length === 0 ? (
              <div style={{padding:18,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No units yet for this asset.</div>
            ) : (
              <div style={{maxHeight:420,overflowY:'auto',margin:'-4px -4px',padding:'4px 4px'}}>
                <table className="data-table" style={{fontSize:12,width:'100%'}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Unit</th>
                      <th style={{textAlign:'left',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Tenant</th>
                      <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Billed</th>
                      <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Collected</th>
                      <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600}}>Outstanding</th>
                      <th style={{textAlign:'right',padding:'8px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'#61707D',fontWeight:600,minWidth:120}}>% Paid</th>
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
        </div>
      </div>
    </div>
  );
};
