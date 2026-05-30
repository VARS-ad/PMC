// ==================== TOP BAR ====================
// The property dropdown is populated from Supabase (the user's actual buildings).
// Properties are grouped by property_type into 4 collapsible categories so the
// list stays scannable when the portfolio grows.
const PROPERTY_CATEGORIES = [
  { key: 'Residential',     label: 'Residential' },
  { key: 'Commercial',      label: 'Commercial Buildings' },
  { key: 'Villa',           label: 'Villas' },
  { key: 'Commercial Land', label: 'Plots' },
];

const TopBar = ({ onCreateClick, onMenuToggle, onLogout, onNavigate }) => {
  const { data, setData, t, selectedProperties, setSelectedProperties } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [showPmProfile, setShowPmProfile] = useState(false);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [allProperties, setAllProperties] = useState([]);
  // Which category sections are expanded inside the dropdown. Default: all
  // four expanded so the first-time view mirrors the old flat list; user
  // can collapse what isn't relevant to declutter.
  const [expandedCats, setExpandedCats] = useState({
    'Residential': true, 'Commercial': true, 'Villa': true, 'Commercial Land': true,
  });
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    const load = async () => {
      try {
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name,address,property_type').order('name');
        if (!mounted) return;
        const ids = (buildings || []).map(b => b.id);
        const unitCounts = {};
        if (ids.length) {
          const { data: units } = await supabaseClient.from('units').select('building_id').in('building_id', ids);
          (units || []).forEach(u => { unitCounts[u.building_id] = (unitCounts[u.building_id] || 0) + 1; });
        }
        const real = (buildings || []).map(b => ({
          id: b.id, name: b.name, location: b.address || '—',
          property_type: b.property_type || 'Residential',
          towers: 1, units: unitCounts[b.id] || 0,
        }));
        if (!mounted) return;
        setAllProperties(real);
        // Default: select ALL real properties so every report shows the full
        // portfolio out of the box. After a fresh upload (vars:buildings-changed)
        // we also auto-select the NEW property ids so the user immediately sees
        // their data in the active filter — they're not hidden behind an
        // un-checked checkbox.
        setSelectedProperties(prev => {
          if (!prev || prev.length === 0) return real.map(r => r.id);
          const known = new Set(prev);
          const newOnes = real.filter(r => !known.has(r.id)).map(r => r.id);
          return newOnes.length === 0 ? prev : [...prev, ...newOnes];
        });
      } catch (_) { /* keep fallback */ }
    };
    load();
    // After a bulk-onboard upload finishes, profile-creation dispatches this
    // event so the topbar refreshes without a page reload.
    const onBuildingsChanged = () => load();
    window.addEventListener('vars:buildings-changed', onBuildingsChanged);
    return () => { mounted = false; window.removeEventListener('vars:buildings-changed', onBuildingsChanged); };
  }, []);
  const realProps = allProperties;
  // Bucket properties by category for the grouped dropdown.
  const propsByCat = {};
  PROPERTY_CATEGORIES.forEach(c => { propsByCat[c.key] = []; });
  realProps.forEach(p => {
    const cat = PROPERTY_CATEGORIES.find(c => c.key === p.property_type) ? p.property_type : 'Residential';
    propsByCat[cat].push(p);
  });
  const toggleCat = (key) => setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  // Select-all / deselect-all just within one category. Enforces the global
  // "at least one selected" invariant by falling back to a single property
  // when a deselect-all would empty the filter.
  const setSelectionForCategory = (catKey, select) => {
    const ids = (propsByCat[catKey] || []).map(p => p.id);
    if (ids.length === 0) return;
    setSelectedProperties(prev => {
      if (select) return Array.from(new Set([...prev, ...ids]));
      const next = prev.filter(id => !ids.includes(id));
      if (next.length > 0) return next;
      // Keep at least one selected globally.
      const fallback = realProps.find(p => !ids.includes(p.id));
      return fallback ? [fallback.id] : prev;
    });
  };
  // My Profile is now a routed page (src/shared/my-profile-page.js) — the
  // dropdown navigates via onNavigate('profile') so the form scrolls in the
  // document instead of fighting a 90vh modal.

  // ===== Notifications =====
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifs, setNotifs] = useState({ srs: [], invoices: [], visits: [], reminders: [] });
  // Six-category selection (from Database → Reminder Email). Drives which
  // groups appear in the bell — toggling a category off in Settings hides
  // those items everywhere. Default to all six ON so the bell behaves the
  // same as before for users who haven't visited the new settings yet.
  // Category → bell-group mapping:
  //   payments  → invoices
  //   leases    → reminders where source_type === 'lease'
  //   srs       → srs
  //   contracts → reminders where source_type === 'vendor' OR 'contract'
  //   ops       → visits (visitors expected today + move-ins/outs + shift handovers)
  const TOPBAR_DIGEST_DEFAULT = ['payments','leases','srs','contracts','ops'];
  // Legacy ids saved in reminder_settings.digest_categories before the rename.
  const _TOPBAR_LEGACY = { money: 'payments' };
  const _TOPBAR_VALID  = new Set(TOPBAR_DIGEST_DEFAULT);
  const _normalizeCats = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return TOPBAR_DIGEST_DEFAULT;
    const out = [];
    for (const raw of arr) {
      const id = _TOPBAR_LEGACY[raw] || raw;
      if (_TOPBAR_VALID.has(id) && !out.includes(id)) out.push(id);
    }
    return out.length > 0 ? out : TOPBAR_DIGEST_DEFAULT;
  };
  const [digestCats, setDigestCats] = useState(TOPBAR_DIGEST_DEFAULT);
  // Persisted "last marked-as-read" timestamp. When user clicks the
  // "Mark all read" link we store now(); the bell's red dot only shows
  // when at least one item was created after that timestamp.
  const [notifReadAt, setNotifReadAt] = useState(() => {
    try { return localStorage.getItem('varspm_notif_read_at') || ''; } catch (_) { return ''; }
  });
  const markAllRead = () => {
    const now = new Date().toISOString();
    try { localStorage.setItem('varspm_notif_read_at', now); } catch (_) {}
    setNotifReadAt(now);
  };
  useEffect(() => {
    if (!supabaseClient) return;
    let mounted = true;
    (async () => {
      try {
        // Load the saved digest-categories selection so the bell honours
        // the same toggles configured in Database → Reminder Email.
        const { data: rs } = await supabaseClient.from('reminder_settings').select('digest_categories').eq('id', 1).maybeSingle();
        if (mounted && rs && Array.isArray(rs.digest_categories) && rs.digest_categories.length > 0) {
          setDigestCats(_normalizeCats(rs.digest_categories));
        }
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        if (fIds.length === 0) { if (mounted) setNotifs({ srs: [], invoices: [], visits: [], reminders: [] }); return; }
        const today = new Date().toISOString().slice(0, 10);
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const [{ data: srs }, { data: invs }, { data: visits },
               { data: leasesData }, { data: vendorsData }, { data: contractsData }, { data: dismissals },
               { data: bs }, { data: profs }] = await Promise.all([
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,unit_id').in('unit_id', fIds).in('status', ['New','Acknowledged']).order('created_at', { ascending: false }).limit(8),
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,unit_id').in('unit_id', fIds).eq('status', 'Overdue').order('amount_aed', { ascending: false }).limit(8),
          supabaseClient.from('visits').select('id,visitor_name,type,status,visit_date,unit_id').in('unit_id', fIds).eq('visit_date', today).eq('status', 'Pre-Approved').limit(8),
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,lease_end').in('unit_id', fIds).not('lease_end','is',null),
          supabaseClient.from('vendors').select('id,name,service_category,contract_end').not('contract_end','is',null),
          supabaseClient.from('contracts').select('id,name,counterparty,contract_type,end_date,building_id'),
          supabaseClient.from('reminder_dismissals').select('source_type,source_id,lead_days,dismissal_anchor,dismissed_at'),
          supabaseClient.from('buildings').select('id,name'),
          supabaseClient.from('profiles').select('id,full_name').eq('role','resident'),
        ]);
        if (!mounted) return;
        const addUnit = (rows) => (rows || []).map(r => ({ ...r, unit_number: uMap[r.unit_id]?.unit_number || '—' }));
        const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
        const pMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
        const leasesEnriched = (leasesData || []).map(r => ({
          ...r,
          resident_name: pMap[r.profile_id]?.full_name || 'Tenant',
          unit_number:   uMap[r.unit_id]?.unit_number || '—',
          building_name: uMap[r.unit_id] && bMap[uMap[r.unit_id].building_id] ? bMap[uMap[r.unit_id].building_id].name : '—',
        }));
        // buildReminders is defined in src/pmc/reminders.js (loaded later in the bundle).
        // By the time this effect runs, all scripts have executed so it's available globally.
        const reminders = (typeof buildReminders === 'function')
          ? buildReminders({ leases: leasesEnriched, vendors: vendorsData, contracts: contractsData, dismissals })
          : [];
        setNotifs({ srs: addUnit(srs), invoices: addUnit(invs), visits: addUnit(visits), reminders });
      } catch (_) { /* silent */ }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);
  // Apply the digest-category filter so the bell mirrors the Reminder Email
  // tab's six toggles. Reminders are tagged by source_type:
  //   lease    → 'leases'
  //   vendor   → 'contracts'  (maintenance contracts)
  //   contract → 'contracts'  (generic contracts share the same toggle)
  const _activeCats = digestCats || TOPBAR_DIGEST_DEFAULT;
  const visibleNotifs = {
    srs:       _activeCats.includes('srs')   ? notifs.srs      : [],
    invoices:  _activeCats.includes('payments') ? notifs.invoices : [],
    visits:    _activeCats.includes('ops')   ? notifs.visits   : [],
    reminders: notifs.reminders.filter(r => {
      if (r.source_type === 'lease')    return _activeCats.includes('leases');
      if (r.source_type === 'vendor')   return _activeCats.includes('contracts');
      if (r.source_type === 'contract') return _activeCats.includes('contracts');
      return true;
    }),
  };
  const notifTotal = visibleNotifs.srs.length + visibleNotifs.invoices.length + visibleNotifs.visits.length + visibleNotifs.reminders.length;
  // "Unread" = at least one item became actionable after the last mark-as-read
  // timestamp. For SR / invoice / visit we compare to `created_at`. For a
  // reminder, the "fire moment" is end_date − lead_days (the day today
  // crossed the threshold for its current bucket). So once a reminder has
  // already fired and the user marks all read, the dot clears; it only
  // re-lights when a *new* threshold crossing happens (new reminder
  // appears OR an existing reminder rolls into a tighter bucket).
  const reminderFiredAt = (r) => {
    const d = new Date(r.end_date);
    d.setDate(d.getDate() - (r.lead_days || 0));
    return d.toISOString();
  };
  const hasUnread = !notifReadAt
    || [...visibleNotifs.srs, ...visibleNotifs.invoices, ...visibleNotifs.visits].some(item => (item.created_at || '') > notifReadAt)
    || visibleNotifs.reminders.some(r => reminderFiredAt(r) > notifReadAt);
  const showDot = notifTotal > 0 && hasUnread;
  const fmtAED = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString();
  const goTo = (page) => { setShowNotifications(false); if (onNavigate) onNavigate(page); };

  const toggleProperty = (id) => {
    setSelectedProperties(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // must have at least one
        return prev.filter(p => p !== id);
      }
      return [...prev, id];
    });
  };

  const propertyLabel = selectedProperties.length === 1
    ? (allProperties.find(p => p.id === selectedProperties[0])?.name || '—')
    : selectedProperties.length === realProps.length && realProps.length > 0
    ? 'All Assets'
    : selectedProperties.length + ' Assets Selected';

  return (
    <div className="topbar">
      <button className="hamburger" onClick={onMenuToggle}><span/><span/><span/></button>

      {/* Asset Multi-Select — same DOM rhythm as a .sidebar-item: SVG icon
          (with the shared translateY(-1px) nudge from base.css), text, and
          a trailing chevron. No nested wrappers, no count chip — the label
          already reads "12 Assets Selected" so a second 12-badge was just
          visual noise that didn't share the text baseline. */}
      <div style={{position:'relative'}}>
        <div className="property-select" onClick={() => setShowPropertyDropdown(!showPropertyDropdown)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
          <span>{propertyLabel}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:'auto',transform: showPropertyDropdown ? 'translateY(-1px) rotate(180deg)' : 'translateY(-1px) rotate(0deg)',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        {showPropertyDropdown && (
          <>
            <div onClick={() => setShowPropertyDropdown(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:997}}/>
            <div style={{position:'absolute',top:'100%',left:0,marginTop:6,width:320,maxWidth:'90vw',background:'#fff',borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #E6EAE9',zIndex:998,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid #E6EAE9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,fontWeight:600,color:'#131F23',letterSpacing:'0.04em'}}>{t('pm.selectProperties')}</span>
                <span style={{fontSize:11,color:'#61707D',cursor:'pointer'}} onClick={() => {
                  setSelectedProperties(selectedProperties.length === realProps.length ? (realProps[0] ? [realProps[0].id] : []) : realProps.map(p => p.id));
                }}>{selectedProperties.length === realProps.length && realProps.length > 0 ? t('pm.deselectAll') : t('pm.selectAll')}</span>
              </div>
              <div style={{padding:'4px 0',maxHeight:380,overflowY:'auto'}}>
                {PROPERTY_CATEGORIES.map(cat => {
                  const props = propsByCat[cat.key] || [];
                  if (props.length === 0) return null;
                  const selectedInCat = props.filter(p => selectedProperties.includes(p.id)).length;
                  const allSelected = selectedInCat === props.length;
                  const expanded = !!expandedCats[cat.key];
                  return (
                    <div key={cat.key} style={{borderBottom:'1px solid #F0F0F0'}}>
                      <div onClick={() => toggleCat(cat.key)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'10px 16px',cursor:'pointer',background: expanded ? '#FAFAFA' : 'transparent',transition:'background 0.15s'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="2"
                               style={{transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',transition:'transform 0.15s',flexShrink:0}}>
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                          <span style={{fontSize:12,fontWeight:600,color:'#131F23',letterSpacing:'0.02em'}}>{cat.label}</span>
                          <span style={{fontSize:11,color:'#61707D',whiteSpace:'nowrap'}}>{selectedInCat} / {props.length}</span>
                        </div>
                        <span onClick={(e) => { e.stopPropagation(); setSelectionForCategory(cat.key, !allSelected); }}
                              style={{fontSize:11,color:'#3E4C59',cursor:'pointer',whiteSpace:'nowrap',fontWeight:500}}>
                          {allSelected ? t('pm.deselectAll') : t('pm.selectAll')}
                        </span>
                      </div>
                      {expanded && props.map(p => {
                        const isSelected = selectedProperties.includes(p.id);
                        return (
                          <div key={p.id} onClick={() => toggleProperty(p.id)}
                            style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px 10px 32px',cursor:'pointer',background: isSelected ? '#f8f8f8' : 'transparent',transition:'background 0.15s'}}>
                            <div style={{width:18,height:18,borderRadius:4,border: isSelected ? 'none' : '1.5px solid #d0d0d0',background: isSelected ? '#131F23' : '#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight: isSelected ? 600 : 400,color:'#131F23',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</div>
                              <div style={{fontSize:11,color:'#61707D',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.location} · {p.units} units</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {realProps.length === 0 && (
                  <div style={{padding:'24px 16px',textAlign:'center',color:'#61707D',fontSize:12}}>
                    No properties yet. Upload them from Database → Assets.
                  </div>
                )}
              </div>
              <div style={{padding:'10px 16px',borderTop:'1px solid #f0f0f0',fontSize:11,color:'#61707D'}}>
                {selectedProperties.length} of {realProps.length} properties selected
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{flex:1}}/>
      <div className="topbar-right">
        <div style={{position:'relative'}}>
          <div onClick={() => setShowNotifications(!showNotifications)} style={{width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',cursor:'pointer',background:'transparent',border:'none'}} title={notifTotal > 0 ? `${notifTotal} item${notifTotal === 1 ? '' : 's'} need attention` : 'Notifications'}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#131F23" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {showDot && (
              <span style={{position:'absolute',top:4,right:6,width:8,height:8,borderRadius:'50%',background:'#c62828',border:'2px solid #F4EEE4',boxSizing:'content-box'}}/>
            )}
          </div>
          {showNotifications && (
            <>
              <div onClick={() => setShowNotifications(false)} style={{position:'fixed',inset:0,zIndex:997}}/>
              <div onClick={e => e.stopPropagation()} style={{position:'absolute',top:44,right:-8,width:360,maxHeight:520,background:'#fff',borderRadius:12,boxShadow:'0 12px 40px rgba(0,0,0,0.15)',border:'1px solid #E6EAE9',zIndex:999,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                <div style={{padding:'14px 16px',borderBottom:'1px solid #E6EAE9',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:'#131F23'}}>Notifications</div>
                    <div style={{fontSize:11,color:'#61707D',marginTop:1}}>{notifTotal} item{notifTotal === 1 ? '' : 's'} need attention</div>
                  </div>
                  {notifTotal > 0 && (
                    <button onClick={markAllRead} disabled={!hasUnread} style={{flexShrink:0,fontSize:11,color: hasUnread ? '#3E4C59' : '#8A98A2',background:'transparent',border:'none',cursor: hasUnread ? 'pointer' : 'default',padding:'4px 6px',fontFamily:'inherit',whiteSpace:'nowrap',fontWeight:500}}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {notifTotal === 0 ? (
                    <div style={{padding:'40px 20px',textAlign:'center',color:'#61707D',fontSize:13}}>
                      <div style={{fontSize:32,marginBottom:8,opacity:0.5}}>✓</div>
                      All caught up. Nothing needs your attention right now.
                    </div>
                  ) : (
                    <>
                      {visibleNotifs.reminders.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span>Contract Reminders · {visibleNotifs.reminders.length}</span>
                            <span onClick={() => goTo('reminders')} style={{fontSize:10,color:'var(--accent-warm-dark)',cursor:'pointer',textTransform:'none',letterSpacing:0,fontWeight:500}}>View all →</span>
                          </div>
                          {visibleNotifs.reminders.slice(0, 5).map(r => {
                            const dotColor = r.lead_days === 0 ? '#8b4a42' : r.lead_days <= 7 ? '#a07d3c' : '#61707D';
                            const remainTxt = r.days_until < 0
                              ? Math.abs(r.days_until) + ' days overdue'
                              : 'in ' + r.days_until + ' day' + (r.days_until === 1 ? '' : 's');
                            return (
                              <div key={r.key} onClick={() => goTo('reminders')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                                onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                <div style={{width:6,height:6,borderRadius:3,background:dotColor,marginTop:6,flexShrink:0}}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:13,color:'#131F23',fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.title}</div>
                                  <div style={{fontSize:11,color:'#61707D',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.subtitle}</div>
                                  <div style={{fontSize:10,color:'#61707D',marginTop:3}}>Expires {r.end_date} · {remainTxt}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {visibleNotifs.srs.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4'}}>
                            Service Requests · {visibleNotifs.srs.length}
                          </div>
                          {visibleNotifs.srs.slice(0, 5).map(s => (
                            <div key={s.id} onClick={() => goTo('service')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                              onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <div style={{width:6,height:6,borderRadius:3,background: s.priority === 'High' ? '#c62828' : s.priority === 'Normal' ? '#a07d3c' : '#D0D6D5',marginTop:6,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:'#131F23',fontWeight:500}}>{s.category} · Unit {s.unit_number}</div>
                                <div style={{fontSize:11,color:'#61707D',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.description}</div>
                                <div style={{fontSize:10,color:'#61707D',marginTop:3}}>{s.status} · {new Date(s.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {visibleNotifs.invoices.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4'}}>
                            Overdue Invoices · {visibleNotifs.invoices.length}
                          </div>
                          {visibleNotifs.invoices.slice(0, 5).map(i => (
                            <div key={i.id} onClick={() => goTo('payment')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                              onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <div style={{width:6,height:6,borderRadius:3,background:'#8b4a42',marginTop:6,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:'#131F23',fontWeight:500}}>{fmtAED(i.amount_aed)} · Unit {i.unit_number}</div>
                                <div style={{fontSize:11,color:'#61707D',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{i.description}</div>
                                <div style={{fontSize:10,color:'#61707D',marginTop:3}}>Due {i.due_date || '—'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {visibleNotifs.visits.length > 0 && (
                        <div>
                          <div style={{padding:'10px 16px 6px',fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'#61707D',fontWeight:600,background:'#F4EEE4'}}>
                            Today's Visitors · {visibleNotifs.visits.length}
                          </div>
                          {visibleNotifs.visits.slice(0, 5).map(v => (
                            <div key={v.id} onClick={() => goTo('visitors')} style={{padding:'10px 16px',borderBottom:'1px solid #E6EAE9',cursor:'pointer',display:'flex',gap:10,alignItems:'flex-start'}}
                              onMouseEnter={e => e.currentTarget.style.background='#F4EEE4'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <div style={{width:6,height:6,borderRadius:3,background:'#5a6b4f',marginTop:6,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,color:'#131F23',fontWeight:500}}>{v.visitor_name} · Unit {v.unit_number}</div>
                                <div style={{fontSize:11,color:'#61707D',marginTop:2}}>{v.type || 'Visit'} · Pre-Approved</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{position:'relative'}}>
          <div className="avatar" onClick={()=>setShowPmProfile(!showPmProfile)} style={{width:34,height:34,borderRadius:'50%',background:'#E6EAE9',cursor:'pointer'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
          </div>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" style={{position:'absolute',right:-14,top:'50%',transform:'translateY(-50%)',cursor:'pointer'}} onClick={()=>setShowPmProfile(!showPmProfile)}><polyline points="6 9 12 15 18 9"/></svg>
          {showPmProfile && (() => {
            // Headline now shows the logged-in user's name (or the bootstrap
            // demo name). Initials fall back to "?" so the avatar never renders
            // empty.
            const userName = data.currentUser?.name || 'My profile';
            const userRole = data.currentUser?.role ? String(data.currentUser.role) : '';
            const initials = (userName || '?').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
            return (
            <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:44,right:-14,width:280,background:'#fff',borderRadius:10,boxShadow:'0 8px 32px rgba(0,0,0,.15)',border:'1px solid #E6EAE9',zIndex:999,overflow:'hidden'}}>
              <div style={{padding:'20px 16px',textAlign:'center',borderBottom:'1px solid #E6EAE9'}}>
                <div style={{width:48,height:48,borderRadius:'50%',background:'#3E4C59',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:600,letterSpacing:'0.04em',margin:'0 auto 10px'}}>{initials}</div>
                <div style={{fontSize:16,fontWeight:600,color:'#131F23',lineHeight:1.2,wordBreak:'break-word'}}>{userName}</div>
                {userRole && <div style={{fontSize:12,color:'#61707D',marginTop:4,textTransform:'capitalize'}}>{userRole}</div>}
              </div>
              <div style={{padding:'8px 12px'}}>
                <div onClick={()=>{setShowPmProfile(false); if (onNavigate) onNavigate('profile');}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',cursor:'pointer',fontSize:13,color:'#131F23'}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:'#E6EAE9',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="user" size={14}/></div>
                  {t('pm.myProfile')}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" style={{marginLeft:'auto'}}><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
              <div style={{padding:'4px 12px 12px',borderTop:'1px solid #f0f0f0'}}>
                <div onClick={()=>{setShowPmProfile(false);onLogout();}} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 4px',cursor:'pointer',fontSize:13,color:'#131F23'}}>
                  {/* Logout icon matched to the My Profile chip — same neutral
                      container, same #61707D stroke as the user icon. No red
                      "danger" tint; logout isn't destructive enough for it. */}
                  <div style={{width:30,height:30,borderRadius:'50%',background:'#E6EAE9',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  </div>
                  {t('pm.logout')}
                </div>
              </div>
            </div>
            );
          })()}
        </div>
      </div>
      {showPmProfile && <div onClick={()=>setShowPmProfile(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,zIndex:998}}/>}
    </div>
  );
};
