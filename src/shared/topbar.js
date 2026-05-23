// ==================== TOP BAR ====================
// The property dropdown is populated from Supabase (the user's actual buildings)
// plus two "Coming soon" placeholders to convey future scope.
const COMING_SOON_PROPERTIES = [
  { id: 'soon-commercial', name: 'Commercial Land', location: 'Coming soon · multi-use development', towers: 0, units: 0, comingSoon: true },
  { id: 'soon-villa',      name: 'Villa Compound',  location: 'Coming soon · low-rise residential', towers: 0, units: 0, comingSoon: true },
];

const TopBar = ({ onCreateClick, onMenuToggle, onLogout, onSearchSelect }) => {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showMyProfileModal, setShowMyProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
  const [settingsSaved, setSettingsSaved] = useState(false);

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

  // Search results
  const searchResults = React.useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results = [];
    // Search visitors
    (data.visitors || []).forEach(v => {
      if (v.name?.toLowerCase().includes(q) || v.flat?.toLowerCase().includes(q) || v.resident?.toLowerCase().includes(q) || v.permitRef?.toLowerCase().includes(q)) {
        results.push({ type: 'Visitor', name: v.name, detail: v.flat + ' · ' + (v.status || ''), icon: 'user', page: 'visitors', sourceData: v });
      }
    });
    // Search residents
    (data.residents || []).forEach(r => {
      if (r.name?.toLowerCase().includes(q) || r.flat?.toLowerCase().includes(q) || r.id?.toLowerCase().includes(q) || r.contact?.toLowerCase().includes(q)) {
        results.push({ type: 'Resident', name: r.name, detail: r.flat + ' · ' + (r.status || ''), icon: 'user', page: 'properties', sourceData: r });
      }
    });
    // Search service requests
    (data.serviceRequests || []).forEach(r => {
      if (r.id?.toLowerCase().includes(q) || r.type?.toLowerCase().includes(q) || r.flat?.toLowerCase().includes(q) || r.resident?.toLowerCase().includes(q)) {
        results.push({ type: 'Service Request', name: r.id + ' — ' + r.type, detail: r.flat + ' · ' + r.resident, icon: 'service', page: 'service', sourceData: r });
      }
    });
    // Search announcements
    (data.announcements || []).forEach(a => {
      if (a.title?.toLowerCase().includes(q) || a.body?.toLowerCase().includes(q)) {
        results.push({ type: 'Announcement', name: a.title, detail: a.status + ' · ' + (a.audience || ''), icon: 'announcements', page: 'announcements', sourceData: a });
      }
    });
    // Search guards
    (data.guards || []).forEach(g => {
      if (g.name?.toLowerCase().includes(q) || g.shift?.toLowerCase().includes(q)) {
        results.push({ type: 'Guard', name: g.name, detail: g.shift + ' · ' + (g.status || ''), icon: 'guards', page: 'guards', sourceData: g });
      }
    });
    // Search entry log
    (data.entryLog || []).slice(0, 50).forEach(e => {
      if (e.visitor?.toLowerCase().includes(q) || e.refId?.toLowerCase().includes(q) || e.flat?.toLowerCase().includes(q)) {
        results.push({ type: 'Entry Log', name: e.visitor, detail: e.refId + ' · ' + (e.flat || ''), icon: 'visitors', page: 'visitors', sourceData: e });
      }
    });
    // Search pending approvals
    (data.pendingApprovals || []).forEach(p => {
      if (p.name?.toLowerCase().includes(q) || p.flat?.toLowerCase().includes(q)) {
        results.push({ type: 'Pending Approval', name: p.name, detail: p.flat + ' · ' + (p.type || ''), icon: 'visitors', page: 'visitors', sourceData: p });
      }
    });
    return results.slice(0, 12);
  }, [searchQuery, data]);

  return (
    <div className="topbar">
      <button className="hamburger" onClick={onMenuToggle}><span/><span/><span/></button>

      {/* Property Multi-Select */}
      <div style={{position:'relative'}}>
        <div className="property-select" onClick={() => setShowPropertyDropdown(!showPropertyDropdown)} style={{cursor:'pointer'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          <span>{propertyLabel}</span>
          {selectedProperties.length > 1 && selectedProperties.length < realProps.length && (
            <span style={{background:'#928989',color:'#fff',fontSize:10,padding:'1px 6px',borderRadius:10,fontWeight:600}}>{selectedProperties.length}</span>
          )}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="2" style={{transform: showPropertyDropdown ? 'rotate(180deg)' : 'rotate(0deg)',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        {showPropertyDropdown && (
          <>
            <div onClick={() => setShowPropertyDropdown(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:997}}/>
            <div style={{position:'absolute',top:'100%',left:0,marginTop:6,width:320,maxWidth:'90vw',background:'#fff',borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #ebe7e3',zIndex:998,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid #ebe7e3',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#1a1a1a',letterSpacing:'0.04em'}}>{t('pm.selectProperties')}</span>
                <span style={{fontSize:11,color:'#a89a92',cursor:'pointer'}} onClick={() => {
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
                      <div style={{width:18,height:18,borderRadius:4,border: isSelected ? 'none' : '1.5px solid #d0d0d0',background: isSelected ? '#1a1a1a' : '#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,visibility: isComingSoon ? 'hidden' : 'visible'}}>
                        {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight: isSelected ? 600 : 400,color: isComingSoon ? '#c0c0c0' : '#1a1a1a'}}>{p.name}</div>
                        <div style={{fontSize:11,color: isComingSoon ? '#d0d0d0' : '#a89a92'}}>{p.location} · {p.towers} towers · {p.units} units</div>
                      </div>
                      {isComingSoon && <span style={{fontSize:10,fontWeight:600,color:'#fff',background:'#c0c0c0',padding:'3px 10px',borderRadius:12,whiteSpace:'nowrap'}}>{t('pm.comingSoon')}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{padding:'10px 16px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#a89a92'}}>
                {selectedProperties.length} of {realProps.length} properties selected
              </div>
            </div>
          </>
        )}
      </div>

      {/* Search Bar */}
      <div style={{position:'relative',flex:1,maxWidth:480}}>
        <div className="search-bar">
          <span className="search-icon"><Icon name="search" size={14}/></span>
          <input placeholder={t('top.search')} value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}/>
          {searchQuery && (
            <span onClick={() => setSearchQuery('')} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#a89a92',fontSize:16,lineHeight:1}}>×</span>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchFocused && searchQuery.length >= 2 && (
          <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,background:'#fff',borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #ebe7e3',zIndex:998,maxHeight:400,overflowY:'auto'}}>
            {searchResults.length === 0 ? (
              <div style={{padding:'20px 16px',textAlign:'center',color:'#a89a92',fontSize:13}}>
                No results for "{searchQuery}"
              </div>
            ) : (
              <>
                <div style={{padding:'10px 16px',borderBottom:'1px solid #ebe7e3',fontSize:11,color:'#a89a92'}}>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </div>
                {searchResults.map((r, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderBottom: i < searchResults.length - 1 ? '1px solid #f5f5f5' : 'none',cursor:'pointer',transition:'background 0.15s'}}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { if (onSearchSelect) onSearchSelect(r); setSearchQuery(''); setSearchFocused(false); }}
                    onMouseEnter={e => e.currentTarget.style.background='#f9f9f9'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <Icon name={r.icon} size={14}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name}</div>
                      <div style={{fontSize:11,color:'#a89a92',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.detail}</div>
                    </div>
                    <span style={{fontSize:10,color:'#a89a92',background:'#f2efec',padding:'2px 8px',borderRadius:3,flexShrink:0,letterSpacing:'0.02em'}}>{r.type}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <div className="topbar-right">
        <div className="topbar-icon" style={{borderRadius:'50%',width:34,height:34}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7a6f66" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        </div>
        <div style={{position:'relative'}}>
          <div className="avatar" onClick={()=>setShowPmProfile(!showPmProfile)} style={{width:34,height:34,borderRadius:'50%',background:'#e8e3de',cursor:'pointer'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a89a92" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" style={{position:'absolute',right:-14,top:'50%',transform:'translateY(-50%)',cursor:'pointer'}} onClick={()=>setShowPmProfile(!showPmProfile)}><polyline points="6 9 12 15 18 9"/></svg>
          {showPmProfile && (
            <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:44,right:-14,width:260,background:'#fff',borderRadius:10,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #ebe7e3',zIndex:999,overflow:'hidden'}}>
              <div style={{padding:'20px 16px',textAlign:'center',borderBottom:'1px solid #ebe7e3'}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:10,margin:'0 auto 10px'}}>
                  <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS">
                    <rect width="100" height="100" rx="4" fill="#928989"/>
                    <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
                  </svg>
                  <span style={{fontSize:22,fontWeight:500,letterSpacing:'-0.01em',color:'#1a1a1a',lineHeight:1}}>VARS</span>
                </div>
                <div style={{fontSize:15,fontWeight:600,color:'#1a1a1a'}}>Hassan Al-PM</div>
                <div style={{fontSize:12,color:'#a89a92'}}>Property Manager</div>
                <div style={{fontSize:11,color:'#c4b8b0'}}>The Pinnacle Residences</div>
              </div>
              <div style={{padding:'8px 12px'}}>
                {[{label:t('pm.myProfile'),icon:'user',action:()=>{setShowPmProfile(false);setShowMyProfileModal(true);}},{label:t('pm.settings'),icon:'settings',action:()=>{setShowPmProfile(false);setShowSettingsModal(true);}}].map((item,i)=>(
                  <div key={i} onClick={item.action} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',borderBottom:i<1?'1px solid #f0f0f0':'none',cursor:'pointer',fontSize:13,color:'#1a1a1a'}}>
                    <div style={{width:30,height:30,borderRadius:'50%',background:'#f2efec',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name={item.icon} size={14}/></div>
                    {item.label}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" style={{marginLeft:'auto'}}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                ))}
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

      {/* ===== My Profile Modal — warm palette, VARS branded ===== */}
      {showMyProfileModal && (
        <div onClick={()=>setShowMyProfileModal(false)} style={{position:'fixed',inset:0,background:'rgba(26,26,26,0.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Helvetica Now Text','Inter',-apple-system,sans-serif",letterSpacing:'-0.01em'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#faf8f6',borderRadius:14,width:'100%',maxWidth:560,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.25)',border:'1px solid #ebe7e3'}}>
            {/* Header */}
            <div style={{padding:'22px 26px 18px',borderBottom:'1px solid #ebe7e3',display:'flex',alignItems:'center',gap:14}}>
              <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS" style={{flexShrink:0}}>
                <rect width="100" height="100" rx="4" fill="#928989"/>
                <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
              </svg>
              <div style={{flex:1}}>
                <div style={{fontSize:17,fontWeight:600,color:'#1a1a1a',lineHeight:1.2}}>{t('pm.profileTitle')}</div>
                <div style={{fontSize:11,color:'#8a8078',marginTop:3,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t('pm.profileSubtitle')}</div>
              </div>
              <button onClick={()=>setShowMyProfileModal(false)} style={{background:'transparent',border:'none',cursor:'pointer',padding:6,borderRadius:6,color:'#8a8078'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Body */}
            <div style={{padding:'22px 26px',overflowY:'auto'}}>
              {profileSaved && (
                <div style={{background:'#eef5ec',border:'1px solid #cfe0c9',color:'#3d5c36',padding:'10px 14px',borderRadius:8,fontSize:12,marginBottom:18,display:'flex',alignItems:'center',gap:8}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {t('pm.profileUpdated')}
                </div>
              )}
              {/* Avatar row */}
              <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:22,padding:'14px 16px',background:'#f5f3f0',borderRadius:10,border:'1px solid #ebe7e3'}}>
                <div style={{width:56,height:56,borderRadius:'50%',background:'#e8e3de',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="1.4"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:'#1a1a1a'}}>{profileForm.name}</div>
                  <div style={{fontSize:11,color:'#8a8078',marginTop:2}}>{profileForm.role} · {profileForm.property}</div>
                </div>
                <button style={{background:'#fff',border:'1px solid #d5cfc8',padding:'7px 12px',borderRadius:6,fontSize:11,color:'#1a1a1a',cursor:'pointer',fontWeight:500,letterSpacing:'0.02em'}}>Change Photo</button>
              </div>
              {/* Form fields */}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',marginBottom:10,fontWeight:600}}>{t('pm.personalInformation')}</div>
              {[
                {key:'name',label:t('pm.fullName'),type:'text'},
                {key:'email',label:t('pm.emailAddress'),type:'email'},
                {key:'phone',label:t('pm.phoneNumber'),type:'tel'},
              ].map(f => (
                <div key={f.key} style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{f.label}</label>
                  <input type={f.type} value={profileForm[f.key]} onChange={e=>setProfileForm({...profileForm,[f.key]:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',letterSpacing:'-0.01em'}}/>
                </div>
              ))}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',margin:'18px 0 10px',fontWeight:600}}>{t('pm.assignment')}</div>
              {[
                {key:'role',label:t('pm.role'),readonly:true},
                {key:'property',label:t('pm.property'),readonly:true},
                {key:'location',label:t('pm.location'),readonly:true},
              ].map(f => (
                <div key={f.key} style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{f.label}</label>
                  <input type="text" value={profileForm[f.key]} readOnly style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#5a5550',background:'#f5f3f0',border:'1px solid #ebe7e3',borderRadius:8,outline:'none',fontFamily:'inherit',letterSpacing:'-0.01em',cursor:'not-allowed'}}/>
                </div>
              ))}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',margin:'18px 0 10px',fontWeight:600}}>{t('pm.preferences')}</div>
              <div style={{marginBottom:4}}>
                <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.language')}</label>
                <select value={profileForm.language} onChange={e=>setProfileForm({...profileForm,language:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                  <option>English</option>
                  <option>Arabic (العربية)</option>
                  <option>Hindi (हिन्दी)</option>
                  <option>Urdu (اردو)</option>
                  <option>Tagalog</option>
                </select>
              </div>
            </div>
            {/* Footer */}
            <div style={{padding:'16px 26px',borderTop:'1px solid #ebe7e3',display:'flex',gap:10,justifyContent:'flex-end',background:'#fff'}}>
              <button onClick={()=>setShowMyProfileModal(false)} style={{padding:'10px 20px',fontSize:12,fontWeight:500,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,cursor:'pointer',letterSpacing:'0.02em'}}>{t('pm.cancel')}</button>
              <button onClick={()=>{
                setData(prev=>({...prev,currentUser:{...prev.currentUser,name:profileForm.name,email:profileForm.email,phone:profileForm.phone}}));
                setProfileSaved(true);
                setTimeout(()=>{setProfileSaved(false);setShowMyProfileModal(false);},1400);
              }} style={{padding:'10px 22px',fontSize:12,fontWeight:600,color:'#fff',background:'#928989',border:'none',borderRadius:8,cursor:'pointer',letterSpacing:'0.02em'}}>{t('pm.saveChanges')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Settings Modal — warm palette ===== */}
      {showSettingsModal && (
        <div onClick={()=>setShowSettingsModal(false)} style={{position:'fixed',inset:0,background:'rgba(26,26,26,0.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:"'Helvetica Now Text','Inter',-apple-system,sans-serif",letterSpacing:'-0.01em'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#faf8f6',borderRadius:14,width:'100%',maxWidth:600,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.25)',border:'1px solid #ebe7e3'}}>
            {/* Header */}
            <div style={{padding:'22px 26px 18px',borderBottom:'1px solid #ebe7e3',display:'flex',alignItems:'center',gap:14}}>
              <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS" style={{flexShrink:0}}>
                <rect width="100" height="100" rx="4" fill="#928989"/>
                <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
              </svg>
              <div style={{flex:1}}>
                <div style={{fontSize:17,fontWeight:600,color:'#1a1a1a',lineHeight:1.2}}>{t('pm.settingsTitle')}</div>
                <div style={{fontSize:11,color:'#8a8078',marginTop:3,letterSpacing:'0.04em',textTransform:'uppercase'}}>{t('pm.settingsSubtitle')}</div>
              </div>
              <button onClick={()=>setShowSettingsModal(false)} style={{background:'transparent',border:'none',cursor:'pointer',padding:6,borderRadius:6,color:'#8a8078'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Body */}
            <div style={{padding:'22px 26px',overflowY:'auto'}}>
              {settingsSaved && (
                <div style={{background:'#eef5ec',border:'1px solid #cfe0c9',color:'#3d5c36',padding:'10px 14px',borderRadius:8,fontSize:12,marginBottom:18,display:'flex',alignItems:'center',gap:8}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {t('pm.settingsSaved')}
                </div>
              )}

              {/* Appearance */}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',marginBottom:10,fontWeight:600}}>{t('pm.appearance')}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:18}}>
                <div>
                  <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.theme')}</label>
                  <select value={settingsForm.theme} onChange={e=>setSettingsForm({...settingsForm,theme:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                    <option>Warm Light</option>
                    <option>Dark</option>
                    <option>System</option>
                  </select>
                </div>
                <div>
                  <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.density')}</label>
                  <select value={settingsForm.density} onChange={e=>setSettingsForm({...settingsForm,density:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                    <option>Comfortable</option>
                    <option>Compact</option>
                  </select>
                </div>
              </div>

              {/* Regional */}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',marginBottom:10,fontWeight:600}}>{t('pm.regional')}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:18}}>
                <div>
                  <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.timezone')}</label>
                  <select value={settingsForm.timezone} onChange={e=>setSettingsForm({...settingsForm,timezone:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                    <option>Asia/Dubai (GMT+4)</option>
                    <option>Asia/Riyadh (GMT+3)</option>
                    <option>Europe/London (GMT+0)</option>
                    <option>Asia/Singapore (GMT+8)</option>
                  </select>
                </div>
                <div>
                  <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.dateFormat')}</label>
                  <select value={settingsForm.dateFormat} onChange={e=>setSettingsForm({...settingsForm,dateFormat:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                    <option>DD MMM YYYY</option>
                    <option>DD/MM/YYYY</option>
                    <option>MM/DD/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select>
                </div>
              </div>

              {/* Notifications */}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',marginBottom:10,fontWeight:600}}>{t('pm.notifications')}</div>
              <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:10,marginBottom:18}}>
                {[
                  {key:'notifyEmail',label:t('pm.notifyEmail'),desc:'Approvals, alerts and daily digests'},
                  {key:'notifyPush',label:t('pm.notifyPush'),desc:'Real-time alerts on this device'},
                  {key:'notifySms',label:t('pm.notifySms'),desc:'Only urgent security alerts'},
                ].map((opt,idx,arr)=>(
                  <div key={opt.key} style={{padding:'14px 16px',borderBottom:idx<arr.length-1?'1px solid #f0ece8':'none',display:'flex',alignItems:'center',gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{opt.label}</div>
                      <div style={{fontSize:11,color:'#8a8078',marginTop:2}}>{opt.desc}</div>
                    </div>
                    <div onClick={()=>setSettingsForm({...settingsForm,[opt.key]:!settingsForm[opt.key]})} style={{width:38,height:22,borderRadius:999,background:settingsForm[opt.key]?'#928989':'#e8e3de',position:'relative',cursor:'pointer',transition:'background .15s',flexShrink:0}}>
                      <div style={{position:'absolute',top:2,left:settingsForm[opt.key]?18:2,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left .15s'}}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:18}}>
                <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.notifyDigest')}</label>
                <select value={settingsForm.notifyDigest} onChange={e=>setSettingsForm({...settingsForm,notifyDigest:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                  <option>Hourly</option>
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Off</option>
                </select>
              </div>

              {/* Security */}
              <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'#8a8078',marginBottom:10,fontWeight:600}}>{t('pm.security')}</div>
              <div style={{background:'#fff',border:'1px solid #ebe7e3',borderRadius:10,marginBottom:14}}>
                <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500,color:'#1a1a1a'}}>{t('pm.twoFactor')}</div>
                    <div style={{fontSize:11,color:'#8a8078',marginTop:2}}>Require a code on sign-in</div>
                  </div>
                  <div onClick={()=>setSettingsForm({...settingsForm,twoFactor:!settingsForm.twoFactor})} style={{width:38,height:22,borderRadius:999,background:settingsForm.twoFactor?'#928989':'#e8e3de',position:'relative',cursor:'pointer',transition:'background .15s',flexShrink:0}}>
                    <div style={{position:'absolute',top:2,left:settingsForm.twoFactor?18:2,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left .15s'}}/>
                  </div>
                </div>
              </div>
              <div style={{marginBottom:4}}>
                <label style={{display:'block',fontSize:11,color:'#5a5550',marginBottom:5,fontWeight:500}}>{t('pm.sessionTimeout')}</label>
                <select value={settingsForm.sessionTimeout} onChange={e=>setSettingsForm({...settingsForm,sessionTimeout:e.target.value})} style={{width:'100%',padding:'10px 12px',fontSize:13,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
                  <option>15 minutes</option>
                  <option>30 minutes</option>
                  <option>1 hour</option>
                  <option>4 hours</option>
                  <option>Never</option>
                </select>
              </div>
            </div>
            {/* Footer */}
            <div style={{padding:'16px 26px',borderTop:'1px solid #ebe7e3',display:'flex',gap:10,justifyContent:'flex-end',background:'#fff'}}>
              <button onClick={()=>setShowSettingsModal(false)} style={{padding:'10px 20px',fontSize:12,fontWeight:500,color:'#1a1a1a',background:'#fff',border:'1px solid #d5cfc8',borderRadius:8,cursor:'pointer',letterSpacing:'0.02em'}}>{t('pm.cancel')}</button>
              <button onClick={()=>{
                setSettingsSaved(true);
                setTimeout(()=>{setSettingsSaved(false);setShowSettingsModal(false);},1400);
              }} style={{padding:'10px 22px',fontSize:12,fontWeight:600,color:'#fff',background:'#928989',border:'none',borderRadius:8,cursor:'pointer',letterSpacing:'0.02em'}}>{t('pm.saveChanges')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

