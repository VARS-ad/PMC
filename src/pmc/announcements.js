// ==================== ANNOUNCEMENTS PAGE ====================
// Render-side helper: announcement.audience can be either a legacy string
// ("All Residents", "Tower B") or — once the new audience picker lands —
// a structured object. Until the picker is wired in, this just passes
// through whatever the value is so cards keep rendering correctly.
const audienceLabel = (aud) => {
  if (!aud) return '—';
  if (typeof aud === 'string') return aud;
  if (aud.scope === 'all') return 'All Residents';
  const parts = [];
  if (Array.isArray(aud.building_names) && aud.building_names.length) parts.push(aud.building_names.join(', '));
  if (Array.isArray(aud.property_types) && aud.property_types.length) parts.push('(' + aud.property_types.join(', ') + ')');
  return parts.length ? parts.join(' ') : '—';
};
const AnnouncementsPage = () => {
  const { data, setData, showToast, t } = useApp();
  const [filter, setFilter] = useState('All');
  const [showComposer, setShowComposer] = useState(false);
  const [composerStep, setComposerStep] = useState(1);
  const [showDelete, setShowDelete] = useState(null);
  const [editingAnn, setEditingAnn] = useState(null);
  const [annForm, setAnnForm] = useState({ title: '', body: '', priority: 'Normal', audience: 'All Residents', publishMode: 'now', ackRequired: false, scheduleDate: '', scheduleTime: '' });
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => setAnnForm({ title: '', body: '', priority: 'Normal', audience: 'All Residents', publishMode: 'now', ackRequired: false, scheduleDate: '', scheduleTime: '' });

  // Tab semantics (per product spec):
  //   Live      — already published AND not past its expiry/display-until date
  //   Scheduled — scheduled_at is in the future (will go live later)
  //   Draft     — expired announcements (used to be Live, now past their expiry date)
  //   Sent      — already published (regardless of whether still live or expired)
  // The announcement object on this app does NOT carry explicit `published_at` /
  // `expires_at` fields — only `status`, `created` (string like "05 Apr, 09:44"),
  // and optionally `scheduleDate` / `scheduleTime`. As a proxy, we treat any
  // currently-"Live" item older than 30 days as expired (=> Draft bucket).
  const EXPIRY_DAYS = 30;
  const now = new Date();
  const parseCreated = (s) => {
    // Best-effort: "05 Apr, 09:44" -> Date in current year. Falls back to now.
    if (!s) return now;
    const d = new Date(s + ' ' + now.getFullYear());
    return isNaN(d.getTime()) ? now : d;
  };
  const parseScheduled = (a) => {
    if (!a.scheduleDate) return null;
    const d = new Date(a.scheduleDate + 'T' + (a.scheduleTime || '00:00'));
    return isNaN(d.getTime()) ? null : d;
  };
  const isExpired = (a) => {
    const created = parseCreated(a.created);
    return (now - created) > EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  };
  const bucketOf = (a) => {
    // Scheduled — future publish date
    if (a.status === 'Scheduled') {
      const sd = parseScheduled(a);
      if (sd && sd > now) return 'Scheduled';
    }
    // Draft — was Live but now past expiry (proxy: created > 30 days ago)
    if (a.status === 'Live' && isExpired(a)) return 'Draft';
    // Live — published and not expired
    if (a.status === 'Live') return 'Live';
    // Sent — already delivered (Sent status, or expired Live which is also "sent")
    if (a.status === 'Sent') return 'Sent';
    // Legacy explicit Draft still maps to Draft
    if (a.status === 'Draft') return 'Draft';
    return a.status;
  };
  // An announcement can belong to multiple buckets — Sent covers any
  // already-published item (Live OR expired-Draft OR explicit Sent).
  const inBucket = (a, bucket) => {
    if (bucket === 'All') return true;
    if (bucket === 'Sent') {
      // Anything that has been published counts as Sent
      return a.status === 'Sent' || a.status === 'Live';
    }
    return bucketOf(a) === bucket;
  };

  const liveCount = data.announcements.filter(a => inBucket(a, 'Live')).length;
  const scheduledCount = data.announcements.filter(a => inBucket(a, 'Scheduled')).length;
  const draftCount = data.announcements.filter(a => inBucket(a, 'Draft')).length;
  const sentCount = data.announcements.filter(a => inBucket(a, 'Sent')).length;
  const filters = [{label:'All',count:data.announcements.length},{label:'Live',count:liveCount},{label:'Scheduled',count:scheduledCount},{label:'Draft',count:draftCount},{label:'Sent',count:sentCount}];
  const filtered = data.announcements.filter(a => inBucket(a, filter));

  const handlePublish = () => {
    if (submitting) return; // guard against double-submit
    if (!annForm.title.trim()) { showToast('Title is required'); return; }
    if (annForm.publishMode === 'schedule' && (!annForm.scheduleDate || !annForm.scheduleTime)) {
      showToast('Please pick a date and time for the scheduled publish');
      return;
    }
    setSubmitting(true);
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
    setSubmitting(false);
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
    <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:32,height:32,border:'1px solid #D0D6D5',borderRadius:4,cursor:'pointer',fontSize:13,fontWeight:600,color:'#131F23',background:'#fff'}}>{children}</span>
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
      {filtered.length === 0 && <div style={{textAlign:'center',color:'#61707D',padding:40,fontSize:13}}>{t('pm.noAnnouncementsCat')}</div>}
      {filtered.map(a => (
        <div key={a.id} className="announcement-card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}>
              <div className="tags">
                <StatusBadge status={a.status}/>
              </div>
              <h3 style={{fontSize:16,fontWeight:600,marginBottom:6}}>{a.title}</h3>
              {a.body && <p style={{fontSize:13,color:'#7a6f66',margin:'4px 0 8px',lineHeight:1.5}}>{a.body}</p>}
              <div className="meta">{t('pm.announceAudience')} <strong>{audienceLabel(a.audience)}</strong> &nbsp; {t('pm.announceBy')} {a.author} &nbsp; {t('pm.announceCreated')} {a.created}</div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:16}}>
              <button className="btn btn-sm" onClick={()=>handleEdit(a)} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                <Icon name="edit" size={14}/>
              </button>
              <button className="btn btn-sm" onClick={()=>setShowDelete(a)} style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                <Icon name="trash" size={14}/>
              </button>
            </div>
          </div>
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
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.titleLabel')} *</label>
                <input className="form-input" placeholder="Announcement title" value={annForm.title} onChange={e => setAnnForm(p => ({...p, title: e.target.value}))} style={{padding:'12px 14px',fontSize:13}}/>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.bodyLabel')}</label>
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
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.announcePriority')}</label>
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
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.announceAttachment')}</label>
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',border:'1px solid #E6EAE9',borderRadius:8,background:'#fff'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <span style={{color:'#61707D',fontSize:12}}>Upload image or document<br/>JPG, PNG, PDF up to 10MB</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#131F23'}}>Acknowledgement Required</div>
                  <div style={{fontSize:11,color:'#61707D'}}>{t('pm.ackRequiredDesc')}</div>
                </div>
                <Toggle value={annForm.ackRequired} onChange={() => setAnnForm(p => ({...p, ackRequired: !p.ackRequired}))}/>
              </div>
              <button className="btn btn-primary" style={{width:'100%',padding:'14px 0',fontSize:14,fontWeight:600,borderRadius:8}} onClick={()=>setComposerStep(2)}>{t('pm.continueAudience')}</button>
            </div>)}

            {/* Step 2: Audience */}
            {composerStep===2 && (<div>
              <p style={{color:'#61707D',marginBottom:16,fontSize:13}}>{t('pm.selectWhoReceive')}</p>
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
              <p style={{color:'#61707D',marginBottom:16,fontSize:13}}>{t('pm.choosePubTime')}</p>
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
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16,padding:16,background:'#E6EAE9',borderRadius:6,border:'1px solid #E6EAE9'}}>
                  <div>
                    <label style={{fontSize:11,color:'#61707D',letterSpacing:'0.04em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('pm.scheduleDateLabel')}</label>
                    <input type="date" value={annForm.scheduleDate} onChange={e => setAnnForm(p => ({...p, scheduleDate: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:'#61707D',letterSpacing:'0.04em',textTransform:'uppercase',display:'block',marginBottom:6}}>{t('pm.scheduleTimeLabel')}</label>
                    <input type="time" value={annForm.scheduleTime} onChange={e => setAnnForm(p => ({...p, scheduleTime: e.target.value}))}
                      style={{width:'100%',padding:'10px 12px',background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#131F23',fontSize:13,boxSizing:'border-box',outline:'none'}}/>
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
              <div style={{background:'#E6EAE9',borderRadius:8,padding:20,marginBottom:20}}>
                <div style={{display:'flex',gap:6,marginBottom:8}}>
                  <StatusBadge status={annForm.publishMode==='now'?'Live':annForm.publishMode==='schedule'?'Scheduled':'Draft'}/>
                  {annForm.priority==='High' && <span style={{fontSize:11,border:'1px solid #D0D6D5',borderRadius:3,padding:'1px 8px',background:'#fff'}}>△ High Priority</span>}
                  {annForm.ackRequired && <span style={{fontSize:11,border:'1px solid #D0D6D5',borderRadius:3,padding:'1px 8px',background:'#fff'}}>Ack Required</span>}
                </div>
                <div style={{fontWeight:600,fontSize:15,marginBottom:4}}>{annForm.title || '[Untitled]'}</div>
                {annForm.body && <p style={{fontSize:13,color:'#7a6f66',margin:'0 0 8px',lineHeight:1.5}}>{annForm.body}</p>}
                <div style={{fontSize:12,color:'#61707D'}}>Audience: {annForm.audience}</div>
                {annForm.publishMode === 'schedule' && annForm.scheduleDate && (
                  <div style={{fontSize:12,color:'#61707D'}}>Scheduled: {annForm.scheduleDate} at {annForm.scheduleTime || '—'}</div>
                )}
                {annForm.ackRequired && <div style={{fontSize:12,color:'#61707D'}}>Acknowledgement required</div>}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13,marginBottom:20,background:'#fff',border:'1px solid #E6EAE9',borderRadius:6,padding:16}}>
                <div><span style={{color:'#61707D'}}>Audience:</span> <strong>{annForm.audience}</strong></div>
                <div><span style={{color:'#61707D'}}>Priority:</span> <strong>{annForm.priority}</strong></div>
                <div><span style={{color:'#61707D'}}>Publish:</span> <strong>{annForm.publishMode==='now'?'Immediately':annForm.publishMode==='schedule'?'Scheduled':'Draft'}</strong></div>
                <div><span style={{color:'#61707D'}}>Acknowledgement:</span> <strong>{annForm.ackRequired ? 'Required' : 'Not required'}</strong></div>
              </div>

              {/* Data persistence notice */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#E6EAE9',borderRadius:6,marginBottom:20,border:'1px solid #E6EAE9'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#131F23" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>
                <span style={{fontSize:11,color:'#131F23'}}>
                  {annForm.publishMode === 'now' ? t('pm.publishImmediately') :
                   annForm.publishMode === 'schedule' ? t('pm.publishScheduled') :
                   t('pm.publishDraft')}
                </span>
              </div>

              <div className="grid-2">
                <button className="btn" onClick={()=>setComposerStep(3)}>← Back</button>
                <button className="btn btn-primary" style={{fontWeight:600,opacity:submitting?0.6:1,pointerEvents:submitting?'none':'auto'}} disabled={submitting} onClick={handlePublish}>
                  {submitting ? 'Working…' : annForm.publishMode==='now' ? 'Publish Now' : annForm.publishMode==='schedule' ? 'Schedule' : 'Save Draft'}
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
            <p style={{color:'#61707D',marginBottom:20,fontSize:13}}>Are you sure you want to delete "{showDelete.title}"? {t('pm.confirmDelete')}</p>
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

