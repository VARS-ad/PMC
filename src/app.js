// ==================== MAIN APP ====================
const App = () => {
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem('varspm_role') || null; } catch(e) { return null; }
  });
  // Sync URL hash + document.title with the current role so each tab's URL
  // and browser tab label reflect its view (bookmarkable, distinguishable).
  useEffect(() => {
    try {
      const titles = {
        manager:  'VARS — Property Manager',
        pmc:      'VARS — Property Manager',
        resident: 'VARS — Resident',
        security: 'VARS — Security',
      };
      document.title = role ? (titles[role] || 'VARS') : 'VARS';
      if (role) {
        const slug = role === 'manager' ? 'pmc' : role;
        const desired = '#/' + slug;
        if (window.location.hash !== desired) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search + desired);
        }
      } else if (window.location.hash && window.location.hash !== '#') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (_) { /* ignore in non-browser contexts */ }
  }, [role]);
  const [page, setPage] = useState('overview');
  const [data, setData] = useState(loadPersistedData);
  // Lifted from TopBar so other PMC pages (Visitors, Guards, future Overview) can
  // filter their data by the currently-selected building ids.
  const [selectedProperties, setSelectedProperties] = useState([]);
  // Time range filter — shared across Overview / Service Charges / other
  // financial pages so navigating between them carries the selection.
  const [timeRange, setTimeRange] = useState('1m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [toast, setToast] = useState(null);
  // Personalised welcome splash shown right after a successful login.
  // Mirrors the pre-login intro: ~1.6s static then ~0.6s fade. Component
  // owns its own teardown so the parent just sets `showWelcome` to true.
  const [showWelcome, setShowWelcome] = useState(false);
  const [language, setLanguageState] = useState(getInitialLanguage);
  // Apply RTL/LTR to <html> + <body> whenever language changes
  React.useEffect(() => { applyDirection(language); }, [language]);
  const setLanguage = (lang) => {
    setLanguageState(lang);
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch(e) {}
  };
  const t = React.useMemo(() => makeT(language), [language]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState(supabaseReady ? 'connecting' : 'local');
  const isWritingRef = React.useRef(false);  // true while we are saving to Supabase
  const writePendingRef = React.useRef(false); // true from data change until cloud write completes
  const writeTimerRef = React.useRef(null);
  const lastCloudHashRef = React.useRef(''); // hash of last cloud data to detect real changes
  const initialLoadDoneRef = React.useRef(false); // DON'T write to Supabase until first cloud load completes

  // Simple hash to compare data quickly
  const quickHash = (obj) => { try { return JSON.stringify(obj).length + '_' + (obj.visitors||[]).length + '_' + (obj.entryLog||[]).length; } catch(e) { return ''; } };

  // Merge arrays by ID — union of local + cloud, local wins on conflict
  const mergeById = (localArr, cloudArr, idKey = 'id') => {
    if (!localArr || !localArr.length) return cloudArr || [];
    if (!cloudArr || !cloudArr.length) return localArr || [];
    const map = new Map();
    cloudArr.forEach(item => { const k = item[idKey] || JSON.stringify(item); map.set(k, item); });
    localArr.forEach(item => { const k = item[idKey] || JSON.stringify(item); map.set(k, item); }); // local overwrites cloud
    return Array.from(map.values());
  };

  // Load initial data from Supabase on mount + start polling
  useEffect(() => {
    if (!supabaseReady || !supabaseClient) return;

    const loadFromCloud = async (isInitial) => {
      // Don't poll while we have a pending or in-progress write
      if (!isInitial && (isWritingRef.current || writePendingRef.current)) return;
      // Skip polls while the tab is in the background — no UI is visible to
      // update, and it spares the user a 184KB fetch + parse every cycle.
      // The next foreground poll (or tab refocus) picks up any changes.
      if (!isInitial && typeof document !== 'undefined' && document.hidden) return;
      try {
        // .maybeSingle() instead of .single() so an empty result is row=null
        // rather than a PGRST116 / 406 error. With per-user RLS on the demo
        // project, an unauthenticated visitor sees zero rows and we don't
        // want the console flooded with red 406s.
        const { data: row, error } = await supabaseClient
          .from('app_state')
          .select('data, updated_at')
          .eq('id', 'main')
          .maybeSingle();
        if (error) {
          console.log('Supabase query error:', error.code, error.message);
          if (isInitial) {
            setSyncStatus('offline');
            initialLoadDoneRef.current = true; // allow writes even if cloud errored
          }
          return;
        }
        if (!row) {
          // No row exists yet for this user. On the working project that
          // meant "first run, create the seed"; on the demo project it
          // mostly means "not signed in yet". Try the seed upsert anyway
          // — RLS will reject it silently when unauthenticated, which is
          // fine.
          if (isInitial) {
            await supabaseClient.from('app_state').upsert({ id: 'main', data: initialData, updated_at: new Date().toISOString() });
            setSyncStatus('online');
            initialLoadDoneRef.current = true;
          }
          return;
        }
        // Row found — merge cloud data into state
        if (row && row.data && Object.keys(row.data).length > 0) {
          const cloudData = { ...row.data };
          const writerDevice = cloudData._lastWriter || '';
          delete cloudData._lastWriter;
          const hash = quickHash(cloudData);

          // On poll (not initial): skip if data hasn't changed
          if (!isInitial && hash === lastCloudHashRef.current) {
            return;
          }
          console.log(isInitial ? 'Loaded cloud data (visitors: ' + (cloudData.visitors||[]).length + ')' : 'Poll: new data from device ' + writerDevice + ' (visitors: ' + (cloudData.visitors||[]).length + ')');
          lastCloudHashRef.current = hash;

          if (isInitial) {
            // On initial load: cloud is source of truth, but merge with any locally-added data
            const localData = loadPersistedData();
            const dataVersionChanged = localData._forceCloudPush || (cloudData._dataVersion !== DATA_VERSION);
            const mergedVisitors = mergeById(localData.visitors || [], cloudData.visitors || [], 'id');
            const mergedEntryLog = mergeById(localData.entryLog || [], cloudData.entryLog || [], 'id');
            const mergedAmenities = mergeById(localData.amenityBookings || [], cloudData.amenityBookings || [], 'id');
            const mergedPending = mergeById(localData.pendingApprovals || [], cloudData.pendingApprovals || [], 'id');
            // If data version changed, use fresh local SR/escalations instead of stale cloud
            const mergedSR = dataVersionChanged ? (initialData.serviceRequests || []) : mergeById(localData.serviceRequests || [], cloudData.serviceRequests || [], 'id');
            const mergedDismissedNotifs = [...new Set([...(localData.dismissedNotifIds || []), ...(cloudData.dismissedNotifIds || [])])];
            const mergedDismissedSecNotifs = [...new Set([...(localData.dismissedSecNotifIds || []), ...(cloudData.dismissedSecNotifIds || [])])];
            const merged = { ...initialData, ...cloudData, visitors: mergedVisitors, entryLog: mergedEntryLog, amenityBookings: mergedAmenities, pendingApprovals: mergedPending, serviceRequests: mergedSR, dismissedNotifIds: mergedDismissedNotifs, dismissedSecNotifIds: mergedDismissedSecNotifs, _dataVersion: DATA_VERSION };
            delete merged._forceCloudPush;
            setData(merged);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch(e) {}
            if (dataVersionChanged) console.log('Data version changed — pushing fresh SR database to cloud');
          } else {
            // On poll: merge cloud data with current local state (local wins on conflict)
            setData(prev => {
              const mergedVisitors = mergeById(prev.visitors || [], cloudData.visitors || [], 'id');
              const mergedEntryLog = mergeById(prev.entryLog || [], cloudData.entryLog || [], 'id');
              const mergedAmenities = mergeById(prev.amenityBookings || [], cloudData.amenityBookings || [], 'id');
              const mergedPending = mergeById(prev.pendingApprovals || [], cloudData.pendingApprovals || [], 'id');
              const mergedSR = mergeById(prev.serviceRequests || [], cloudData.serviceRequests || [], 'id');
              const mergedDismissedNotifs = [...new Set([...(prev.dismissedNotifIds || []), ...(cloudData.dismissedNotifIds || [])])];
              const mergedDismissedSecNotifs = [...new Set([...(prev.dismissedSecNotifIds || []), ...(cloudData.dismissedSecNotifIds || [])])];
              const merged = { ...prev, ...cloudData, visitors: mergedVisitors, entryLog: mergedEntryLog, amenityBookings: mergedAmenities, pendingApprovals: mergedPending, serviceRequests: mergedSR, dismissedNotifIds: mergedDismissedNotifs, dismissedSecNotifIds: mergedDismissedSecNotifs };
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch(e) {}
              return merged;
            });
          }
        } else {
          console.log(isInitial ? 'Cloud row exists but data is empty — using local data' : 'Poll: empty data, skipping');
        }
        setSyncStatus('online');
        if (isInitial) {
          initialLoadDoneRef.current = true;
          console.log('Initial cloud load done — cloud writes enabled');
        }
      } catch(e) {
        console.log('Supabase load error:', e);
        if (isInitial) {
          setSyncStatus('offline');
          initialLoadDoneRef.current = true; // allow writes even if cloud is down
        }
      }
    };

    // Initial load
    loadFromCloud(true);

    // Poll for changes from other devices. 4s was needlessly aggressive for
    // a 184KB blob — visitor pre-approvals already arrive via a realtime
    // channel (see upcoming-pre-approvals.js), so a 15s sweep is plenty for
    // the rest and cuts the background fetch/parse load by ~75%. A refocus
    // listener fires an immediate catch-up poll so returning to the tab feels
    // instant rather than waiting up to 15s.
    const pollId = setInterval(() => loadFromCloud(false), 15000);
    const onFocus = () => { if (!document.hidden) loadFromCloud(false); };
    document.addEventListener('visibilitychange', onFocus);
    console.log('Supabase polling started (every 15s, paused while hidden)');
    return () => { clearInterval(pollId); document.removeEventListener('visibilitychange', onFocus); };
  }, []);

  // Write data to Supabase + localStorage when data changes (debounced)
  useEffect(() => {
    // Save to localStorage immediately
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
    // Update our local hash so polling doesn't re-apply our own data
    lastCloudHashRef.current = quickHash(data);
    // Write to Supabase — but ONLY after initial cloud load is done
    // This prevents overwriting real data with initialData on fresh page loads
    if (supabaseReady && supabaseClient && initialLoadDoneRef.current) {
      writePendingRef.current = true; // block polls during debounce window
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
      writeTimerRef.current = setTimeout(async () => {
        isWritingRef.current = true;
        try {
          const payload = { ...data, _lastWriter: DEVICE_ID };
          const { error } = await supabaseClient
            .from('app_state')
            .upsert({ id: 'main', data: payload, updated_at: new Date().toISOString() });
          if (error) {
            console.log('Supabase write FAILED:', error.message, error.code);
            setSyncStatus('offline');
          } else {
            console.log('Supabase write OK — visitors:', (data.visitors||[]).length, 'entryLog:', (data.entryLog||[]).length);
            setSyncStatus('online');
          }
        } catch(e) {
          console.log('Supabase write exception:', e);
          setSyncStatus('offline');
        }
        isWritingRef.current = false;
        writePendingRef.current = false; // allow polls again
      }, 600);
    } else if (!initialLoadDoneRef.current) {
      console.log('Supabase write BLOCKED — initial load not yet done');
    }
  }, [data]);

  // One-time online-database seed migration.
  // After the initial cloud load completes, check whether the seed rows have been
  // applied. If not, merge the ~60 realistic entries into data.entryLog so the app
  // has a full historic + scheduled dataset. The auto-write effect above will then
  // push the merged entryLog into Supabase on the next tick — making the seed
  // visible to every device that loads the app.
  const seedAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (seedAppliedRef.current) return;
    if (!initialLoadDoneRef.current) return;
    if ((data.entryLogSeedVersion || '') === SEED_ENTRY_LOG_VERSION) {
      seedAppliedRef.current = true;
      return;
    }
    seedAppliedRef.current = true;
    const seedRows = buildSeedEntryLog();
    setData(prev => {
      // Remove stale seed entries (they carry _seed: true) so dates refresh daily
      const userEntries = (prev.entryLog || []).filter(e => !e._seed);
      const merged = [...seedRows, ...userEntries];
      console.log('Entry log seed refreshed: ' + seedRows.length + ' seed + ' + userEntries.length + ' user = ' + merged.length + ' total');
      return { ...prev, entryLog: merged, entryLogSeedVersion: SEED_ENTRY_LOG_VERSION };
    });
  }, [data, syncStatus]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleCreateClick = (type) => {
    if (type === 'visitor') setPage('visitors');
    else if (type === 'announcement') setPage('announcements');
    else if (type === 'service') setPage('service');
    else if (type === 'guard') setPage('guards');
  };

  const handleLogout = () => {
    try { localStorage.removeItem('varspm_role'); } catch(e) {}
    if (supabaseClient) { try { supabaseClient.auth.signOut(); } catch(e) {} }
    // Mark this transition so LoginPage skips the brand splash — coming
    // back to the login screen from a logout shouldn't play the welcome
    // animation again. The flag is consumed on the next LoginPage mount.
    try { sessionStorage.setItem('varspm_just_logged_out', '1'); } catch(e) {}
    setRole(null);
  };

  // If not logged in, show login page (with scan notice if QR was scanned)
  if (!role) return (
    <AppContext.Provider value={{ data, setData, showToast, language, setLanguage, t, selectedProperties, setSelectedProperties, timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd }}>
      <LoginPage onLogin={(selectedRole) => {
        try { localStorage.setItem('varspm_role', selectedRole); } catch(e) {}
        setRole(selectedRole);
        setShowWelcome(true);
      }} syncStatus={syncStatus}/>
      <GlobalOverlays showToast={showToast}/>
    </AppContext.Provider>
  );

  // Sync status indicator removed — sat at bottom-right and obstructed
  // mobile UX (overlapped the bottom nav, looked like a stuck toast).
  // Sync state is still tracked in syncStatus; we just don't render it.
  const SyncDot = () => null;

  // If logged in as resident, show resident app
  if (role === 'resident') {
    return (
      <AppContext.Provider value={{ data, setData, showToast, language, setLanguage, t, selectedProperties, setSelectedProperties, timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd }}>
        <ResidentApp onLogout={handleLogout}/>
        <GlobalOverlays showToast={showToast}/>
        {toast && <div className="toast">{toast}</div>}
      </AppContext.Provider>
    );
  }

  // If logged in as security, show security app
  if (role === 'security') {
    return (
      <AppContext.Provider value={{ data, setData, showToast, language, setLanguage, t, selectedProperties, setSelectedProperties, timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd }}>
        <SecurityApp onLogout={handleLogout}/>
        <SyncDot/>
        <GlobalOverlays showToast={showToast}/>
        {toast && <div className="toast">{toast}</div>}
      </AppContext.Provider>
    );
  }

  // Default: Property Manager app
  const renderPage = () => {
    switch (page) {
      case 'overview': return <PMCOverviewPage setPage={setPage}/>;
      case 'profileCreation': return <ProfileCreationPage/>;
      case 'payment': return <PMCServiceChargesPage/>;
      case 'visitors': return <PMCVisitorsPage/>;
      case 'service': return <PMCServiceRequestsPage/>;
      case 'packages': return <PlaceholderPage title="Packages" description="Package tracking and delivery management. Coming soon!"/>;
      case 'announcements': return <AnnouncementsPage/>;
      case 'chat': return <ChatPage/>;
      case 'guards': return <PMCGuardsPage/>;
      case 'properties': return <PMCPropertiesPage setPage={setPage}/>;
      case 'vendors': return <PMCVendorsPage setPage={setPage}/>;
      // Escalations page removed — page no longer routed.
      case 'reports': return <PMCReportsPage/>;
      case 'reminders': return <PMCRemindersPage setPage={setPage}/>;
      case 'profile': return <MyProfilePage setPage={setPage}/>;
      default: return <PMCOverviewPage setPage={setPage}/>;
    }
  };

  return (
    <AppContext.Provider value={{ data, setData, showToast, language, setLanguage, t, selectedProperties, setSelectedProperties, timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd }}>
      <div className="app-layout">
        <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)}/>
        <Sidebar page={page} setPage={setPage} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onLogout={handleLogout}/>
        <TopBar onCreateClick={handleCreateClick} onMenuToggle={() => setSidebarOpen(!sidebarOpen)} onLogout={handleLogout} onNavigate={setPage}/>
        <div className="main-content">{renderPage()}</div>
        <MobileBottomNav page={page} setPage={setPage}/>
      </div>
      <SyncDot/>
      <GlobalOverlays showToast={showToast}/>
      {toast && <div className="toast">{toast}</div>}
      {showWelcome && <PostLoginWelcome roleLabel="PMC profile" userName={data.currentUser?.name} onDone={() => setShowWelcome(false)}/>}
    </AppContext.Provider>
  );
};

ReactDOM.render(<App/>, document.getElementById('root'));
