// ==================== ANNOUNCEMENTS PAGE ====================
const AnnouncementsPage = () => {
  const { data, setData, showToast, t } = useApp();
  const [filter, setFilter] = useState('All');
  const [showComposer, setShowComposer] = useState(false);
  const [composerStep, setComposerStep] = useState(1);
  const [showDelete, setShowDelete] = useState(null);
  const [editingAnn, setEditingAnn] = useState(null);
  const [annForm, setAnnForm] = useState({ title: '', body: '', priority: 'Normal', audience: 'All Residents', publishMode: 'now', ackRequired: false, scheduleDate: '', scheduleTime: '' });

  const resetForm = () => setAnnForm({ title: '', body: '', priority: 'Normal', audience: 'All Residents', publishMode: 'now', ackRequired: false, scheduleDate: '', scheduleTime: '' });

  const liveCount = data.announcements.filter(a => a.status === 'Live').length;
  const scheduledCount = data.announcements.filter(a => a.status === 'Scheduled').length;
  const draftCount = data.announcements.filter(a => a.status === 'Draft').length;
  const sentCount = data.announcements.filter(a => a.status === 'Sent').length;
  const filters = [{label:'All',count:data.announcements.length},{label:'Live',count:liveCount},{label:'Scheduled',count:scheduledCount},{label:'Draft',count:draftCount},{label:'Sent',count:sentCount}];
  const filtered = filter === 'All' ? data.announcements : data.announcements.filter(a => a.status === filter);

  const handlePublish = () => {
    if (!annForm.title.trim()) { showToast('Title is required'); return; }
    const now = new Date();
    const timeStr = formatTime24(now);
    const dateStr = formatDateShort(now);
    const status = annForm.publishMode === 'now' ? 'Live' : annForm.publishMode === 'schedule' ? 'Scheduled' : 'Draft';

    if (editingAnn) {
      setData(prev => ({
        ...prev,
        announcements: prev.announcements.map(a => a.id === editingAnn.id ? {
          ...a, title: annForm.title, audience: annForm.audience, priority: annForm.priority, ackRequired: annForm.ackRequired, status: status, body: annForm.body,
          scheduleDate: annForm.scheduleDate, scheduleTime: annForm.scheduleTime
        } : a)
      }));
      showToast('Announcement updated');
    } else {
      const newAnn = {
        id: Date.now(),
        title: annForm.title,
        body: annForm.body,
        audience: annForm.audience,
        author: data.currentUser.name,
        created: dateStr + ', ' + timeStr,
        status: status,
        priority: annForm.priority,
        ackRequired: annForm.ackRequired,
        delivered: status === 'Live' ? 1240 : 0,
        read: 0,
        acknowledged: 0,
        scheduleDate: annForm.scheduleDate,
        scheduleTime: annForm.scheduleTime
      };
      setData(prev => ({ ...prev, announcements: [newAnn, ...prev.announcements] }));
      showToast('Announcement ' + (status === 'Live' ? 'published — visible to residents now' : status === 'Scheduled' ? 'scheduled for ' + annForm.scheduleDate + ' ' + annForm.scheduleTime : 'saved as draft'));
    }
    setShowComposer(false);
    setEditingAnn(null);
    resetForm();
  };

  const handleDelete = (ann) => {
    if (window.confirm('Delete this announcement? This action cannot be undone.')) { setData(prev => ({ ...prev, announcements: prev.announcements.filter(a => a.id !== ann.id) })); }
    setShowDelete(null);
    showToast('Announcement deleted');
  };

  const handleEdit = (ann) => {
    setEditingAnn(ann);
    setAnnForm({ title: ann.title, body: ann.body || '', priority: ann.priority, audience: ann.audience, publishMode: ann.status === 'Scheduled' ? 'schedule' : ann.status === 'Draft' ? 'draft' : 'now', ackRequired: ann.ackRequired, scheduleDate: ann.scheduleDate || '', scheduleTime: ann.scheduleTime || '' });
    setComposerStep(1);
    setShowComposer(true);
  };

  // Simple toolbar button
  const ToolBtn = ({ children }) => (
    <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:32,height:32,border:'1px solid #d5cfc8',borderRadius:4,cursor:'pointer',fontSize:13,fontWeight:600,color:'#1a1a1a',background:'#fff'}}>{children}</span>
  );

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('pm.announcementsTitle')}</h1><div className="subtitle">{liveCount} {t('pm.announcementLive')} · {scheduledCount} {t('pm.announcementScheduled')} · {draftCount} {t('pm.announcementDraft')} · {sentCount} {t('pm.announcementSent')}</div></div>
        <button className="btn btn-primary" onClick={()=>{resetForm();setEditingAnn(null);setShowComposer(true);setComposerStep(1)}}>{t('pm.newAnnouncementBtn')}</button>
      </div>
      <div className="filter-row">
        {filters.map(f => <span key={f.label} className={`chip ${filter===f.label?'active':''}`} onClick={()=>setFilter(f.label)}>{f.label} {f.count}</span>)}
      </div>
      {filtered.length === 0 && <div style={{textAlign:'center',color:'#a89a92',padding:40,fontSize:13}}>{t('pm.noAnnouncementsCat')}</div>}
      {filtered.map(a => (
        <div key={a.id} className="announcement-card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}>
              <div className="tags">
                <StatusBadge status={a.status}/>
                {a.priority==='High' && <span style={{fontSize:11,color:'#8a7f76',border:'1px solid #d5cfc8',borderRadius:3,padding:'1px 8px'}}>△ {t('pm.markHighPriority')}</span>}
                {a.ackRequired && <span style={{fontSize:11,color:'#8a7f76',border:'1px solid #d5cfc8',borderRadius:3,padding:'1px 8px'}}>{t('pm.ackRequiredLabel')} {t('pm.requireAck')}</span>}
              </div>
              <h3 style={{fontSize:16,fontWeight:600,marginBottom:6}}>{a.title}</h3>
              {a.body && <p style={{fontSize:13,color:'#7a6f66',margin:'4px 0 8px',lineHeight:1.5}}>{a.body}</p>}
              <div className="meta">{t('pm.announceAudience')} <strong>{a.audience}</strong> &nbsp; {t('pm.announceBy')} {a.author} &nbsp; {t('pm.announceCreated')} {a.created}</div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:16}}>
              {a.status !== 'Sent' && a.status !== 'Live' && (
                <button className="btn btn-sm" onClick={()=>handleEdit(a)} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                  <Icon name="edit" size={14}/>
                </button>
              )}
              <button className="btn btn-sm" onClick={()=>setShowDelete(a)} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                <Icon name="trash" size={14}/>
              </button>
            </div>
          </div>
          {(a.delivered > 0 || a.read > 0) && (
            <div style={{display:'flex',gap:24,alignItems:'center',flexWrap:'wrap',marginTop:16,paddingTop:16,borderTop:'1px solid #f0f0f0'}}>
              <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em'}}>{t('pm.deliveredCol')}</div><div style={{fontWeight:600,fontSize:14}}>{a.delivered.toLocaleString()}</div></div>
              <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em'}}>{t('pm.readCol')}</div><div style={{fontWeight:600,fontSize:14}}>{a.read.toLocaleString()}</div></div>
              {a.acknowledged > 0 && <div><div style={{fontSize:10,color:'#a89a92',letterSpacing:'0.04em'}}>{t('pm.acknowledgedCol')}</div><div style={{fontWeight:600,fontSize:14}}>{a.acknowledged.toLocaleString()}</div></div>}
              {a.read > 0 && a.delivered > 0 && <div style={{flex:1,display:'flex',alignItems:'center',gap:8,minWidth:120}}>
                <div className="progress-bar"><div className="fill" style={{width:`${Math.round(a.read/a.delivered*100)}%`}}/></div>
                <span style={{fontSize:11,color:'#a89a92'}}>{Math.round(a.read/a.delivered*100)}% {t('pm.readRateLabel')}</span>
              </div>}
              <span style={{fontSize:11,color:'#a89a92'}}>{t('pm.announceAudit')}: {a.author} · {a.created}</span>
            </div>
          )}
        </div>
      ))}

      {/* Composer Modal */}
      {showComposer && (
        <div className="modal-overlay" onClick={()=>{setShowComposer(false);setEditingAnn(null)}}>
          <div className="modal" style={{maxWidth:620}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header" style={{marginBottom:4}}>
              <div><div className="modal-sub" style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Announcement Composer</div><h2 style={{fontSize:22}}>{editingAnn ? t('pm.composerEditTitle') : t('pm.composerTitle')}</h2></div>
              <button className="modal-close" onClick={()=>{setShowComposer(false);setEditingAnn(null)}}>×</button>
            </div>

            {/* Wizard Steps — pill style matching Figma */}
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:24,fontSize:12}}>
              {[t('pm.composeStep'), t('pm.audienceStep'), t('pm.scheduleStep'), t('pm.previewStep')].map((s,i) => {
                const stepNum = i + 1;
                const isActive = composerStep === stepNum;
                const isCompleted = composerStep > stepNum;
                const circled = ['\u2460','\u2461','\u2462','\u2463'][i];
                return (
                  <React.Fragment key={s}>
                    {i > 0 && <span style={{color:'#d0d0d0',fontSize:11}}>›</span>}
                    <span onClick={() => { if (isCompleted || isActive) setComposerStep(stepNum); }}
                      style={{padding:'7px 16px',borderRadius:20,cursor: isActive || isCompleted ? 'pointer' : 'default',fontWeight: isActive ? 500 : 400,
                        background: isActive ? 'var(--bg-warm-dark)' : 'transparent',
                        color: isActive ? '#fff' : isCompleted ? 'var(--text-dark)' : 'var(--text-muted)',
                        border: isActive ? 'none' : '1px solid var(--border-light)',fontSize:12,letterSpacing:'0.02em',whiteSpace:'nowrap'}}>
                      {circled} {s}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Step 1: Compose */}
            {composerStep===1 && (<div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#1a1a1a',display:'block',marginBottom:8}}>{t('pm.titleLabel')} *</label>
                <input className="form-input" placeholder="Announcement title" value={annForm.title} onChange={e => setAnnForm(p => ({...p, title: e.target.value}))} style={{padding:'12px 14px',fontSize:13}}/>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#1a1a1a',display:'block',marginBottom:8}}>{t('pm.bodyLabel')}</label>
                {/* Rich text toolbar */}
                <div style={{display:'flex',gap:4,marginBottom:8}}>
                  <ToolBtn>B</ToolBtn>
                  <ToolBtn><em>I</em></ToolBtn>
                  <ToolBtn><u>U</u></ToolBtn>
                  <ToolBtn>• List</ToolBtn>
                  <ToolBtn>Link</ToolBtn>
                </div>
                <textarea className="form-input" rows={4} placeholder="Write your announcement here..." value={annForm.body} onChange={e => setAnnForm(p => ({...p, body: e.target.value}))} style={{resize:'vertical',padding:'12px 14px',fontSize:13}}/>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#1a1a1a',display:'block',marginBottom:8}}>{t('pm.announcePriority')}</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div onClick={() => setAnnForm(p => ({...p, priority:'Normal'}))}
                    style={{padding:'14px 16px',textAlign:'center',border: annForm.priority==='Normal' ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',borderRadius:8,cursor:'pointer',background: annForm.priority==='Normal' ? 'var(--bg-warm-dark)' : '#fff',color: annForm.priority==='Normal' ? '#fff' : 'var(--text-dark)',fontWeight:500,fontSize:13,transition:'all 0.15s'}}>
                    {t('pm.normalPriority')}
                  </div>
                  <div onClick={() => setAnnForm(p => ({...p, priority:'High'}))}
                    style={{padding:'14px 16px',textAlign:'center',border: annForm.priority==='High' ? '1.5px solid #8b4a42' : '1px solid var(--border-light)',borderRadius:8,cursor:'pointer',background: annForm.priority==='High' ? '#8b4a42' : '#fff',color: annForm.priority==='High' ? '#fff' : 'var(--text-dark)',fontWeight:500,fontSize:13,transition:'all 0.15s'}}>
                    △ {t('pm.highPriorityLabel')}
                  </div>
                </div>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#1a1a1a',display:'block',marginBottom:8}}>{t('pm.announceAttachment')}</label>
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',border:'1px solid #ebe7e3',borderRadius:8,background:'#fff'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <span style={{color:'#a89a92',fontSize:12}}>Upload image or document<br/>JPG, PNG, PDF up to 10MB</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>Acknowledgement Required</div>
                  <div style={{fontSize:11,color:'#a89a92'}}>{t('pm.ackRequiredDesc')}</div>
                </div>
                <Toggle value={annForm.ackRequired} onChange={() => setAnnForm(p => ({...p, ackRequired: !p.ackRequired}))}/>
              </div>
              <button className="btn btn-primary" style={{width:'100%',padding:'14px 0',fontSize:14,fontWeight:600,borderRadius:8}} onClick={()=>setComposerStep(2)}>{t('pm.continueAudience')}</button>
            </div>)}

            {/* Step 2: Audience */}
            {composerStep===2 && (<div>
              <p style={{color:'#a89a92',marginBottom:16,fontSize:13}}>{t('pm.selectWhoReceive')}</p>
              {[
                {label:t('pm.allResidents'),sub:'1,240 ' + t('pm.recipientCount'),val:'All Residents'},
                {label:t('pm.allResidentsGuards'),sub:'1,258 ' + t('pm.recipientCount'),val:'All Residents + Guards'},
                {label:t('pm.specificBuildings'),sub:'Tower A, B, C, D',val:'Specific Buildings'},
                {label:t('pm.specificFlats'),sub:'Select individual units',val:'Specific Flats'},
                {label:t('pm.securityGuards'),sub:'18 guards on duty',val:'Security Guards'},
                {label:t('pm.ownersOnly'),sub:'Property owners',val:'Owners Only'}
              ].map((a,i) => (
                <div key={i} onClick={() => setAnnForm(p => ({...p, audience: a.val}))}
                  style={{display:'flex',alignItems:'center',gap:12,marginBottom:8,cursor:'pointer',background: annForm.audience===a.val ? 'var(--accent-warm-light)' : '#fff',borderRadius:8,padding:'14px 16px',border: annForm.audience===a.val ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',transition:'all 0.15s'}}>
                  <div style={{width:36,height:36,background: annForm.audience===a.val ? 'var(--bg-warm-dark)' : 'var(--bg-surface)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border: annForm.audience===a.val ? 'none' : '1px solid var(--border-light)'}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={annForm.audience===a.val ? '#fff' : 'var(--text-secondary)'} strokeWidth="1.6"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight: annForm.audience===a.val ? 600 : 500,color:'var(--text-dark)'}}>{a.label}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{a.sub}</div>
                  </div>
                  {annForm.audience===a.val && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--bg-warm-dark)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
              ))}
              <div className="grid-2" style={{marginTop:20}}>
                <button className="btn" onClick={()=>setComposerStep(1)}>← Back</button>
                <button className="btn btn-primary" onClick={()=>setComposerStep(3)}>Continue to Schedule →</button>
              </div>
            </div>)}

            {/* Step 3: Schedule */}
            {composerStep===3 && (<div>
              <p style={{color:'#a89a92',marginBottom:16,fontSize:13}}>{t('pm.choosePubTime')}</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
                {[
                  {key:'now',label:t('pm.publishNow'),sub:t('pm.sendImmediately')},
                  {key:'schedule',label:t('pm.schedule'),sub:t('pm.setFutureTime')},
                  {key:'draft',label:t('pm.saveAsDraft'),sub:t('pm.editLater')}
                ].map(opt => (
                  <div key={opt.key} onClick={() => setAnnForm(p => ({...p, publishMode: opt.key}))}
                    style={{padding:'16px 12px',textAlign:'center',border: annForm.publishMode===opt.key ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',borderRadius:8,cursor:'pointer',
                      background: annForm.publishMode===opt.key ? 'var(--bg-warm-dark)' : '#fff',
                      color: annForm.publishMode===opt.key ? '#fff' : 'var(--text-dark)',transition:'all 0.15s'}}>
                    <div style={{fontWeight:500,fontSize:13,marginBottom:3}}>{opt.label}</div>
                    <div style={{fontSize:11,opacity:0.7}}>{opt.sub}</div>
                  </div>
                ))}
              </div>

              {/* Schedule Date/Time picker — only shown when Schedule is selected */}
              {annForm.publishMode === 'schedule' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16,padding:16,background:'#f2efec',borderRadius:6,border:'1px solid #ebe7e3'}}>
                  <div>
                    <label style={{fontSize:11,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('pm.scheduleDateLabel')}</label>
                    <input type="date" value={annForm.scheduleDate} onChange={e => setAnnForm(p => ({...p, scheduleDate: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:'#a89a92',letterSpacing:'0.04em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('pm.scheduleTimeLabel')}</label>
                    <input type="time" value={annForm.scheduleTime} onChange={e => setAnnForm(p => ({...p, scheduleTime: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #d5cfc8',borderRadius:4,color:'#1a1a1a',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                  </div>
                </div>
              )}

              <div className="grid-2" style={{marginTop:16}}>
                <button className="btn" onClick={()=>setComposerStep(2)}>← Back</button>
                <button className="btn btn-primary" onClick={()=>setComposerStep(4)}>Preview →</button>
              </div>
            </div>)}

            {/* Step 4: Preview */}
            {composerStep===4 && (<div>
              <div style={{background:'#f2efec',borderRadius:8,padding:20,marginBottom:20}}>
                <div style={{display:'flex',gap:6,marginBottom:8}}>
                  <StatusBadge status={annForm.publishMode==='now'?'Live':annForm.publishMode==='schedule'?'Scheduled':'Draft'}/>
                  {annForm.priority==='High' && <span style={{fontSize:11,border:'1px solid #d5cfc8',borderRadius:3,padding:'1px 8px',background:'#fff'}}>△ High Priority</span>}
                  {annForm.ackRequired && <span style={{fontSize:11,border:'1px solid #d5cfc8',borderRadius:3,padding:'1px 8px',background:'#fff'}}>Ack Required</span>}
                </div>
                <div style={{fontWeight:600,fontSize:15,marginBottom:4}}>{annForm.title || '[Untitled]'}</div>
                {annForm.body && <p style={{fontSize:13,color:'#7a6f66',margin:'0 0 8px',lineHeight:1.5}}>{annForm.body}</p>}
                <div style={{fontSize:12,color:'#a89a92'}}>Audience: {annForm.audience}</div>
                {annForm.publishMode === 'schedule' && annForm.scheduleDate && (
                  <div style={{fontSize:12,color:'#a89a92'}}>Scheduled: {annForm.scheduleDate} at {annForm.scheduleTime || '—'}</div>
                )}
                {annForm.ackRequired && <div style={{fontSize:12,color:'#a89a92'}}>Acknowledgement required</div>}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13,marginBottom:20,background:'#fff',border:'1px solid #ebe7e3',borderRadius:6,padding:16}}>
                <div><span style={{color:'#a89a92'}}>Audience:</span> <strong>{annForm.audience}</strong></div>
                <div><span style={{color:'#a89a92'}}>Priority:</span> <strong>{annForm.priority}</strong></div>
                <div><span style={{color:'#a89a92'}}>Publish:</span> <strong>{annForm.publishMode==='now'?'Immediately':annForm.publishMode==='schedule'?'Scheduled':'Draft'}</strong></div>
                <div><span style={{color:'#a89a92'}}>Acknowledgement:</span> <strong>{annForm.ackRequired ? 'Required' : 'Not required'}</strong></div>
              </div>

              {/* Data persistence notice */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#f2efec',borderRadius:6,marginBottom:20,border:'1px solid #ebe7e3'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>
                <span style={{fontSize:11,color:'#1a1a1a'}}>
                  {annForm.publishMode === 'now' ? t('pm.publishImmediately') :
                   annForm.publishMode === 'schedule' ? t('pm.publishScheduled') :
                   t('pm.publishDraft')}
                </span>
              </div>

              <div className="grid-2">
                <button className="btn" onClick={()=>setComposerStep(3)}>← Back</button>
                <button className="btn btn-primary" style={{fontWeight:600}} onClick={handlePublish}>
                  {annForm.publishMode==='now' ? 'Publish Now' : annForm.publishMode==='schedule' ? 'Schedule' : 'Save Draft'}
                </button>
              </div>
            </div>)}
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDelete && (
        <div className="modal-overlay" onClick={()=>setShowDelete(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <h2 style={{marginBottom:8,fontSize:16}}>{t('pm.announceDelete')}</h2>
            <p style={{color:'#8a7f76',marginBottom:20,fontSize:13}}>Are you sure you want to delete "{showDelete.title}"? {t('pm.confirmDelete')}</p>
            <div className="grid-2">
              <button className="btn btn-primary" onClick={()=>handleDelete(showDelete)}>Delete</button>
              <button className="btn" onClick={()=>setShowDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== GUARDS PAGE ====================

