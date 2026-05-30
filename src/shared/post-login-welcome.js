// ==================== POST-LOGIN WELCOME SPLASH ====================
// Mirrors the pre-login intro (slate, layered radial background, stacked
// VARS mark) but personalised — shows the signed-in user's first name and
// the role label so the moment between login and the dashboard feels like
// a handoff rather than a hard cut.
//
// Lifecycle: render → 1.6s static → 0.6s fade → call onDone(). Tap to
// skip. Parent owns the visible flag; this component only fires onDone
// when it's safe to unmount.

const PostLoginWelcome = ({ userName, roleLabel, onDone }) => {
  const [stage, setStage] = useState('show'); // 'show' → 'fading' → onDone
  useEffect(() => {
    const t1 = setTimeout(() => setStage('fading'), 1600);
    const t2 = setTimeout(() => { onDone && onDone(); }, 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const skip = () => {
    setStage('fading');
    setTimeout(() => onDone && onDone(), 500);
  };

  // First name only — "Welcome back, Hassan" reads better than full name.
  // Falls back to "Welcome back" if we don't have a name yet.
  const firstName = (userName || '').split(/\s+/).filter(Boolean)[0] || '';
  const headline  = firstName ? ('Welcome, ' + firstName) : 'Welcome';

  const splashCss = `
    @keyframes vars-post-logo-in { 0% { opacity: 0; transform: scale(0.92) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
    @keyframes vars-post-tag-in  { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes vars-post-dot     { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
  `;

  return (
    <div onClick={skip}
      style={{position:'fixed',inset:0,zIndex:10000,cursor:'pointer',
        // Same layered radial as the pre-login splash — the two screens
        // read as one continuous brand moment book-ending the sign-in.
        background:
          'radial-gradient(120% 90% at 50% 35%, #4d5d6a 0%, #3a4853 55%, #2c3740 100%),'
          + 'radial-gradient(60% 50% at 10% 0%, rgba(219,197,174,0.18), transparent 70%),'
          + 'radial-gradient(45% 40% at 100% 100%, rgba(19,31,35,0.45), transparent 70%)',
        backgroundBlendMode:'normal, screen, multiply',
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',gap:18,padding:'0 28px',
        opacity: stage === 'fading' ? 0 : 1,
        transition: 'opacity .6s ease',
        pointerEvents: stage === 'fading' ? 'none' : 'auto'}}>
      <style>{splashCss}</style>

      {/* Stacked logo + wordmark */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18,animation:'vars-post-logo-in .8s cubic-bezier(.2,.7,.2,1) both'}}>
        <svg width="78" height="78" viewBox="0 0 100 100" fill="none" aria-label="VARS" style={{filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.28))'}}>
          <rect width="100" height="100" rx="8" fill="#ffffff"/>
          <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#3E4C59"/>
        </svg>
        <div style={{fontSize:58,fontWeight:500,letterSpacing:'-0.02em',color:'#fff',lineHeight:1,textAlign:'center'}}>VARS</div>
      </div>

      {/* Personalised welcome line */}
      <div style={{textAlign:'center',maxWidth:520,animation:'vars-post-tag-in .65s .25s cubic-bezier(.2,.7,.2,1) both'}}>
        <div style={{fontSize:13,letterSpacing:'0.22em',textTransform:'uppercase',color:'#d4c8c0',fontWeight:500,marginBottom:14,textAlign:'center'}}>{roleLabel ? ('Welcome to your ' + roleLabel) : 'Welcome'}</div>
        <div style={{fontSize:30,color:'#fff',fontWeight:500,letterSpacing:'-0.015em',lineHeight:1.2,textAlign:'center',margin:'0 auto'}}>
          {headline}
        </div>
        <div style={{fontSize:14,color:'rgba(255,255,255,0.65)',fontWeight:400,letterSpacing:'0',lineHeight:1.5,textAlign:'center',margin:'12px auto 0',maxWidth:380}}>
          Your portfolio is loading — buildings, residents and ops, ready in a moment.
        </div>
      </div>

      {/* Pulsing dots */}
      <div style={{display:'flex',gap:8,marginTop:22,animation:'vars-post-tag-in .65s .5s cubic-bezier(.2,.7,.2,1) both'}}>
        {[0,1,2].map(i => (
          <span key={i} style={{width:8,height:8,borderRadius:'50%',background:'#d4c8c0',display:'inline-block',animation:'vars-post-dot 1.2s ease-in-out '+ (i*0.15) +'s infinite'}}/>
        ))}
      </div>

      <div style={{position:'absolute',bottom:24,fontSize:11,color:'rgba(255,255,255,0.5)',letterSpacing:'0.08em',textAlign:'center',width:'100%'}}>Tap anywhere to continue →</div>
    </div>
  );
};
