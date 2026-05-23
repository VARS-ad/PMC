// ==================== SERVICE REQUESTS PAGE ====================
const ServiceRequestsPage = () => {
  const { data, setData, showToast, t } = useApp();
  const [viewMode, setViewMode] = useState('Calendar');
  const [showSchedule, setShowSchedule] = useState(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [expandedSR, setExpandedSR] = useState(null);
  const [srPage, setSrPage] = useState(1);
  const [srPageSize, setSrPageSize] = useState(10);
  const [selectedPersonnel, setSelectedPersonnel] = useState(null);
  const [newSR, setNewSR] = useState({ flat:'', type:'', resident:'', dateTime:'', sla:'', notes:'' });
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Enrich SR data with SLA
  const srWithSLA = data.serviceRequests.map(r => ({
    ...r,
    sla: r.sla || ({'AC Repair':'4h','Installation':'4h','Move-In':'2h','Move-Out':'2h','Handyman':'2h','Pest Control':'8h','Plumbing':'2h','Electrical':'2h'}[r.type] || '4h')
  }));

  const activeCount = srWithSLA.filter(r => r.status !== 'Completed').length;
  const pendingCount = srWithSLA.filter(r => r.status === 'Pending Approval').length;
  const escalatedCount = srWithSLA.filter(r => r.status === 'Escalated').length;

  const handleCreateSR = () => {
    if (!newSR.flat || !newSR.type) { showToast(t('pm.flatServiceTypeMissing')); return; }
    const id = `SR-${1092 + data.serviceRequests.length}`;
    const dtParts = newSR.dateTime ? newSR.dateTime.split(' · ') : [];
    const entry = { id, type: newSR.type, flat: newSR.flat, resident: newSR.resident || 'Pending', date: dtParts[0] || '10 Mar', time: dtParts[1] || '10:00', status: 'Pending Approval', sla: newSR.sla || '4h', notes: newSR.notes };
    setData(prev => ({...prev, serviceRequests: [entry, ...prev.serviceRequests]}));
    setNewSR({ flat:'', type:'', resident:'', dateTime:'', sla:'', notes:'' });
    setShowNewRequest(false);
    showToast(t('pm.srCreated'));
  };

  const handleExportSR = () => {
    exportToExcel(srWithSLA, [
      {header:'ID', key:'id'}, {header:'Type', key:'type'}, {header:'Flat', key:'flat'},
      {header:'Resident', key:'resident'}, {header:'Date', key:'date'}, {header:'Time', key:'time'},
      {header:'Status', key:'status'}, {header:'SLA', key:'sla'}
    ], 'VARS_ServiceRequests_Export');
    showToast(t('pm.srExported'));
  };

  // Normalize SR date "12 Apr" → { day:12, month:3 (0-indexed) }
  const parseSRDate = (dateStr) => {
    if (!dateStr) return null;
    const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const parts = dateStr.trim().split(' ');
    if (parts.length === 2 && months[parts[1]] !== undefined) {
      return { day: parseInt(parts[0],10), month: months[parts[1]] };
    }
    return null;
  };

  // Build event day map for calendar dots: { "2026-04-12": "AC Repair" }
  const eventDayMap = {};
  srWithSLA.forEach(r => {
    const p = parseSRDate(r.date);
    if (p) {
      const key = '2026-' + String(p.month+1).padStart(2,'0') + '-' + String(p.day).padStart(2,'0');
      if (!eventDayMap[key]) eventDayMap[key] = r.type;
    }
  });

  // Filter requests for selected date — compare day+month directly
  const selD = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);
  const selDay = selD.getDate();
  const selMonth = selD.getMonth();
  const dayRequests = srWithSLA.filter(r => {
    const p = parseSRDate(r.date);
    return p && p.day === selDay && p.month === selMonth;
  });

  // Sort: upcoming (non-completed) first by date ascending, then completed by date descending
  const srDateVal = (r) => {
    const p = parseSRDate(r.date);
    return p ? (p.month * 31 + p.day) : 0;
  };
  const sortedSR = [...srWithSLA].sort((a, b) => {
    const aCompleted = a.status === 'Completed';
    const bCompleted = b.status === 'Completed';
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1; // upcoming first
    if (!aCompleted) return srDateVal(a) - srDateVal(b); // upcoming: earliest first
    return srDateVal(b) - srDateVal(a); // completed: most recent first
  });

  // Pagination
  const totalSR = sortedSR.length;
  const paginatedSR = sortedSR.slice((srPage - 1) * srPageSize, srPage * srPageSize);
  const srStart = (srPage - 1) * srPageSize + 1;
  const srEnd = Math.min(srPage * srPageSize, totalSR);

  // Validation checklist for expanded request
  const getChecklist = (r) => {
    const base = [
      { label: 'ID verification complete', done: r.status !== 'Pending Approval' },
      { label: 'Work permit issued', done: r.status === 'Scheduled' || r.status === 'Completed' },
      { label: 'Resident approval received', done: r.status === 'Scheduled' || r.status === 'Completed' },
      { label: 'Safety briefing acknowledged', done: r.status === 'Completed' }
    ];
    return base;
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>{t('pm.serviceRequestsTitle')}</h1>
          <div className="subtitle">{activeCount} active · {pendingCount} pending approval · {escalatedCount} escalated</div>
        </div>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          <div style={{display:'flex',border:'1px solid #d5cfc8',borderRadius:6,overflow:'hidden'}}>
            {[t('pm.calendarView'),t('pm.listView')].map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{padding:'8px 20px',fontSize:13,fontWeight:viewMode===v?600:400,background:viewMode===v?'#1a1a1a':'#fff',color:viewMode===v?'#fff':'#1a1a1a',border:'none',cursor:'pointer'}}>
                {v}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={()=>setShowNewRequest(true)}>{t('pm.newRequestBtn')}</button>
        </div>
      </div>

      {/* Main Grid: Calendar + Day View */}
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:20}}>
        {/* Left: Calendar + Legend */}
        <div className="card">
          <MiniCalendar selectedDate={selectedDate} onDateSelect={setSelectedDate} eventDayMap={eventDayMap}/>
          <div style={{marginTop:16,fontSize:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'#928989',display:'inline-block'}}/><span style={{color:'#1a1a1a'}}>{t('pm.legendMoveInOut')}</span></div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'#8a8a8a',display:'inline-block'}}/><span style={{color:'#a89a92'}}>{t('pm.legendInstallation')}</span></div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><span style={{width:8,height:8,borderRadius:'50%',background:'#c0c0c0',display:'inline-block'}}/><span style={{color:'#a89a92'}}>{t('pm.legendHandymanMaint')}</span></div>
            <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:8,height:8,borderRadius:'50%',background:'#e8e3de',display:'inline-block'}}/><span style={{color:'#a89a92'}}>{t('pm.legendPestOther')}</span></div>
          </div>
        </div>

        {/* Right: Day requests + expanded detail */}
        <div>
          <div className="card">
            <div className="card-header">
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <h3>{formatDate(selectedDate)} — {dayRequests.length} requests</h3>
                <input type="date" value={selectedDate instanceof Date ? selectedDate.toISOString().split('T')[0] : new Date(selectedDate).toISOString().split('T')[0]} onChange={e=>{ const d = new Date(e.target.value + 'T12:00:00'); if (!isNaN(d)) setSelectedDate(d); }} style={{padding:'6px 12px',border:'1px solid #d5cfc8',borderRadius:6,fontSize:13}}/>
              </div>
              <button className="btn btn-sm" style={{display:'flex',alignItems:'center',gap:4}}><Icon name="filter" size={12}/> {t('pm.filterBtn')}</button>
            </div>

            {dayRequests.map(r => (
              <div key={r.id}>
                {/* Request row */}
                <div style={{display:'flex',alignItems:'center',gap:16,padding:'14px 0',borderBottom: expandedSR?.id === r.id ? 'none' : '1px solid #f0f0f0',cursor:'pointer'}}
                  onClick={() => setExpandedSR(expandedSR?.id === r.id ? null : r)}>
                  <span style={{fontWeight:600,color:'#a89a92',minWidth:44,fontSize:13}}>{r.time}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,color:'#1a1a1a',fontSize:14}}>{r.type} <span style={{fontWeight:400,color:'#a89a92'}}>— {r.id}</span></div>
                    <div style={{fontSize:12,color:'#a89a92'}}>{r.flat} · {r.resident}</div>
                  </div>
                  <StatusBadge status={r.status}/>
                  <span style={{fontSize:11,color:'#a89a92',display:'flex',alignItems:'center',gap:4}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    SLA: {r.sla}
                  </span>
                  <span style={{color:'#a89a92',fontSize:16,transform: expandedSR?.id === r.id ? 'rotate(180deg)' : 'rotate(0deg)',transition:'transform 0.2s'}}>∧</span>
                </div>

                {/* Expanded Detail */}
                {expandedSR?.id === r.id && (
                  <div style={{padding:'0 0 16px',borderBottom:'1px solid #ebe7e3'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 280px',gap:16}}>
                      {/* Left: Detail Grid */}
                      <div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                          <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:4}}>{t('pm.requestId')}</div><div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{r.id}</div></div>
                          <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:4}}>{t('pm.serviceType')}</div><div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{r.type}</div></div>
                          <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:4}}>{t('pm.flat')}</div><div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{r.flat}</div></div>
                          <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:4}}>{t('pm.residentCol')}</div><div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{r.resident}</div></div>
                          <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:4}}>SLA</div><div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{r.sla} {t('pm.fromApproval')}</div></div>
                          <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',marginBottom:4}}>Documents</div><div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>1 attached</div></div>
                        </div>

                        {/* Validation Checklist */}
                        <div style={{fontSize:12,fontWeight:600,color:'#1a1a1a',marginBottom:8}}>{t('pm.validationChecklist')}</div>
                        {getChecklist(r).map((c, ci) => (
                          <div key={ci} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                            {c.done ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#1a1a1a"/><path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            ) : (
                              <div style={{width:16,height:16,border:'1.5px solid #d0d0d0',borderRadius:4}}/>
                            )}
                            <span style={{fontSize:12,color: c.done ? '#1a1a1a' : '#8a8a8a'}}>{c.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Right: Documents + Actions */}
                      <div style={{gridColumn:'3'}}>
                        <div style={{border:'1px solid #ebe7e3',borderRadius:6,padding:20,textAlign:'center',marginBottom:16}}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="1.5" style={{marginBottom:8}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg>
                          <div style={{fontSize:12,color:'#a89a92'}}>{t('pm.documentsLabel')} (1)</div>
                        </div>

                        <div style={{border:'1px solid #ebe7e3',borderRadius:6,padding:16,marginBottom:16}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                            <span style={{fontSize:12,fontWeight:600,color:'#1a1a1a'}}>{t('pm.residentApprovalLabel')}</span>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{fontSize:12,color:'#a89a92'}}>{t('pm.overrideApproval')}</span>
                            <div style={{width:36,height:20,borderRadius:10,background: r.status === 'Scheduled' || r.status === 'Completed' ? '#1a1a1a' : '#d0d0d0',position:'relative',cursor:'pointer'}}>
                              <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left: r.status === 'Scheduled' || r.status === 'Completed' ? 18 : 2,transition:'left 0.2s'}}/>
                            </div>
                          </div>
                        </div>

                        <button className="btn btn-primary" style={{width:'100%',padding:'12px 0',fontSize:13,fontWeight:600}} onClick={()=>setShowSchedule(r)}>
                          {t('pm.reschedule')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {dayRequests.length === 0 && <div style={{textAlign:'center',color:'#a89a92',padding:24,fontSize:13}}>{t('pm.noRequestsDate')}</div>}
          </div>

          {/* All Service Requests Table */}
          <div className="card">
            <div className="card-header">
              <h3>{t('pm.allServiceRequests')}</h3>
              <button className="btn btn-sm" onClick={handleExportSR} style={{display:'flex',alignItems:'center',gap:4}}>
                <Icon name="download" size={12}/> {t('pm.exportBtn')}
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>{t('pm.idCol')}</th><th>{t('pm.serviceType')}</th><th>{t('pm.flat')}</th><th>{t('pm.residentCol')}</th><th>{t('pm.dateTimeCol')}</th><th>{t('pm.statusCol')}</th><th>SLA</th><th>{t('pm.tableHeaderActions')}</th></tr>
              </thead>
              <tbody>
                {paginatedSR.map(r => (
                  <tr key={r.id}>
                    <td style={{color:'#a89a92'}}>{r.id}</td>
                    <td><strong>{r.type}</strong></td>
                    <td>{r.flat}</td>
                    <td>{r.resident}</td>
                    <td>{r.date} · {r.time}</td>
                    <td><StatusBadge status={r.status}/></td>
                    <td style={{color:'#a89a92'}}>{r.sla || '4h'}</td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-sm" onClick={() => setExpandedSR(expandedSR?.id === r.id ? null : r)}>{t('pm.expandBtn')}</button>
                        <button className="btn btn-sm btn-primary" onClick={() => {
                          setData(prev => ({...prev, serviceRequests: prev.serviceRequests.map(sr => sr.id === r.id ? {...sr, status: 'Scheduled'} : sr)}));
                          showToast(r.id + ' ' + t('pm.approveBtn').toLowerCase());
                        }}>Approve</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',fontSize:12,color:'#a89a92'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span>Rows per page:</span>
                {[10,25,50].map(s => (
                  <span key={s} onClick={() => { setSrPageSize(s); setSrPage(1); }}
                    style={{padding:'4px 10px',border:'1px solid #d5cfc8',borderRadius:4,cursor:'pointer',background: srPageSize === s ? '#1a1a1a' : '#fff',color: srPageSize === s ? '#fff' : '#8a8a8a',fontWeight: srPageSize === s ? 600 : 400}}>
                    {s}
                  </span>
                ))}
              </div>
              <span>{srStart}–{srEnd} of {totalSR}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="modal-overlay" onClick={()=>{setShowSchedule(null);setSelectedPersonnel(null);}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
            <div className="modal-header">
              <div><div className="modal-sub">modal/schedule · {showSchedule.id}</div><h2>{t('pm.scheduleServiceTitle')}</h2></div>
              <button className="modal-close" onClick={()=>{setShowSchedule(null);setSelectedPersonnel(null);}}>×</button>
            </div>
            <div style={{background:'#f2efec',borderRadius:6,padding:'14px 16px',marginBottom:20}}>
              <div style={{fontWeight:600,color:'#1a1a1a',fontSize:14}}>{showSchedule.type} — {showSchedule.flat}</div>
              <div style={{fontSize:12,color:'#a89a92',marginTop:2}}>{showSchedule.resident}</div>
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:13,fontWeight:500,color:'#1a1a1a',display:'block',marginBottom:12}}>{t('pm.chooseServicePersonnel')}</label>
              {data.servicePersonnel.map(p => (
                <div key={p.id} onClick={() => setSelectedPersonnel(p.id)}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',border: selectedPersonnel === p.id ? '1.5px solid #1a1a1a' : '1px solid #e0e0e0',borderRadius:6,marginBottom:8,cursor:'pointer',background: selectedPersonnel === p.id ? '#f5f5f5' : '#fff',transition:'all 0.15s'}}>
                  <div style={{width:36,height:36,background: selectedPersonnel === p.id ? '#1a1a1a' : '#f0f0f0',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={selectedPersonnel === p.id ? '#fff' : '#8a8a8a'} strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:selectedPersonnel === p.id ? 600 : 500,color:'#1a1a1a',fontSize:13}}>{p.name}</div>
                    <div style={{fontSize:11,color:'#a89a92'}}>{p.specialty}</div>
                  </div>
                  {selectedPersonnel === p.id && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  )}
                </div>
              ))}
            </div>
            <div className="form-group"><label style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>b. {t('pm.scheduleServiceTitle')} Date</label><input className="form-input" type="date"/></div>
            <div className="form-group"><label style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>c. {t('pm.scheduleServiceTitle')} Time</label><input className="form-input" type="time"/></div>
            <div className="grid-2" style={{marginTop:8}}>
              <button className="btn btn-primary" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={()=>{setShowSchedule(null);setSelectedPersonnel(null);showToast('Service scheduled!');}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                {t('pm.confirmSchedule')}
              </button>
              <button className="btn" onClick={()=>{setShowSchedule(null);setSelectedPersonnel(null);}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequest && (
        <div className="modal-overlay" onClick={()=>setShowNewRequest(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
            <div className="modal-header">
              <div><div className="modal-sub">form/service-request/create</div><h2>{t('pm.createServiceRequestForm')}</h2></div>
              <button className="modal-close" onClick={()=>setShowNewRequest(false)}>×</button>
            </div>
            <div className="form-group"><label>{t('pm.flatUnitLabel')}</label><input className="form-input" placeholder="e.g. A-1204" value={newSR.flat} onChange={e=>setNewSR(p=>({...p,flat:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.serviceTypeLabel')}</label><input className="form-input" placeholder="Move-In/Out, Installation, Handyman..." value={newSR.type} onChange={e=>setNewSR(p=>({...p,type:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.requesterName')}</label><input className="form-input" placeholder="Resident or company name" value={newSR.resident} onChange={e=>setNewSR(p=>({...p,resident:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.preferredDateTime')}</label><input className="form-input" placeholder="DD/MM/YYYY · HH:MM" value={newSR.dateTime} onChange={e=>setNewSR(p=>({...p,dateTime:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.slaLabel')}</label><input className="form-input" placeholder="e.g. 4 hours" value={newSR.sla} onChange={e=>setNewSR(p=>({...p,sla:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.notesLabel')}</label><input className="form-input" placeholder="Special instructions..." value={newSR.notes} onChange={e=>setNewSR(p=>({...p,notes:e.target.value}))}/></div>
            <div className="form-group"><label>{t('pm.attachmentsLabel')}</label><div className="upload-area">Drag & drop or click to upload</div></div>
            <div className="grid-2" style={{marginTop:8}}>
              <button className="btn btn-primary" onClick={handleCreateSR}>Create Request</button>
              <button className="btn" onClick={()=>setShowNewRequest(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

