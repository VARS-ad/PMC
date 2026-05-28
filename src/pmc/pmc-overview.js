// ==================== PMC OVERVIEW (dashboard home) ====================
// Replaces the legacy OverviewPage. Pulls live counts from Supabase tables,
// scoped to the top-bar property selector. Removes the 'Unresolved Escalations'
// KPI card per user request.

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
          supabaseClient.from('invoices').select('id,amount_aed,status,due_date,unit_id').in('unit_id', probe),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,unit_id,resident_profile_id').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('visits').select('id,visit_date,status,visitor_name,type').in('unit_id', probe),
        ]);
        if (!mounted) return;

        const today = new Date().toISOString().slice(0,10);
        const todaySRs = (srs || []).filter(s => (s.created_at || '').slice(0,10) === today).length;
        const overdueAmt = (invoices || []).filter(i => i.status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
        const upcomingVisits = (visits || []).filter(v => v.visit_date > today && v.status === 'Pre-Approved').length;
        const todayVisits = (visits || []).filter(v => v.visit_date === today).length;
        const totalUnits = filteredUnits.length;
        const occupied = new Set((ras || []).map(r => r.unit_id)).size;
        const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

        // SR status distribution
        const srStatusCounts = { open: 0, inProgress: 0, scheduled: 0, completed: 0 };
        (srs || []).forEach(s => {
          if (s.status === 'New' || s.status === 'Acknowledged') srStatusCounts.open++;
          else if (s.status === 'In Progress') srStatusCounts.inProgress++;
          else if (s.preferred_date && new Date(s.preferred_date) > new Date()) srStatusCounts.scheduled++;
          else if (s.status === 'Done' || s.status === 'Closed') srStatusCounts.completed++;
          else srStatusCounts.open++;
        });

        // Recent SRs needing action (Open / Acknowledged / In Progress)
        const srNeedingAction = (srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).slice(0, 5);

        // Service charge collection
        const totalBilled = (invoices || []).reduce((s, i) => s + Number(i.amount_aed), 0);
        const totalCollected = (invoices || []).filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const outstanding = totalBilled - totalCollected;
        const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

        // Units in arrears — group overdue invoices by unit
        const arrearsByUnit = {};
        (invoices || []).filter(i => i.status === 'Overdue').forEach(i => {
          if (!arrearsByUnit[i.unit_id]) arrearsByUnit[i.unit_id] = { unit_id: i.unit_id, amount: 0, count: 0, oldest_due: null };
          arrearsByUnit[i.unit_id].amount += Number(i.amount_aed);
          arrearsByUnit[i.unit_id].count++;
          if (!arrearsByUnit[i.unit_id].oldest_due || (i.due_date && i.due_date < arrearsByUnit[i.unit_id].oldest_due)) {
            arrearsByUnit[i.unit_id].oldest_due = i.due_date;
          }
        });
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((buildings || []).map(b => [b.id, b]));
        const arrearsList = Object.values(arrearsByUnit).map(a => {
          const u = uMap[a.unit_id];
          return {
            ...a,
            unit_number: u ? u.unit_number : '—',
            floor: u ? u.floor : null,
            building_name: u && bMap[u.building_id] ? bMap[u.building_id].name : '—',
            building_letter: u && bMap[u.building_id] ? bMap[u.building_id].name.slice(0, 1).toUpperCase() : '?',
          };
        }).sort((a, b) => b.amount - a.amount).slice(0, 4);

        setStats({
          todaySRs, overdueAmt, upcomingVisits, todayVisits,
          occupancyRate, occupied, totalUnits,
          recentSRs: (srs || []).slice(0, 10),
          srNeedingAction, srStatusCounts,
          totalBilled, totalCollected, outstanding, collectionRate,
          arrearsList,
          totalUnitsInArrears: Object.keys(arrearsByUnit).length,
          totalArrears: Object.values(arrearsByUnit).reduce((s, a) => s + a.amount, 0),
          uMap, bMap,
        });
      } catch (e) {
        if (mounted) setError(String(e.message || e));
      }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);

  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  if (error) return (<div><div className="page-header"><h1>PM Dashboard — Overview</h1></div><div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div></div>);

  const statusBadge = (s) => {
    const c = ({
      'New':         { bg: '#f5f3f0', fg: '#7a6e60' },
      'Acknowledged':{ bg: '#e8e3de', fg: '#4a4540' },
      'In Progress': { bg: '#a07d3c', fg: '#fff' },
      'Done':        { bg: '#e6efe1', fg: '#5a6b4f' },
      'Closed':      { bg: '#ccc8c1', fg: '#4a4540' },
      'Rejected':    { bg: '#fdf2f1', fg: '#8b4a42' },
    })[s] || { bg: '#f5f3f0', fg: '#888' };
    return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{s}</span>;
  };

  const daysOverdue = (d) => {
    if (!d) return 0;
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>PM Dashboard — Overview</h1>
        </div>
      </div>

      {!stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : (<>
        {/* KPI cards row — 6 wide */}
        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',margin:'8px 0 10px',fontWeight:500}}>Key Performance Indicators</div>
        <div className="kpi-row" style={{marginBottom:28}}>
          {[
            { label: 'Service Requests Today', value: stats.todaySRs, page: 'service' },
            { label: 'Service Charge Arrears', value: fmt(stats.overdueAmt), page: 'payment' },
            { label: 'Upcoming Visitors',      value: stats.upcomingVisits, page: 'visitors' },
            { label: 'Visitors Today',         value: stats.todayVisits, page: 'visitors' },
            { label: 'Occupancy Rate',         value: stats.occupancyRate + '%', page: 'properties' },
            { label: 'Units Occupied',         value: stats.occupied + ' / ' + stats.totalUnits, page: 'properties' },
          ].map((k, i) => (
            <div key={i} className="kpi-card" style={{cursor:'pointer'}} onClick={() => setPage && setPage(k.page)}>
              <div className="label">{k.label}</div>
              <div className="value">{k.value}</div>
              <div className="link">View details →</div>
            </div>
          ))}
        </div>

        {/* Two-column main: SR summary + needing-action  |  Service Charge Collection */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:18}}>
          <div>
            {/* Service Request Summary card */}
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)'}}>Service Request Summary</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Status breakdown — across selected properties</div>
                </div>
                <span onClick={() => setPage && setPage('service')} style={{fontSize:11,color:'var(--accent-warm-dark)',cursor:'pointer'}}>View all →</span>
              </div>
              {(() => {
                const c = stats.srStatusCounts;
                const total = Math.max(c.open + c.inProgress + c.scheduled + c.completed, 1);
                return (<>
                  <div style={{display:'flex',height:14,borderRadius:7,overflow:'hidden',marginTop:14,marginBottom:10,background:'var(--bg-surface)'}}>
                    <div style={{flex: c.open, background:'#e8e3de'}} title={'Open: ' + c.open}/>
                    <div style={{flex: c.inProgress, background:'#928989'}} title={'In Progress: ' + c.inProgress}/>
                    <div style={{flex: c.scheduled, background:'#c4b8b0'}} title={'Scheduled: ' + c.scheduled}/>
                    <div style={{flex: c.completed, background:'#ccc8c1'}} title={'Completed: ' + c.completed}/>
                  </div>
                  <div style={{display:'flex',gap:16,fontSize:11,color:'var(--text-secondary)',flexWrap:'wrap'}}>
                    <div><span style={{display:'inline-block',width:8,height:8,borderRadius:4,background:'#e8e3de',marginRight:6,verticalAlign:'middle'}}/>Open ({c.open})</div>
                    <div><span style={{display:'inline-block',width:8,height:8,borderRadius:4,background:'#928989',marginRight:6,verticalAlign:'middle'}}/>In Progress ({c.inProgress})</div>
                    <div><span style={{display:'inline-block',width:8,height:8,borderRadius:4,background:'#c4b8b0',marginRight:6,verticalAlign:'middle'}}/>Scheduled ({c.scheduled})</div>
                    <div><span style={{display:'inline-block',width:8,height:8,borderRadius:4,background:'#ccc8c1',marginRight:6,verticalAlign:'middle'}}/>Completed ({c.completed})</div>
                  </div>
                </>);
              })()}
            </div>

            {/* Requiring Action table */}
            <div className="card">
              <div style={{marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>Service Requests Requiring Action</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Pending approval or scheduling, no resolution yet</div>
              </div>
              {stats.srNeedingAction.length === 0 ? (
                <div style={{color:'var(--text-muted)',fontSize:13,padding:24,textAlign:'center'}}>Nothing waiting on you. ✓</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Category</th><th>Description</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {stats.srNeedingAction.map(s => (
                      <tr key={s.id} style={{cursor:'pointer'}} onClick={() => setPage && setPage('service')}>
                        <td style={{fontWeight:500}}>{s.category}</td>
                        <td style={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={s.description}>{s.description}</td>
                        <td>{s.priority}</td>
                        <td>{statusBadge(s.status)}</td>
                        <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            {/* Service Charge Collection panel */}
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>Service Charge Collection</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Across all current invoices</div>
                </div>
                <span onClick={() => setPage && setPage('payment')} style={{fontSize:11,color:'var(--accent-warm-dark)',cursor:'pointer'}}>View all →</span>
              </div>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Total Billed</div>
              <div style={{fontSize:24,fontWeight:600,color:'var(--text-dark)',marginBottom:14,letterSpacing:'-0.03em'}}>{fmt(stats.totalBilled)}</div>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Total Collected</div>
              <div style={{fontSize:24,fontWeight:600,color:'#5a6b4f',marginBottom:14,letterSpacing:'-0.03em'}}>{fmt(stats.totalCollected)}</div>
              <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Outstanding</div>
              <div style={{fontSize:24,fontWeight:600,color:'#8b4a42',marginBottom:8,letterSpacing:'-0.03em'}}>{fmt(stats.outstanding)}</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Collection rate · {stats.collectionRate}%</div>
              <div style={{height:8,background:'var(--bg-surface)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',width:stats.collectionRate+'%',background:'linear-gradient(90deg, var(--accent-warm) 0%, var(--bg-warm-dark) 100%)'}}/>
              </div>
            </div>

            {/* Units in Arrears */}
            <div className="card">
              <div style={{marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>Units in Arrears</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{stats.totalUnitsInArrears} unit{stats.totalUnitsInArrears===1?'':'s'} · Total {fmt(stats.totalArrears)}</div>
              </div>
              {stats.arrearsList.length === 0 ? (
                <div style={{color:'var(--text-muted)',fontSize:13,padding:18,textAlign:'center'}}>No overdue invoices ✓</div>
              ) : stats.arrearsList.map((a, i) => (
                <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom: i < stats.arrearsList.length - 1 ? '1px solid var(--border-light)' : 'none'}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>{a.building_letter}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>{a.unit_number}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{a.building_name}{a.floor != null ? ' · Floor ' + a.floor : ''}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#8b4a42'}}>{fmt(a.amount)}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)'}}>Due {daysOverdue(a.oldest_due)}d ago</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>)}
    </div>
  );
};

