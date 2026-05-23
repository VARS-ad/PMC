// ==================== OVERVIEW PAGE ====================
const OverviewPage = ({ setPage }) => {
  const { data, t } = useApp();
  const [pmNow, setPmNow] = useState(new Date());
  const [ovSelectedVisitor, setOvSelectedVisitor] = useState(null);
  const ovQrRef = React.useRef(null);
  useEffect(() => { const iv = setInterval(() => setPmNow(new Date()), 60000); return () => clearInterval(iv); }, []);
  const pmTime = formatTime12(pmNow);
  const pmDate = formatDate(pmNow);

  // ===== Live KPI computation — everything derived from the actual databases =====
  // 1. PROPERTY UNITS — authoritative source for residences & occupancy
  const units = data.propertyUnits || [];
  const totalResidences = units.length;
  const occupiedFlats   = units.filter(u => u.status === 'Occupied').length;
  const vacantFlats     = units.filter(u => u.status === 'Vacant').length;
  const forRentFlats    = units.filter(u => u.status === 'For Rent').length;
  const forSaleFlats    = units.filter(u => u.status === 'For Sale').length;
  const occupancyRate   = totalResidences ? Math.round((occupiedFlats / totalResidences) * 100) : 0;

  // 2. VISITORS — live from the visitors database
  const visitors = data.visitors || [];
  const insideCount    = visitors.filter(v => v.status === 'Inside').length;
  const scheduledCount = visitors.filter(v => v.status === 'Scheduled' || v.status === 'Pre-Approved').length;
  const pendingCount   = visitors.filter(v => v.status === 'Pending').length;

  // 3. SERVICE REQUESTS — live from the service request database
  const serviceRequests = data.serviceRequests || [];
  const todayDay = pmNow.getDate();
  const todayMonthName = pmNow.toLocaleString('en-US', { month: 'short' });
  const todayDateStr = todayDay + ' ' + todayMonthName; // e.g. "13 Apr"
  const todaySR = serviceRequests.filter(sr => sr.date === todayDateStr && sr.status !== 'Completed' && sr.status !== 'Cancelled').length;

  // 4. ALERTS / ESCALATIONS — unresolved + in review
  const escalations = data.escalations || [];
  const unackAlerts = escalations.filter(e => e.status === 'Unresolved' || e.status === 'In Review').length;

  // Mini sparkline SVG paths for KPI cards
  const sparklines = [
    'M0,12 L8,10 L16,11 L24,10 L32,12 L40,11 L48,12', // flat
    'M0,14 L8,12 L16,10 L24,8 L32,6 L40,5 L48,3',     // up
    'M0,10 L8,6 L16,8 L24,4 L32,3 L40,5 L48,2',       // up strong
    'M0,12 L8,10 L16,11 L24,9 L32,7 L40,8 L48,6',     // slight up
    'M0,10 L8,8 L16,6 L24,7 L32,5 L40,3 L48,4',       // up
    'M0,4 L8,6 L16,5 L24,8 L32,10 L40,9 L48,12',      // down
  ];

  // Format with thousands separator
  const fmt = (n) => n.toLocaleString('en-US');

  // Service charge data
  const scTotalBilled = 2840000;
  const scTotalCollected = 2420000;
  const scOutstanding = scTotalBilled - scTotalCollected;
  const scCollectionRate = Math.round((scTotalCollected / scTotalBilled) * 100);
  const arrearsUnits = [
    { unit: 'C-502', block: t('pm.blockLabel')+' C · '+t('pm.floorLabel')+' 5', amount: 18500, due: '2 '+t('pm.monthsWord') },
    { unit: 'D-065', block: t('pm.blockLabel')+' D · '+t('pm.floorLabel')+' 1', amount: 13550, due: '1 '+t('pm.monthsWord') },
    { unit: 'A-1302', block: t('pm.blockLabel')+' A · '+t('pm.floorLabel')+' 6', amount: 4100, due: '12.5 '+t('pm.monthsWord') },
  ];

  const kpis = [
    { label: t('kpi.serviceToday'),          value: fmt(todaySR),               page: 'service' },
    { label: t('kpi.scArrears'),             value: 'AED ' + fmt(scOutstanding), page: 'payment' },
    { label: t('kpi.unresolvedEscalations'), value: fmt(unackAlerts),            page: 'escalations' },
    { label: t('kpi.moveInOut'),             value: fmt(11),                     page: 'properties' },
    { label: t('kpi.occupancy'),             value: occupancyRate + '%',         page: 'properties' },
    { label: t('kpi.appAdoption'),           value: '63%',                       page: 'settings' },
  ];

  // Service Requests requiring action — pull from live database (non-completed, first 5)
  const srAction = serviceRequests
    .filter(sr => sr.status !== 'Completed' && sr.status !== 'Cancelled' && sr.status !== 'Closed')
    .slice(0, 5)
    .map(sr => {
      const action = sr.status === 'Pending Approval' ? t('pm.pendingApproval') : sr.status === 'In Progress' ? t('pm.viewAll') : sr.status === 'Scheduled' ? t('pm.scheduleDate') : t('pm.viewAll');
      return { id: sr.id, type: sr.type, unit: sr.flat, resident: sr.resident, days: sr.date, status: sr.status, action };
    });

  // SR status breakdown data
  const srStatusData = [
    { label: t('pm.srOpen'), count: 12, color: '#d5cfc8' },
    { label: t('pm.srInProgress'), count: 15, color: '#928989' },
    { label: t('pm.srScheduled'), count: 18, color: '#b0a898' },
    { label: t('pm.srCompleted'), count: 22, color: '#c4beb6' },
  ];
  const srTotal = srStatusData.reduce((s, d) => s + d.count, 0);

  // Active escalations
  const escData = [
    { id: 'ESC-041', type: 'SLA Breach',  summary: 'AC Repair overdue > 7d',        unit: 'A-0302', open: '8h', severity: 'Critical' },
    { id: 'ESC-038', type: 'Security',    summary: 'Guard override not reviewed',    unit: 'C-0501', open: '3h', severity: 'High' },
    { id: 'ESC-035', type: 'Compliance',  summary: 'Fire safety doc missing',        unit: 'B-0903', open: '2d', severity: 'High' },
  ];

  // Activity feed items
  const ovFeed = [
    { color: '#c0392b', text: 'ESC-041 raised — SLA breach on SR-1042', time: '10:08' },
    { color: '#e67e22', text: 'Guard override used — Flat C-0501', time: '09:58' },
    { color: '#3498db', text: 'SR-1038 status changed → In Progress', time: '09:44' },
    { color: '#27ae60', text: 'Move-in confirmed — Unit A-0202 (15 Mar)', time: '09:31' },
    { color: '#3498db', text: 'Announcement sent — Pool maintenance notice', time: '09:14' },
    { color: '#888', text: 'Service charge reminder sent — 5 units', time: '08:50' },
    { color: '#888', text: 'SR-1025 assigned to ProServ Cleaning Co.', time: '08:33' },
    { color: '#c0392b', text: 'ESC-035 escalated — Compliance flag raised', time: '08:11' },
  ];

  // Operations Calendar data
  const calMonth = 2; // March 2026 (0-indexed)
  const calYear = 2026;
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calToday = 10;
  const calEventDays = [10, 15, 17, 18, 22, 25];
  const todayEvents = [
    { time: '11:00', title: 'Tech Support — Etisalat', unit: 'A-0302', badge: 'Vendor', badgeColor: '#e8e3de' },
    { time: '13:00', title: 'Move-In — Nour Al-Rashid', unit: 'C-0904', badge: 'Move', badgeColor: '#e0e5db' },
  ];

  // QR code rendering for visitor detail modal
  const getQrUrl = (permit) => 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(permit || 'UNKNOWN');
  useEffect(() => {
    if (ovSelectedVisitor && ovQrRef.current) {
      const permit = ovSelectedVisitor.permitRef || ovSelectedVisitor.name;
      ovQrRef.current.innerHTML = '<img src="' + getQrUrl(permit) + '" width="200" height="200" style="display:block;margin:0 auto;" crossorigin="anonymous" />';
    }
  }, [ovSelectedVisitor]);

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('pm.overviewTitle')}</h1></div>
        <div style={{fontSize:12,color:'#a89a92'}}>Abu Dhabi · GST+4 &nbsp; {pmDate + ', ' + pmTime}</div>
      </div>

      {/* KPI Header */}
      <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:14}}>
        <span style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{t('pm.kpiHeader')}</span>
        <span style={{fontSize:12,color:'#a89a92'}}>{t('common.today')}, {pmDate}</span>
      </div>

      {/* KPI Cards — 6 columns */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:28}}>
        {kpis.map((k,i) => (
          <div key={i} className="kpi-card" style={{padding:'16px 18px',display:'flex',flexDirection:'column'}}>
            <div style={{fontSize:11,color:'#a89a92',marginBottom:6}}>{k.label}</div>
            <div style={{fontSize:22,fontWeight:600,color:'#1a1a1a',flex:1}}>{k.value}</div>
            <div style={{fontSize:11,color:'#a89a92',marginTop:10,cursor:'pointer'}} onClick={()=>setPage(k.page)}>{t('kpi.viewDetails')} →</div>
          </div>
        ))}
      </div>

      {/* Main Content: Left + Right */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20}}>
        {/* LEFT COLUMN */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Service Request Summary */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:600}}>{t('pm.srSummary')}</h3>
              <span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}} onClick={()=>setPage('service')}>{t('pm.viewAll')} →</span>
            </div>
            <div style={{fontSize:12,color:'#a89a92',marginBottom:14}}>{t('pm.srStatusBreakdown')}</div>

            {/* Stacked horizontal bar */}
            <div style={{display:'flex',height:28,borderRadius:4,overflow:'hidden',marginBottom:10}}>
              {srStatusData.map((s,i) => (
                <div key={i} style={{width:(s.count/srTotal*100)+'%',background:s.color,transition:'width .3s'}}/>
              ))}
            </div>
            {/* Legend */}
            <div style={{display:'flex',gap:20,fontSize:11,color:'#a89a92',marginBottom:24}}>
              {srStatusData.map((s,i) => (
                <span key={i} style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:s.color,display:'inline-block'}}/> {s.label}
                </span>
              ))}
            </div>

            {/* Service Requests Requiring Action */}
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{t('pm.srRequireAction')}</div>
            <div style={{fontSize:11,color:'#a89a92',marginBottom:12}}>{t('pm.srRequireActionDesc')}</div>
            <table className="data-table" style={{fontSize:12}}>
              <thead><tr><th>{t('pm.th.srId')}</th><th>{t('pm.th.type')}</th><th>{t('pm.th.unit')}</th><th>{t('pm.th.resident')}</th><th>{t('pm.th.date')}</th><th>{t('pm.th.status')}</th><th>{t('pm.th.action')}</th></tr></thead>
              <tbody>
                {srAction.map(sr => (
                  <tr key={sr.id}>
                    <td style={{fontWeight:500}}>{sr.id}</td>
                    <td>{sr.type}</td>
                    <td>{sr.unit}</td>
                    <td>{sr.resident}</td>
                    <td>{sr.days}</td>
                    <td><StatusBadge status={sr.status}/></td>
                    <td>
                      <button className="btn btn-sm" style={{fontSize:11,padding:'4px 10px',borderRadius:4}}>
                        {sr.action}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Active Escalations */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:600}}>{t('pm.escalations')}</h3>
              <span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}} onClick={()=>setPage('escalations')}>{t('pm.viewAll')} →</span>
            </div>
            <table className="data-table" style={{fontSize:12}}>
              <thead><tr><th>{t('pm.th.id')}</th><th>{t('pm.th.type')}</th><th>{t('pm.th.summary')}</th><th>{t('pm.th.unit')}</th><th>{t('pm.th.open')}</th><th>{t('pm.th.severity')}</th></tr></thead>
              <tbody>
                {escData.map(e => (
                  <tr key={e.id}>
                    <td style={{fontWeight:500}}>{e.id}</td>
                    <td>{e.type}</td>
                    <td>{e.summary}</td>
                    <td>{e.unit}</td>
                    <td>{e.open}</td>
                    <td>
                      <span style={{
                        display:'inline-block',padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,
                        background: e.severity === 'Critical' ? '#f8d7da' : '#fff3cd',
                        color: e.severity === 'Critical' ? '#721c24' : '#856404'
                      }}>{e.severity === 'Critical' ? t('pm.severityCritical') : e.severity === 'High' ? t('pm.severityHigh') : e.severity === 'Medium' ? t('pm.severityMedium') : e.severity === 'Low' ? t('pm.severityLow') : e.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Activity Feed */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:600}}>{t('pm.activityFeed')}</h3>
              <span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}}>{t('pm.viewAll')} →</span>
            </div>
            <div style={{fontSize:12,color:'#a89a92',marginBottom:12}}>{t('pm.activityFeedDesc')}</div>
            {ovFeed.map((item,i) => (
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderTop: i > 0 ? '1px solid #f5f2ef' : 'none'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:item.color,marginTop:5,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:12,color:'#1a1a1a'}}><span style={{color:'#a89a92',marginRight:6}}>{item.time}</span>{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {/* Service Charge Collection */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:600}}>{t('pm.scCollection')}</h3>
              <span style={{fontSize:12,color:'#a89a92',cursor:'pointer'}} onClick={()=>setPage('payment')}>{t('pm.viewAll')} →</span>
            </div>
            <div style={{fontSize:12,color:'#a89a92',marginBottom:18}}>Q1 2026 · {t('pm.scQuarter')}</div>

            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:'#a89a92',marginBottom:4}}>{t('pm.scTotalBilled')}</div>
              <div style={{fontSize:22,fontWeight:600,color:'#1a1a1a'}}>AED {fmt(scTotalBilled)}</div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:'#a89a92',marginBottom:4}}>{t('pm.scTotalCollected')}</div>
              <div style={{fontSize:22,fontWeight:600,color:'#1a1a1a'}}>AED {fmt(scTotalCollected)}</div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:'#a89a92',marginBottom:4}}>{t('pm.scOutstanding')}</div>
              <div style={{fontSize:22,fontWeight:600,color:'#c0392b'}}>AED {fmt(scOutstanding)}</div>
            </div>

            {/* Collection rate bar */}
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#a89a92',marginBottom:6}}>
              <span>{t('pm.scCollectionRate')} · {scCollectionRate}%</span>
            </div>
            <div style={{height:6,background:'#ebe7e3',borderRadius:3,marginBottom:20,overflow:'hidden'}}>
              <div style={{height:'100%',width:scCollectionRate+'%',background:'#928989',borderRadius:3}}/>
            </div>

            {/* Units in Arrears */}
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{t('pm.scUnitsInArrears')}</div>
            <div style={{fontSize:11,color:'#a89a92',marginBottom:12}}>{arrearsUnits.length} {t('pm.scUnits')} · {t('pm.scTotal')} AED {fmt(arrearsUnits.reduce((s,u)=>s+u.amount,0))}</div>

            {arrearsUnits.map((u,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#faf8f6',borderRadius:8,marginBottom:8,border:'1px solid #ebe7e3'}}>
                <div style={{width:32,height:32,borderRadius:6,background:'#928989',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,flexShrink:0}}>
                  {u.unit.charAt(0)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{u.unit}</div>
                  <div style={{fontSize:11,color:'#a89a92'}}>{u.block}</div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>AED {fmt(u.amount)}</div>
                  <div style={{fontSize:10,color:'#c0392b'}}>{t('pm.scDueFrom')} {u.due}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Operations Calendar */}
          <div className="card" style={{padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:600}}>{t('pm.opsCalendar')}</h3>
              <span style={{fontSize:13,color:'#a89a92'}}>{t('pm.months.mar')} {calYear}</span>
            </div>

            {/* Calendar grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,textAlign:'center',marginBottom:16}}>
              {['S','M','T','W','T','F','S'].map((d,i) => (
                <div key={i} style={{fontSize:10,color:'#a89a92',padding:'4px 0',fontWeight:500}}>{d}</div>
              ))}
              {Array.from({length:calFirstDay}).map((_,i) => <div key={'e'+i}/>)}
              {Array.from({length:calDaysInMonth}).map((_,i) => {
                const day = i + 1;
                const isToday = day === calToday;
                const hasEvent = calEventDays.includes(day);
                return (
                  <div key={day} style={{
                    padding:'4px 0',fontSize:12,
                    background: isToday ? '#928989' : 'transparent',
                    color: isToday ? '#fff' : '#1a1a1a',
                    borderRadius: isToday ? '50%' : 0,
                    width: isToday ? 28 : 'auto', height: isToday ? 28 : 'auto',
                    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    margin: isToday ? '0 auto' : 0,
                    fontWeight: isToday ? 600 : 400,
                    position:'relative'
                  }}>
                    {day}
                    {hasEvent && !isToday && <div style={{width:3,height:3,borderRadius:'50%',background:'#928989',marginTop:1}}/>}
                  </div>
                );
              })}
            </div>

            {/* Today's events */}
            <div style={{borderTop:'1px solid #ebe7e3',paddingTop:14}}>
              <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Today — {calToday} March</div>
              {todayEvents.map((ev,i) => (
                <div key={i} style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:'#a89a92',marginBottom:2}}>{ev.time}</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{ev.title}</div>
                      <div style={{fontSize:11,color:'#a89a92'}}>{ev.unit}</div>
                    </div>
                    <span style={{fontSize:11,padding:'3px 10px',borderRadius:4,background:ev.badgeColor,color:'#1a1a1a',fontWeight:500}}>{ev.badge}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

