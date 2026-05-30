// ==================== MY PROFILE PAGE ====================
// Was previously a centered modal popped from the topbar dropdown — it
// kept growing past 90vh on shorter screens and the user couldn't see the
// whole form. Now it's a normal page reachable via setPage('profile'), so
// the surrounding chrome (sidebar / topbar) stays put and the form just
// scrolls in the document the same way every other page does.

const MyProfilePage = ({ setPage }) => {
  const { data, setData, t } = useApp();
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name:     data.currentUser?.name  || '',
    email:    data.currentUser?.email || '',
    phone:    data.currentUser?.phone || '',
    role:     data.currentUser?.role  || '',
    property: 'The Pinnacle Residences',
    location: 'Al Reem Island, Abu Dhabi, UAE',
    language: 'English',
  });
  const [settingsForm, setSettingsForm] = useState({
    theme:           'Warm Light',
    density:         'Comfortable',
    timezone:        'Asia/Dubai (GMT+4)',
    dateFormat:      'DD MMM YYYY',
    notifyEmail:     true,
    notifyPush:      true,
    notifySms:       false,
    notifyDigest:    'Daily',
    twoFactor:       false,
    sessionTimeout:  '30 minutes',
  });

  // Inline design tokens lifted from the first app's tokens.ts. Kept inline
  // so the page is self-contained and doesn't fight the global CSS.
  const T = {
    page:      '#F4EEE4', surface: '#FFFFFF', ink: '#131F23', muted: '#61707D',
    border:    '#E6EAE9', slateDeep: '#3E4C59',
  };
  const HEAD_FONT = '"Google Sans Flex","Inter",system-ui,-apple-system,"Helvetica Neue",sans-serif';
  const BODY_FONT = '"Anek Odia","Google Sans Flex","Inter",system-ui,-apple-system,sans-serif';
  const card         = { background: T.surface, border: '1px solid ' + T.border, borderRadius: 12, padding: '22px 24px', marginBottom: 14, boxShadow: '0 1px 3px rgba(19,31,35,0.05)' };
  const eyebrow      = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, fontWeight: 600, marginBottom: 14 };
  const labelStyle   = { display: 'block', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, fontWeight: 500 };
  const inputBase    = { width: '100%', padding: '9px 12px', fontSize: 14, color: T.ink, background: T.surface, border: '1px solid ' + T.border, borderRadius: 6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const inputDisabled= { ...inputBase, background: T.page, color: T.muted, cursor: 'not-allowed' };
  const toggleOn     = T.slateDeep, toggleOff = '#D0D6D5';
  const Toggle = ({ on, onClick }) => (
    <div onClick={onClick} style={{width:38,height:22,borderRadius:999,background: on ? toggleOn : toggleOff,position:'relative',cursor:'pointer',transition:'background .15s',flexShrink:0}}>
      <div style={{position:'absolute',top:2,left: on ? 18 : 2,width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 2px rgba(19,31,35,0.25)',transition:'left .15s'}}/>
    </div>
  );

  const handleSave = () => {
    setData(prev => ({ ...prev, currentUser: { ...prev.currentUser, name: profileForm.name, email: profileForm.email, phone: profileForm.phone } }));
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1800);
  };

  const initials = (profileForm.name || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{maxWidth:760,margin:'0 auto',padding:'8px 4px 40px',fontFamily:BODY_FONT,letterSpacing:'-0.003em',color:T.ink}}>
      {/* Page header — avatar + name + role, with Cancel/Save tucked to the right. */}
      <div style={{display:'flex',alignItems:'center',gap:16,padding:'4px 6px 22px',flexWrap:'wrap'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:T.slateDeep,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:600,letterSpacing:'0.04em',flexShrink:0}}>{initials || '?'}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:T.muted,fontWeight:600,marginBottom:3}}>Account</div>
          <div style={{fontSize:26,fontWeight:500,color:T.ink,lineHeight:1.05,fontFamily:HEAD_FONT,letterSpacing:'-0.02em'}}>{profileForm.name || 'My profile'}</div>
          <div style={{fontSize:13,color:T.muted,marginTop:4}}>{profileForm.role || '—'}{profileForm.property ? ' · ' + profileForm.property : ''}</div>
        </div>
        <div style={{display:'flex',gap:10,flexShrink:0}}>
          <button onClick={() => setPage && setPage('overview')} style={{padding:'9px 18px',fontSize:13,fontWeight:500,color:T.ink,background:T.surface,border:'1px solid '+T.border,borderRadius:6,cursor:'pointer',fontFamily:'inherit'}}>{t('pm.cancel')}</button>
          <button onClick={handleSave} style={{padding:'9px 20px',fontSize:13,fontWeight:500,color:'#fff',background:T.slateDeep,border:'none',borderRadius:6,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.005em'}}>Save profile</button>
        </div>
      </div>

      {profileSaved && (
        <div style={{background:'#E4EDDF',border:'1px solid #C5D8BC',color:'#3A5430',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {t('pm.profileUpdated')}
        </div>
      )}

      {/* Identity */}
      <div style={card}>
        <div style={eyebrow}>Identity</div>
        <div style={{marginBottom:14}}>
          <label style={labelStyle}>{t('pm.fullName')}</label>
          <input type="text" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} style={inputBase}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={labelStyle}>{t('pm.emailAddress')}</label>
          <input type="email" value={profileForm.email} disabled style={inputDisabled}/>
          <p style={{fontSize:11,color:T.muted,marginTop:5}}>Email is managed by Supabase Auth and can't be edited from here.</p>
        </div>
        <div style={{marginBottom:14}}>
          <label style={labelStyle}>{t('pm.phoneNumber')}</label>
          <input type="tel" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} placeholder="+971 50 000 0000" style={inputBase}/>
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

      {/* Preferences */}
      <div style={card}>
        <div style={eyebrow}>Preferences</div>
        <div style={{marginBottom:14}}>
          <label style={labelStyle}>{t('pm.language')}</label>
          <select value={profileForm.language} onChange={e => setProfileForm({...profileForm, language: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
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
            <select value={settingsForm.theme} onChange={e => setSettingsForm({...settingsForm, theme: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
              <option>Warm Light</option>
              <option>Dark</option>
              <option>System</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('pm.density')}</label>
            <select value={settingsForm.density} onChange={e => setSettingsForm({...settingsForm, density: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
              <option>Comfortable</option>
              <option>Compact</option>
            </select>
          </div>
        </div>
      </div>

      {/* Regional */}
      <div style={card}>
        <div style={eyebrow}>Regional</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <label style={labelStyle}>{t('pm.timezone')}</label>
            <select value={settingsForm.timezone} onChange={e => setSettingsForm({...settingsForm, timezone: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
              <option>Asia/Dubai (GMT+4)</option>
              <option>Asia/Riyadh (GMT+3)</option>
              <option>Europe/London (GMT+0)</option>
              <option>Asia/Singapore (GMT+8)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('pm.dateFormat')}</label>
            <select value={settingsForm.dateFormat} onChange={e => setSettingsForm({...settingsForm, dateFormat: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
              <option>DD MMM YYYY</option>
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div style={card}>
        <div style={eyebrow}>Notifications</div>
        {[
          { key: 'notifyEmail', label: t('pm.notifyEmail'), desc: 'Approvals, alerts and daily digests' },
          { key: 'notifyPush',  label: t('pm.notifyPush'),  desc: 'Real-time alerts on this device' },
          { key: 'notifySms',   label: t('pm.notifySms'),   desc: 'Only urgent security alerts' },
        ].map((opt, idx, arr) => (
          <div key={opt.key} style={{padding:'12px 0',borderBottom: idx < arr.length - 1 ? '1px solid '+T.border : 'none',display:'flex',alignItems:'center',gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{opt.label}</div>
              <div style={{fontSize:12,color:T.muted,marginTop:2}}>{opt.desc}</div>
            </div>
            <Toggle on={settingsForm[opt.key]} onClick={() => setSettingsForm({...settingsForm, [opt.key]: !settingsForm[opt.key]})}/>
          </div>
        ))}
        <div style={{marginTop:16}}>
          <label style={labelStyle}>{t('pm.notifyDigest')}</label>
          <select value={settingsForm.notifyDigest} onChange={e => setSettingsForm({...settingsForm, notifyDigest: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
            <option>Hourly</option>
            <option>Daily</option>
            <option>Weekly</option>
            <option>Off</option>
          </select>
        </div>
      </div>

      {/* Security */}
      <div style={card}>
        <div style={eyebrow}>Security</div>
        <div style={{padding:'4px 0 14px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid '+T.border}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{t('pm.twoFactor')}</div>
            <div style={{fontSize:12,color:T.muted,marginTop:2}}>Require a code on sign-in</div>
          </div>
          <Toggle on={settingsForm.twoFactor} onClick={() => setSettingsForm({...settingsForm, twoFactor: !settingsForm.twoFactor})}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={labelStyle}>{t('pm.sessionTimeout')}</label>
          <select value={settingsForm.sessionTimeout} onChange={e => setSettingsForm({...settingsForm, sessionTimeout: e.target.value})} style={{...inputBase, cursor:'pointer'}}>
            <option>15 minutes</option>
            <option>30 minutes</option>
            <option>1 hour</option>
            <option>4 hours</option>
            <option>Never</option>
          </select>
        </div>
      </div>
    </div>
  );
};
