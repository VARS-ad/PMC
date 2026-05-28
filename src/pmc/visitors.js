// ==================== VISITORS PAGE ====================
const VisitorsPage = () => {
  const { data, setData, showToast } = useApp();
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [search, setSearch] = useState('');
  const [pmcFormStep, setPmcFormStep] = useState('form');
  const [formErrors, setFormErrors] = useState({});
  const [isCreatingVisitor, setIsCreatingVisitor] = useState(false);
  const [pmcUnitFocused, setPmcUnitFocused] = useState(false);
  const [newVisitor, setNewVisitor] = useState({
    visitorType: 'Resident Guest',
    entryType: 'Walk-in',
    fullName: '',
    mobile: '',
    idDocType: '',
    idDocNumber: '',
    flat: '',
    tower: 'Tower A',
    host: '',
    additionalVisitors: 0,
    vehicle: '',
    notes: '',
    purpose: '',
    repeater: 'Single Visit'
  });

  const types = ['All','Guest','Vendor','Contractor'];
  const statuses = ['All','Inside','Pending','Pre-Approved','Scheduled','Checked Out'];

  const filtered = data.visitors.filter(v => {
    if (typeFilter !== 'All' && v.type !== typeFilter) return false;
    if (statusFilter !== 'All' && v.status !== statusFilter) return false;
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.flat.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    // Sort by date in descending order (newest first)
    // Parse dates like "10 Mar" to compare
    const dateA = new Date(a.date + ' 2026');
    const dateB = new Date(b.date + ' 2026');
    return dateB - dateA;
  });

  const resetPmcVisitorForm = () => {
    setPmcFormStep('form');
    setNewVisitor({
      visitorType: 'Resident Guest', entryType: 'Walk-in', fullName: '', mobile: '',
      idDocType: '', idDocNumber: '', flat: '', tower: 'Tower A', host: '',
      additionalVisitors: 0, vehicle: '', notes: '', purpose: '', repeater: 'Single Visit'
    });
  };

  const validatePmcVisitorForm = () => {
    const errors = {};
    if (!newVisitor.fullName.trim()) { errors.fullName = 'Visitor name is required'; }
    else if (!/^[a-zA-Z\s]+$/.test(newVisitor.fullName)) { errors.fullName = 'Name must contain only letters and spaces'; }
    if (!newVisitor.mobile.trim()) { errors.mobile = 'Mobile number is required'; }
    if (!newVisitor.flat.trim()) { errors.flat = 'Flat/unit number is required'; }
    if (newVisitor.visitorType !== 'Resident Guest' && !newVisitor.idDocType) { errors.idDocType = 'ID document is required'; }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showToast('Please fill in all required fields');
      setIsSubmitting(false); return;
    }
    setFormErrors({});
    setIsCreatingVisitor(true);
    setPmcFormStep('review');
  };

  const handleCreateVisitor = () => {
    const timeNow = new Date();
    const timeStr = formatTime12(timeNow);
    const dateStr = formatDateShort(timeNow);
    const id = 'VIS-' + timeNow.getTime() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const permitRef = 'VIS-' + timeNow.getFullYear() + '-' + String(Date.now() % 10000).padStart(4,'0');
    const idDocFull = newVisitor.idDocType ? (newVisitor.idDocType + (newVisitor.idDocNumber ? ': ' + newVisitor.idDocNumber : '')) : '';
    // For single-visit QR: set validity to end of current day (23:59:59 Dubai time)
    // For multiple-visit QR: set validity to "Until Cancelled" (no auto-expiry)
    const validUntil = newVisitor.repeater === 'Single Visit' ? (dateStr + ' 23:59:59') : 'Until Cancelled';

    const isoDate = timeNow.getFullYear()+'-'+String(timeNow.getMonth()+1).padStart(2,'0')+'-'+String(timeNow.getDate()).padStart(2,'0');
    const entry = {
      id, name: newVisitor.fullName.trim(), resident: newVisitor.host.trim() || 'Pending Assignment',
      flat: newVisitor.flat.trim(), contact: newVisitor.mobile.trim(), type: newVisitor.visitorType,
      gate: 'Main Gate', status: 'Pending', time: timeStr, date: dateStr, dateIn: isoDate, dateOut: '', permitRef,
      duration: newVisitor.repeater === 'Single Visit' ? 'Day pass' : 'Multi-entry',
      qrCode: 'Pending', entryType: newVisitor.entryType, idDoc: idDocFull,
      vehicle: newVisitor.vehicle.trim(), additionalVisitors: newVisitor.additionalVisitors,
      notes: newVisitor.notes.trim(), purpose: newVisitor.purpose.trim() || newVisitor.visitorType + ' visit',
      repeater: newVisitor.repeater, validUntil
    };
    setData(prev => ({...prev, visitors: [entry, ...prev.visitors]}));
    resetPmcVisitorForm();
    setShowManualEntry(false);
    setIsCreatingVisitor(false);
    showToast('Visitor entry created successfully!');
  };

  const handleApprove = (v) => {
    setData(prev => ({
      ...prev,
      visitors: prev.visitors.map(vis => vis.id === v.id ? {...vis, status:'Passed Security'} : vis),
      notifications: [...(prev.notifications || []), {
        id: 'notif-' + Date.now(),
        type: 'visitor_approved',
        title: v.name + ' approved',
        message: v.name + ' has been approved to enter. Status: Passed Security',
        time: formatTime12(new Date()),
        timestamp: new Date().toISOString(),
        read: false,
        visitorId: v.id,
        visitorName: v.name,
        flat: v.flat
      }]
    }));
    showToast(`${v.name} approved - Passed Security`);
  };

  const handleReject = (v) => {
    setData(prev => ({
      ...prev,
      visitors: prev.visitors.map(vis => vis.id === v.id ? {...vis, status:'Denied Entry'} : vis),
      notifications: [...(prev.notifications || []), {
        id: 'notif-' + Date.now(),
        type: 'visitor_rejected',
        title: v.name + ' rejected',
        message: v.name + ' has been denied entry',
        time: formatTime12(new Date()),
        timestamp: new Date().toISOString(),
        read: false,
        visitorId: v.id,
        visitorName: v.name,
        flat: v.flat
      }]
    }));
    showToast(`${v.name} rejected - Denied Entry`);
  };

  const handleExportExcel = () => {
    exportToExcel(filtered, [
      {header:'Timestamp', key:'date'}, {header:'Time', key:'time'}, {header:'Name', key:'name'},
      {header:'Flat', key:'flat'}, {header:'Contact', key:'contact'}, {header:'Type', key:'type'},
      {header:'Gate', key:'gate'}, {header:'Status', key:'status'}, {header:'Permit Ref', key:'permitRef'},
      {header:'Resident', key:'resident'}, {header:'Duration', key:'duration'}
    ], 'VARS_Visitors_Export');
    showToast('Visitors exported to Excel!');
  };

  const visitorCounts = { Guests: data.visitors.filter(v=>v.type==='Guest'&&v.status==='Inside').length, Vendors: data.visitors.filter(v=>v.type==='Vendor'&&v.status==='Inside').length, Contractors: data.visitors.filter(v=>v.type==='Contractor'&&v.status==='Inside').length };

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('pm.visitorsLiveLog')}</h1><div className="subtitle">86 {t('pm.guestsInside')} · 7 {t('pm.pendingApprovalCount')}</div></div>
        <button className="btn btn-primary" onClick={()=>setShowManualEntry(true)}>✦ {t('pm.createRequest')}</button>
      </div>

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="label">{t('pm.guestsInside')}</div><div style={{display:'flex',alignItems:'baseline',gap:8}}><span className="value">34</span><span style={{fontSize:12,color:'#61707D'}}>40%</span></div></div>
        <div className="kpi-card"><div className="label">{t('pm.vendorsInside')}</div><div style={{display:'flex',alignItems:'baseline',gap:8}}><span className="value">28</span><span style={{fontSize:12,color:'#61707D'}}>33%</span></div></div>
        <div className="kpi-card"><div className="label">{t('pm.contractorsInside')}</div><div style={{display:'flex',alignItems:'baseline',gap:8}}><span className="value">24</span><span style={{fontSize:12,color:'#61707D'}}>28%</span></div></div>
        <div className="kpi-card"><div className="label">{t('pm.pendingApprovalCount')}</div><span className="value">7</span></div>
      </div>

      <div className="card">
        <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
          <div className="search-bar" style={{flex:1,maxWidth:400}}>
            <span className="search-icon"><Icon name="search" size={14}/></span>
            <input placeholder="Search by name, flat, type..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:12,color:'#61707D',marginRight:4}}>{t('pm.visitorType')}:</span>
            {types.map(typeItem => <span key={typeItem} className={`chip ${typeFilter===typeItem?'active':''}`} onClick={()=>setTypeFilter(typeItem)}>{typeItem}</span>)}
          </div>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:12,color:'#61707D',marginRight:4}}>{t('pm.visitorStatus')}:</span>
            {statuses.map(s => <span key={s} className={`chip ${statusFilter===s?'active':''}`} onClick={()=>setStatusFilter(s)}>{s}</span>)}
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontSize:13,color:'#61707D'}}>{filtered.length} {t('pm.visitorResults')}</span>
          <button className="btn btn-sm" onClick={handleExportExcel}><Icon name="download" size={12}/> {t('pm.exportExcel')}</button>
        </div>
        <table className="data-table">
          <thead><tr><th>{t('pm.tableHeaderDateIn') || 'Date In'}</th><th>{t('pm.tableHeaderTime') || 'Time'}</th><th>{t('pm.tableHeaderDateOut') || 'Date Out'}</th><th>{t('pm.tableHeaderName')}</th><th>{t('pm.tableHeaderFlat')}</th><th>{t('pm.tableHeaderContact')}</th><th>{t('pm.typeLabel')}</th><th>{t('pm.tableHeaderGate') || 'Gate'}</th><th>{t('pm.tableHeaderStatus') || 'Status'}</th><th>{t('pm.tableHeaderActions')}</th></tr></thead>
          <tbody>
            {filtered.map(v => {
              const fmtDt = (d) => { if(!d) return '—'; try { const dt = new Date(d.includes('-') ? d+'T00:00:00' : d); if(isNaN(dt)) return d; return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Dubai'}); } catch(e) { return d; } };
              return (
              <tr key={v.id}>
                <td>{fmtDt(v.dateIn) || v.date || '—'}</td>
                <td>{v.time || '—'}</td>
                <td>{v.dateOut ? fmtDt(v.dateOut) : '—'}</td>
                <td className="name-cell">{v.name}<span className="sub">{v.resident}</span></td>
                <td>{v.flat}</td><td>{v.contact}</td>
                <td><StatusBadge status={v.type}/></td><td>{v.gate}</td>
                <td><StatusBadge status={v.status}/></td>
                <td>
                  <div style={{display:'flex',gap:4}}>
                    <button className="btn btn-sm" onClick={()=>setSelectedVisitor(v)}><Icon name="eye" size={12}/> {t('pm.viewButton')}</button>
                    {v.status==='Pending' && <button className="btn btn-sm btn-primary" onClick={()=>handleApprove(v)}><Icon name="check" size={12}/> {t('pm.applyChanges')}</button>}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination total={86} pageSize={10} page={1} onPageChange={()=>{}}/>
      </div>

      {selectedVisitor && (
        <div className="modal-overlay" onClick={()=>setSelectedVisitor(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="modal-sub">{t('pm.visitorDetail')}</div><h2>{t('pm.visitorDetailModal')}</h2></div>
              <button className="modal-close" onClick={()=>setSelectedVisitor(null)}>×</button>
            </div>
            <div style={{display:'flex',gap:16,marginBottom:20}}>
              <div style={{width:60,height:60,background:'#E6EAE9',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#61707D'}}>{t('pm.visitorPhoto')}</div>
              <div>
                <h3 style={{fontSize:18,fontWeight:600}}>{selectedVisitor.name}</h3>
                <div style={{color:'#61707D',fontSize:13}}>{selectedVisitor.contact}</div>
                <div style={{display:'flex',gap:6,marginTop:4}}><StatusBadge status={selectedVisitor.type}/><StatusBadge status={selectedVisitor.status}/></div>
              </div>
            </div>
            <div className="grid-2" style={{marginBottom:16}}>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.flatUnit')}</div><div style={{fontWeight:600}}>{selectedVisitor.flat}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.checkInTime')}</div><div style={{fontWeight:600}}>{t('pm.todayLabel')}, {selectedVisitor.time}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.residentName')}</div><div style={{fontWeight:600}}>{selectedVisitor.resident}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.permitRef')}</div><div style={{fontWeight:600}}>{selectedVisitor.permitRef}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.expectedDuration')}</div><div style={{fontWeight:600}}>{selectedVisitor.duration}</div></div>
              <div><div style={{fontSize:11,color:'#61707D'}}>{t('pm.qrCode')}</div><div style={{fontWeight:600}}>{selectedVisitor.qrCode} ✓</div></div>
            </div>
            <div style={{background:'#f5f2ef',borderRadius:8,padding:24,textAlign:'center',color:'#61707D',fontSize:12,marginBottom:16}}>{t('pm.qrCodePlaceholder')}</div>
            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,marginBottom:8}}>{t('pm.approvalHistory')}</div>
              <div style={{fontSize:13,color:'#61707D'}}>✓ {t('pm.preApprovedByResident')} — {selectedVisitor.flat} — 09:00</div>
              <div style={{fontSize:13,color:'#61707D'}}>◷ {t('pm.guardScannedQr')} — {t('pm.entryPoint')}: Main Gate — {selectedVisitor.time}</div>
            </div>
            {(() => {
              const vDate = selectedVisitor.date;
              const todayStr = new Date().toISOString().split('T')[0];
              let isFuture = false;
              if (vDate) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(vDate)) isFuture = vDate > todayStr;
                else { const p = vDate.split('/'); if (p.length === 3) isFuture = (p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0')) > todayStr; }
              }
              return isFuture && (selectedVisitor.status === 'Pre-Approved' || selectedVisitor.status === 'Scheduled') ? (
                <div style={{textAlign:'center',padding:'12px 16px',background:'#f5f0ec',borderRadius:8,color:'#7a6f66',fontSize:12,fontWeight:500,marginTop:8}}>
                  {t('pm.preApprovedFor')} {selectedVisitor.date}. {t('pm.actionsAvailableVisitDay')}.
                </div>
              ) : (
                <div className="grid-2">
                  <button className="btn btn-primary"><Icon name="phone" size={14}/> {t('pm.callResident')}</button>
                  <button className="btn" onClick={()=>{handleReject(selectedVisitor);setSelectedVisitor(null);}}>{t('pm.rejectVisitor')}</button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {showManualEntry && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#E6EAE9',zIndex:1000,overflowY:'auto'}} onClick={() => {resetPmcVisitorForm(); setShowManualEntry(false);}}>
          <div style={{maxWidth:900,margin:'0 auto',padding:20}} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <div>
                <h2 style={{fontSize:18,fontWeight:600,color:'#131F23',margin:0}}>{t('pm.manualVisitorEntry')}</h2>
                <div style={{fontSize:12,color:'#61707D',marginTop:2}}>{pmcFormStep === 'form' ? t('pm.createEntry') : t('pm.reviewConfirm')}</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                {pmcFormStep === 'review' && (
                  <button onClick={() => setPmcFormStep('form')} style={{background:'#fff',color:'#131F23',border:'1px solid #E6EAE9',padding:'8px 20px',borderRadius:4,fontSize:12,cursor:'pointer',fontWeight:500}}>{t('pm.backToEdit')}</button>
                )}
                <button onClick={() => { resetPmcVisitorForm(); setShowManualEntry(false); }} style={{background:'#fff',color:'#131F23',border:'1px solid #E6EAE9',padding:'8px 20px',borderRadius:4,fontSize:12,cursor:'pointer',fontWeight:500}}>{t('pm.cancel')}</button>
              </div>
            </div>

            {pmcFormStep === 'form' ? (
              <>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                  {/* Section 01 — Visitor Identity */}
                  <div style={{background:'#fff',border:'1px solid #E6EAE9',borderRadius:6,padding:20}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#131F23',display:'flex',alignItems:'center',gap:8}}><span style={{background:'#E6EAE9',padding:'2px 8px',borderRadius:3,fontSize:10,color:'#61707D'}}>01</span> {t('sec.visitorIdentity')}</div>
                                          </div>

                    {/* Visitor Type */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>{t('sec.visitorTypeReq')}</label>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                        {['Resident Guest','Contractor / Worker','Delivery / Courier','Domestic Staff','Service Vendor','Other / Misc.'].map(t => (
                          <div key={t} onClick={() => setNewVisitor({...newVisitor, visitorType: t, idDocType: t === 'Resident Guest' ? '' : newVisitor.idDocType})}
                            style={{padding:'10px 6px',border: newVisitor.visitorType === t ? '1.5px solid #131F23' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitor.visitorType === t ? '#f0f0f0' : 'transparent',fontSize:11,color: newVisitor.visitorType === t ? '#131F23' : '#61707D'}}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Entry Type */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>Entry Type *</label>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {['Walk-in','Drive In'].map(t => (
                          <div key={t} onClick={() => setNewVisitor({...newVisitor, entryType: t})}
                            style={{padding:10,border: newVisitor.entryType === t ? '1.5px solid #131F23' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitor.entryType === t ? '#f0f0f0' : 'transparent',fontSize:12,color: newVisitor.entryType === t ? '#131F23' : '#61707D'}}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Full Name */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.fullNameReq')}</label>
                      <input value={newVisitor.fullName} onChange={e => setNewVisitor({...newVisitor, fullName: e.target.value})}
                        placeholder={t('sec.phEnterName')}
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:formErrors.fullName ? '2px solid #d32f2f' : '1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      {formErrors.fullName && <div style={{fontSize:11,color:'#d32f2f',marginTop:4}}>{formErrors.fullName}</div>}
                    </div>

                    {/* Mobile Number */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.mobileNumberReq')}</label>
                      <input value={newVisitor.mobile} onChange={e => setNewVisitor({...newVisitor, mobile: e.target.value})}
                        placeholder="+971 XX XXX XXXX"
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:formErrors.mobile ? '2px solid #d32f2f' : '1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      {formErrors.mobile && <div style={{fontSize:11,color:'#d32f2f',marginTop:4}}>{formErrors.mobile}</div>}
                    </div>

                    {/* ID Document Type */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>
                        ID Document Type {newVisitor.visitorType !== 'Resident Guest' ? '*' : '(Optional)'}
                      </label>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {['Passport','Emirates ID'].map(t => (
                          <div key={t} onClick={() => setNewVisitor({...newVisitor, idDocType: newVisitor.idDocType === t ? '' : t})}
                            style={{padding:10,border: newVisitor.idDocType === t ? '1.5px solid #131F23' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitor.idDocType === t ? '#f0f0f0' : 'transparent',fontSize:12,color: newVisitor.idDocType === t ? '#131F23' : '#61707D'}}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Document Number */}
                    {newVisitor.idDocType && (
                      <div style={{marginBottom:16}}>
                        <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Document Number {newVisitor.visitorType !== 'Resident Guest' ? '*' : ''}</label>
                        <input value={newVisitor.idDocNumber} onChange={e => setNewVisitor({...newVisitor, idDocNumber: e.target.value})}
                          placeholder={t('sec.phEnterDocNum')}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      </div>
                    )}

                    {/* Purpose */}
                    <div style={{marginBottom:0}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('pm.purposeOfVisit')}</label>
                      <input value={newVisitor.purpose} onChange={e => setNewVisitor({...newVisitor, purpose: e.target.value})}
                        placeholder="e.g. Personal visit, Delivery, Maintenance..."
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                    </div>
                  </div>

                  {/* Section 02 — Visit Details */}
                  <div style={{background:'#fff',border:'1px solid #E6EAE9',borderRadius:6,padding:20}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#131F23',display:'flex',alignItems:'center',gap:8}}><span style={{background:'#E6EAE9',padding:'2px 8px',borderRadius:3,fontSize:10,color:'#61707D'}}>02</span> {t('sec.visitDetails')}</div>
                                          </div>

                    {/* Flat / Unit + Tower */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                      <div style={{position:'relative'}}>
                        <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.unitNo')} *</label>
                        <input value={newVisitor.flat}
                          onChange={e => {
                            const val = e.target.value;
                            const resident = RESIDENT_BY_UNIT[val.trim()];
                            setNewVisitor({
                              ...newVisitor,
                              flat: val,
                              host: resident ? resident.fullName : newVisitor.host,
                              tower: resident ? resident.tower : newVisitor.tower
                            });
                            setPmcUnitFocused(true);
                          }}
                          onFocus={() => setPmcUnitFocused(true)}
                          onBlur={() => setTimeout(() => setPmcUnitFocused(false), 150)}
                          placeholder={t('sec.phTypeUnit')}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:formErrors.flat ? '2px solid #d32f2f' : '1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                        {formErrors.flat && <div style={{fontSize:11,color:'#d32f2f',marginTop:4}}>{formErrors.flat}</div>}
                        {pmcUnitFocused && newVisitor.flat && (() => {
                          const matches = UNITS_DATABASE.filter(u => u.startsWith(newVisitor.flat.trim())).slice(0,5);
                          if (matches.length === 0) return null;
                          if (matches.length === 1 && matches[0] === newVisitor.flat.trim()) return null;
                          return (
                            <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,boxShadow:'0 4px 12px rgba(0,0,0,0.08)',zIndex:10,maxHeight:220,overflowY:'auto'}}>
                              {matches.map(u => {
                                const res = RESIDENT_BY_UNIT[u];
                                return (
                                  <div key={u}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      setNewVisitor({
                                        ...newVisitor,
                                        flat: u,
                                        host: res ? res.fullName : newVisitor.host,
                                        tower: res ? res.tower : newVisitor.tower
                                      });
                                      setPmcUnitFocused(false);
                                    }}
                                    style={{padding:'10px 12px',fontSize:12,color:'#131F23',cursor:'pointer',borderBottom:'1px solid #f0ece8'}}
                                    onMouseEnter={e => e.currentTarget.style.background='#E6EAE9'}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    <span style={{fontWeight:600}}>Unit {u}</span>
                                    <span style={{color:'#61707D'}}> / {res ? res.fullName : 'Vacant'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.towerBlock')}</label>
                        <select value={newVisitor.tower} onChange={e => setNewVisitor({...newVisitor, tower: e.target.value})}
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}>
                          <option>{t('pm.towerA')}</option><option>{t('pm.towerB')}</option><option>{t('pm.towerC')}</option><option>{t('pm.towerD')}</option>
                        </select>
                      </div>
                    </div>

                    {/* Host / Resident */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.residentName')} *</label>
                      <input value={newVisitor.host} onChange={e => setNewVisitor({...newVisitor, host: e.target.value})}
                        placeholder={t('sec.phAutoPopulated')}
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:formErrors.host ? '2px solid #d32f2f' : '1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      {formErrors.host && <div style={{fontSize:11,color:'#d32f2f',marginTop:4}}>{formErrors.host}</div>}
                    </div>

                    {/* Visit Frequency */}
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>{t('sec.visitFrequency')}</label>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {['Single Visit','Multiple Entry'].map(r => (
                          <div key={r} onClick={() => setNewVisitor({...newVisitor, repeater: r})}
                            style={{padding:10,border: newVisitor.repeater === r ? '1.5px solid #131F23' : '1px solid #d0d0d0',borderRadius:4,textAlign:'center',cursor:'pointer',background: newVisitor.repeater === r ? '#f0f0f0' : 'transparent',fontSize:12,color: newVisitor.repeater === r ? '#131F23' : '#61707D'}}>
                            {r}
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:10,color:'#61707D',marginTop:4}}>
                        {newVisitor.repeater === 'Single Visit' ? 'Valid for today only' : 'Valid until cancelled by resident'}
                      </div>
                    </div>

                    {/* Additional Visitors + Vehicle */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                      <div>
                        <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.additionalVisitors')}</label>
                        <div style={{display:'flex',alignItems:'center',gap:0}}>
                          <button onClick={() => setNewVisitor({...newVisitor, additionalVisitors: Math.max(0, newVisitor.additionalVisitors - 1)})}
                            style={{width:36,height:36,background:'#fff',border:'1px solid #D0D6D5',borderRadius:'4px 0 0 4px',color:'#131F23',fontSize:16,cursor:'pointer'}}>-</button>
                          <div style={{width:48,height:36,background:'#E6EAE9',border:'1px solid #D0D6D5',borderLeft:'none',borderRight:'none',display:'flex',alignItems:'center',justifyContent:'center',color:'#131F23',fontSize:14,fontWeight:600}}>{newVisitor.additionalVisitors}</div>
                          <button onClick={() => setNewVisitor({...newVisitor, additionalVisitors: newVisitor.additionalVisitors + 1})}
                            style={{width:36,height:36,background:'#fff',border:'1px solid #D0D6D5',borderRadius:'0 4px 4px 0',color:'#131F23',fontSize:16,cursor:'pointer'}}>+</button>
                        </div>
                        <div style={{fontSize:10,color:'#61707D',marginTop:4}}>Total visitors: {1 + newVisitor.additionalVisitors}</div>
                      </div>
                      <div>
                        <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('sec.vehicleNumber')}</label>
                        <input value={newVisitor.vehicle} onChange={e => setNewVisitor({...newVisitor, vehicle: e.target.value})}
                          placeholder="e.g. AB 12345 — leave blank if no"
                          style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label style={{fontSize:10,color:'#61707D',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Notes / Remarks</label>
                      <textarea value={newVisitor.notes} onChange={e => setNewVisitor({...newVisitor, notes: e.target.value})}
                        placeholder={t('sec.phObservations')}
                        rows={3}
                        style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
                    </div>
                  </div>
                </div>

                {/* Review Button */}
                <button onClick={validatePmcVisitorForm} disabled={isCreatingVisitor}
                  style={{width:'100%',padding:16,background:isCreatingVisitor ? '#61707D' : '#3E4C59',color:'#fff',border:'none',borderRadius:4,fontSize:15,fontWeight:700,cursor:isCreatingVisitor ? 'not-allowed' : 'pointer',marginTop:20,letterSpacing:'0.04em',opacity:isCreatingVisitor ? 0.7 : 1}}>
                  {isCreatingVisitor ? 'Validating...' : 'Review Visitor Entry'}
                </button>
              </>
            ) : (
              /* REVIEW STEP */
              <div style={{maxWidth:600,margin:'0 auto'}}>
                <div style={{background:'#fff',border:'1px solid #E6EAE9',borderRadius:8,overflow:'hidden',marginBottom:20}}>
                  {/* Review Header */}
                  <div style={{background:'#E6EAE9',padding:'16px 20px',borderBottom:'1px solid #d0d0d0'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{width:44,height:44,borderRadius:'50%',background:'#3E4C59',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#fff'}}>
                        {newVisitor.fullName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
                      </div>
                      <div>
                        <div style={{fontSize:16,fontWeight:600,color:'#131F23'}}>{newVisitor.fullName}</div>
                        <div style={{fontSize:12,color:'#131F23'}}>{newVisitor.visitorType}</div>
                      </div>
                    </div>
                  </div>

                  {/* Review Details */}
                  <div style={{padding:20}}>
                    {[
                      ['Mobile', newVisitor.mobile],
                      ['Entry Type', newVisitor.entryType],
                      ['ID Document', newVisitor.idDocType ? (newVisitor.idDocType + (newVisitor.idDocNumber ? ': ' + newVisitor.idDocNumber : '')) : 'Not provided'],
                      ['Purpose', newVisitor.purpose || newVisitor.visitorType + ' visit'],
                      ['Unit', newVisitor.flat + ' — ' + newVisitor.tower],
                      ['Host / Resident', newVisitor.host || 'Pending Assignment'],
                      ['Visit Frequency', newVisitor.repeater],
                      ['Additional Visitors', newVisitor.additionalVisitors > 0 ? '+' + newVisitor.additionalVisitors + ' (' + (1 + newVisitor.additionalVisitors) + ' total)' : 'None'],
                      ['Vehicle', newVisitor.vehicle || 'No vehicle'],
                      ['Notes', newVisitor.notes || '—']
                    ].map(([label, val], i) => (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom: i < 9 ? '1px solid #e0e0e0' : 'none'}}>
                        <span style={{fontSize:12,color:'#61707D'}}>{label}</span>
                        <span style={{fontSize:12,color:'#131F23',fontWeight:500,textAlign:'right',maxWidth:'60%'}}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status indicator */}
                  <div style={{padding:'12px 20px',background:'#E6EAE9',borderTop:'1px solid #D0D6D5',display:'flex',alignItems:'center',gap:8}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#131F23" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>
                    <span style={{fontSize:11,color:'#131F23'}}>{t('pm.pendingEntryText')}</span>
                  </div>
                </div>

                {/* Confirm Button */}
                <button onClick={handleCreateVisitor}
                  style={{width:'100%',padding:16,background:'#3E4C59',color:'#fff',border:'none',borderRadius:6,fontSize:15,fontWeight:700,cursor:'pointer',letterSpacing:'0.04em'}}>
                  Confirm & Create Entry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

