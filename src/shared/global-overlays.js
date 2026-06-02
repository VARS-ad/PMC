// ==================== GLOBAL OVERLAYS ====================
// Host for always-on widgets that float above every page on the demo
// build: the slim "demo data" banner at the top, and a floating
// WhatsApp help bubble at the bottom-right that lets visitors message
// the team directly. Rendered from src/app.js for the login splash AND
// each role app (PMC / Resident / Security) so it survives route changes.

// IS_DEMO is derived the same way the rest of the codebase does it (see
// src/shared/login.js, src/pmc/profile-creation.js) so behaviour stays in
// sync with the build target.
const __VARS_IS_DEMO = (typeof VARS_TARGET !== 'undefined' && VARS_TARGET === 'demo');

// Build identity — stamped by build.mjs at compile time. The placeholders
// stay as the literal strings during dev (no build step), so a fall-through
// IIFE swaps them for 'dev' when nothing replaced them. This lets the
// user verify which deployed bundle their browser is currently running by
// looking at the chip in the banner / corner.
const __VARS_BUILD_SHA = (() => {
  const s = '@@BUILD_SHA@@';
  return s.startsWith('@@') ? 'dev' : s;
})();
const __VARS_BUILD_TIME = (() => {
  const s = '@@BUILD_TIME@@';
  return s.startsWith('@@') ? '' : s;
})();

// Inject the small bit of CSS the overlays need (banner-aware body
// padding). Done once, on first load, so every page benefits without
// per-component style tags.
(function injectGlobalOverlayStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('vars-global-overlays-css')) return;
  const css =
    // When the demo banner is mounted, push the entire app down 32px so the
    // banner doesn't sit on top of the topbar / login splash.
    'body.vars-has-demo-banner{padding-top:40px!important}' +
    // The fixed topbar in PMC/resident/security needs to shift down too.
    'body.vars-has-demo-banner .topbar{top:40px!important}' +
    'body.vars-has-demo-banner .sidebar{top:40px!important}';
  const style = document.createElement('style');
  style.id = 'vars-global-overlays-css';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---- Demo banner ------------------------------------------------------------
// Slim horizontal bar at the very top, only on the demo build. Tells the user
// they're in a sandbox and offers a one-click re-seed.
const DemoBanner = ({ showToast }) => {
  const [busy, setBusy] = React.useState(false);

  // Body class toggle so the rest of the layout reserves space for us. We
  // can't use a layout effect alone — Resident/Security apps remount fresh
  // — so this runs every mount and tears down cleanly.
  React.useEffect(() => {
    try { document.body.classList.add('vars-has-demo-banner'); } catch (_) {}
    return () => {
      try { document.body.classList.remove('vars-has-demo-banner'); } catch (_) {}
    };
  }, []);

  const handleReset = async () => {
    if (busy) return;
    if (!window.confirm('Wipe your demo data and re-seed from the template?')) return;
    setBusy(true);
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (showToast) showToast('Supabase not ready — refresh and try again.');
        setBusy(false);
        return;
      }
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const uid = sessionData && sessionData.session && sessionData.session.user && sessionData.session.user.id;
      if (!uid) {
        if (showToast) showToast('Sign in first to reset demo data.');
        setBusy(false);
        return;
      }
      const { error } = await supabaseClient.rpc('seed_demo_portfolio_for', { p_uid: uid });
      if (error) {
        console.log('seed_demo_portfolio_for error:', error.message, error.code);
        if (showToast) showToast('Couldn’t reset demo data: ' + (error.message || 'unknown error'));
        setBusy(false);
        return;
      }
      // Success — full reload so cached local state is dropped.
      window.location.reload();
    } catch (e) {
      console.log('Demo reset exception:', e);
      if (showToast) showToast('Couldn’t reset demo data — see console.');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        background: '#f6e4be',
        borderBottom: '1px solid #d9bf7e',
        color: '#5a4416',
        fontSize: 14,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '0 16px',
        zIndex: 250,
        letterSpacing: '0.005em'
      }}
    >
      <span>
        Demo data is only for illustrative purposes.
      </span>
    </div>
  );
};

