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
  // Audience is now a structured object: { scope: 'all'|'specific',
  // building_ids: [], building_names: [], property_types: [] }. Legacy
  // string audiences ("All Residents", "Tower B") survive on existing
  // rows via audienceLabel() and are converted on edit.
  const initialAudience = () => ({ scope: 'all', building_ids: [], building_names: [], property_types: [] });
  const [annForm, setAnnForm] = useState({ title: '', body: '', priority: 'Normal', audience: initialAudience(), publishMode: 'now', scheduleDate: '', scheduleTime: '', attachment: null });
  const [submitting, setSubmitting] = useState(false);
  // Buildings for the audience picker — loaded from Supabase on first
  // composer open and cached for the rest of the session.
  const [audBuildings, setAudBuildings] = useState(null);
  useEffect(() => {
    if (!showComposer || audBuildings || !supabaseClient) return;
    (async () => {
      const { data: bs } = await supabaseClient.from('buildings').select('id,name,property_type').order('name');
      setAudBuildings(bs || []);
    })();
  }, [showComposer]);

  const resetForm = () => setAnnForm({ title: '', body: '', priority: 'Normal', audience: initialAudience(), publishMode: 'now', scheduleDate: '', scheduleTime: '', attachment: null });

  // Convert any legacy string audience to a structured object for the form.
  const audienceFromAnn = (raw) => {
    if (raw && typeof raw === 'object') {
      return {
        scope: raw.scope || 'all',
        building_ids:   Array.isArray(raw.building_ids)   ? raw.building_ids   : [],
        building_names: Array.isArray(raw.building_names) ? raw.building_names : [],
        property_types: Array.isArray(raw.property_types) ? raw.property_types : [],
      };
    }
    if (typeof raw === 'string') {
      if (!raw || raw === 'All Residents' || raw === 'All Residents + Guards') return initialAudience();
      // Best-effort: dump the legacy string in building_names so the user
      // can re-pick the right buildings from the proper list.
      return { scope: 'specific', building_ids: [], building_names: [raw], property_types: [] };
    }
    return initialAudience();
  };

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

    // Attachment metadata: file object isn't persistable, so capture
    // name/size/type for the audit trail. (Upload to storage is Phase 2.)
    const attachmentMeta = annForm.attachment ? {
      name: annForm.attachment.name,
      size: annForm.attachment.size,
      type: annForm.attachment.type,
    } : null;
    if (editingAnn) {
      setData(prev => ({
        ...prev,
        announcements: prev.announcements.map(a => a.id === editingAnn.id ? {
          ...a, title: annForm.title, audience: annForm.audience, priority: annForm.priority, status: status, body: annForm.body,
          scheduleDate: annForm.scheduleDate, scheduleTime: annForm.scheduleTime,
          attachment: attachmentMeta || a.attachment || null,
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
        delivered: status === 'Live' ? 1240 : 0,
        read: 0,
        acknowledged: 0,
        scheduleDate: annForm.scheduleDate,
        scheduleTime: annForm.scheduleTime,
        attachment: attachmentMeta,
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
    setAnnForm({
      title: ann.title,
      body: ann.body || '',
      priority: ann.priority || 'Normal',
      audience: audienceFromAnn(ann.audience),
      publishMode: ann.status === 'Scheduled' ? 'schedule' : ann.status === 'Draft' ? 'draft' : 'now',
      scheduleDate: ann.scheduleDate || '',
      scheduleTime: ann.scheduleTime || '',
      attachment: null, // user re-attaches if they want
    });
    setComposerStep(1);
    setShowComposer(true);
  };

  // File picker for the Attachment block. Stores the chosen File object on
  // the form so it can be uploaded later; we only persist the metadata.
  const attachInputRef = useRef(null);

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
              <div style={{marginBottom:18}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.titleLabel')} *</label>
                <input className="form-input" placeholder="Announcement title" value={annForm.title} onChange={e => setAnnForm(p => ({...p, title: e.target.value}))} style={{padding:'12px 14px',fontSize:13}}/>
              </div>
              <div style={{marginBottom:18}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.bodyLabel')}</label>
                <textarea className="form-input" rows={4} placeholder="Write your announcement here..." value={annForm.body} onChange={e => setAnnForm(p => ({...p, body: e.target.value}))} style={{resize:'vertical',padding:'12px 14px',fontSize:13}}/>
              </div>
              {/* Priority — left-aligned, compact text pills (no filled "cover" button) */}
              <div style={{marginBottom:18}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.announcePriority')}</label>
                <div style={{display:'inline-flex',gap:6}}>
                  <span onClick={() => setAnnForm(p => ({...p, priority:'Normal'}))}
                    style={{padding:'6px 14px',fontSize:12,fontWeight:500,cursor:'pointer',borderRadius:14,userSelect:'none',
                      border: annForm.priority==='Normal' ? '1px solid var(--text-dark)' : '1px solid var(--border-light)',
                      background:'#fff',
                      color: annForm.priority==='Normal' ? 'var(--text-dark)' : 'var(--text-secondary)'}}>
                    {t('pm.normalPriority')}
                  </span>
                  <span onClick={() => setAnnForm(p => ({...p, priority:'High'}))}
                    style={{padding:'6px 14px',fontSize:12,fontWeight:500,cursor:'pointer',borderRadius:14,userSelect:'none',
                      border: annForm.priority==='High' ? '1px solid #8b4a42' : '1px solid var(--border-light)',
                      background:'#fff',
                      color: annForm.priority==='High' ? '#8b4a42' : 'var(--text-secondary)'}}>
                    △ {t('pm.highPriorityLabel')}
                  </span>
                </div>
              </div>
              {/* Attachment — real file picker. Click anywhere on the box to open. */}
              <div style={{marginBottom:22}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'#131F23',display:'block',marginBottom:8}}>{t('pm.announceAttachment')}</label>
                <input ref={attachInputRef} type="file" accept="image/*,.pdf" style={{display:'none'}}
                  onChange={e => { const f = e.target.files && e.target.files[0]; if (f) setAnnForm(p => ({...p, attachment: f})); e.target.value = ''; }}/>
                <div onClick={() => attachInputRef.current && attachInputRef.current.click()}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'14px 16px',border:'1px dashed #D0D6D5',borderRadius:8,background:'#fff',cursor:'pointer'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <div style={{flex:1,minWidth:0}}>
                    {annForm.attachment ? (
                      <>
                        <div style={{fontSize:12,fontWeight:500,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{annForm.attachment.name}</div>
                        <div style={{fontSize:11,color:'#61707D'}}>{Math.round(annForm.attachment.size / 1024)} KB · click to replace</div>
                      </>
                    ) : (
                      <>
                        <div style={{fontSize:12,fontWeight:500,color:'var(--text-dark)'}}>Upload image or document</div>
                        <div style={{fontSize:11,color:'#61707D'}}>JPG, PNG, PDF up to 10MB</div>
                      </>
                    )}
                  </div>
                  {annForm.attachment && (
                    <button onClick={e => { e.stopPropagation(); setAnnForm(p => ({...p, attachment: null})); }}
                      style={{border:'none',background:'transparent',color:'#61707D',cursor:'pointer',fontSize:18,lineHeight:1,padding:'0 4px'}}>×</button>
                  )}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <button className="btn btn-primary" style={{padding:'10px 22px',fontSize:13,fontWeight:600,borderRadius:8}} onClick={()=>setComposerStep(2)}>{t('pm.continueAudience')}</button>
              </div>
            </div>)}

            {/* Step 2: Audience — Everyone OR specific (buildings + property types) */}
            {composerStep===2 && (() => {
              const aud = annForm.audience;
              const types = ['Residential', 'Villa', 'Commercial', 'Commercial Land'];
              const blds = audBuildings || [];
              // If a property type is selected, narrow the building list to that
              // type so the user only sees relevant rows.
              const visibleBuildings = aud.property_types.length > 0
                ? blds.filter(b => aud.property_types.includes(b.property_type || 'Residential'))
                : blds;
              const setAud = (next) => setAnnForm(p => ({...p, audience: { ...p.audience, ...next }}));
              const toggleType = (t) => {
                const has = aud.property_types.includes(t);
                setAud({ property_types: has ? aud.property_types.filter(x => x !== t) : [...aud.property_types, t] });
              };
              const toggleBuilding = (b) => {
                const has = aud.building_ids.includes(b.id);
                if (has) {
                  setAud({
                    building_ids:   aud.building_ids.filter(x => x !== b.id),
                    building_names: aud.building_names.filter(n => n !== b.name),
                  });
                } else {
                  setAud({
                    building_ids:   [...aud.building_ids, b.id],
                    building_names: [...aud.building_names, b.name],
                  });
                }
              };
              const allVisibleSelected = visibleBuildings.length > 0 && visibleBuildings.every(b => aud.building_ids.includes(b.id));
              const toggleSelectAllVisible = () => {
                if (allVisibleSelected) {
                  const remove = new Set(visibleBuildings.map(b => b.id));
                  setAud({
                    building_ids:   aud.building_ids.filter(id => !remove.has(id)),
                    building_names: aud.building_names.filter((_, i) => !remove.has(aud.building_ids[i])),
                  });
                } else {
                  const addIds = visibleBuildings.map(b => b.id).filter(id => !aud.building_ids.includes(id));
                  const addNames = visibleBuildings.filter(b => addIds.includes(b.id)).map(b => b.name);
                  setAud({
                    building_ids:   [...aud.building_ids, ...addIds],
                    building_names: [...aud.building_names, ...addNames],
                  });
                }
              };
              return (
                <div style={{maxWidth:520,margin:'0 auto'}}>
                  <p style={{color:'#61707D',marginBottom:16,fontSize:13,textAlign:'center'}}>{t('pm.selectWhoReceive')}</p>

                  {/* Everyone vs specific scope */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                    {[
                      { val: 'all',      label: 'Everyone',          sub: 'All residents across every building' },
                      { val: 'specific', label: 'Specific audience', sub: 'Pick buildings or property types' },
                    ].map(opt => {
                      const on = aud.scope === opt.val;
                      return (
                        <div key={opt.val} onClick={() => setAud({ scope: opt.val })}
                          style={{padding:'14px 14px',textAlign:'center',cursor:'pointer',borderRadius:8,
                            border: on ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',
                            background: on ? 'var(--bg-warm-dark)' : '#fff',color: on ? '#fff' : 'var(--text-dark)',transition:'all .15s'}}>
                          <div style={{fontSize:13,fontWeight:600,marginBottom:3}}>{opt.label}</div>
                          <div style={{fontSize:11,opacity: on ? 0.85 : 0.6}}>{opt.sub}</div>
                        </div>
                      );
                    })}
                  </div>

                  {aud.scope === 'specific' && (
                    <div style={{border:'1px solid var(--border-light)',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
                      {/* Property type chips */}
                      <div style={{marginBottom:14}}>
                        <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:8}}>Property type</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {types.map(t2 => {
                            const on = aud.property_types.includes(t2);
                            return (
                              <span key={t2} onClick={() => toggleType(t2)}
                                style={{padding:'5px 12px',borderRadius:14,fontSize:12,cursor:'pointer',
                                  background: on ? 'var(--bg-warm-dark)' : '#fff',color: on ? '#fff' : 'var(--text-dark)',
                                  border: on ? '1px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',userSelect:'none'}}>
                                {t2}
                              </span>
                            );
                          })}
                        </div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>Leave blank to include every type.</div>
                      </div>

                      {/* Building list */}
                      <div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                          <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Buildings ({aud.building_ids.length} selected)</div>
                          {visibleBuildings.length > 0 && (
                            <button onClick={toggleSelectAllVisible}
                              style={{border:'none',background:'transparent',color:'var(--bg-warm-dark)',fontSize:11,fontWeight:500,cursor:'pointer',padding:0}}>
                              {allVisibleSelected ? 'Clear all' : 'Select all visible'}
                            </button>
                          )}
                        </div>
                        {audBuildings === null ? (
                          <div style={{fontSize:12,color:'var(--text-muted)',padding:'10px 0'}}>Loading buildings…</div>
                        ) : visibleBuildings.length === 0 ? (
                          <div style={{fontSize:12,color:'var(--text-muted)',padding:'10px 0'}}>
                            {blds.length === 0 ? 'No buildings yet — add some in Database → Assets.' : 'No buildings match the selected property types.'}
                          </div>
                        ) : (
                          <div style={{maxHeight:200,overflowY:'auto',border:'1px solid var(--border-light)',borderRadius:6}}>
                            {visibleBuildings.map(b => {
                              const on = aud.building_ids.includes(b.id);
                              return (
                                <label key={b.id}
                                  style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',cursor:'pointer',borderBottom:'1px solid var(--border-light)',background: on ? 'var(--accent-warm-light)' : '#fff'}}>
                                  <input type="checkbox" checked={on} onChange={() => toggleBuilding(b)} style={{accentColor:'var(--bg-warm-dark)'}}/>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:13,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.name}</div>
                                  </div>
                                  <span style={{fontSize:10,color:'var(--text-muted)',padding:'2px 7px',background:'var(--bg-surface)',borderRadius:3,whiteSpace:'nowrap'}}>{b.property_type || 'Residential'}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recap line */}
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14,textAlign:'center'}}>
                    Sending to: <strong style={{color:'var(--text-dark)'}}>{audienceLabel(aud)}</strong>
                  </div>

                  <div className="grid-2" style={{marginTop:8}}>
                    <button className="btn" onClick={()=>setComposerStep(1)}>← Back</button>
                    <button className="btn btn-primary" onClick={()=>setComposerStep(3)}>Continue to Schedule →</button>
                  </div>
                </div>
              );
            })()}

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
                </div>
                <div style={{fontWeight:600,fontSize:15,marginBottom:4}}>{annForm.title || '[Untitled]'}</div>
                {annForm.body && <p style={{fontSize:13,color:'#7a6f66',margin:'0 0 8px',lineHeight:1.5}}>{annForm.body}</p>}
                <div style={{fontSize:12,color:'#61707D'}}>Audience: {audienceLabel(annForm.audience)}</div>
                {annForm.attachment && <div style={{fontSize:12,color:'#61707D',marginTop:2}}>Attachment: {annForm.attachment.name}</div>}
                {annForm.publishMode === 'schedule' && annForm.scheduleDate && (
                  <div style={{fontSize:12,color:'#61707D'}}>Scheduled: {annForm.scheduleDate} at {annForm.scheduleTime || '—'}</div>
                )}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13,marginBottom:20,background:'#fff',border:'1px solid #E6EAE9',borderRadius:6,padding:16}}>
                <div><span style={{color:'#61707D'}}>Audience:</span> <strong>{audienceLabel(annForm.audience)}</strong></div>
                <div><span style={{color:'#61707D'}}>Priority:</span> <strong>{annForm.priority}</strong></div>
                <div><span style={{color:'#61707D'}}>Publish:</span> <strong>{annForm.publishMode==='now'?'Immediately':annForm.publishMode==='schedule'?'Scheduled':'Draft'}</strong></div>
                <div><span style={{color:'#61707D'}}>Attachment:</span> <strong>{annForm.attachment ? annForm.attachment.name : 'None'}</strong></div>
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

