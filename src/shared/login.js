// ==================== LOGIN PAGE ====================
// Plays a short brand splash (~1.8s) on first mount before the login card
// fades in. Gives the user a moment of "welcome" rather than dumping them
// straight into a form. Tap anywhere on the splash to skip; the splash
// also dismisses itself once the timer fires. We don't gate this on
// sessionStorage because the user explicitly wants it every time the
// login page opens.
const LoginPage = ({ onLogin, syncStatus }) => {
  const { t, setData } = useApp();
  const [selectedRole, setSelectedRole] = useState('resident');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Splash sequence: 'splash' (full-screen intro) → 'transition' (fade out
  // splash + fade in login card) → 'ready' (login card only).
  const [splashStage, setSplashStage] = useState('splash');
  useEffect(() => {
    const t1 = setTimeout(() => setSplashStage('transition'), 1600);
    const t2 = setTimeout(() => setSplashStage('ready'),      2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const skipSplash = () => { setSplashStage(s => s === 'splash' ? 'transition' : s); setTimeout(() => setSplashStage('ready'), 500); };

  const credentials = {
    resident: { email: 'nitin@resident.ae', password: 'resident123' },
    security: { email: 'suresh@security.ae', password: 'guard123' },
    manager: { email: 'hassan@pinnaclepm.ae', password: 'admin123' }
  };

  useEffect(() => {
    setEmail('');
    setPassword('');
    setError('');
  }, [selectedRole]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // First try Supabase Auth (real account with email/password)
    if (supabaseClient) {
      try {
        const { data, error: authErr } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (!authErr && data && data.session) {
          const u = data.session.user;
          const authRole = u && u.app_metadata && u.app_metadata.role;
          const mapped = authRole === 'pmc' ? 'manager' : authRole;
          // Hydrate data.currentUser from the real Supabase session so the
          // topbar dropdown and My Profile page show the actual signed-in
          // person — not the legacy "Hassan Al-PM" seed in store.js.
          if (mapped && setData) {
            let fullName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
            let phone    = u.phone || '';
            let role     = mapped === 'manager' ? 'Property Manager'
                         : mapped === 'security' ? 'Security'
                         : mapped === 'resident' ? 'Resident' : (authRole || '');
            // Best-effort enrich from public.profiles — non-blocking, login
            // proceeds even if this query fails (RLS / network).
            try {
              const { data: prof } = await supabaseClient
                .from('profiles').select('full_name,phone,role').eq('id', u.id).maybeSingle();
              if (prof) {
                if (prof.full_name) fullName = prof.full_name;
                if (prof.phone)     phone    = prof.phone;
                if (prof.role)      role     = prof.role === 'pmc' ? 'Property Manager' : prof.role;
              }
            } catch (_) {}
            // Fallback name: derive from email if profile row had nothing.
            if (!fullName) fullName = (u.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            setData(prev => ({
              ...prev,
              currentUser: { ...prev.currentUser, name: fullName, email: u.email || prev.currentUser?.email, phone: phone || prev.currentUser?.phone, role },
            }));
          }
          if (mapped) { onLogin(mapped); return; }
        }
      } catch (err) {
        // fall through to demo credentials
      }
    }

    // Demo-credentials fallback (legacy role-pick flow)
    const cred = credentials[selectedRole];
    if (email === cred.email && password === cred.password) {
      onLogin(selectedRole);
    } else {
      setError(t('login.invalid'));
    }
  };

  const roleIcons = {
    resident: (active) => (
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="10" r="5" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.4" fill="none"/>
        <path d="M6 28c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      </svg>
    ),
    security: (active) => (
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <path d="M16 3L5 8v7c0 7.18 4.7 13.89 11 16 6.3-2.11 11-8.82 11-16V8L16 3z" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
        <path d="M12 16l3 3 5-6" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    manager: (active) => (
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="12" width="24" height="16" rx="1" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.4" fill="none"/>
        <path d="M4 16h24M12 4h8l4 8H8l4-8z" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
        <rect x="13" y="20" width="6" height="8" rx="0.5" stroke={active?'#2c2c2c':'#bbb'} strokeWidth="1.2" fill="none"/>
      </svg>
    )
  };

  // Inline keyframes for the splash → login transition. Injected once; CSS-in-
  // JS is enough here since the rest of the app already does this inline.
  const splashCss = `
    @keyframes vars-splash-logo-in { 0% { opacity: 0; transform: scale(0.92); } 60% { opacity: 1; transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes vars-splash-tag-in  { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes vars-splash-dot     { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
    @keyframes vars-login-in       { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
  `;

  return (
    <div className="login-page" style={{position:'relative'}}>
      <style>{splashCss}</style>

      {/* Brand splash — full-screen, 1.6s static then 0.7s fade out. */}
      {splashStage !== 'ready' && (
        <div onClick={skipSplash}
          style={{position:'fixed',inset:0,zIndex:50,
            // Layered background: a warm slate radial centred on the logo,
            // a soft sand bloom in the upper-left, and a deeper slate fade
            // toward the bottom-right so the screen has depth instead of
            // reading as a flat solid colour.
            background:
              'radial-gradient(120% 90% at 50% 35%, #4d5d6a 0%, #3a4853 55%, #2c3740 100%),'
              + 'radial-gradient(60% 50% at 10% 0%, rgba(219,197,174,0.18), transparent 70%),'
              + 'radial-gradient(45% 40% at 100% 100%, rgba(19,31,35,0.45), transparent 70%)',
            backgroundBlendMode:'normal, screen, multiply',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',gap:18,padding:'0 28px',cursor:'pointer',
            opacity: splashStage === 'transition' ? 0 : 1,
            transition: 'opacity .6s ease',
            pointerEvents: splashStage === 'transition' ? 'none' : 'auto'}}>
          {/* Logo block — stacked vertically and centred so the wordmark
              sits directly under the door icon. Cleaner read than the
              side-by-side row at large sizes. */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18,animation:'vars-splash-logo-in .8s cubic-bezier(.2,.7,.2,1) both'}}>
            <svg width="86" height="86" viewBox="0 0 100 100" fill="none" aria-label="VARS" style={{filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.28))'}}>
              <rect width="100" height="100" rx="8" fill="#ffffff"/>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#3E4C59"/>
            </svg>
            <div style={{fontSize:64,fontWeight:500,letterSpacing:'-0.02em',color:'#fff',lineHeight:1,textAlign:'center'}}>VARS</div>
          </div>
          {/* Tag line + supporting copy — fully centred under the logo */}
          <div style={{textAlign:'center',maxWidth:480,animation:'vars-splash-tag-in .7s .35s cubic-bezier(.2,.7,.2,1) both'}}>
            <div style={{fontSize:13,letterSpacing:'0.22em',textTransform:'uppercase',color:'#d4c8c0',fontWeight:500,marginBottom:16,textAlign:'center'}}>Property Management Software</div>
            <div style={{fontSize:18,color:'#fff',fontWeight:400,letterSpacing:'-0.005em',lineHeight:1.5,textAlign:'center',margin:'0 auto'}}>
              Welcome — your buildings, residents and ops in one place.
            </div>
          </div>
          {/* Three loading dots */}
          <div style={{display:'flex',gap:8,marginTop:22,animation:'vars-splash-tag-in .7s .6s cubic-bezier(.2,.7,.2,1) both'}}>
            {[0,1,2].map(i => (
              <span key={i} style={{width:8,height:8,borderRadius:'50%',background:'#d4c8c0',display:'inline-block',animation:'vars-splash-dot 1.2s ease-in-out '+ (i*0.15) +'s infinite'}}/>
            ))}
          </div>
          <div style={{position:'absolute',bottom:24,fontSize:11,color:'rgba(255,255,255,0.5)',letterSpacing:'0.08em',textAlign:'center',width:'100%'}}>Tap anywhere to continue →</div>
        </div>
      )}

      {/* Language switcher — top right corner */}
      <div style={{position:'absolute',top:20,right:20,zIndex:10,opacity: splashStage === 'ready' ? 1 : 0,transition:'opacity .4s ease'}}>
        <LanguageSwitcher/>
      </div>
      <div className="login-card" style={{maxWidth:460,padding:'40px 44px',border:'1px solid var(--border-light)',boxShadow:'0 8px 40px rgba(146,137,137,0.18)',borderRadius:14,
        animation: splashStage === 'ready' ? 'vars-login-in .55s cubic-bezier(.2,.7,.2,1) both' : 'none',
        visibility: splashStage === 'ready' ? 'visible' : 'hidden'}}>
        {/* Header — VARS brand mark (exact from vars.live) */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:14,marginBottom:10}}>
            <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS">
              <rect width="100" height="100" rx="4" fill="#3E4C59"/>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
            </svg>
            <h1 style={{fontSize:38,fontWeight:500,letterSpacing:'-0.01em',margin:0,color:'#131F23',lineHeight:1}}>VARS</h1>
          </div>
          <p style={{fontSize:10,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--text-secondary)',margin:'8px 0 0',fontWeight:400}}>{t('login.subtitle')}</p>
        </div>

        {/* Role Selection */}
        <div style={{fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:10,fontWeight:500}}>{t('login.selectRole')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:28}}>
          {[
            {id:'resident',label:t('role.resident'),sub:''},
            {id:'security',label:t('role.security'),sub:''},
            {id:'manager',label:t('role.manager'),sub:''}
          ].map(role => {
            const active = selectedRole === role.id;
            return (
              <div
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                style={{
                  padding:'16px 8px 14px',
                  border: active ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',
                  borderRadius:10,
                  textAlign:'center',
                  cursor:'pointer',
                  background: active ? 'var(--bg-surface)' : '#fff',
                  transition:'all .2s',
                  position:'relative'
                }}
              >
                {active && <div style={{position:'absolute',top:-1,left:'50%',transform:'translateX(-50%)',width:20,height:2,background:'var(--bg-warm-dark)',borderRadius:1}}></div>}
                <div style={{display:'flex',justifyContent:'center',marginBottom:8}}>{roleIcons[role.id](active)}</div>
                <div style={{fontSize:12,fontWeight:500,color: active ? 'var(--text-dark)' : 'var(--text-muted)',letterSpacing:'-0.01em'}}>{role.label}</div>
                {role.sub && <div style={{fontSize:9,color: active ? 'var(--text-secondary)' : '#ccc',letterSpacing:'0.04em',marginTop:2,textTransform:'uppercase'}}>{role.sub}</div>}
              </div>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{t('login.email')}</label>
            <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
          </div>
          <div className="form-group">
            <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{t('login.password')}</label>
            <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
          </div>


          {error && <p style={{color:'#8b4a42',fontSize:12,marginBottom:12}}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{width:'100%',padding:'13px',fontSize:12,marginTop:4,background:'var(--bg-warm-dark)',border:'none',borderRadius:8,color:'#fff',fontWeight:500,letterSpacing:'0.02em',textTransform:'uppercase',cursor:'pointer',transition:'all .2s'}}>{t('login.signIn')}</button>
        </form>

        {/* Footer */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:20,fontSize:11,color: syncStatus === 'online' ? '#6b8e6b' : '#b05050'}}>
          <div style={{width:6,height:6,borderRadius:'50%',background: syncStatus === 'online' ? '#4caf50' : '#f44336'}}></div>
          {syncStatus === 'online' ? t('login.syncActive') : t('login.syncInactive')}
        </div>

        <div style={{marginTop:12,textAlign:'center'}}>
          <p style={{fontSize:10,color:'#D0D6D5',letterSpacing:'0.04em'}}>{formatDateTime(new Date())}</p>
        </div>
      </div>
    </div>
  );
};
