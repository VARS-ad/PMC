// ==================== LOGIN PAGE ====================
// Plays a short brand splash (~1.8s) on first mount before the login card
// fades in. Gives the user a moment of "welcome" rather than dumping them
// straight into a form. Tap anywhere on the splash to skip; the splash
// also dismisses itself once the timer fires. We don't gate this on
// sessionStorage because the user explicitly wants it every time the
// login page opens.

// Detect whether the page is loading from a Supabase auth callback —
// either email confirmation (signup / invite) or password recovery.
// Supabase tacks `type=signup` / `type=invite` / `type=recovery` onto the
// hash or query of the configured Site URL after the user clicks the link.
//
// Returns one of:
//   { kind: 'confirm', email }   — confirm-signup / invite. We use this to
//                                  skip the brand splash, jump straight to
//                                  the Sign In form, pre-fill the email
//                                  (stashed at signup time), and show a
//                                  green "Email confirmed" banner.
//   { kind: 'recovery' }         — password-reset callback. The user already
//                                  holds a short-lived session via the
//                                  access_token in the URL hash; we route
//                                  them into a "Set a new password" form
//                                  whose submit calls updateUser(password).
//   null                         — normal page load, splash + choose surface.
//
// Cached so re-renders during the same load don't re-evaluate.
let _varsAuthCallback;
const _detectAuthCallback = () => {
  if (_varsAuthCallback !== undefined) return _varsAuthCallback;
  try {
    if (typeof window === 'undefined') { _varsAuthCallback = null; return null; }
    const hash  = window.location.hash  || '';
    const query = window.location.search || '';
    const combined = hash + query;
    let kind = null;
    // 1. Our own breadcrumb flags. handleForgotPassword sets ?recovery=1
    //    on the redirectTo URL; handleSignup sets ?confirmed=1 on
    //    emailRedirectTo. Supabase preserves arbitrary query params
    //    across the verify redirect, so these survive into our load.
    //    This is the primary signal — works for both PKCE and implicit.
    if (/[?&]recovery=1/.test(query))                   kind = 'recovery';
    else if (/[?&]confirmed=1/.test(query))             kind = 'confirm';
    // 2. Implicit-flow fallback (older Supabase or non-default config).
    else if (/[?&#]type=recovery/.test(combined))       kind = 'recovery';
    else if (/[?&#]type=(signup|invite)/.test(combined)) kind = 'confirm';
    else if (/access_token=/.test(hash))                 kind = 'confirm';
    // 3. Bare PKCE code with no breadcrumb — old links from before this
    //    fix. Park on signin form and wait for the event listener to
    //    upgrade to 'reset' if PASSWORD_RECOVERY fires.
    else if (/[?&]code=/.test(query))                    kind = 'pending';
    // 4. Last resort: an early-captured event flag from supabase-client.js
    //    (for old links predating this fix).
    else if (window._varspmAuthCallback) {
      _varsAuthCallback = window._varspmAuthCallback;
      return _varsAuthCallback;
    }
    console.log('[auth] _detectAuthCallback: kind=', kind, ' query=', query, ' hash=', hash);
    if (!kind) { _varsAuthCallback = null; return null; }
    let email = '';
    try {
      email = sessionStorage.getItem('varspm_pending_confirm_email') || '';
      sessionStorage.removeItem('varspm_pending_confirm_email');
    } catch (_) {}
    _varsAuthCallback = { kind, email };
    return _varsAuthCallback;
  } catch (e) {
    console.log('[auth] _detectAuthCallback error:', e.message);
    _varsAuthCallback = null;
    return null;
  }
};

const LoginPage = ({ onLogin, syncStatus }) => {
  const { t, setData } = useApp();
  // On the demo deployment every user is their own PMC. We hide the
  // role selector, expose a Sign Up tab, and after sign-up auto-route
  // to the PMC overview. On the working deployment everything below
  // behaves the same as before.
  const IS_DEMO = (typeof VARS_TARGET !== 'undefined' && VARS_TARGET === 'demo');
  // Demo lands users on a 'choose' surface (just two white pill buttons) so
  // returning + new visitors split paths up-front. Working build skips the
  // choose state entirely and lands on its legacy role selector + signin.
  //
  // Two auth-callback paths override the default:
  //   - confirm callback (signup / invite confirmed): land on 'signin' with
  //     a green "Email confirmed" banner and the email pre-filled.
  //   - recovery callback (password reset): land on 'reset' which renders
  //     a "Set a new password" form that calls supabase.auth.updateUser.
  const _authCallback = _detectAuthCallback();
  const [mode, setMode] = useState(() => {
    if (_authCallback && _authCallback.kind === 'recovery') return 'reset';
    if (_authCallback && _authCallback.kind === 'confirm')  return 'signin';
    // 'pending' = PKCE callback whose flavour isn't known yet. Park on the
    // signin form (instead of the choose surface) and let the event listener
    // upgrade to 'reset' if Supabase fires PASSWORD_RECOVERY.
    if (_authCallback && _authCallback.kind === 'pending') return 'signin';
    try { if (typeof VARS_TARGET !== 'undefined' && VARS_TARGET === 'demo') return 'choose'; } catch (_) {}
    return 'signin';
  }); // 'choose' | 'signin' | 'signup' | 'reset'
  const [selectedRole, setSelectedRole] = useState(IS_DEMO ? 'manager' : 'resident');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(() => (_authCallback && _authCallback.email) || '');
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
    // Brand splash skipped on URL load — user wants the login card
    // immediately, no 3.7s VARS intro. The branded transition still
    // plays AFTER successful sign-in (login → dashboard), which lives
    // outside this component. Also map the auth-callback / just-logged-
    // out paths to 'ready' for the same effect.
    try {
      if (sessionStorage.getItem('varspm_just_logged_out') === '1') {
        sessionStorage.removeItem('varspm_just_logged_out');
      }
    } catch (_) {}
    return 'ready';
  });
  // Fire the post-callback banner once the splash has resolved (we set
  // splashStage='ready' immediately on callback so this fires right away).
  useEffect(() => {
    if (!_authCallback) return;
    if (_authCallback.kind === 'confirm') {
      flashNotice('Email confirmed. Sign in to continue.');
    } else if (_authCallback.kind === 'recovery') {
      flashNotice('Reset link verified. Set a new password to sign in.');
    } else if (_authCallback.kind === 'pending') {
      flashNotice('Verifying your link...');
    }
  // _authCallback is captured once at mount; safe to leave out of deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live auth-callback listener — handles the case where the URL was
  // ambiguous (PKCE: just ?code=...) at mount time and the event hadn't
  // fired yet. supabase-client.js dispatches a custom event when
  // PASSWORD_RECOVERY / SIGNED_IN fires from URL detection; we promote
  // the mode here once it does.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => {
      const detail = (e && e.detail) || {};
      if (detail.kind === 'recovery') {
        setMode('reset');
        setSplashStage('ready');
        flashNotice('Reset link verified. Set a new password to sign in.');
      } else if (detail.kind === 'confirm') {
        setMode('signin');
        setSplashStage('ready');
        if (detail.email) setEmail(detail.email);
        flashNotice('Email confirmed. Sign in to continue.');
      }
    };
    window.addEventListener('varspm:auth-callback', handler);
    return () => window.removeEventListener('varspm:auth-callback', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          // Role resolution. Demo signups never get app_metadata.role
          // populated server-side, so previously they fell through to the
          // "Wrong email or password" branch even though Supabase had
          // signed them in. On IS_DEMO we always treat the signed-in user
          // as a PMC manager (it's their own portfolio). On the working
          // build we still trust app_metadata.role but fall back to
          // 'manager' for unknown values so login never silently fails.
          const authRole = u && u.app_metadata && u.app_metadata.role;
          let mapped;
          if (IS_DEMO) {
            mapped = 'manager';
          } else if (authRole === 'pmc') {
            mapped = 'manager';
          } else if (authRole === 'security' || authRole === 'resident' || authRole === 'manager') {
            mapped = authRole;
          } else {
            mapped = 'manager';
          }
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
          if (mapped) {
            try { track('signin_success', { role: mapped }); } catch (_) {}
            onLogin(mapped);
            return;
          }
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
      // emailRedirectTo carries our own ?confirmed=1 breadcrumb so the
      // landing page can recognise it as a confirm-signup callback
      // regardless of PKCE / implicit flow.
      const _origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
      const signupCall = supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: (fullName || '').trim() || null },
          emailRedirectTo: _origin + '/?confirmed=1',
        },
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
        try { track('signup_completed', { autosignin: true }); } catch (_) {}
        onLogin('manager');
        return;
      }
      // No session means email confirmation is still on. Tell the user
      // via the green success toast (not the red error line) and flip
      // back to the Sign In tab.
      // Stash the email so the confirm callback can pre-fill the sign-in
      // form once they come back from clicking the confirm link.
      try { sessionStorage.setItem('varspm_pending_confirm_email', email); } catch (_) {}
      try { track('signup_email_sent'); } catch (_) {}
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
      // redirectTo carries our own ?recovery=1 breadcrumb so the landing
      // page can recognise it as a password-reset callback regardless of
      // PKCE / implicit flow.
      const _origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
      const { error: resetErr } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: _origin + '/?recovery=1',
      });
      if (resetErr) { safeSetError(resetErr); return; }
      flashNotice('Password reset email sent to ' + email + '.');
    } catch (err) { safeSetError(err); }
  };

  // Recovery flow — runs when we landed via the password-reset email link.
  // Supabase JS has already created a short-lived session from the access_token
  // in the URL hash. updateUser({password}) lets us set the new password on
  // that session; we then route the user straight into the app.
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    safeSetError(null);
    if (!password)                    { safeSetError('Pick a new password.'); return; }
    if (password.length < 6)          { safeSetError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { safeSetError('Passwords do not match.'); return; }
    if (!supabaseClient)              { safeSetError('Password reset is not available right now.'); return; }
    setSubmitting(true);
    try {
      const { data, error: updErr } = await supabaseClient.auth.updateUser({ password });
      if (updErr) { safeSetError(updErr); setSubmitting(false); return; }
      // Strip the recovery hash from the URL so a refresh doesn't put them
      // back in this flow.
      try { window.history.replaceState({}, '', window.location.pathname); } catch (_) {}
      // Route straight into the app. updateUser keeps the session alive and
      // the existing onAuthStateChange listener in app.js would also handle
      // this, but routing explicitly avoids a flicker.
      const u = data && data.user;
      if (u && setData) {
        const fullName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
        setData(prev => ({
          ...prev,
          currentUser: { ...prev.currentUser, name: fullName || (u.email || '').split('@')[0], email: u.email || prev.currentUser?.email, role: 'Property Manager' },
        }));
      }
      flashNotice('Password updated. Welcome back.');
      onLogin('manager');
    } catch (err) {
      safeSetError(err);
      setSubmitting(false);
    }
  };

  // Anonymous demo entry — the only sign-in surface on IS_DEMO. Creates a
  // fresh Supabase anon user (so RLS + the on_demo_user_signup trigger that
  // seeds the portfolio fire exactly as they do for email users) and then
  // overrides the trigger's generic 'Property Manager' name default with
  // whatever the visitor typed. Each click is a brand-new identity; there
  // is no account recovery because there is nothing to recover to.
  const handleStart = async (e) => {
    e.preventDefault();
    safeSetError(null);
    const name = (fullName || '').trim();
    if (!name) { safeSetError('Please enter your name to continue.'); return; }
    if (!supabaseClient) { safeSetError('Demo is not available right now.'); return; }
    setSubmitting(true);
    try {
      const { data, error: authErr } = await supabaseClient.auth.signInAnonymously({
        options: { data: { full_name: name } },
      });
      if (authErr) { safeSetError(authErr); setSubmitting(false); return; }
      const u = data && data.user;
      if (!u) { safeSetError('Could not start your demo. Please try again.'); setSubmitting(false); return; }
      // Override the trigger's email-derived default. Non-blocking — if the
      // profiles row hasn't been inserted by the trigger yet, the UI falls
      // back to user_metadata.full_name below.
      try {
        await supabaseClient.from('profiles').update({ full_name: name }).eq('id', u.id);
      } catch (_) {}
      if (setData) {
        setData(prev => ({
          ...prev,
          currentUser: { ...prev.currentUser, name, email: '', phone: '', role: 'Property Manager' },
        }));
      }
      try { track('demo_started', { name_len: name.length }); } catch (_) {}
      onLogin('manager');
    } catch (err) {
      safeSetError(err);
      setSubmitting(false);
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
            <div style={{fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500,marginBottom:14,textAlign:'center'}}>Portfolio Management Software</div>
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
      <div className="login-card" style={{maxWidth:600,padding:'60px 64px',border:'1px solid var(--border-light)',boxShadow:'0 8px 40px rgba(146,137,137,0.18)',borderRadius:14,
        animation: splashStage === 'ready' ? 'vars-login-in .55s cubic-bezier(.2,.7,.2,1) both' : 'none',
        visibility: splashStage === 'ready' ? 'visible' : 'hidden'}}>
        {/* Header — VARS brand mark side-by-side (icon + wordmark in a row).
            Wordmark is the visual anchor; the icon sits to its left. */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:32,width:'100%'}}>
          <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:14}}>
            <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS" style={{display:'block',flexShrink:0}}>
              <rect width="100" height="100" rx="4" fill="#3E4C59"/>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
            </svg>
            <h1 style={{fontSize:50,fontWeight:500,letterSpacing:'-0.01em',margin:0,color:'#131F23',lineHeight:1,paddingTop:11}}>VARS</h1>
          </div>
          <p style={{fontSize:13,letterSpacing:'0.15em',textTransform:'uppercase',color:'var(--text-secondary)',margin:'18px 0 0',fontWeight:500,textAlign:'center',whiteSpace:'nowrap'}}>{t('login.subtitle')}</p>
        </div>

        {/* IS_DEMO has ONE surface: type your name, hit Start, you're in.
            Each click creates a fresh anonymous Supabase user via
            signInAnonymously(); the on_demo_user_signup trigger seeds the
            portfolio; sticky localStorage session means a refresh keeps the
            visitor in their data. No email, no password, no recovery. */}
        {IS_DEMO && (
          <form onSubmit={handleStart}>
            <div style={{textAlign:'center',marginBottom:26,fontSize:30,fontWeight:400,color:'var(--text-muted)',letterSpacing:'-0.012em',lineHeight:1.15}}>
              What's your name?
            </div>
            {/* Input + Start sit inside a 280px max-width column so they
                read as a paired stack. The .form-input class has width:100%
                which beats inline width on the bare element, so the outer
                wrapper is what actually constrains the field — the children
                then take width:100% of the 280px wrapper. */}
            <div style={{maxWidth:280,margin:'0 auto',display:'flex',flexDirection:'column',gap:14}}>
              <input className="form-input" type="text" value={fullName}
                onChange={e=>setFullName(e.target.value)}
                placeholder="Your name" autoFocus
                style={{width:'100%',borderColor:'var(--border-light)',fontSize:14,borderRadius:8,textAlign:'center',padding:'13px 14px',boxSizing:'border-box'}}/>
              <button type="submit" className="btn btn-primary" disabled={submitting}
                style={{width:'100%',padding:'14px 0',fontSize:13,background:'var(--bg-warm-dark)',border:'none',borderRadius:8,color:'#fff',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',textAlign:'center',cursor: submitting ? 'default' : 'pointer',opacity: submitting ? 0.7 : 1,transition:'all .2s',boxSizing:'border-box'}}>
                {submitting ? 'STARTING…' : 'START'}
              </button>
            </div>
            {error && <p style={{color:'#8b4a42',fontSize:12,marginTop:14,marginBottom:0,textAlign:'center'}}>{typeof error === 'string' ? error : 'Something went wrong. Please try again.'}</p>}
            <div style={{textAlign:'center',marginTop:22,fontSize:11,color:'var(--text-muted)',letterSpacing:'0.02em'}}>
              No signup. No password. Just go.
            </div>
          </form>
        )}

        {/* Password recovery — working build only. Demo users never hit
            this because they have no password to reset. */}
        {!IS_DEMO && mode === 'reset' && (
          <form onSubmit={handleResetSubmit}>
            <div style={{fontSize:14,fontWeight:600,letterSpacing:'-0.005em',color:'var(--text-dark)',marginBottom:18}}>
              Set a new password
            </div>
            <div className="form-group">
              <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>New password</label>
              <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Min 6 characters" autoFocus style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
            </div>
            <div className="form-group">
              <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>Confirm new password</label>
              <input className="form-input" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter the same password" style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
            </div>
            {error && <p style={{color:'#8b4a42',fontSize:12,marginBottom:12}}>{typeof error === 'string' ? error : 'Something went wrong. Please try again.'}</p>}
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{width:'100%',padding:'13px',fontSize:12,marginTop:4,background:'var(--bg-warm-dark)',border:'none',borderRadius:8,color:'#fff',fontWeight:500,letterSpacing:'0.02em',textTransform:'uppercase',cursor: submitting ? 'default' : 'pointer',opacity: submitting ? 0.7 : 1,transition:'all .2s'}}>
              {submitting ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}

        {/* Working-build role picker + email/password form. Untouched by
            the demo refactor — keeps the legacy flow available for any
            real PMCs we eventually onboard via the working deployment. */}
        {!IS_DEMO && mode !== 'reset' && (
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

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{t('login.email')}</label>
                <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
              </div>
              <div className="form-group">
                <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:500}}>{t('login.password')}</label>
                <input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={t('login.passwordPlaceholder')} style={{borderColor:'var(--border-light)',fontSize:13,borderRadius:8}}/>
              </div>
              {error && <p style={{color:'#8b4a42',fontSize:12,marginBottom:12}}>{typeof error === 'string' ? error : 'Something went wrong. Please try again.'}</p>}
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{width:'100%',padding:'13px',fontSize:12,marginTop:4,background:'var(--bg-warm-dark)',border:'none',borderRadius:8,color:'#fff',fontWeight:500,letterSpacing:'0.02em',textTransform:'uppercase',cursor: submitting ? 'default' : 'pointer',opacity: submitting ? 0.7 : 1,transition:'all .2s'}}>
                {submitting ? 'Working…' : t('login.signIn')}
              </button>
            </form>
          </>
        )}

        {/* Footer — kept on the working build. The demo build drops it
            because the login surface is already clean and the sync state
            is uninteresting to prospects. */}
        {!IS_DEMO && (
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginTop:20,fontSize:11,color: syncStatus === 'online' ? '#6b8e6b' : '#b05050'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background: syncStatus === 'online' ? '#4caf50' : '#f44336'}}></div>
              {syncStatus === 'online' ? t('login.syncActive') : t('login.syncInactive')}
            </div>
            <div style={{marginTop:12,textAlign:'center'}}>
              <p style={{fontSize:10,color:'#D0D6D5',letterSpacing:'0.04em'}}>{formatDateTime(new Date())}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
