// ==================== SUPABASE + REAL-TIME SYNC ====================
const STORAGE_KEY = 'varspm_data';
// Unique device ID so we can ignore our own real-time echoes
const DEVICE_ID = (function() {
  let id = localStorage.getItem('varspm_device_id');
  if (!id) { id = 'dev_' + Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem('varspm_device_id', id); }
  return id;
})();
// Supabase target — replaced at build time by build.mjs.
//   working build (default) → "VARS - PMC" project
//   demo build (--target=demo) → "VARS - Demo" project
// In dev mode (no build, babel-standalone in the browser) the placeholders
// are left literal — the IIFEs detect that and fall back to the working
// project so opening index.html directly still works.
const SUPABASE_URL = (() => { const v = '@@SUPABASE_URL@@'; return v.startsWith('@@') ? 'https://khhguxuxvkxvycndkron.supabase.co' : v; })();
const SUPABASE_KEY = (() => { const v = '@@SUPABASE_KEY@@'; return v.startsWith('@@') ? 'sb_publishable_JFWXeWDyB2_-po46Qyu6rA_HH7Uueyj' : v; })();
// Which deployment is this — "working" or "demo". Demo unlocks public
// signup + the seed-clone flow; working keeps the bootstrap-only login.
const VARS_TARGET = (() => { const v = '@@VARS_TARGET@@'; return v.startsWith('@@') ? 'working' : v; })();

let supabaseClient = null;
let supabaseReady = false;
try {
  const _sb = window.supabase;
  console.log('Supabase global:', typeof _sb, _sb ? Object.keys(_sb).slice(0,5) : 'null');
  // Try multiple access patterns for different CDN builds
  let _createClient = null;
  if (_sb && typeof _sb.createClient === 'function') {
    _createClient = _sb.createClient;
  } else if (_sb && _sb.supabase && typeof _sb.supabase.createClient === 'function') {
    _createClient = _sb.supabase.createClient;
  } else if (_sb && _sb.default && typeof _sb.default.createClient === 'function') {
    _createClient = _sb.default.createClient;
  } else if (typeof window.createClient === 'function') {
    _createClient = window.createClient;
  }
  if (_createClient) {
    // sessionStorage (NOT localStorage) so each browser tab keeps its own independent
    // Supabase session. That's what lets you sign in as PMC in tab 1, Resident in tab 2,
    // Security in tab 3 simultaneously without them overwriting each other.
    supabaseClient = _createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
    });
    supabaseReady = true;
    console.log('Supabase client initialized OK');
  } else {
    console.log('createClient not found. supabase type:', typeof _sb, 'keys:', _sb ? Object.keys(_sb) : 'N/A');
  }
} catch(e) { console.log('Supabase init error:', e.message); }

const DATA_VERSION = 'v62';
const loadPersistedData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // If data version changed, use fresh serviceRequests + escalations from code
      if (parsed._dataVersion !== DATA_VERSION) {
        parsed.serviceRequests = initialData.serviceRequests;
        parsed.escalations = initialData.escalations;
        parsed._dataVersion = DATA_VERSION;
        parsed._forceCloudPush = true; // signal to push fresh data to Supabase
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialData, ...parsed })); } catch(e) {}
      }
      return { ...initialData, ...parsed };
    }
  } catch(e) {}
  return { ...initialData, _dataVersion: DATA_VERSION };
};

