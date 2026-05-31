// ==================== ANALYTICS ====================
// Thin wrapper around Vercel Web Analytics so the rest of the app can fire
// `track('demo_signup_click')` without worrying about whether the script
// is loaded yet. The stub in index.html queues calls; this wrapper just
// formats them.
//
// Pageviews are tracked automatically by Vercel's deferred script — we
// only need to call this for funnel events the dashboard can't infer
// (clicks, completions, etc.).
//
// Safe everywhere: no-ops on any environment where `window.va` is missing
// (server-side rendering, tests, dev without the script tag).

const track = (name, data) => {
  try {
    if (typeof window === 'undefined') return;
    if (typeof window.va !== 'function') return;
    // Vercel's event payload schema: { name, ...customProps }
    if (data && typeof data === 'object') {
      window.va('event', { name, ...data });
    } else {
      window.va('event', { name });
    }
  } catch (_) {
    // Never let analytics break a real user flow.
  }
};
