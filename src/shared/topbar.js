// ==================== TOP BAR ====================
// The property dropdown is populated from Supabase (the user's actual buildings)
// plus two "Coming soon" placeholders to convey future scope.
const COMING_SOON_PROPERTIES = [
  { id: 'soon-commercial', name: 'Commercial Land', location: 'Coming soon · multi-use development', towers: 0, units: 0, comingSoon: true },
  { id: 'soon-villa',      name: 'Villa Compound',  location: 'Coming soon · low-rise residential', towers: 0, units: 0, comingSoon: true },
];

const TopBar = ({ onCreateClick, onMenuToggle, onLogout, onNavigate }) => {
  const { data, setData, t, selectedProperties, setSelectedProperties } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [showPmProfile, setShowPmProfile] = useState(false);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [allProperties, setAllProperties] = useState(COMING_SOON_PROPERTIES);
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name,address').order('name');
        if (!mounted) return;
        const ids = (buildings || []).map(b => b.id);
        const unitCounts = {};
        if (ids.length) {
          const { data: units } = await supabaseClient.from('units').select('building_id').in('building_id', ids);
          (units || []).forEach(u => { unitCounts[u.building_id] = (unitCounts[u.building_id] || 0) + 1; });
        }
        const real = (buildings || []).map(b => ({
          id: b.id, name: b.name, location: b.address || '—',
          towers: 1, units: unitCounts[b.id] || 0,
        }));
        if (!mounted) return;
        setAllProperties([...real, ...COMING_SOON_PROPERTIES]);
        // Default: select ALL real properties so every report shows the full portfolio out of the box.
        if (real.length > 0) setSelectedProperties(prev => prev.length ? prev : real.map(r => r.id));
      } catch (_) { /* keep fallback */ }
    })();
    return () => { mounted = false; };
  }, []);
  const realProps = allProperties.filter(p => !p.comingSoon);
  const [showMyProfileModal, setShowMyProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: data.currentUser?.name || '',
    email: data.currentUser?.email || '',
    phone: data.currentUser?.phone || '',
    role: data.currentUser?.role || '',
    property: 'The Pinnacle Residences',
    location: 'Al Reem Island, Abu Dhabi, UAE',
    language: 'English',
  });
  const [settingsForm, setSettingsForm] = useState({
    theme: 'Warm Light',
    density: 'Comfortable',
    timezone: 'Asia/Dubai (GMT+4)',
    dateFormat: 'DD MMM YYYY',
    notifyEmail: true,
    notifyPush: true,
    notifySms: false,
    notifyDigest: 'Daily',
    twoFactor: false,
    sessionTimeout: '30 minutes',
  });
  const [profileSaved, setProfileSaved] = useState(false);

  // ===== Notifications =====
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifs, setNotifs] = useState({ srs: [], invoices: [], visits: [] });
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        if (fIds.length === 0) { if (mounted) setNotifs({ srs: [], invoices: [], visits: [] }); return; }
        const today = new Date().toISOString().slice(0, 10);
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const [{ data: srs }, { data: invs }, { data: visits }] = await Promise.all([
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,unit_id').in('unit_id', fIds).in('status', ['New','Acknowledged']).order('created_at', { ascending: false }).limit(8),
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,unit_id').in('unit_id', fIds).eq('status', 'Overdue').order('amount_aed', { ascending: false }).limit(8),
          supabaseClient.from('visits').select('id,visitor_name,type,status,visit_date,unit_id').in('unit_id', fIds).eq('visit_date', today).eq('status', 'Pre-Approved').limit(8),
        ]);
        if (!mounted) return;
        const addUnit = (rows) => (rows || []).map(r => ({ ...r, unit_number: uMap[r.unit_id]?.unit_number || '—' }));
        setNotifs({ srs: addUnit(srs), invoices: addUnit(invs), visits: addUnit(visits) });
      } catch (_) { /* silent */ }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);
  const notifTotal = notifs.srs.length + notifs.invoices.length + notifs.visits.length;
  const fmtAED = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const goTo = (page) => { setShowNotifications(false); if (onNavigate) onNavigate(page); };

  const toggleProperty = (id) => {
    setSelectedProperties(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // must have at least one
        return prev.filter(p => p !== id);
      }
      return [...prev, id];
    });
  };

  const propertyLabel = selectedProperties.length === 1
    ? (allProperties.find(p => p.id === selectedProperties[0])?.name || '—')
    : selectedProperties.length === realProps.length && realProps.length > 0
    ? 'All Properties'
    : selectedProperties.length + ' Properties Selected';

  return (
    <div className="topbar">
      <button className="hamburger" onClick={onMenuToggle}><span/><span/><span/></button>

      {/* Property Multi-Select */}
      <div style={{position:'relative'}}>
        <div className="property-select" onClick={() => setShowPropertyDropdown(!showPropertyDropdown)} style={{cursor:'pointer'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          <span>{propertyLabel}</span>
          {selectedProperties.length > 1 && selectedProperties.length < realProps.length && (
            <span style={{background:'#3E4C59',color:'#fff',fontSize:10,padding:'1px 6px',borderRadius:10,fontWeight:600}}>{selectedProperties.length}</span>
          )}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="2" style={{transform: showPropertyDropdown ? 'rotate(180deg)' : 'rotate(0deg)',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        {showPropertyDropdown && (
          <>
            <div onClick={() => setShowPropertyDropdown(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:997}}/>
            <div style={{position:'absolute',top:'100%',left:0,marginTop:6,width:320,maxWidth:'90vw',background:'#fff',borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #E6EAE9',zIndex:998,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid #E6EAE9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#131F23',letterSpacing:'0.04em'}}>{t('pm.selectProperties')}</span>
                <span style={{fontSize:11,color:'#61707D',cursor:'pointer'}} onClick={() => {
                  setSelectedProperties(selectedProperties.length === realProps.length ? (realProps[0] ? [realProps[0].id] : []) : realProps.map(p => p.id));
                }}>{selectedProperties.length === realProps.length && realProps.length > 0 ? t('pm.deselectAll') : t('pm.selectAll')}</span>
              </div>
              <div style={{padding:'8px 0',maxHeight:300,overflowY:'auto'}}>
                {allProperties.map(p => {
                  const isSelected = selectedProperties.includes(p.id);
                  const isComingSoon = !!p.comingSoon;
                  return (
                    <div key={p.id} onClick={() => !isComingSoon && toggleProperty(p.id)}
                      style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',cursor: isComingSoon ? 'default' : 'pointer',background: isSelected ? '#f8f8f8' : 'transparent',transition:'background 0.15s',opacity: isComingSoon ? 0.5 : 1}}>
                      <div style={{width:18,height:18,borderRadius:4,border: isSelected ? 'none' : '1.5px solid #d0d0d0',background: isSelected ? '#131F23' : '#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,visibility: isComingSoon ? 'hidden' : 'visible'}}>
                        {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight: isSelected ? 600 : 400,color: isComingSoon ? '#c0c0c0' : '#131F23'}}>{p.name}</div>
                        <div style={{fontSize:11,color: isComingSoon ? '#d0d0d0' : '#61707D'}}>{p.location} · {p.towers} towers · {p.units} units</div>
                      </div>
                      {isComingSoon && <span style={{fontSize:10,fontWeight:600,color:'#fff',background:'#c0c0c0',padding:'3px 10px',borderRadius:12,whiteSpace:'nowrap'}}>{t('pm.comingSoon')}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{padding:'10px 16px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#61707D'}}>
                {selectedProperties.length} of {realProps.length} properties selected
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{flex:1}}/>
      <div className="topbar-right">
        <div style={{position:'relative'}}>
          <div className="topbar-icon" onClick={() => setShowNotifications(!showNotifications)} style={{borderRadius:'50%',width:34,height:34,position:'relative',cursor:'pointer'}} title={notifTotal > 0 ? `${notifTotal} item${notifTotal === 1 ? '' : 's'} need attention` : 'Notifications'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {notifTotal > 0 && (
              <span style={{position:'absolute',top:8,right:9,width:8,height:8,borderRadius:'50%',background:'#c62828',border:'2px solid #F4EEE4',boxSizing:'content-box'}}/>
            )}
          </div>
          {showNotifications && (
            <>
              <div onClick={() => setShowNotifications(false)} style={{position:'fixed',inset:0,zIndex:997}}/>
              <div onClick={e => e.stopPropagation()} style={{position:'absolute',top:44,right:-8,width:360,maxHeight:520,background:'#fff',borderRadius:12,boxShadow:'0 12px 40px rgba(0,0,0,0.15)',border:'1px solid #E6EAE9',zIndex:999,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                <div style={{padding:'14px 16px',borderBottom:'1px solid #E6EAE9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:'#131F23'}}>Notifications</div>
                    <div style={{fontSize:11,color:'#61707D',marginTop:1}}>{notifTotal} item{notifTotal === 1 ? '' : 's'} need attention</div>
                  </div>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {notifTotal === 0 ? (
                    <div style={{padding:'40px 20px',textAlign:'center',color:'#61707D',fontSize:13}}>
                      <div style={{fontSize:32,marginBottom:8,opacity:0.5}}>✓</div>
                      All caught up. Nothing needs your attention right now.
                    </div>
                  ) : (
                    <>
                      {notifs.srs.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4'}}>
                            Service Requests · {notifs.srs.length}
                          </div>
                          {notifs.srs.slice(0, 5).map(s => (
                            <div key={s.id} onClick={() => goTo('service')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                              onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <div style={{width:6,height:6,borderRadius:3,background: s.priority === 'High' ? '#c62828' : s.priority === 'Normal' ? '#a07d3c' : '#D0D6D5',marginTop:6,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:'#131F23',fontWeight:500}}>{s.category} · Unit {s.unit_number}</div>
                                <div style={{fontSize:11,color:'#61707D',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.description}</div>
                                <div style={{fontSize:10,color:'#61707D',marginTop:3}}>{s.status} · {new Date(s.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {notifs.invoices.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4'}}>
                            Overdue Invoices · {notifs.invoices.length}
                          </div>
                          {notifs.invoices.slice(0, 5).map(i => (
                            <div key={i.id} onClick={() => goTo('payment')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                              onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <div style={{width:6,height:6,borderRadius:3,background:'#8b4a42',marginTop:6,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:'#131F23',fontWeight:500}}>{fmtAED(i.amount_aed)} · Unit {i.unit_number}</div>
                                <div style={{fontSize:11,color:'#61707D',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{i.description}</div>
                                <div style={{fontSize:10,color:'#61707D',marginTop:3}}>Due {i.due_date || '—'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {notifs.visits.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4'}}>
                            Today's Visitors · {notifs.visits.length}
                          </div>
                          {notifs.visits.slice(0, 5).map(v => (
                            <div key={v.id} onClick={() => goTo('visitors')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                              onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <div style={{width:6,height:6,borderRadius:3,background:'#5a6b4f',marginTop:6,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:'#131F23',fontWeight:500}}>{v.visitor_name} · Unit {v.unit_number}</div>
                                <div style={{fontSize:11,color:'#61707D',marginTop:2}}>{v.type || 'Visit'} · Pre-Approved</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{position:'relative'}}>
          <div className="avatar" onClick={()=>setShowPmProfile(!showPmProfile)} style={{width:34,height:34,borderRadius:'50%',background:'#E6EAE9',cursor:'pointer'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" style={{position:'absolute',right:-14,top:'50%',transform:'translateY(-50%)',cursor:'pointer'}} onClick={()=>setShowPmProfile(!showPmProfile)}><polyline points="6 9 12 15 18 9"/></svg>
          {showPmProfile && (
            <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:44,right:-14,width:260,background:'#fff',borderRadius:10,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #E6EAE9',zIndex:999,overflow:'hidden'}}>
              <div style={{padding:'20px 16px',textAlign:'center',borderBottom:'1px solid #E6EAE9'}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:10,margin:'0 auto 10px'}}>
                  <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS">
                    <rect width="100" height="100" rx="4" fill="#3E4C59"/>
                    <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
                  </svg>
                  <span style={{fontSize:22,fontWeight:500,letterSpacing:'-0.01em',color:'#131F23',lineHeight:1}}>VARS</span>
                </div>
                <div style={{fontSize:15,fontWeight:600,color:'#131F23'}}>Hassan Al-PM</div>
              </div>
              <div style={{padding:'8px 12px'}}>
                <div onClick={()=>{setShowPmProfile(false);setShowMyProfileModal(true);}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',cursor:'pointer',fontSize:13,color:'#131F23'}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:'#E6EAE9',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="user" size={14}/></div>
                  {t('pm.myProfile')}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" style={{marginLeft:'auto'}}><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
              <div style={{padding:'4px 12px 12px',borderTop:'1px solid #f0f0f0'}}>
                <div onClick={()=>{setShowPmProfile(false);onLogout();}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',cursor:'pointer',fontSize:13,color:'#8b4a42',fontWeight:500}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:'#fff5f5',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </div>
                  {t('pm.logout')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showPmProfile && <div onClick={()=>setShowPmProfile(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:998}}/>}

      {/* ===== My Profile Modal — VARS supervisor design system (warm beige + slate) ===== */}
      {showMyProfileModal && (() => {
        // Inline design tokens lifted from the first app's `packages/ui-web/src/tokens.ts`
        const T = {
          page:'#F4EEE4', surface:'#FFFFFF', ink:'#131F23', muted:'#61707D', subtle:'#8A98A2',
          border:'#E6EAE9', slateDeep:'#3E4C59', sand:'#DBC5AE',
        };
        const HEAD_FONT = '"Google Sans Flex","Inter",system-ui,-apple-system,"Helvetica Neue",sans-serif';
        const BODY_FONT = '"Anek Odia","Google Sans Flex","Inter",system-ui,-apple-system,sans-serif';
        const card = { background:T.surface, border:'1px solid '+T.border, borderRadius:12, padding:'22px 24px', marginBottom:14, boxShadow:'0 1px 3px rgba(19,31,35,0.05)' };
        const eyebrow = { fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:T.muted, fontWeight:600, marginBottom:14 };
        const labelStyle = { display:'block', fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:T.muted, marginBottom:6, fontWeight:500 };
        const inputBase = { width:'100%', padding:'9px 12px', fontSize:14, color:T.ink, background:T.surface, border:'1px solid '+T.border, borderRadius:6, outline:'none', fontFamily:'inherit' };
        const inputDisabled = { ...inputBase, background:T.page, color:T.muted, cursor:'not-allowed' };
        const toggleOn = T.slateDeep, toggleOff = '#D0D6D5';
        const Toggle = ({on,onClick}) => (
          <div onClick={onClick} style={{width:38,height:22,borderRadius:999,background:on?toggleOn:toggleOff,position:'relative',cursor:'pointer',transition:'background .15s',flexShrink:0}}>
            <div style={{position:'absolute',top:2,left:on?18:2,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(19,31,35,0.25)',transition:'left .15s'}}/>
          </div>
        );
        return (
          <div onClick={()=>setShowMyProfileModal(false)} style={{position:'fixed',inset:0,background:'rgba(19,31,35,0.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:BODY_FONT,letterSpacing:'-0.003em',color:T.ink}}>
            <div onClick={e=>e.stopPropagation()} style={{background:T.page,borderRadius:16,width:'100%',maxWidth:640,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(19,31,35,0.22)',border:'1px solid '+T.border}}>
              {/* Header strip — white */}
              <div style={{padding:'20px 28px',background:T.surface,borderBottom:'1px solid '+T.border,display:'flex',alignItems:'center',gap:14}}>
                <svg width="32" height="32" viewBox="0 0 100 100" fill="none" aria-label="VARS" style={{flexShrink:0}}>
                  <rect width="100" height="100" rx="6" fill={T.ink}/>
                  <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill={T.surface}/>
                </svg>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:T.muted,fontWeight:600,marginBottom:3}}>Account</div>
                  <div style={{fontSize:24,fontWeight:500,color:T.ink,lineHeight:1.05,fontFamily:HEAD_FONT,letterSpacing:'-0.02em'}}>My profile</div>
                </div>
                <button onClick={()=>setShowMyProfileModal(false)} style={{background:'transparent',border:'none',cursor:'pointer',padding:6,borderRadius:6,color:T.muted}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Body — warm beige, scrollable */}
              <div style={{padding:'22px 24px 12px',overflowY:'auto',background:T.page,flex:1}}>
                {profileSaved && (
                  <div style={{background:'#E4EDDF',border:'1px solid #C5D8BC',color:'#3A5430',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {t('pm.profileUpdated')}
                  </div>
                )}

                {/* Identity card */}
                <div style={card}>
                  <div style={eyebrow}>Identity</div>
                  <div style={{marginBottom:14}}>
                    <label style={labelStyle}>{t('pm.fullName')}</label>
                    <input type="text" value={profileForm.name} onChange={e=>setProfileForm({...profileForm,name:e.target.value})} style={inputBase}/>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={labelStyle}>{t('pm.emailAddress')}</label>
                    <input type="email" value={profileForm.email} disabled style={inputDisabled}/>
                    <p style={{fontSize:11,color:T.muted,marginTop:5}}>Email is managed by Supabase Auth and can't be edited from here.</p>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={labelStyle}>{t('pm.phoneNumber')}</label>
                    <input type="tel" value={profileForm.phone} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})} placeholder="+971 50 000 0000" style={inputBase}/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                    <div>
                      <label style={labelStyle}>{t('pm.role')}</label>
                      <input type="text" value={profileForm.role} disabled style={inputDisabled}/>
                    </div>
                    <div>
                      <label style={labelStyle}>{t('pm.property')}</label>
                      <input type="text" value={profileForm.property} disabled style={inputDisabled}/>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>{t('pm.location')}</label>
                    <input type="text" value={profileForm.location} disabled style={inputDisabled}/>
                    <p style={{fontSize:11,color:T.muted,marginTop:5}}>Set by an administrator on the profile.</p>
                  </div>
                </div>

                {/* Preferences card — language + appearance */}
                <div style={card}>
                  <div style={eyebrow}>Preferences</div>
                  <div style={{marginBottom:14}}>
                    <label style={labelStyle}>{t('pm.language')}</label>
                    <select value={profileForm.language} onChange={e=>setProfileForm({...profileForm,language:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                      <option>English</option>
                      <option>Arabic (العربية)</option>
                      <option>Hindi (हिन्दी)</option>
                      <option>Urdu (اردو)</option>
                      <option>Tagalog</option>
                    </select>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                      <label style={labelStyle}>{t('pm.theme')}</label>
                      <select value={settingsForm.theme} onChange={e=>setSettingsForm({...settingsForm,theme:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                        <option>Warm Light</option>
                        <option>Dark</option>
                        <option>System</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>{t('pm.density')}</label>
                      <select value={settingsForm.density} onChange={e=>setSettingsForm({...settingsForm,density:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                        <option>Comfortable</option>
                        <option>Compact</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Regional card */}
                <div style={card}>
                  <div style={eyebrow}>Regional</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                      <label style={labelStyle}>{t('pm.timezone')}</label>
                      <select value={settingsForm.timezone} onChange={e=>setSettingsForm({...settingsForm,timezone:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                        <option>Asia/Dubai (GMT+4)</option>
                        <option>Asia/Riyadh (GMT+3)</option>
                        <option>Europe/London (GMT+0)</option>
                        <option>Asia/Singapore (GMT+8)</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>{t('pm.dateFormat')}</label>
                      <select value={settingsForm.dateFormat} onChange={e=>setSettingsForm({...settingsForm,dateFormat:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                        <option>DD MMM YYYY</option>
                        <option>DD/MM/YYYY</option>
                        <option>MM/DD/YYYY</option>
                        <option>YYYY-MM-DD</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Notifications card */}
                <div style={card}>
                  <div style={eyebrow}>Notifications</div>
                  {[
                    {key:'notifyEmail',label:t('pm.notifyEmail'),desc:'Approvals, alerts and daily digests'},
                    {key:'notifyPush',label:t('pm.notifyPush'),desc:'Real-time alerts on this device'},
                    {key:'notifySms',label:t('pm.notifySms'),desc:'Only urgent security alerts'},
                  ].map((opt,idx,arr)=>(
                    <div key={opt.key} style={{padding:'12px 0',borderBottom:idx<arr.length-1?'1px solid '+T.border:'none',display:'flex',alignItems:'center',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{opt.label}</div>
                        <div style={{fontSize:12,color:T.muted,marginTop:2}}>{opt.desc}</div>
                      </div>
                      <Toggle on={settingsForm[opt.key]} onClick={()=>setSettingsForm({...settingsForm,[opt.key]:!settingsForm[opt.key]})}/>
                    </div>
                  ))}
                  <div style={{marginTop:16}}>
                    <label style={labelStyle}>{t('pm.notifyDigest')}</label>
                    <select value={settingsForm.notifyDigest} onChange={e=>setSettingsForm({...settingsForm,notifyDigest:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                      <option>Hourly</option>
                      <option>Daily</option>
                      <option>Weekly</option>
                      <option>Off</option>
                    </select>
                  </div>
                </div>

                {/* Security card */}
                <div style={card}>
                  <div style={eyebrow}>Security</div>
                  <div style={{padding:'4px 0 14px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid '+T.border}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{t('pm.twoFactor')}</div>
                      <div style={{fontSize:12,color:T.muted,marginTop:2}}>Require a code on sign-in</div>
                    </div>
                    <Toggle on={settingsForm.twoFactor} onClick={()=>setSettingsForm({...settingsForm,twoFactor:!settingsForm.twoFactor})}/>
                  </div>
                  <div style={{marginTop:14}}>
                    <label style={labelStyle}>{t('pm.sessionTimeout')}</label>
                    <select value={settingsForm.sessionTimeout} onChange={e=>setSettingsForm({...settingsForm,sessionTimeout:e.target.value})} style={{...inputBase,cursor:'pointer'}}>
                      <option>15 minutes</option>
                      <option>30 minutes</option>
                      <option>1 hour</option>
                      <option>4 hours</option>
                      <option>Never</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Footer strip — white */}
              <div style={{padding:'14px 24px',borderTop:'1px solid '+T.border,background:T.surface,display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={()=>setShowMyProfileModal(false)} style={{padding:'9px 18px',fontSize:13,fontWeight:500,color:T.ink,background:T.surface,border:'1px solid '+T.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit'}}>{t('pm.cancel')}</button>
                <button onClick={()=>{
                  setData(prev=>({...prev,currentUser:{...prev.currentUser,name:profileForm.name,email:profileForm.email,phone:profileForm.phone}}));
                  setProfileSaved(true);
                  setTimeout(()=>{setProfileSaved(false);setShowMyProfileModal(false);},1400);
                }} style={{padding:'9px 20px',fontSize:13,fontWeight:500,color:'#fff',background:T.slateDeep,border:'none',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.005em'}}>Save profile</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