// ---- Feedback / WhatsApp help bubble ----------------------------------------
// Floating green circle at bottom-right; tap to open a small panel. Visitor
// can either:
//   1) Send feedback — POST to formsubmit.co which emails the VARS team
//   2) Contact on WhatsApp — opens wa.me with their typed message pre-filled
// Feedback path keeps the visitor inside the page (just a thank-you screen);
// WhatsApp path hands them to their app for a live chat.
const WA_PHONE   = '971504967084';   // E.164 without the '+', as wa.me expects
const WA_PROMPT  = 'Hi! Got any questions or suggestions? Drop us a message — we’ll get back to you within 10 minutes.';
// Form endpoint — formsubmit.co relays the POST as an email to this address.
// First submission triggers a one-time activation email to the inbox; click
// the "Activate" link inside it and all future submits arrive normally.
const FEEDBACK_ENDPOINT = 'https://formsubmit.co/ajax/aleksandrov.hse@gmail.com';

const WhatsAppIcon = ({ size = 30 }) => (
  // Official-style glyph, white on transparent so it sits on the green button.
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M16.02 3.2c-7.07 0-12.8 5.73-12.8 12.8 0 2.26.6 4.47 1.73 6.4L3.2 28.8l6.6-1.72a12.74 12.74 0 0 0 6.22 1.6h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.63-3.75-9.05A12.71 12.71 0 0 0 16.02 3.2zm0 23.34h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-3.92 1.03 1.05-3.82-.25-.4a10.59 10.59 0 0 1-1.62-5.64c0-5.86 4.77-10.63 10.64-10.63 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.52c0 5.87-4.77 10.63-10.63 10.63zm5.83-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1 1.26-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.77-2.21-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.99-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.1-1.12 2.67 0 1.58 1.15 3.1 1.31 3.32.16.21 2.27 3.47 5.5 4.86.77.33 1.37.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z" fill="#fff"/>
  </svg>
);

