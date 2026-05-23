// ==================== PMC SERVICE CHARGES PAGE (replaces Payment placeholder) ====================

const PMCServiceChargesPage = () => {
  const { selectedProperties = [] } = useApp();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    setInvoices(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number,floor');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probe = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];
        const [{ data: invs }, { data: bs }, { data: profs }] = await Promise.all([
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,source_type,unit_id,resident_profile_id,created_at').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('buildings').select('id,name'),
          supabaseClient.from('profiles').select('id,full_name').eq('role', 'resident'),
        ]);
        if (!mounted) return;
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
        const pMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
        setInvoices((invs || []).map(i => {
          const u = uMap[i.unit_id];
          return {
            ...i,
            unit_number: u ? u.unit_number : '—',
            floor: u ? u.floor : null,
            building_name: u && bMap[u.building_id] ? bMap[u.building_id].name : '—',
            resident_name: i.resident_profile_id && pMap[i.resident_profile_id] ? pMap[i.resident_profile_id].full_name : '—',
          };
        }));
      } catch (e) { if (mounted) setError(String(e.message || e)); }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);

  const filtered = (invoices || []).filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (search) {
      const hay = ((i.invoice_number || '') + ' ' + i.description + ' ' + i.resident_name + ' ' + i.unit_number).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totals = {
    total: filtered.reduce((s, i) => s + Number(i.amount_aed), 0),
    paid:    filtered.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0),
    pending: filtered.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0),
    overdue: filtered.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0),
  };
  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Service Charges</h1>
          <div className="subtitle">All invoices across selected properties. Filter by status, search by invoice/resident/unit.</div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card"><div className="label">Total Billed</div><div className="value">{fmt(totals.total)}</div></div>
        <div className="kpi-card"><div className="label">Collected</div><div className="value" style={{color:'#5a6b4f'}}>{fmt(totals.paid)}</div></div>
        <div className="kpi-card"><div className="label">Pending</div><div className="value" style={{color:'#a07d3c'}}>{fmt(totals.pending)}</div></div>
        <div className="kpi-card"><div className="label">Overdue</div><div className="value" style={{color:'#8b4a42'}}>{fmt(totals.overdue)}</div></div>
      </div>

      {/* Aging buckets — receivables by days overdue */}
      {invoices !== null && filtered.length > 0 && (() => {
        const today = new Date();
        const buckets = { current: 0, b30: 0, b60: 0, b90: 0, b91: 0 };
        filtered.filter(i => i.status === 'Pending' || i.status === 'Overdue').forEach(i => {
          if (!i.due_date) { buckets.current += Number(i.amount_aed); return; }
          const days = Math.floor((today.getTime() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24));
          if (days <= 0) buckets.current += Number(i.amount_aed);
          else if (days <= 30) buckets.b30 += Number(i.amount_aed);
          else if (days <= 60) buckets.b60 += Number(i.amount_aed);
          else if (days <= 90) buckets.b90 += Number(i.amount_aed);
          else buckets.b91 += Number(i.amount_aed);
        });
        const total = Math.max(buckets.current + buckets.b30 + buckets.b60 + buckets.b90 + buckets.b91, 1);
        const rows = [
          { label: 'Not yet due',  amt: buckets.current, color: '#c4b8b0' },
          { label: '1–30 days',     amt: buckets.b30,     color: '#a07d3c' },
          { label: '31–60 days',    amt: buckets.b60,     color: '#8b6a3c' },
          { label: '61–90 days',    amt: buckets.b90,     color: '#8b4a42' },
          { label: '90+ days',      amt: buckets.b91,     color: '#6b2a22' },
        ];
        return (
          <div className="card">
            <div style={{marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:600}}>Aging — Receivables by Days Overdue</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Only unpaid invoices (Pending + Overdue). Older buckets = redder.</div>
            </div>
            <div style={{display:'flex',height:18,borderRadius:9,overflow:'hidden',border:'1px solid var(--border-light)',marginBottom:14}}>
              {rows.map((r, i) => r.amt > 0 && <div key={i} title={r.label + ': ' + fmt(r.amt)} style={{flex: r.amt, background: r.color}}/>)}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:10}}>
              {rows.map((r, i) => (
                <div key={i} style={{padding:'10px 12px',background:'var(--bg-surface)',borderRadius:6,border:'1px solid var(--border-light)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{width:8,height:8,borderRadius:4,background:r.color}}/>
                    <div style={{fontSize:10,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)'}}>{r.label}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>{fmt(r.amt)}</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{Math.round(r.amt/total*100)}% of unpaid</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Charts row — 2 col on desktop, stack on narrow */}
      {invoices !== null && filtered.length > 0 && (() => {
        // monthly bucket totals for last 12 months
        const buckets = buildMonthlyBuckets(12);
        const idxMap = Object.fromEntries(buckets.map((m, i) => [m.key, i]));
        const monthly = { paid: new Array(12).fill(0), pending: new Array(12).fill(0), overdue: new Array(12).fill(0) };
        filtered.forEach(i => {
          const k = (i.created_at || i.due_date || '').slice(0, 7);
          const idx = idxMap[k]; if (idx == null) return;
          const amt = Number(i.amount_aed) || 0;
          if (i.status === 'Paid') monthly.paid[idx] += amt;
          else if (i.status === 'Pending') monthly.pending[idx] += amt;
          else if (i.status === 'Overdue') monthly.overdue[idx] += amt;
        });
        // by source type
        const bySource = {};
        filtered.forEach(i => {
          const key = ({ monthly_dues:'Monthly Dues', amenity_booking:'Amenity', service_request:'Maintenance', manual:'Other / Manual' })[i.source_type] || 'Other';
          bySource[key] = (bySource[key] || 0) + Number(i.amount_aed);
        });
        return (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))',gap:18}}>
            <div className="card">
              <div style={{marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:600}}>Invoices by Month</div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Stacked Paid · Pending · Overdue across last 12 months.</div>
              </div>
              <ChartCanvas height={280} config={{
                type: 'bar',
                data: { labels: buckets.map(m => m.label), datasets: [
                  { label: 'Paid', data: monthly.paid, backgroundColor: '#5a6b4f' },
                  { label: 'Pending', data: monthly.pending, backgroundColor: '#c4b8b0' },
                  { label: 'Overdue', data: monthly.overdue, backgroundColor: '#8b4a42' },
                ]},
                options: {
                  responsive: true, maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': AED ' + Math.round(ctx.parsed.y).toLocaleString() } },
                  },
                  scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => 'AED ' + Math.round(v/1000) + 'K' } } },
                },
              }}/>
            </div>
            <div className="card">
              <div style={{marginBottom:6}}>
                <div style={{fontSize:13,fontWeight:600}}>Charges by Source</div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>Where invoiced amounts come from. Hover slices for AED.</div>
              </div>
              <ChartCanvas height={280} config={{
                type: 'doughnut',
                data: { labels: Object.keys(bySource), datasets: [{
                  data: Object.values(bySource),
                  backgroundColor: ['#928989','#a07d3c','#5a6b4f','#c4b8b0','#8b4a42','#7a6e60'],
                  borderWidth: 0,
                }]},
                options: {
                  responsive: true, maintainAspectRatio: false, cutout: '60%',
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ctx.label + ': AED ' + Math.round(ctx.parsed).toLocaleString() } },
                  },
                },
              }}/>
            </div>
          </div>
        );
      })()}

      <div className="card">
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',marginBottom:14}}>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Status</label>
            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option>Paid</option><option>Pending</option><option>Overdue</option><option>Cancelled</option>
            </select>
          </div>
          <div style={{flex:'2 1 200px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Search</label>
            <input type="text" className="form-input" placeholder="Invoice number, description, resident, unit…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-sm" onClick={() => { setStatusFilter('all'); setSearch(''); }}>Clear</button>
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {invoices === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No invoices match these filters.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Description</th><th>Resident</th><th>Building / Unit</th><th style={{textAlign:'right'}}>Amount</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map(i => (
                <tr key={i.id}>
                  <td style={{fontWeight:500,fontSize:12}}>{i.invoice_number || '—'}</td>
                  <td style={{maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={i.description}>{i.description}</td>
                  <td>{i.resident_name}</td>
                  <td>{i.building_name}<div style={{fontSize:11,color:'var(--text-muted)'}}>Unit {i.unit_number}</div></td>
                  <td style={{textAlign:'right',fontWeight:500}}>{fmt(i.amount_aed)}</td>
                  <td>{i.due_date || '—'}</td>
                  <td>
                    <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,
                      background: i.status === 'Paid' ? '#e6efe1' : i.status === 'Overdue' ? '#fdf2f1' : '#f5f3f0',
                      color: i.status === 'Paid' ? '#5a6b4f' : i.status === 'Overdue' ? '#8b4a42' : '#7a6e60',
                    }}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

