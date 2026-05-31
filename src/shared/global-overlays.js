// ==================== GLOBAL OVERLAYS ====================
// Host for always-on widgets that float above every page across all three
// role apps (PMC / Resident / Security). Currently a thin scaffold —
// historically also rendered a WhatsApp help button and a demo banner;
// both have been removed at user request.
// Rendered from src/app.js once per role-app so it stays above route
// changes and isn't re-mounted per page.

// IS_DEMO is derived the same way the rest of the codebase does it (see
// src/shared/login.js, src/pmc/profile-creation.js) so behaviour stays in
// sync with the build target.
const __VARS_IS_DEMO = (typeof VARS_TARGET !== 'undefined' && VARS_TARGET === 'demo');

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

// Single host component — renders the demo banner on the demo build so the
// "this isn't real data" notice shows on every page (login, PMC overview,
// resident, security). Returns null on the working build.
const GlobalOverlays = ({ showToast }) => {
  if (!__VARS_IS_DEMO) return null;
  return <DemoBanner showToast={showToast}/>;
};
