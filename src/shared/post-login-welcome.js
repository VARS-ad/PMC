// ==================== POST-LOGIN WELCOME ====================
// Personalised "you're in" card shown over a blurred dashboard the first
// time a visitor signs in. Replaces the older 1.6s tiled splash — that
// surface bought rendering time but communicated nothing; this surface
// teaches the visitor what they're looking at and what they can do.
//
// Lifecycle: mounts when app.js sets showWelcome=true (after onLogin),
// stays up until the visitor taps "Let's go" (no auto-dismiss — they
// should read it). Closing fires onDone() which clears showWelcome.
//
// Personalisation: userName is the name the visitor typed on the demo
// landing form (stashed in data.currentUser.name by handleStart). We
// greet by FIRST name only so "Hassan Al-Mansoori" reads as "Hassan"
// — friendlier than the full string and stays one line on mobile.
//
// Backdrop: the dashboard renders fully behind, frosted via
// backdrop-filter so the visitor gets a teaser of what they're about
// to see — turns the welcome into an invitation rather than a wall.

const PostLoginWelcome = ({ onDone, userName }) => {
  const [stage, setStage] = useState('show');
  const firstName = (userName || '').trim().split(/\s+/)[0] || '';

  const dismiss = () => {
    setStage('fading');
    setTimeout(() => onDone && onDone(), 380);
  };

  return (
    <div
      style={{
        position:'fixed', inset:0, zIndex:10000,
        // Warm wash + frost. The dashboard sits behind, recognisably
        // present but visually demoted so the card owns attention.
        background:'rgba(244,238,228,0.55)',
        backdropFilter:'blur(10px) saturate(115%)',
        WebkitBackdropFilter:'blur(10px) saturate(115%)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'24px',
        opacity: stage === 'fading' ? 0 : 1,
        transition: 'opacity .35s ease',
        animation: 'vars-welcome-fade-in .4s ease',
        pointerEvents: stage === 'fading' ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          background:'#fff',
          border:'1px solid var(--border-light)',
          borderRadius:18,
          boxShadow:'0 28px 80px rgba(91,72,52,0.22), 0 4px 12px rgba(91,72,52,0.06)',
          maxWidth:620,
          width:'100%',
          padding:'56px 60px 48px',
          textAlign:'center',
          animation:'vars-welcome-card-in .5s cubic-bezier(.2,.7,.2,1)',
        }}
      >
        <svg width="60" height="60" viewBox="0 0 100 100" style={{display:'block', margin:'0 auto 24px'}}>
          <rect width="100" height="100" rx="6" fill="#3E4C59"/>
          <path d="M33.3 16.7 L50 16.7 L58.1 25.2 L66.7 33.3 L66.7 83.3 L50 83.3 L33.3 66.7 Z" fill="#ffffff"/>
        </svg>

        <h2 style={{
          fontSize:34, fontWeight:500, letterSpacing:'-0.02em',
          color:'#131F23', margin:'0 0 10px', lineHeight:1.15,
        }}>
          Welcome{firstName ? ', ' + firstName : ''}
        </h2>

        <div style={{
          fontSize:12, letterSpacing:'0.16em', textTransform:'uppercase',
          color:'var(--text-secondary)', fontWeight:500, marginBottom:30,
        }}>
          Portfolio Management Software
        </div>

        <p style={{
          fontSize:15, lineHeight:1.65, color:'var(--text-muted)',
          margin:'0 0 14px', letterSpacing:'-0.003em',
        }}>
          Here you'll find every asset in your portfolio - buildings, units,
          residents and each contract attached to them, with maintenance included.
          You can also generate reports on anything you see. Operational activity -
          service requests, announcements, visitors and guards - is also under
          your control.
        </p>
        <p style={{
          fontSize:15, lineHeight:1.65, color:'var(--text-muted)',
          margin:'0 0 36px', letterSpacing:'-0.003em',
        }}>
          Take your time looking around.
        </p>

        <button
          onClick={dismiss}
          style={{
            background:'var(--bg-warm-dark)', color:'#fff', border:'none',
            padding:'15px 48px', borderRadius:8,
            fontSize:12, fontWeight:700, letterSpacing:'0.08em',
            textTransform:'uppercase', cursor:'pointer',
            transition:'transform .2s, box-shadow .2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 10px 28px rgba(146,137,137,0.32)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
        >
          Let's go
        </button>
      </div>

      <style>{`
        @keyframes vars-welcome-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes vars-welcome-card-in { 0% { opacity: 0; transform: translateY(18px) scale(0.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
};
