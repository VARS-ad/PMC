// ==================== GLOBAL OVERLAYS ====================
// Two always-on widgets that float above every page across all three role
// apps (PMC / Resident / Security):
//   1. <WhatsAppHelpButton/> — fixed bottom-right round button.
//   2. <DemoBanner/> — slim top bar shown only on the demo build.
// Both are rendered from src/app.js once per role-app so they stay above
// route changes and aren't re-mounted per page.

// IS_DEMO is derived the same way the rest of the codebase does it (see
// src/shared/login.js, src/pmc/profile-creation.js) so behaviour stays in
// sync with the build target.
const __VARS_IS_DEMO = (typeof VARS_TARGET !== 'undefined' && VARS_TARGET === 'demo');

// Inject the small bit of CSS the overlays need (mobile hide for the
// floating button, banner-aware body padding). Done once, on first load,
// so every page benefits without per-component style tags.
(function injectGlobalOverlayStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('vars-global-overlays-css')) return;
  const css =
    // Hide the WhatsApp button on phones — it overlaps the mobile bottom nav.
    '@media(max-width:768px){.vars-wa-help-btn{display:none!important}}' +
    // When the demo banner is mounted, push the entire app down 32px so the
    // banner doesn't sit on top of the topbar / login splash.
    'body.vars-has-demo-banner{padding-top:32px!important}' +
    // The fixed topbar in PMC/resident/security needs to shift down too.
    'body.vars-has-demo-banner .topbar{top:32px!important}' +
    'body.vars-has-demo-banner .sidebar{top:32px!important}';
  const style = document.createElement('style');
  style.id = 'vars-global-overlays-css';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---- WhatsApp "Need help?" floating button ---------------------------------
// Real support WhatsApp. wa.me accepts plain digits (country code + number,
// no '+'). Update here if the support line ever changes.
const VARS_HELP_WHATSAPP_NUMBER = '971504967084';
// Official WhatsApp brand greens — rest #25D366, hover/active #128C7E.
const WA_GREEN       = '#25D366';
const WA_GREEN_HOVER = '#128C7E';

const WhatsAppHelpButton = () => {
  const [hover, setHover] = React.useState(false);
  const openChat = () => {
    try {
      window.open('https://wa.me/' + VARS_HELP_WHATSAPP_NUMBER, '_blank', 'noopener,noreferrer');
    } catch (_) {
      window.location.href = 'https://wa.me/' + VARS_HELP_WHATSAPP_NUMBER;
    }
  };
  return (
    <div
      className="vars-wa-help-btn"
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 90 }}
    >
      {hover && (
        <div
          style={{
            position: 'absolute',
            right: 68,
            bottom: 14,
            background: 'var(--bg-warm-dark)',
            color: '#fff',
            fontSize: 12,
            letterSpacing: '0.02em',
            padding: '8px 12px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            pointerEvents: 'none'
          }}
        >
          Need help? Chat with us
        </div>
      )}
      <button
        type="button"
        onClick={openChat}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label="Need help? Chat with us on WhatsApp"
        title="Need help? Chat with us"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: hover ? WA_GREEN_HOVER : WA_GREEN,
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: hover ? '0 10px 26px rgba(37,211,102,0.45)' : '0 8px 22px rgba(0,0,0,0.22)',
          transition: 'transform .15s ease, box-shadow .15s ease, background .15s ease',
          transform: hover ? 'translateY(-2px)' : 'translateY(0)'
        }}
      >
        {/* WhatsApp glyph — single-path SVG, scales cleanly at 28px */}
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <path
            fill="#fff"
            d="M16.003 3C9.382 3 4 8.382 4 15.003c0 2.376.692 4.59 1.882 6.448L4 29l7.74-1.84a12.94 12.94 0 0 0 4.263.72h.005C22.628 27.88 28 22.5 28 15.88 28 9.26 22.624 3 16.003 3zm0 22.07h-.004a10.69 10.69 0 0 1-3.91-.74l-.28-.11-4.59 1.09 1.124-4.474-.182-.29a10.66 10.66 0 0 1-1.636-5.55C6.523 9.86 10.79 5.6 16.005 5.6c2.502 0 4.852.97 6.621 2.74a9.31 9.31 0 0 1 2.736 6.62c-.003 5.214-4.27 9.11-9.359 9.11zm5.844-6.83c-.32-.16-1.894-.934-2.188-1.04-.293-.107-.507-.16-.72.16-.213.32-.826 1.04-1.013 1.253-.187.214-.373.24-.693.08-.32-.16-1.35-.498-2.572-1.587-.95-.847-1.591-1.893-1.778-2.213-.187-.32-.02-.494.14-.654.144-.144.32-.373.48-.56.16-.187.213-.32.32-.534.107-.213.054-.4-.026-.56-.08-.16-.72-1.733-.987-2.373-.26-.624-.524-.54-.72-.55l-.613-.01a1.18 1.18 0 0 0-.853.4c-.293.32-1.12 1.094-1.12 2.667 0 1.573 1.147 3.094 1.307 3.307.16.213 2.253 3.44 5.46 4.827.764.33 1.36.526 1.825.674.767.244 1.465.21 2.017.127.615-.092 1.894-.774 2.16-1.522.267-.747.267-1.387.187-1.522-.08-.134-.293-.213-.613-.373z"
          />
        </svg>
      </button>
    </div>
  );
};

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
        height: 32,
        background: '#fdf5e6',
        borderBottom: '1px solid #efe1be',
        color: '#7a5a1f',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 16px',
        zIndex: 250,
        letterSpacing: '0.01em'
      }}
    >
      <span>
        Demo mode — every action is sandboxed. Click anything safely.
      </span>
      <button
        type="button"
        onClick={handleReset}
        disabled={busy}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: '#7a5a1f',
          textDecoration: 'underline',
          fontSize: 12,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          letterSpacing: '0.01em',
          fontFamily: 'inherit'
        }}
      >
        {busy ? 'Resetting…' : 'Reset to fresh data'}
      </button>
    </div>
  );
};

// Single host component — render once per role-app and it handles both the
// banner (demo-only) and the help button (always).
const GlobalOverlays = ({ showToast }) => {
  // Demo banner removed at user request — the top bar with "Demo mode —
  // every action is sandboxed. Click anything safely. Reset to fresh
  // data" was more visual noise than affordance. The Reset action is
  // still useful but doesn't justify a persistent banner; reinstate as
  // a one-time hint or move into the avatar dropdown later.
  return (
    <React.Fragment>
      <WhatsAppHelpButton/>
    </React.Fragment>
  );
};
