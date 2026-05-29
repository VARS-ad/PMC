// ==================== ASSET FINANCIAL PANEL (Al Qurm trial) ====================
// Right-edge slide-in panel that covers the right 75% of the viewport.
// Opens when the user clicks the consolidated 'Total Billed' tile on
// the Assets page (Al Qurm View trial only). Shows the asset's whole
// financial picture in one place so the 5 tiny per-bucket KPIs on the
// card can be reduced to one.
//
// Receives a pre-aggregated `building` from the Assets page that
// already carries: invoices (period-filtered + effective_status),
// tenants, units, collected / pending / upcoming / future, etc. No
// extra Supabase round-trip needed — we slice that data here.
//
// Click a unit row → opens the existing UnitDetailModal (the small
// compact one the user said worked fine for unit ops).
const AssetFinancialPanel = ({ building, onClose }) => {
  const [openUnit, setOpenUnit] = useState(null);     // { unit }
  const [entering, setEntering] = useState(true);     // slide-in flag
  const chartCanvasRef = useRef(null);
  const chartInstance  = useRef(null);

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();

  // Trigger the slide-in transition one tick after mount.
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 10);
    return () => clearTimeout(t);
  }, []);
  const handleClose = () => {
    setEntering(true);
    setTimeout(onClose, 260);
  };

  // ESC key closes the panel.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Per-unit billed breakdown -------------------------------------
  // Iterates the building's already-loaded invoices, buckets by unit,
  // computes billed / collected / outstanding per unit. Sorted by
  // billed amount descending so the biggest contributors are on top.
  const tenantByUnit = {};
  for (const t of (building.tenants || [])) tenantByUnit[t.unit_id] = t;
  const perUnit = {};
  for (const u of (building.units || [])) {
    perUnit[u.id] = {
      unit: u,
      tenant_name: tenantByUnit[u.id]?.resident_name || null,
      billed: 0, collected: 0, outstanding: 0,
    };
  }
  for (const i of (building.invoices || [])) {
    const row = perUnit[i.unit_id];
    if (!row) continue;
    row.billed += Number(i.amount_aed || 0);
    if (i.effective_status === 'Paid') row.collected += Number(i.amount_aed || 0);
    else if (i.effective_status === 'Pending' || i.effective_status === 'Upcoming') row.outstanding += Number(i.amount_aed || 0);
  }
  const perUnitRows = Object.values(perUnit).sort((a, b) => b.billed - a.billed);

  // ---- 12-month income series (across the WHOLE asset) ---------------
  // We need the full 12-month view irrespective of the asset page's
  // active period filter, so the chart is always a year-shape. We
  // re-bucket from the building.invoices array (period-filtered) but
  // also widen the lookback would need a re-fetch; for the trial we
  // accept the current period and show what we have.
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

  // Chart.js render — depends on data + DOM being ready.
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
  }, [entering, JSON.stringify(series)]);

  // ---- Big numbers from pre-aggregated building stats -----------------
  const totalBilled = (building.collected || 0) + (building.pending || 0) + (building.upcoming || 0) + (building.future || 0);

  // Status pill colours match the rest of the app.
  const statusPill = (eff) => ({
    'Paid':     { bg:'#e6efe1', fg:'#5a6b4f' },
    'Pending':  { bg:'#fdf2f1', fg:'#8b4a42' },
    'Upcoming': { bg:'#fdf2dc', fg:'#7a5a1f' },
    'Future':   { bg:'#E6EAE9', fg:'#61707D' },
  }[eff] || { bg:'#E6EAE9', fg:'#61707D' });

  return (
    <>
      {/* Backdrop — click to close */}
      <div onClick={handleClose}
        style={{position:'fixed',inset:0,background: entering ? 'rgba(19,31,35,0)' : 'rgba(19,31,35,0.32)',transition:'background 0.25s ease',zIndex:1100}}/>
      {/* Slide-in panel covers right 75% of viewport */}
      <div onClick={e => e.stopPropagation()}
        style={{position:'fixed',top:0,right:0,bottom:0,width:'75vw',maxWidth:1400,background:'var(--bg-page)',boxShadow:'-18px 0 60px rgba(19,31,35,0.22)',transform: entering ? 'translateX(100%)' : 'translateX(0)',transition:'transform 0.26s ease',zIndex:1101,display:'flex',flexDirection:'column',overflow:'hidden'}}>

        {/* Sticky header */}
        <div style={{flexShrink:0,padding:'18px 28px',background:'#fff',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:3}}>Financial summary</div>
            <div style={{fontSize:20,fontWeight:600,letterSpacing:'-0.015em',color:'var(--text-dark)',lineHeight:1.15}}>{building.name}</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>{building.address || '—'}</div>
          </div>
          <button type="button" onClick={handleClose}
            style={{width:34,height:34,borderRadius:'50%',border:'none',background:'transparent',cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center'}}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-page)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:'auto',padding:'24px 28px 40px'}}>

          {/* Big-number row — Billed + 4 sub-buckets */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(5, minmax(0, 1fr))',gap:12,marginBottom:22}}>
            <div className="card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>Total Billed</div>
              <div style={{fontSize:24,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(totalBilled)}</div>
            </div>
            <div className="card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>Collected</div>
              <div style={{fontSize:24,fontWeight:600,color:'#5a6b4f',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(building.collected || 0)}</div>
            </div>
            <div className="card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>Pending</div>
              <div style={{fontSize:24,fontWeight:600,color: (building.pending || 0) > 0 ? '#8b4a42' : 'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(building.pending || 0)}</div>
            </div>
            <div className="card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>Upcoming</div>
              <div style={{fontSize:24,fontWeight:600,color: (building.upcoming || 0) > 0 ? '#a07d3c' : 'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(building.upcoming || 0)}</div>
            </div>
            <div className="card" style={{padding:'16px 18px'}}>
              <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>Future</div>
              <div style={{fontSize:24,fontWeight:600,color: (building.future || 0) > 0 ? '#61707D' : 'var(--text-dark)',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(building.future || 0)}</div>
            </div>
          </div>

          {/* 12-month chart */}
          <div className="card" style={{padding:'20px 22px',marginBottom:22}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>12-month income</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>Collected vs outstanding · whole asset</div>
            </div>
            <div style={{height:240,position:'relative'}}>
              <canvas ref={chartCanvasRef}/>
            </div>
          </div>

          {/* Per-unit breakdown table */}
          <div className="card" style={{padding:'20px 22px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>Per-unit breakdown · {perUnitRows.length} unit{perUnitRows.length===1?'':'s'}</div>
              <div style={{fontSize:11,color:'var(--text-muted)'}}>Click a row to open unit detail</div>
            </div>
            <div style={{maxHeight:480,overflowY:'auto'}}>
              <table className="data-table" style={{fontSize:12,width:'100%'}}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left',padding:'9px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Unit</th>
                    <th style={{textAlign:'left',padding:'9px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Tenant</th>
                    <th style={{textAlign:'right',padding:'9px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Billed</th>
                    <th style={{textAlign:'right',padding:'9px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Collected</th>
                    <th style={{textAlign:'right',padding:'9px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Outstanding</th>
                    <th style={{textAlign:'left',padding:'9px 10px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {perUnitRows.map(r => {
                    const isVacant = !r.tenant_name;
                    const isOverdue = r.outstanding > 0 && r.collected < r.billed;
                    return (
                      <tr key={r.unit.id}
                        onClick={() => setOpenUnit({ unit: r.unit })}
                        style={{borderBottom:'1px solid #f0f0f0',cursor:'pointer',background: isVacant ? '#fafafa' : '#fff',transition:'background 0.12s'}}
                        onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                        onMouseLeave={e => e.currentTarget.style.background = isVacant ? '#fafafa' : '#fff'}>
                        <td style={{padding:'10px 10px',fontWeight:500,color:'var(--text-dark)'}}>{r.unit.unit_number}{r.unit.floor != null ? ' · F' + r.unit.floor : ''}</td>
                        <td style={{padding:'10px 10px',color: isVacant ? 'var(--text-muted)' : 'var(--text-dark)'}}>{isVacant ? <em>Vacant</em> : r.tenant_name}</td>
                        <td style={{padding:'10px 10px',textAlign:'right',color:'var(--text-dark)',fontWeight:500}}>{r.billed > 0 ? fmt(r.billed) : '—'}</td>
                        <td style={{padding:'10px 10px',textAlign:'right',color:'#5a6b4f',fontWeight:500}}>{r.collected > 0 ? fmt(r.collected) : '—'}</td>
                        <td style={{padding:'10px 10px',textAlign:'right',color: r.outstanding > 0 ? '#8b4a42' : 'var(--text-muted)',fontWeight: r.outstanding > 0 ? 600 : 500}}>{r.outstanding > 0 ? fmt(r.outstanding) : '—'}</td>
                        <td style={{padding:'10px 10px'}}>
                          {isVacant ? (
                            <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',color:'#a07d3c',background:'#fdf5e6',padding:'3px 8px',borderRadius:3}}>Vacant</span>
                          ) : isOverdue ? (
                            <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',color:'#8b4a42',background:'#fdf2f1',padding:'3px 8px',borderRadius:3}}>Outstanding</span>
                          ) : (
                            <span style={{fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',color:'#5a6b4f',background:'#e6efe1',padding:'3px 8px',borderRadius:3}}>Paid up</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {perUnitRows.length === 0 && (
                    <tr><td colSpan="6" style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No units yet for this asset.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Nested unit detail when a row is clicked. Uses the existing
          small modal the user said worked great for unit ops. */}
      {openUnit && (
        <UnitDetailModal unit={openUnit.unit} building={building} onClose={() => setOpenUnit(null)}/>
      )}
    </>
  );
};
