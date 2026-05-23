// ==================== LOGIN PAGE ====================
const LoginPage = ({ onLogin, syncStatus }) => {
  const { t } = useApp();
  const [selectedRole, setSelectedRole] = useState('resident');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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
          const authRole = data.session.user && data.session.user.app_metadata && data.session.user.app_metadata.role;
          const mapped = authRole === 'pmc' ? 'manager' : authRole;
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

  return (
    <div className="login-page" style={{position:'relative'}}>
      {/* Language switcher — top right corner */}
      <div style={{position:'absolute',top:20,right:20,zIndex:10}}>
        <LanguageSwitcher/>
      </div>
      <div className="login-card" style={{maxWidth:460,padding:'40px 44px',border:'1px solid var(--border-light)',boxShadow:'0 8px 40px rgba(146,137,137,0.18)',borderRadius:14}}>
        {/* Header — VARS brand mark (exact from vars.live) */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:14,marginBottom:10}}>
            <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VARS">
              <rect width="100" height="100" rx="4" fill="#928989"/>
              <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
            </svg>
            <h1 style={{fontSize:38,fontWeight:500,letterSpacing:'-0.01em',margin:0,color:'#1a1a1a',lineHeight:1}}>VARS</h1>
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
          <p style={{fontSize:10,color:'#c4b8b0',letterSpacing:'0.04em'}}>Abu Dhabi · GST+4 · VARS v1.0 · {formatDateTime(new Date()) + ' GST'}</p>
        </div>
      </div>
    </div>
  );
};