const WhatsAppHelpWidget = () => {
  const [open, setOpen]   = React.useState(false);
  const [msg, setMsg]     = React.useState('');
  // 'compose' | 'sending' | 'sent' | 'error'
  const [stage, setStage] = React.useState('compose');

  const sendFeedback = async () => {
    const text = (msg || '').trim();
    if (!text || stage === 'sending') return;
    setStage('sending');
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: 'VARS demo — feedback',
          _captcha: 'false',
          source:   'demo.vars.live',
          page:     (typeof window !== 'undefined') ? window.location.href : '',
          message:  text,
        }),
      });
      if (!res.ok) throw new Error('http ' + res.status);
      setStage('sent');
      setMsg('');
    } catch (e) {
      console.log('Feedback send error:', e);
      setStage('error');
    }
  };

  const openWhatsApp = () => {
    const text = (msg || '').trim();
    const url  = 'https://wa.me/' + WA_PHONE + (text ? ('?text=' + encodeURIComponent(text)) : '');
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}
  };

  // Close + reset to compose so the next open is a clean panel.
  const closePanel = () => {
    setOpen(false);
    setTimeout(() => { setStage('compose'); setMsg(''); }, 250);
  };

  // Bottom offset bumps up on mobile so the bubble doesn't overlap the
  // mobile-bottom-nav inside Resident / Security. The nav is hidden on
  // desktop via CSS, so on wider screens we sit closer to the corner.
  const bottomOffset = (typeof window !== 'undefined' && window.innerWidth < 720) ? 86 : 24;

  return (
    <React.Fragment>
      {/* Expanded panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Message VARS support on WhatsApp"
          style={{
            position: 'fixed',
            right: 24,
            bottom: bottomOffset + 78,
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
            background: '#fff',
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
            border: '1px solid #e6e2dd',
            zIndex: 260,
            overflow: 'hidden',
            fontFamily: 'inherit',
          }}
        >
          {/* Header — WhatsApp green */}
          <div style={{background:'#075E54', color:'#fff', padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
            <div style={{
              width:40, height:40, borderRadius:'50%',
              background:'#25D366', display:'flex', alignItems:'center', justifyContent:'center',
              flexShrink:0,
            }}>
              <WhatsAppIcon size={22}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:600, lineHeight:1.2}}>VARS Team</div>
              <div style={{fontSize:12, opacity:0.85, lineHeight:1.3, marginTop:2}}>Replies within 10 minutes</div>
            </div>
            <button
              onClick={closePanel}
              aria-label="Close"
              style={{
                background:'transparent', border:'none', color:'#fff',
                fontSize:22, lineHeight:1, cursor:'pointer', padding:4,
              }}
            >×</button>
          </div>

          {/* Body */}
          <div style={{padding:'16px', background:'#ECE5DD'}}>
            {/* Chat-bubble prompt — swaps to a thank-you after feedback is sent */}
            <div style={{
              background:'#fff', borderRadius:10, padding:'10px 12px',
              fontSize:13, lineHeight:1.45, color:'#1a1a1a',
              boxShadow:'0 1px 1px rgba(0,0,0,0.06)',
              marginBottom:12,
            }}>
              {stage === 'sent'
                ? '✓ Thanks for your feedback — it’s really valuable to us. We read every message. 😊'
                : WA_PROMPT}
            </div>

            {/* Compose UI — hidden once feedback has been sent successfully */}
            {stage !== 'sent' && (
              <React.Fragment>
                <textarea
                  value={msg}
                  onChange={e => setMsg(e.target.value)}
                  placeholder="Type your message…"
                  rows={3}
                  disabled={stage === 'sending'}
                  style={{
                    width:'100%', boxSizing:'border-box',
                    border:'1px solid #d6cfc7', borderRadius:10,
                    padding:'10px 12px', fontSize:13, fontFamily:'inherit',
                    resize:'none', outline:'none', background:'#fff',
                  }}
                />

                {stage === 'error' && (
                  <div style={{
                    marginTop:8,
                    background:'#fff3f0', border:'1px solid #f5cabb', color:'#a4310e',
                    borderRadius:8, padding:'8px 10px', fontSize:12,
                  }}>
                    Couldn’t send right now — please try again or message us on WhatsApp.
                  </div>
                )}

                <button
                  onClick={sendFeedback}
                  disabled={!msg.trim() || stage === 'sending'}
                  style={{
                    marginTop:10, width:'100%',
                    background:'#25D366', color:'#fff', border:'none',
                    borderRadius:10, padding:'11px 14px',
                    fontSize:14, fontWeight:600,
                    cursor: (msg.trim() && stage !== 'sending') ? 'pointer' : 'not-allowed',
                    opacity: (msg.trim() && stage !== 'sending') ? 1 : 0.55,
                  }}
                >
                  {stage === 'sending' ? 'Sending…' : 'Send feedback'}
                </button>
              </React.Fragment>
            )}

            {/* WhatsApp contact — always visible, both before and after sending */}
            <button
              onClick={openWhatsApp}
              style={{
                marginTop:10, width:'100%',
                background:'#075E54', color:'#fff', border:'none',
                borderRadius:10, padding:'11px 14px',
                fontSize:14, fontWeight:600, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}
            >
              <WhatsAppIcon size={18}/>
              <span>Contact us on WhatsApp</span>
            </button>
          </div>
        </div>
      )}

      {/* Caption to the LEFT of the closed bubble — invites the visitor to click. */}
      {!open && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            right: 96,                  // 24 (bubble right) + 60 (bubble) + 12 (gap)
            bottom: bottomOffset + 8,   // roughly centred against the 60px bubble
            maxWidth: 230,
            background: '#fff',
            color: '#1a1a1a',
            fontSize: 13,
            lineHeight: 1.35,
            padding: '8px 12px',
            borderRadius: 12,
            border: '1px solid #e6e2dd',
            boxShadow: '0 6px 16px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
            textAlign: 'right',
            zIndex: 260,
            pointerEvents: 'none',
          }}
        >
          Thank you for feedback — <span style={{color:'#7a6f66'}}>especially what we can improve</span> 😊
        </div>
      )}

      {/* Floating launcher button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close WhatsApp chat' : 'Chat with VARS on WhatsApp'}
        style={{
          position: 'fixed',
          right: 24,
          bottom: bottomOffset,
          width: 60, height: 60, borderRadius: '50%',
          background: '#25D366',
          border: 'none',
          boxShadow: '0 6px 18px rgba(37,211,102,0.45), 0 2px 4px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 260,
        }}
      >
        {open
          ? <span style={{color:'#fff', fontSize:28, lineHeight:1, fontWeight:300}}>×</span>
          : <WhatsAppIcon size={30}/>}
      </button>
    </React.Fragment>
  );
};

// Single host component — renders the demo banner + WhatsApp help bubble on
// the demo build (login splash, PMC, resident, security). Returns null on
// the working build so production stays clean.
const GlobalOverlays = ({ showToast }) => {
  if (!__VARS_IS_DEMO) return null;
  return (
    <React.Fragment>
      <DemoBanner showToast={showToast}/>
      <WhatsAppHelpWidget/>
    </React.Fragment>
  );
};
