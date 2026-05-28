// ==================== PMC OVERVIEW (Dashboard) ====================
// KPIs grouped into Properties / Service Requests / Visitors with their own
// eyebrow headings. Below: Service Request Summary → Service Charge Collection
// (this month) → Units in Arrears → Service Requests Requiring Action.

const PMCStat = ({ label, value, color, onClick, hint }) => (
  <div
    onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
    style={{
      padding:'12px 14px',
      background:'var(--bg-surface)',
      borderRadius:6,
      border:'1px solid var(--border-light)',
      cursor: onClick ? 'pointer' : 'default',
      transition:'background 0.15s, border-color 0.15s'
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.background = 'var(--accent-warm-light)'; e.currentTarget.style.borderColor = 'var(--accent-warm)'; } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-light)'; } }}
  >
    <div style={{fontSize:10,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>{label}</div>
    <div style={{fontSize:15,fontWeight:600,color:color||'var(--text-dark)'}}>{value}</div>
    {hint && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>{hint}</div>}
  </div>
);

const PMCOverviewPage = ({ setPage }) => {
  const { selectedProperties = [] } = useApp();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setStats(null); setError(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name');
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number,floor');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probe = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];

        const [{ data: ras }, { data: invoices }, { data: srs }, { data: visits }] = await Promise.all([
          supabaseClient.from('resident_assignments').select('profile_id,unit_id').in('unit_id', probe),
          supabaseClient.from('invoices').select('id,amount_aed,status,due_date,unit_id,created_at').in('unit_id', probe),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,resolved_at,unit_id,resident_profile_id').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('visits').select('id,visit_date,status,visitor_name,type').in('unit_id', probe),
        ]);
        if (!mounted) return;

        const today = new Date().toISOString().slice(0,10);
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0,10);
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0,10);

        // -------- Properties group --------
        // Selected count: if filter is null (user picked nothing), treat as "All buildings".
        const realBuildingsCount = (buildings || []).length;
        const selectedPropsCount = filterB ? filterB.length : realBuildingsCount;
        const totalUnits = filteredUnits.length;
        const occupied = new Set((ras || []).map(r => r.unit_id)).size;
        const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;
        const lastMonthCollected = (invoices || [])
          .filter(i => i.status === 'Paid' && i.created_at && i.created_at.slice(0,10) >= lastMonthStart && i.created_at.slice(0,10) <= lastMonthEnd)
          .reduce((s, i) => s + Number(i.amount_aed), 0);
        const pendingSCAmount = (invoices || [])
          .filter(i => i.status === 'Pending' || i.status === 'Overdue')
          .reduce((s, i) => s + Number(i.amount_aed), 0);

        // -------- Service Requests group --------
        const todaySRs = (srs || []).filter(s => (s.created_at || '').slice(0,10) === today).length;
        const completedToday = (srs || []).filter(s =>
          ['Done','Closed'].includes(s.status) && s.resolved_at && s.resolved_at.slice(0,10) === today
        ).length;
        const pendingRequests = (srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).length;

        // -------- Visitors group --------
        const upcomingVisits = (visits || []).filter(v => v.visit_date > today && v.status === 'Pre-Approved').length;
        const todayVisits = (visits || []).filter(v => v.visit_date === today).length;

        // -------- Service Request Summary (status breakdown bar) --------
        const srStatusCounts = { open: 0, inProgress: 0, scheduled: 0, completed: 0 };
        (srs || []).forEach(s => {
          if (s.status === 'New' || s.status === 'Acknowledged') srStatusCounts.open++;
          else if (s.status === 'In Progress') srStatusCounts.inProgress++;
          else if (s.preferred_date && new Date(s.preferred_date) > new Date()) srStatusCounts.scheduled++;
          else if (s.status === 'Done' || s.status === 'Closed') srStatusCounts.completed++;
          else srStatusCounts.open++;
        });

        // -------- Service Charge Collection (THIS MONTH) --------
        // Three buckets so the card can show Collected / Pending / Outstanding
        // distinctly and the rate bar still has a meaningful denominator.
        const monthInvoices = (invoices || []).filter(i => i.created_at && i.created_at.slice(0,10) >= thisMonthStart);
        const monthBilled = monthInvoices.reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthCollected = monthInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthPending = monthInvoices.filter(i => i.status === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthOverdue = monthInvoices.filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthOutstanding = monthPending + monthOverdue;
        const monthCollectionRate = monthBilled > 0 ? Math.round((monthCollected / monthBilled) * 100) : 0;

        // -------- Per-unit payment activity (THIS MONTH) --------
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((buildings || []).map(b => [b.id, b]));
        const enrich = (u_id, amount, count, oldest_due) => {
          const u = uMap[u_id];
          return {
            unit_id: u_id, amount, count, oldest_due,
            unit_number:    u ? u.unit_number : '—',
            floor:          u ? u.floor : null,
            building_name:  u && bMap[u.building_id] ? bMap[u.building_id].name : '—',
            building_letter:u && bMap[u.building_id] ? bMap[u.building_id].name.slice(0, 1).toUpperCase() : '?',
          };
        };

        const paidByUnit = {};
        monthInvoices.filter(i => i.status === 'Paid').forEach(i => {
          if (!paidByUnit[i.unit_id]) paidByUnit[i.unit_id] = { amount: 0, count: 0 };
          paidByUnit[i.unit_id].amount += Number(i.amount_aed);
          paidByUnit[i.unit_id].count++;
        });
        const paidList = Object.entries(paidByUnit)
          .map(([uid, v]) => enrich(uid, v.amount, v.count, null))
          .sort((a, b) => b.amount - a.amount).slice(0, 4);

        const pendingByUnit = {};
        (invoices || []).filter(i => i.status === 'Pending' || i.status === 'Overdue').forEach(i => {
          if (!pendingByUnit[i.unit_id]) pendingByUnit[i.unit_id] = { amount: 0, count: 0, oldest_due: null };
          pendingByUnit[i.unit_id].amount += Number(i.amount_aed);
          pendingByUnit[i.unit_id].count++;
          if (!pendingByUnit[i.unit_id].oldest_due || (i.due_date && i.due_date < pendingByUnit[i.unit_id].oldest_due)) {
            pendingByUnit[i.unit_id].oldest_due = i.due_date;
          }
        });
        const pendingList = Object.entries(pendingByUnit)
          .map(([uid, v]) => enrich(uid, v.amount, v.count, v.oldest_due))
          .sort((a, b) => b.amount - a.amount).slice(0, 4);

        // -------- Recent Service Requests (all-status) for the SR section table --------
        const srRecent = (srs || []).slice(0, 10);

        setStats({
          // Portfolio Summary KPIs
          selectedPropsCount, totalUnits, occupied, occupancyRate, lastMonthCollected, pendingSCAmount,
          // Service Requests KPIs
          todaySRs, completedToday, pendingRequests,
          // Visitors KPIs
          upcomingVisits, todayVisits,
          // Financial Summary cards
          monthBilled, monthCollected, monthPending, monthOverdue, monthOutstanding, monthCollectionRate,
          paidList, pendingList,
          totalUnitsPaid:    paidList.length    > 0 ? Object.keys(paidByUnit).length    : 0,
          totalUnitsPending: pendingList.length > 0 ? Object.keys(pendingByUnit).length : 0,
          totalArrears:      Object.values(pendingByUnit).reduce((s, a) => s + a.amount, 0),
          // Service Requests table
          srRecent,
        });
      } catch (e) {
        if (mounted) setError(String(e.message || e));
      }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);

  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  // Dynamic current-month label, e.g. "May 2026". Auto-updates when the
  // calendar month changes — the user explicitly asked for this.
  const monthLabel = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  if (error) return (<div><div className="page-header"><h1>Overview</h1></div><div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div></div>);

  const statusBadge = (s) => {
    const c = ({
      'New':         { bg: '#E6EAE9', fg: '#61707D' },
      'Acknowledged':{ bg: '#E6EAE9', fg: '#4a4540' },
      'In Progress': { bg: '#a07d3c', fg: '#fff' },
      'Done':        { bg: '#e6efe1', fg: '#5a6b4f' },
      'Closed':      { bg: '#ccc8c1', fg: '#4a4540' },
      'Rejected':    { bg: '#fdf2f1', fg: '#8b4a42' },
    })[s] || { bg: '#E6EAE9', fg: '#888' };
    return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{s}</span>;
  };

  const daysOverdue = (d) => {
    if (!d) return 0;
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Eyebrow style shared across the KPI sub-group headers
  const groupEyebrow = { fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-secondary)', fontWeight:600, margin:'18px 0 10px' };

  const KpiCard = ({ label, value, color, page }) => (
    <div className="kpi-card" style={{cursor:'pointer'}} onClick={() => setPage && setPage(page)}>
      <div className="label">{label}</div>
      <div className="value" style={color ? {color} : undefined}>{value}</div>
      <div className="link">View details →</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div><h1>Overview</h1></div>
      </div>

      {!stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : (<>
        {/* ============ PORTFOLIO SUMMARY ============ */}
        <div style={groupEyebrow}>Portfolio Summary</div>
        <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))',marginBottom:0}}>
          <KpiCard label="Total Properties Selected" value={stats.selectedPropsCount + ' ' + (stats.selectedPropsCount === 1 ? 'property' : 'properties')} page="properties"/>
          <KpiCard label="Units Occupied"            value={stats.occupied + ' / ' + stats.totalUnits}        page="properties"/>
          <KpiCard label="Occupancy Rate"            value={stats.occupancyRate + '%'}                         page="properties"/>
          <KpiCard label={'Collected ' + monthLabel}             value={fmt(stats.monthCollected)}    color="#5a6b4f" page="payment"/>
          <KpiCard label={'Pending Service Charges ' + monthLabel} value={fmt(stats.monthOutstanding)} color="#8b4a42" page="payment"/>
        </div>

        {/* ============ FINANCIAL SUMMARY ============ */}
        <div style={groupEyebrow}>Financial Summary</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18,marginBottom:8}}>
          {/* Service Charge Collection — THIS MONTH: Collected / Pending / Outstanding */}
          <div className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>Service Charge Collection {monthLabel}</div>
              <span onClick={() => setPage && setPage('payment')} style={{fontSize:11,color:'var(--accent-warm-dark)',cursor:'pointer'}}>View all →</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3, minmax(0, 1fr))',gap:18,marginBottom:14}}>
              <div>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>Collected</div>
                <div style={{fontSize:24,fontWeight:600,color:'#5a6b4f',letterSpacing:'-0.03em'}}>{fmt(stats.monthCollected)}</div>
              </div>
              <div>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>Pending</div>
                <div style={{fontSize:24,fontWeight:600,color:'#a07d3c',letterSpacing:'-0.03em'}}>{fmt(stats.monthPending)}</div>
              </div>
              <div>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>Outstanding</div>
                <div style={{fontSize:24,fontWeight:600,color:'#8b4a42',letterSpacing:'-0.03em'}}>{fmt(stats.monthOverdue)}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Collection rate this month · {stats.monthCollectionRate}%</div>
            <div style={{height:8,background:'var(--bg-surface)',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',width:stats.monthCollectionRate+'%',background:'linear-gradient(90deg, var(--accent-warm) 0%, var(--bg-warm-dark) 100%)'}}/>
            </div>
          </div>

          {/* Unit Payment Activity — Paid (this month) | Pending (all unpaid) */}
          <div className="card">
            <div style={{marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>Unit Payment Activity {monthLabel}</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Top paying units this month · Top units with pending or overdue invoices</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:28}}>
              <div>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#5a6b4f',fontWeight:600,marginBottom:10}}>Paid</div>
                {stats.paidList.length === 0 ? (
                  <div style={{color:'var(--text-muted)',fontSize:12,padding:'14px 0'}}>No paid invoices this month yet.</div>
                ) : stats.paidList.map((a, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom: i < stats.paidList.length - 1 ? '1px solid var(--border-light)' : 'none'}}>
                    <div style={{width:30,height:30,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>{a.building_letter}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>{a.unit_number}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.building_name}{a.floor != null ? ' · Fl ' + a.floor : ''}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#5a6b4f'}}>{fmt(a.amount)}</div>
                      <div style={{fontSize:10,color:'var(--text-muted)'}}>{a.count} invoice{a.count===1?'':'s'}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#8b4a42',fontWeight:600,marginBottom:10}}>Pending</div>
                {stats.pendingList.length === 0 ? (
                  <div style={{color:'var(--text-muted)',fontSize:12,padding:'14px 0'}}>No pending or overdue invoices ✓</div>
                ) : stats.pendingList.map((a, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom: i < stats.pendingList.length - 1 ? '1px solid var(--border-light)' : 'none'}}>
                    <div style={{width:30,height:30,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>{a.building_letter}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>{a.unit_number}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.building_name}{a.floor != null ? ' · Fl ' + a.floor : ''}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#8b4a42'}}>{fmt(a.amount)}</div>
                      <div style={{fontSize:10,color:'var(--text-muted)'}}>{a.oldest_due ? 'Due ' + daysOverdue(a.oldest_due) + 'd ago' : a.count + ' invoice' + (a.count===1?'':'s')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ============ SERVICE REQUESTS ============ */}
        <div style={groupEyebrow}>Service Requests</div>
        <div className="kpi-row" style={{gridTemplateColumns:'repeat(3, minmax(0, 1fr))',marginBottom:18}}>
          <KpiCard label="Requests Today"  value={stats.todaySRs}        page="service"/>
          <KpiCard label="Completed Today" value={stats.completedToday}  color="#5a6b4f" page="service"/>
          <KpiCard label="Pending"         value={stats.pendingRequests} color="#a07d3c" page="service"/>
        </div>
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>All Service Requests</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Most recent {stats.srRecent.length} across selected properties</div>
            </div>
            <span onClick={() => setPage && setPage('service')} style={{fontSize:11,color:'var(--accent-warm-dark)',cursor:'pointer'}}>View all →</span>
          </div>
          {stats.srRecent.length === 0 ? (
            <div style={{color:'var(--text-muted)',fontSize:13,padding:24,textAlign:'center'}}>No service requests yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th style={{width:'16%'}}>Category</th><th style={{width:'44%'}}>Description</th><th style={{width:'12%'}}>Priority</th><th style={{width:'16%'}}>Status</th><th style={{width:'12%'}}>Created</th></tr></thead>
              <tbody>
                {stats.srRecent.map(s => (
                  <tr key={s.id} style={{cursor:'pointer'}} onClick={() => setPage && setPage('service')}>
                    <td style={{fontWeight:500}}>{s.category}</td>
                    <td style={{maxWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.description}>{s.description}</td>
                    <td>{s.priority}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ============ VISITORS ============ */}
        <div style={groupEyebrow}>Visitors</div>
        <div className="kpi-row" style={{gridTemplateColumns:'repeat(2, minmax(0, 1fr))',marginBottom:0}}>
          <KpiCard label="Upcoming Visitors" value={stats.upcomingVisits} page="visitors"/>
          <KpiCard label="Visitors Today"    value={stats.todayVisits}    page="visitors"/>
        </div>
      </>)}
    </div>
  );
};

