// ==================== LOGIN PAGE ====================
// Plays a short brand splash (~1.8s) on first mount before the login card
// fades in. Gives the user a moment of "welcome" rather than dumping them
// straight into a form. Tap anywhere on the splash to skip; the splash
// also dismisses itself once the timer fires. We don't gate this on
// sessionStorage because the user explicitly wants it every time the
// login page opens.
const LoginPage = ({ onLogin, syncStatus }) => {
  const { t, setData } = useApp();
  // On the demo deployment every user is their own PMC. We hide the
  // role selector, expose a Sign Up tab, and after sign-up auto-route
  // to the PMC overview. On the working deployment everything below
  // behaves the same as before.
  const IS_DEMO = (typeof VARS_TARGET !== 'undefined' && VARS_TARGET === 'demo');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [selectedRole, setSelectedRole] = useState(IS_DEMO ? 'manager' : 'resident');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Success-style banner (e.g. after signup). Rendered as a green toast at
  // the top of the page so it doesn't read like a form error. Auto-dismiss
  // after 7s; the dismissTimer ref lets us cancel it on unmount.
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);
  const flashNotice = (text) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(''), 7000);
  };
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  // Splash sequence: 'splash' (full-screen intro) → 'transition' (fade out
  // splash + fade in login card) → 'ready' (login card only).
  // Skip the whole sequence when we just came back from a logout — the
  // brand intro is for first arrivals, not for someone signing in again
  // after they explicitly signed out. The flag is set by handleLogout in
  // app.js and consumed here so the very next mount starts in 'ready'.
  const [splashStage, setSplashStage] = useState(() => {
    try {
      if (sessionStorage.getItem('varspm_just_logged_out') === '1') {
        sessionStorage.removeItem('varspm_just_logged_out');
        return 'ready';
      }
    } catch (_) {}
    return 'splash';
  });
  useEffect(() => {
    if (splashStage === 'ready') return;
    // ~3.0s of full-visibility static + 0.7s fade = ~3.7s total so the
    // welcome tagline has time to be read on first arrival.
    const t1 = setTimeout(() => setSplashStage('transition'), 3000);
    const t2 = setTimeout(() => setSplashStage('ready'),      3700);
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

    // Demo-credentials fallback (legacy role-pick flow). Skip on the
    // demo deployment — there are no fake roles to fall back to.
    if (!IS_DEMO) {
      const cred = credentials[selectedRole];
      if (email === cred.email && password === cred.password) {
        onLogin(selectedRole);
        return;
      }
    }
    setError(IS_DEMO ? 'Wrong email or password.' : t('login.invalid'));
  };

  // Sign-up handler used only on the demo deployment. Creates a Supabase
  // Auth user; the on_demo_user_signup trigger seeds their portfolio
  // server-side. If Supabase returns a session immediately (email
  // confirmation disabled — which is the demo's intended setting) we
  // route straight to the PMC overview; otherwise we ask the user to
  // sign in once their account is confirmed.
  // Always coerce to a string so the JSX error <p> never renders an object
  // literal (the "{}" the user reported was Supabase returning an error
  // without a .message on it).
  const safeSetError = (val) => {
    if (val == null) { setError(''); return; }
    if (typeof val === 'string') { setError(val); return; }
    if (typeof val === 'object' && val.message) { setError(String(val.message)); return; }
    setError('Something went wrong. Please try again.');
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    safeSetError(null);
    if (!email || !password) { safeSetError('Email and password are required.'); return; }
    if (password.length < 6)       { safeSetError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { safeSetError('Passwords do not match.'); return; }
    if (!supabaseClient)           { safeSetError('Sign-up is not available right now.'); return; }
    setSubmitting(true);
    try {
      // Hard 20s timeout on the signup call so the user is never stuck
      // on "Working…". Supabase normally responds in 1-3s; anything
      // longer almost always means SMTP is misconfigured and the
      // confirmation email is timing out somewhere.
      const signupCall = supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: (fullName || '').trim() || null } },
      });
      const timeoutCall = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Sign-up is taking longer than expected. Email delivery may be misconfigured — try again, or contact support if this keeps happening.')), 20000));
      const { data, error: signErr } = await Promise.race([signupCall, timeoutCall]);
      if (signErr) { safeSetError(signErr); setSubmitting(false); return; }
      if (data && data.session) {
        // Already signed in — set currentUser and route to PMC overview.
        const u = data.session.user;
        const displayName = (fullName || '').trim()
          || (u.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (setData) setData(prev => ({
          ...prev,
          currentUser: { ...prev.currentUser, name: displayName, email: u.email, phone: '', role: 'Property Manager' },
        }));
        onLogin('manager');
        return;
      }
      // No session means email confirmation is still on. Tell the user
      // via the green success toast (not the red error line) and flip
      // back to the Sign In tab.
      flashNotice('Account created. Check your email to confirm, then sign in.');
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      safeSetError(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Forgot password — fires Supabase's resetPasswordForEmail using the email
  // currently typed into the form. Result surfaces in the same green toast
  // so the user gets a unified success affordance.
  const handleForgotPassword = async () => {
    if (!email) { safeSetError('Enter your email first, then click Forgot password.'); return; }
    if (!supabaseClient) { safeSetError('Password reset is not available right now.'); return; }
    safeSetError(null);
    try {
      const { error: resetErr } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      if (resetErr) { safeSetError(resetErr); return; }
      flashNotice('Password reset email sent to ' + email + '.');
    } catch (err) { safeSetError(err); }
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
    @keyframes vars-toast-in       { 0% { opacity: 0; transform: translate(-50%, -10px); } 100% { opacity: 1; transform: translate(-50%, 0); } }
  `;

  return (
    <div className="login-page" style={{position:'relative'}}>
      <style>{splashCss}</style>

      {/* Green success toast — rendered above everything (zIndex 1000)
          so the splash doesn't sit on top of it. Auto-dismisses after
          7s via the noticeTimer ref in state. */}
      {notice && splashStage === 'ready' && (
        <div style={{position:'fixed',top:24,left:'50%',transform:'translateX(-50%)',zIndex:1000,
          display:'flex',alignItems:'center',gap:10,
          padding:'12px 18px 12px 14px',
          background:'#5a6b4f',color:'#fff',
          borderRadius:10,boxShadow:'0 8px 24px rgba(19,31,35,0.18)',
          fontSize:13,fontWeight:500,letterSpacing:'-0.005em',
          maxWidth:'calc(100vw - 32px)',
          animation:'vars-toast-in .35s cubic-bezier(.2,.7,.2,1) both'}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>{notice}</span>
          <span onClick={() => setNotice('')}
            style={{marginLeft:6,cursor:'pointer',opacity:0.7,padding:'0 2px',fontSize:16,lineHeight:1}}>×</span>
        </div>
      )}

      {/* Brand splash — full-screen, 3.0s static then 0.7s fade out.
          Quiet warm-light palette to match the rest of the app — the
          slate-on-dark version felt flashy next to the warm beige
          login card it transitions into. Now reads as a calm intro
          rather than a marketing impression. */}
      {splashStage !== 'ready' && (
        <div onClick={skipSplash}
          style={{position:'fixed',inset:0,zIndex:50,
            // Very soft warm wash — same family as var(--bg-page) (#F4EEE4)
            // with a subtle centre highlight + sand bloom on the upper-left
            // so it isn't a dead-flat colour but doesn't grab attention.
            background:
              'radial-gradient(120% 90% at 50% 40%, #FAF5EC 0%, #F4EEE4 60%, #E9DECC 100%),'
              + 'radial-gradient(55% 45% at 12% 0%, rgba(219,197,174,0.35), transparent 70%)',
            backgroundBlendMode:'normal, multiply',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',gap:16,padding:'0 28px',cursor:'pointer',
            opacity: splashStage === 'transition' ? 0 : 1,
            transition: 'opacity .6s ease',
            pointerEvents: splashStage === 'transition' ? 'none' : 'auto'}}>
          {/* Logo block — same lockup as the login card so the splash
              feels like the form's "calm cousin" rather than a different
              screen entirely. */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18,animation:'vars-splash-logo-in .8s cubic-bezier(.2,.7,.2,1) both'}}>
            <svg width="72" height="72" viewBox="0 0 100 100" fill="none" aria-label="VARS">
              <rect width="100" height="100" rx="6" fill="#3E4C59"/>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
            </svg>
            <div style={{fontSize:52,fontWeight:500,letterSpacing:'-0.02em',color:'#131F23',lineHeight:1,textAlign:'center'}}>VARS</div>
          </div>
          {/* Tag line + supporting copy */}
          <div style={{textAlign:'center',maxWidth:480,animation:'vars-splash-tag-in .7s .35s cubic-bezier(.2,.7,.2,1) both'}}>
            <div style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500,marginBottom:14,textAlign:'center'}}>Property Management Software</div>
            <div style={{fontSize:16,color:'var(--text-dark)',fontWeight:400,letterSpacing:'-0.003em',lineHeight:1.5,textAlign:'center',margin:'0 auto'}}>
              Welcome - your buildings, residents and ops in one place.
            </div>
          </div>
          {/* Pulsing dots — slate, quiet */}
          <div style={{display:'flex',gap:7,marginTop:18,animation:'vars-splash-tag-in .7s .6s cubic-bezier(.2,.7,.2,1) both'}}>
            {[0,1,2].map(i => (
              <span key={i} style={{width:6,height:6,borderRadius:'50%',background:'#3E4C59',display:'inline-block',opacity:0.45,animation:'vars-splash-dot 1.2s ease-in-out '+ (i*0.15) +'s infinite'}}/>
            ))}
          </div>
          <div style={{position:'absolute',bottom:24,fontSize:11,color:'var(--text-muted)',letterSpacing:'0.08em',textAlign:'center',width:'100%'}}>Tap anywhere to continue →</div>
        </div>
      )}

      {/* Language switcher — top right corner */}
      <div style={{position:'absolute',top:20,right:20,zIndex:10,opacity: splashStage === 'ready' ? 1 : 0,transition:'opacity .4s ease'}}>
        <LanguageSwitcher/>
      </div>
      <div className="login-card" style={{maxWidth:460,padding:'40px 44px',border:'1px solid var(--border-light)',boxShadow:'0 8px 40px rgba(146,137,137,0.18)',borderRadius:14,
        animation: splashStage === 'ready' ? 'vars-login-in .55s cubic-bezier(.2,.7,.2,1) both' : 'none',
        visibility: splashStage === 'ready' ? 'visible' : 'hidden'}}>
        {/* Header — VARS brand mark, explicitly centered with a flex column.
            Was relying on textAlign:center + inline-flex which let the
            asymmetric icon+wordmark slide slightly left of true centre.
            flex-direction:column + alignItems:center guarantees both the
            lockup and the eyebrow sit on the card's vertical axis. */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:32}}>
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
            <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS">
              <rect width="100" height="100" rx="4" fill="#3E4C59"/>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
            </svg>
            <h1 style={{fontSize:38,fontWeight:500,letterSpacing:'-0.01em',margin:0,color:'#131F23',lineHeight:1}}>VARS</h1>
          </div>
          <p style={{fontSize:10,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--text-secondary)',margin:'8px 0 0',fontWeight:400,textAlign:'center'}}>{t('login.subtitle')}</p>
        </div>

        {/* Demo: a quiet outlined "Create a free demo account" pill above
            the form. Same palette as the form fields — same border colour,
            white background, slate text. Click to flip to signup mode. */}
        {IS_DEMO && mode === 'signin' && (
          <div onClick={() => { setMode('signup'); safeSetError(null); }}
            style={{
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,
              padding:'12px 14px',marginBottom:22,cursor:'pointer',
              background:'#fff',border:'1px solid var(--border-light)',borderRadius:8,
              transition:'border-color .15s, background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--bg-warm-dark)'; e.currentTarget.style.background='var(--bg-surface)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-light)'; e.currentTarget.style.background='#fff'; }}>
            <span style={{fontSize:13,fontWeight:500,color:'var(--text-dark)',letterSpacing:'-0.005em'}}>
              Create a free demo account
            </span>
          </div>
        )}

        {IS_DEMO ? null : (
          <>
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
          </>
        )}

        {/* Form */}
        <form onSubmit={IS_DEMO && mode === 'signup' ? handleSignup : handleSubmit}>
          {IS_DEMO && mode === 'signup' && (
            <div className="form-group">
              <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>Full name</label>
              <input className="form-input" type="text" value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="e.g. Hassan Al-Mansoori" style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
            </div>
          )}
          <div className="form-group">
            <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{t('login.email')}</label>
            <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
          </div>
          <div className="form-group">
            <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{t('login.password')}</label>
            <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={IS_DEMO && mode==='signup' ? 'Choose a password (min 6 characters)' : t('login.passwordPlaceholder')} style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
          </div>
          {IS_DEMO && mode === 'signup' && (
            <div className="form-group">
              <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>Confirm password</label>
              <input className="form-input" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter the same password" style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
            </div>
          )}

          {error && <p style={{color:'#8b4a42',fontSize:12,marginBottom:12}}>{typeof error === 'string' ? error : 'Something went wrong. Please try again.'}</p>}
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{width:'100%',padding:'13px',fontSize:12,marginTop:4,background:'var(--bg-warm-dark)',border:'none',borderRadius:8,color:'#fff',fontWeight:500,letterSpacing:'0.02em',textTransform:'uppercase',cursor: submitting ? 'default' : 'pointer',opacity: submitting ? 0.7 : 1,transition:'all .2s'}}>
            {submitting ? 'Working…' : (IS_DEMO && mode === 'signup' ? 'Create account' : t('login.signIn'))}
          </button>
          {/* Signin mode: just Forgot password? on the right. The
              "Create account" affordance now lives in the pill above
              the form, so no duplicate link here. */}
          {IS_DEMO && mode === 'signin' && (
            <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',marginTop:14,gap:10,fontSize:12}}>
              <span onClick={handleForgotPassword}
                style={{color:'var(--text-muted)',cursor:'pointer'}}>
                Forgot password?
              </span>
            </div>
          )}
          {IS_DEMO && mode === 'signup' && (
            <div style={{marginTop:14,fontSize:12,textAlign:'left'}}>
              <span style={{color:'var(--text-muted)'}}>Already have an account? </span>
              <span onClick={() => { setMode('signin'); safeSetError(null); }}
                style={{color:'var(--bg-warm-dark)',cursor:'pointer',fontWeight:500}}>
                Sign in
              </span>
            </div>
          )}
        </form>

        {/* Sync indicator + datetime footer removed — they read like dev
            scaffolding next to the polished form. Only useful for debugging,
            which I can do from the browser console. */}
      </div>
    </div>
  );
};
