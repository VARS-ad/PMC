// ==================== ASSET DETAIL MODAL (landlord view) ====================
// Deep dive into a single building from the Overview / Your Portfolio
// asset card. Designed for the small UAE family landlord persona:
//   - One screen, glanceable
//   - Money + risk first, ops below
//   - All the data needed to decide 'hold / sell / refinance'
//
// Surfaces (top → bottom):
//   1. Header strip — name + property-type chip + address + first photo
//   2. Big-number row — this month / yield / occupancy / current value
//   3. 12-month income chart — Chart.js bars: collected vs outstanding
//   4. Investment block — purchase price / value / appreciation / hold period
//   5. Tenant roster table — unit / tenant / tenure / monthly / lease end / outstanding
//
// Data dependencies:
//   - public.units (units inside this building + tenant_*)
//   - public.resident_assignments + public.profiles (residential roster)
//   - public.invoices (chart + outstanding per unit)
//   - public.unit_attachments (header photo, first available)
const AssetDetailModal = ({ asset, onClose }) => {
  const [loading, setLoading]         = useState(true);
  const [tenants, setTenants]         = useState([]);
  const [monthly, setMonthly]         = useState([]);   // [{ month, label, collected, outstanding }]
  const [photoUrl, setPhotoUrl]       = useState(null);
  const chartCanvasRef = useRef(null);
  const chartInstance  = useRef(null);

  const fmt = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabaseClient) return;
      setLoading(true);
      try {
        // 1. Units for this building.
        const { data: units } = await supabaseClient
          .from('units')
          .select('id, unit_number, floor, tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_lease_end, tenant_monthly_payment_aed, tenant_contract_number')
          .eq('building_id', asset.id)
          .order('floor', { ascending: true })
          .order('unit_number', { ascending: true });
        const unitIds = (units || []).map(u => u.id);

        // 2. Residential assignments + profile names (skipped on
        // non-residential since those live on unit.tenant_*).
        let assignments = [];
        let profById = {};
        if (unitIds.length > 0) {
          const { data: ras } = await supabaseClient
            .from('resident_assignments')
            .select('profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, contract_number, cheques_per_year')
            .in('unit_id', unitIds);
          assignments = ras || [];
          const profIds = Array.from(new Set(assignments.map(a => a.profile_id).filter(Boolean)));
          if (profIds.length > 0) {
            const { data: profs } = await supabaseClient.from('profiles').select('id, full_name, phone').in('id', profIds);
            (profs || []).forEach(p => { profById[p.id] = p; });
          }
        }

        // 3. Invoices for the last 12 months for the income chart + per-
        // tenant outstanding total.
        const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
        const cutoffIso = cutoff.toISOString().slice(0, 10);
        let invoices = [];
        if (unitIds.length > 0) {
          const { data: invs } = await supabaseClient
            .from('invoices')
            .select('id, unit_id, amount_aed, status, due_date, created_at')
            .in('unit_id', unitIds)
            .gte('created_at', cutoffIso);
          invoices = invs || [];
        }

        // 4. First photo on any unit of this building, for the header.
        let firstPhoto = null;
        if (unitIds.length > 0) {
          const { data: atts } = await supabaseClient
            .from('unit_attachments')
            .select('storage_path')
            .in('unit_id', unitIds)
            .eq('kind', 'photo')
            .order('created_at', { ascending: false })
            .limit(1);
          if ((atts || []).length > 0) {
            const { data: signed } = await supabaseClient.storage
              .from('unit-attachments')
              .createSignedUrl(atts[0].storage_path, 3600);
            if (signed) firstPhoto = signed.signedUrl;
          }
        }

        // --- Compose the tenant roster row-by-row -----------------------
        const today = new Date().toISOString().slice(0, 10);
        const outstandingByUnit = {};
        for (const i of invoices) {
          // Outstanding = Overdue + Pending with due_date past today.
          if (i.status === 'Overdue' || (i.status === 'Pending' && i.due_date && i.due_date < today)) {
            outstandingByUnit[i.unit_id] = (outstandingByUnit[i.unit_id] || 0) + Number(i.amount_aed);
          }
        }
        const roster = (units || []).map(u => {
          const ra = assignments.find(a => a.unit_id === u.id);
          const prof = ra ? profById[ra.profile_id] : null;
          if (prof) {
            return {
              unit_id: u.id, unit_number: u.unit_number, floor: u.floor,
              name: prof.full_name || 'Resident', phone: prof.phone || '',
              tenure: ra.tenure || 'Tenant',
              monthly: Number(ra.monthly_payment_aed || 0),
              lease_end: ra.lease_end || null,
              contract: ra.contract_number || '',
              outstanding: outstandingByUnit[u.id] || 0,
              kind: 'residential',
            };
          }
          if (u.tenant_name) {
            return {
              unit_id: u.id, unit_number: u.unit_number, floor: u.floor,
              name: u.tenant_name, phone: u.tenant_phone || '',
              tenure: u.tenant_tenure || 'Tenant',
              monthly: Number(u.tenant_monthly_payment_aed || 0),
              lease_end: u.tenant_lease_end || null,
              contract: u.tenant_contract_number || '',
              outstanding: outstandingByUnit[u.id] || 0,
              kind: 'non-residential',
            };
          }
          return {
            unit_id: u.id, unit_number: u.unit_number, floor: u.floor,
            vacant: true, outstanding: 0,
          };
        });

        // --- 12-month income series ------------------------------------
        const series = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = d.toISOString().slice(0, 7);
          series.push({
            month: key,
            label: d.toLocaleString('en-GB', { month: 'short' }),
            collected: 0,
            outstanding: 0,
          });
        }
        const byMonth = Object.fromEntries(series.map(s => [s.month, s]));
        for (const i of invoices) {
          const m = (i.created_at || '').slice(0, 7);
          const bucket = byMonth[m];
          if (!bucket) continue;
          if (i.status === 'Paid') bucket.collected += Number(i.amount_aed);
          else bucket.outstanding += Number(i.amount_aed);
        }

        if (!mounted) return;
        setTenants(roster);
        setMonthly(series);
        setPhotoUrl(firstPhoto);
        setLoading(false);
      } catch (_) {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [asset.id]);

  // --- Render the Chart.js chart once data is ready --------------------
  useEffect(() => {
    if (loading || !monthly.length || !chartCanvasRef.current || !window.Chart) return;
    if (chartInstance.current) chartInstance.current.destroy();
    const ctx = chartCanvasRef.current.getContext('2d');
    chartInstance.current = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthly.map(m => m.label),
        datasets: [
          {
            label: 'Collected',
            data: monthly.map(m => Math.round(m.collected)),
            backgroundColor: 'rgba(90, 107, 79, 0.85)',
            borderRadius: 4,
            stack: 'rent',
          },
          {
            label: 'Outstanding',
            data: monthly.map(m => Math.round(m.outstanding)),
            backgroundColor: 'rgba(139, 74, 66, 0.65)',
            borderRadius: 4,
            stack: 'rent',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#61707D' } },
          tooltip: {
            callbacks: { label: (ctx) => ctx.dataset.label + ': AED ' + (ctx.parsed.y || 0).toLocaleString() },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#61707D' } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: {
              font: { size: 10 }, color: '#61707D',
              callback: (v) => v >= 1000 ? (v / 1000) + 'k' : v,
            },
          },
        },
      },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [loading, monthly]);

  // --- Investment summary ---------------------------------------------
  const investment = (() => {
    const purchase = Number(asset.purchase_price) || 0;
    const current  = Number(asset.current_value)  || 0;
    const gain     = purchase > 0 ? current - purchase : 0;
    const gainPct  = purchase > 0 ? (gain / purchase) * 100 : null;
    let holdLabel = '—';
    if (asset.acquired_on) {
      const start = new Date(asset.acquired_on);
      if (!isNaN(start.getTime())) {
        const months = (new Date().getFullYear() - start.getFullYear()) * 12 + (new Date().getMonth() - start.getMonth());
        const years = Math.floor(months / 12);
        const rem   = months % 12;
        holdLabel = (years ? years + 'y ' : '') + rem + 'm';
      }
    }
    const acquiredHuman = asset.acquired_on
      ? new Date(asset.acquired_on).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
      : '—';
    return { purchase, current, gain, gainPct, holdLabel, acquiredHuman };
  })();

  // Stable colour-block fallback when there's no photo. Deterministic
  // off the building id so the same asset always lands the same colour.
  const fallbackHue = (Math.abs((asset.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360);

  const typeChipColor = ({
    'Residential':'#5a6b4f', 'Commercial':'#3E4C59', 'Villa':'#a07d3c', 'Commercial Land':'#61707D',
  })[asset.property_type] || '#61707D';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1100,maxHeight:'92vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* ---- Header strip with photo / hero ---- */}
        <div style={{position:'relative',height:180,flexShrink:0,background: photoUrl
          ? `url(${photoUrl}) center/cover no-repeat`
          : `linear-gradient(135deg, hsl(${fallbackHue}, 22%, 78%) 0%, hsl(${(fallbackHue+30)%360}, 28%, 56%) 100%)`,
          borderBottom:'1px solid var(--border-light)'}}>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom, rgba(19,31,35,0.05) 0%, rgba(19,31,35,0.55) 100%)'}}/>
          <button onClick={onClose}
            style={{position:'absolute',top:14,right:14,width:32,height:32,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.85)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:'#131F23'}}>
            ×
          </button>
          <div style={{position:'absolute',left:24,bottom:18,right:24,color:'#fff'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <span style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(255,255,255,0.75)',fontWeight:600}}>Asset</span>
              <span style={{fontSize:9,letterSpacing:'0.05em',textTransform:'uppercase',background:typeChipColor,color:'#fff',padding:'3px 8px',borderRadius:3,fontWeight:600}}>{asset.property_type}</span>
            </div>
            <div style={{fontSize:28,fontWeight:600,letterSpacing:'-0.015em',lineHeight:1.1,textShadow:'0 1px 2px rgba(0,0,0,0.25)'}}>{asset.name}</div>
            <div style={{fontSize:13,color:'rgba(255,255,255,0.85)',marginTop:4,letterSpacing:'-0.005em'}}>{asset.address || '—'}</div>
          </div>
        </div>

        {/* ---- Scrollable body ---- */}
        <div style={{padding:'22px 28px 28px',overflowY:'auto',flex:1,background:'var(--bg-page)'}}>
          {loading ? (
            <div style={{padding:60,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading…</div>
          ) : (
            <>
              {/* ---- Big number row ---- */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:12,marginBottom:22}}>
                {[
                  { label:'This month',  value: fmt(asset.this_month_collected), color:'#5a6b4f' },
                  { label:'Yield',       value: asset.yield_pct == null ? '—' : asset.yield_pct.toFixed(1) + '%' },
                  { label:'Occupancy',   value: asset.occupied_count + ' / ' + asset.total_units, sub: asset.occupancy_pct + '%' },
                  { label:'Current value', value: investment.current ? fmt(investment.current) : '—' },
                ].map((it, i) => (
                  <div key={i} style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'14px 16px'}}>
                    <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>{it.label}</div>
                    <div style={{fontSize:22,fontWeight:600,color:it.color || 'var(--text-dark)',letterSpacing:'-0.015em',lineHeight:1}}>{it.value}</div>
                    {it.sub && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{it.sub}</div>}
                  </div>
                ))}
              </div>

              {/* ---- 12-month income chart ---- */}
              <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'18px 20px',marginBottom:22}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.01em'}}>12-month income</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>Collected vs outstanding</div>
                </div>
                <div style={{height:220,position:'relative'}}>
                  <canvas ref={chartCanvasRef}/>
                </div>
              </div>

              {/* ---- Investment summary ---- */}
              {(investment.purchase > 0 || asset.acquired_on) && (
                <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'18px 20px',marginBottom:22}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.01em',marginBottom:14}}>Investment</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:14}}>
                    {[
                      { label:'Acquired',    value: investment.acquiredHuman },
                      { label:'Hold period', value: investment.holdLabel },
                      { label:'Purchase price', value: investment.purchase ? fmt(investment.purchase) : '—' },
                      { label:'Appreciation', value: (investment.gain !== 0 && investment.purchase) ? (investment.gain > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(investment.gain)) + ' (' + (investment.gainPct > 0 ? '+' : '') + investment.gainPct.toFixed(1) + '%)' : '—', color: investment.gain > 0 ? '#5a6b4f' : investment.gain < 0 ? '#8b4a42' : 'var(--text-dark)' },
                    ].map((it, i) => (
                      <div key={i}>
                        <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>{it.label}</div>
                        <div style={{fontSize:14,fontWeight:600,color:it.color || 'var(--text-dark)',letterSpacing:'-0.005em'}}>{it.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Tenant roster ---- */}
              <div style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:'18px 20px',marginBottom:6}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.01em'}}>
                    {asset.property_type === 'Commercial' || asset.property_type === 'Commercial Land' ? 'Clients' : 'Tenants'} · {tenants.length} unit{tenants.length===1?'':'s'}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>
                    {tenants.filter(t => !t.vacant).length} occupied · {tenants.filter(t => t.vacant).length} vacant
                  </div>
                </div>
                <div style={{maxHeight:340,overflowY:'auto'}}>
                  <table className="data-table" style={{fontSize:12,width:'100%'}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border-light)'}}>
                        <th style={{textAlign:'left',padding:'8px 6px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Unit</th>
                        <th style={{textAlign:'left',padding:'8px 6px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Tenant</th>
                        <th style={{textAlign:'left',padding:'8px 6px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Tenure</th>
                        <th style={{textAlign:'right',padding:'8px 6px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Monthly</th>
                        <th style={{textAlign:'left',padding:'8px 6px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Lease end</th>
                        <th style={{textAlign:'right',padding:'8px 6px',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((t, i) => {
                        const today = new Date().toISOString().slice(0, 10);
                        const expiringSoon = t.lease_end && t.lease_end >= today && t.lease_end <= new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
                        return (
                          <tr key={i} style={{borderBottom:'1px solid #f0f0f0',background: t.vacant ? '#fafafa' : '#fff'}}>
                            <td style={{padding:'8px 6px',fontWeight:500,color:'var(--text-dark)'}}>{t.unit_number}{t.floor != null ? ' · F' + t.floor : ''}</td>
                            <td style={{padding:'8px 6px',color: t.vacant ? 'var(--text-muted)' : 'var(--text-dark)'}}>
                              {t.vacant ? <em>Vacant</em> : t.name}
                              {t.phone && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{t.phone}</div>}
                            </td>
                            <td style={{padding:'8px 6px',color:'var(--text-muted)'}}>{t.vacant ? '—' : (t.tenure || '—')}</td>
                            <td style={{padding:'8px 6px',textAlign:'right',color: t.vacant ? 'var(--text-muted)' : 'var(--text-dark)'}}>{t.vacant ? '—' : fmt(t.monthly)}</td>
                            <td style={{padding:'8px 6px',color: expiringSoon ? '#a07d3c' : 'var(--text-muted)', fontWeight: expiringSoon ? 600 : 400}}>{t.vacant ? '—' : (t.lease_end || '—')}</td>
                            <td style={{padding:'8px 6px',textAlign:'right',color: t.outstanding > 0 ? '#8b4a42' : 'var(--text-muted)', fontWeight: t.outstanding > 0 ? 600 : 400}}>{t.outstanding > 0 ? fmt(t.outstanding) : '—'}</td>
                          </tr>
                        );
                      })}
                      {tenants.length === 0 && (
                        <tr><td colSpan="6" style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:12}}>No units yet for this asset.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
