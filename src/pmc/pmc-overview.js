// ==================== PMC OVERVIEW (Dashboard) ====================
// KPIs grouped into Properties / Service Requests / Visitors with their own
// eyebrow headings. Below: Service Request Summary → Service Charge Collection
// (this month) → Units in Arrears → Service Requests Requiring Action.

// The hint used to render as a permanent third line under every tile,
// which added noise to dense building cards. It now lives on the
// title attribute (browser tooltip on hover) so the tile reads as a
// clean label + value pair.
const PMCStat = ({ label, value, color, onClick, hint }) => (
  <div
    onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
    title={hint || ''}
    style={{
      padding:'14px 16px',
      background:'var(--bg-surface)',
      borderRadius:6,
      border:'1px solid var(--border-light)',
      cursor: onClick ? 'pointer' : 'default',
      transition:'background 0.15s, border-color 0.15s'
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.background = 'var(--accent-warm-light)'; e.currentTarget.style.borderColor = 'var(--accent-warm)'; } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-light)'; } }}
  >
    <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>{label}</div>
    <div style={{fontSize:16,fontWeight:600,color:color||'var(--text-dark)',letterSpacing:'-0.015em'}}>{value}</div>
  </div>
);

// Stock building photos per property type. Picked deterministically from
// the building id so each asset always lands the same photo, but
// different assets of the same type don't repeat. URLs are Unsplash
// CDN-hosted, free for commercial demo use.
// Each URL was visually vetted (landscape-friendly, on-theme, loads from the
// Unsplash CDN) so any deterministic pick below lands a real-looking cover.
const STOCK_BUILDING_PHOTOS = {
  'Residential': [
    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=900&auto=format&fit=crop&q=70', // Dubai skyline at sunset
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&auto=format&fit=crop&q=70', // warm, plant-filled living room
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=900&auto=format&fit=crop&q=70', // modern apartment balconies
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&auto=format&fit=crop&q=70', // bright apartment interior
  ],
  'Commercial': [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=900&auto=format&fit=crop&q=70', // glass office towers, looking up
    'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=900&auto=format&fit=crop&q=70', // white modern office block
    'https://images.unsplash.com/photo-1554469384-e58fac16e23a?w=900&auto=format&fit=crop&q=70', // blue glass corporate towers
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&auto=format&fit=crop&q=70', // modern office interior
  ],
  'Villa': [
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=900&auto=format&fit=crop&q=70', // modern white villa + pool
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&auto=format&fit=crop&q=70', // modern grey villa + pool
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=900&auto=format&fit=crop&q=70', // villa with pool and lawn
    'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=900&auto=format&fit=crop&q=70', // detached family home
  ],
  'Commercial Land': [
    'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?w=900&auto=format&fit=crop&q=70', // aerial container yard
    'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=900&auto=format&fit=crop&q=70', // aerial logistics depot
    'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=900&auto=format&fit=crop&q=70', // container port terminal
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&auto=format&fit=crop&q=70', // open development land
  ],
};
const pickStockPhoto = (assetId, propertyType) => {
  const pool = STOCK_BUILDING_PHOTOS[propertyType] || STOCK_BUILDING_PHOTOS['Residential'];
  const idx = Math.abs((assetId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % pool.length;
  return pool[idx];
};

// Small per-card photo strip. Lazy-signs a 1h URL the moment the card
// renders; when the asset has no uploaded photo we fall back to a
// curated Unsplash stock photo chosen by property type (see
// STOCK_BUILDING_PHOTOS above) so every card looks like a real photo.
const AssetCardPhoto = ({ storagePath, assetId, typeChipColor, propertyType, name, stockUrl, height = 120 }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let mounted = true;
    if (!storagePath || !supabaseClient) return;
    supabaseClient.storage.from('unit-attachments').createSignedUrl(storagePath, 3600).then(({ data }) => {
      if (mounted && data) setUrl(data.signedUrl);
    });
    return () => { mounted = false; };
  }, [storagePath]);
  // Probe the candidate URL with `new Image()` so we can detect 404 /
  // Unsplash rate-limit failures and fall back to the designed cover
  // instead of showing an empty card (`background:url(...)` swallows
  // load errors silently).
  // `stockUrl` (when given) is a group-deduped pick from the caller so two
  // cards in the same property-type row never share a cover; fall back to the
  // per-asset deterministic pick when no override is supplied.
  const candidateUrl = url || stockUrl || pickStockPhoto(assetId, propertyType);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    if (!candidateUrl) { setImgOk(false); return; }
    setImgOk(true);
    const probe = new Image();
    probe.onload  = () => setImgOk(true);
    probe.onerror = () => setImgOk(false);
    probe.src = candidateUrl;
    return () => { probe.onload = probe.onerror = null; };
  }, [candidateUrl]);
  // 1st pick: real uploaded photo (signed URL from Supabase storage)
  // 2nd pick: a curated Unsplash stock photo by property type — looks
  //            like an actual building rather than a placeholder
  // 3rd pick: the designed initials cover (kept as defensive fallback
  //            if Unsplash is unreachable)
  const effectiveUrl = (candidateUrl && imgOk) ? candidateUrl : null;
  if (effectiveUrl) {
    return (
      <div style={{position:'relative',height,background:'url(' + effectiveUrl + ') center/cover no-repeat',borderBottom:'1px solid var(--border-light)'}}>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom, transparent 50%, rgba(19,31,35,0.30) 100%)'}}/>
        <span style={{position:'absolute',bottom:10,left:10,fontSize:9,letterSpacing:'0.05em',textTransform:'uppercase',color:'#fff',background:typeChipColor,padding:'3px 8px',borderRadius:3,fontWeight:600,whiteSpace:'nowrap'}}>{propertyType}</span>
      </div>
    );
  }
  // ---- Designed fallback cover -----------------------------------------
  // 3-character initials from the asset name + a warm sand gradient that
  // shifts hue deterministically from the building id, so two assets
  // never get the same fallback colour.
  const hue = Math.abs((assetId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  const initials = (name || 'Asset')
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
    .join('');
  // SVG diagonal stripes baked into the background for texture.
  const stripes = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path d="M-20 80 L80 -20 M0 80 L80 0 M20 80 L80 20" stroke="rgba(62,76,89,0.06)" stroke-width="14"/></svg>');
  const bg = 'linear-gradient(135deg, hsl(' + hue + ', 35%, 80%) 0%, hsl(' + ((hue + 25) % 360) + ', 32%, 58%) 100%), url("data:image/svg+xml;utf8,' + stripes + '")';
  return (
    <div style={{position:'relative',height,background:bg,backgroundBlendMode:'multiply',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      {/* Slate VARS badge top-left */}
      <span style={{position:'absolute',top:10,left:10,fontSize:9,letterSpacing:'0.08em',textTransform:'uppercase',color:'#fff',background:'rgba(19,31,35,0.65)',padding:'3px 9px',borderRadius:3,fontWeight:700}}>VARS</span>
      {/* Big initials hugged by a soft outline */}
      <div style={{fontSize:46,fontWeight:700,letterSpacing:'-0.02em',color:'#fff',textShadow:'0 2px 8px rgba(19,31,35,0.25)',lineHeight:1,fontFamily:'"Google Sans Flex","Inter",system-ui,sans-serif'}}>{initials || 'A'}</div>
      {/* Property-type chip bottom-left, on top of the gradient bleed */}
      <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom, transparent 60%, rgba(19,31,35,0.22) 100%)'}}/>
      <span style={{position:'absolute',bottom:10,left:10,fontSize:9,letterSpacing:'0.05em',textTransform:'uppercase',color:'#fff',background:typeChipColor,padding:'3px 8px',borderRadius:3,fontWeight:600,whiteSpace:'nowrap'}}>{propertyType}</span>
    </div>
  );
};

// ===== AttentionDrillModal =====
// Small inline modal that lists the underlying records behind one
// "Needs Your Attention" row so the user can drill straight to the
// offending tenant / lease / vacant building from the Overview. Four
// kinds:
//   overdue   — overdue tenants → opens Assets w/ that building's
//                financial panel pre-opened
//   expiring  — expiring leases → opens Assets w/ that building's
//                financial panel pre-opened (lease list lives there)
//   vacant    — vacant-unit buildings → opens Assets scrolled to the
//                offending asset card
//   srs       — kept for symmetry; in practice SR rows skip the modal
//                and go straight to setPage('service'), but the kind
//                is wired through so we can switch to a modal flow
//                later without restructuring.
// Click outside / × / Esc to close. Body scrolls when the list is long.
const AttentionDrillModal = ({ kind, title, items, onClose, navigate }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const list = items || [];
  // Vacant kind: cascading building + floor dropdowns, then floor-
  // grouped chip grid (same idiom as BuildingDetailModal). All chips
  // are vacant so they share the warm-amber tint.
  const [vacantBuilding, setVacantBuilding] = useState('all');
  const [vacantFloor, setVacantFloor]       = useState('all');
  const vacantBuildings = kind === 'vacant'
    ? Array.from(new Map(list.map(i => [i.building_id, i.building_name])).entries()).sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))
    : [];
  const vacantFloors = kind === 'vacant'
    ? Array.from(new Set(list.filter(i => vacantBuilding === 'all' || i.building_id === vacantBuilding).map(i => i.floor))).sort((a, b) => (a == null) - (b == null) || (Number(a) - Number(b)))
    : [];
  const vacantFiltered = kind === 'vacant'
    ? list.filter(i => (vacantBuilding === 'all' || i.building_id === vacantBuilding) && (vacantFloor === 'all' || i.floor === vacantFloor))
    : list;
  // Per-kind row renderer. Kept inline so the whole modal stays in
  // one place rather than fanning out into more inline components.
  const renderRow = (it, idx) => {
    if (kind === 'overdue') {
      return (
        <>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.resident_name}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.building_name} · {it.unit_number}</div>
          </div>
          <div style={{textAlign:'right',marginRight:12,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:'#8b4a42',whiteSpace:'nowrap'}}>AED {Math.round(it.amount_aed || 0).toLocaleString()}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap'}}>{it.days_late}d late</div>
          </div>
        </>
      );
    }
    if (kind === 'expiring') {
      return (
        <>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.resident_name}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.building_name} · {it.unit_number}</div>
          </div>
          <div style={{textAlign:'right',marginRight:12,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color: it.days_remaining <= 30 ? '#8b4a42' : '#a07d3c',whiteSpace:'nowrap'}}>{it.days_remaining}d left</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap'}}>ends {it.lease_end}</div>
          </div>
        </>
      );
    }
    if (kind === 'vacant') {
      return (
        <>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.unit_number || '—'}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.building_name}{it.floor != null ? ' · Floor ' + it.floor : ''}</div>
          </div>
          <div style={{textAlign:'right',marginRight:12,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,color:'#a07d3c',letterSpacing:'0.04em',textTransform:'uppercase',whiteSpace:'nowrap'}}>Vacant</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap'}}>{it.property_type}</div>
          </div>
        </>
      );
    }
    if (kind === 'srs') {
      return (
        <>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.category || 'Service request'}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.building_name} · {it.unit_number}</div>
          </div>
          <div style={{textAlign:'right',marginRight:12,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,color:'#8b4a42',whiteSpace:'nowrap'}}>{it.priority}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,whiteSpace:'nowrap'}}>{it.status}</div>
          </div>
        </>
      );
    }
    return null;
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{maxWidth:720,width:'92vw',maxHeight:'80vh',display:'flex',flexDirection:'column',padding:0}}
      >
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',zIndex:2,padding:'16px 20px',borderBottom:'1px solid var(--border-light)',display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.01em'}}>{title}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{list.length} {list.length === 1 ? 'item' : 'items'}</div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            style={{background:'transparent',border:'none',cursor:'pointer',fontSize:20,color:'var(--text-muted)',padding:6,lineHeight:1}}
          >×</button>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {kind === 'vacant' ? (
            <div style={{padding:'14px 20px 18px'}}>
              {/* Building + Floor dropdowns */}
              <div style={{display:'flex', gap:10, marginBottom:14, flexWrap:'wrap'}}>
                <div style={{flex:'1 1 200px'}}>
                  <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',fontWeight:600,marginBottom:5,display:'block'}}>Asset</label>
                  <select value={vacantBuilding} onChange={e => { setVacantBuilding(e.target.value); setVacantFloor('all'); }}
                    className="form-input" style={{width:'100%'}}>
                    <option value="all">All assets</option>
                    {vacantBuildings.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}
                  </select>
                </div>
                <div style={{flex:'1 1 140px'}}>
                  <label style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',fontWeight:600,marginBottom:5,display:'block'}}>Floor</label>
                  <select value={vacantFloor} onChange={e => setVacantFloor(e.target.value)} className="form-input" style={{width:'100%'}}>
                    <option value="all">All floors</option>
                    {vacantFloors.map(f => <option key={f == null ? 'none' : f} value={f == null ? '' : f}>{f == null ? '—' : 'Floor ' + f}</option>)}
                  </select>
                </div>
              </div>
              {vacantFiltered.length === 0 ? (
                <div style={{padding:'28px 0',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No vacant units match these filters.</div>
              ) : (() => {
                // Group filtered vacant units by floor for chip display
                const byFloor = {};
                vacantFiltered.forEach(u => {
                  const k = u.floor == null ? 'No floor' : ('Floor ' + u.floor);
                  if (!byFloor[k]) byFloor[k] = [];
                  byFloor[k].push(u);
                });
                const floorKeys = Object.keys(byFloor).sort((a, b) => {
                  const na = parseInt(a.replace('Floor ', ''), 10);
                  const nb = parseInt(b.replace('Floor ', ''), 10);
                  if (isNaN(na)) return 1;
                  if (isNaN(nb)) return -1;
                  return na - nb;
                });
                return floorKeys.map(fk => (
                  <div key={fk} style={{marginBottom:18}}>
                    <div style={{fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight:600, color:'var(--text-secondary)', marginBottom:8}}>
                      {fk}
                      <span style={{fontSize:11, color:'var(--text-muted)', fontWeight:400, marginLeft:8, letterSpacing:0, textTransform:'none'}}>· {byFloor[fk].length} {byFloor[fk].length === 1 ? 'unit' : 'units'}</span>
                    </div>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:6}}>
                      {byFloor[fk].map(u => (
                        <div key={u.id} onClick={() => navigate && navigate(u)}
                          style={{position:'relative', padding:'10px 10px', border:'1px solid #efe1be', borderRadius:6, fontSize:12, fontWeight:600, background:'#fdf5e6', color:'#7a5a1f', textAlign:'center', cursor:'pointer', transition:'background 0.15s, border-color 0.15s'}}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fbeccf'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fdf5e6'; }}
                          title={u.building_name + ' · ' + (u.unit_number || '—') + ' · Vacant'}>
                          <span aria-hidden="true" style={{position:'absolute', top:6, right:6, width:9, height:9, borderRadius:'50%', background:'#a07d3c', boxShadow:'0 0 0 2px #fdf5e6'}}/>
                          {u.unit_number || '—'}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : list.length === 0 ? (
            <div style={{padding:'28px 20px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nothing to show.</div>
          ) : list.map((it, idx) => (
            <div
              key={it.id || it.building_id || idx}
              onClick={() => navigate && navigate(it)}
              style={{display:'flex',alignItems:'center',gap:10,padding:'12px 20px',cursor:'pointer',borderBottom: idx === list.length - 1 ? 'none' : '1px solid var(--border-light)',background:'#fff',transition:'background 0.12s'}}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-warm-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
            >
              {renderRow(it, idx)}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a98a2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PMCOverviewPage = ({ setPage }) => {
  const { selectedProperties = [], timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd } = useApp();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  // Clicking a row in Unit Payment Activity opens the same UnitDetailModal
  // used everywhere else (full invoice list, resident, docs slots).
  const [openedUnit, setOpenedUnit] = useState(null); // { unit, building }
  // When a "Needs Your Attention" row is opened, we show a small drill
  // modal listing the underlying records (overdue tenants, expiring
  // leases, vacant buildings). Set to { kind, items, title } when open.
  const [attentionDrill, setAttentionDrill] = useState(null);
  // Selected period for the financial KPIs and Operating Income card.
  // Lives in AppContext so navigating to Service Charges keeps the choice.
  const monthsBack = ({ '1m': 1, '2m': 2, '3m': 3, '12m': 12 })[timeRange] || 1;

  useEffect(() => {
    let mounted = true;
    setStats(null); setError(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: buildings } = await supabaseClient.from('buildings').select('id,name,address,property_type,purchase_price,current_value,acquired_on');
        // Also pull the denormalised tenant_* fields so the Needs-Attention
        // card can spot vacant units and leases ending soon for non-
        // residential property types.
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number,floor,tenant_name,tenant_lease_end,tenant_monthly_payment_aed');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probe = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];

        const [{ data: ras }, { data: invoices }, { data: srs }, { data: visits }, { data: attsForAttention }, { data: photoAtts }, { data: profiles }] = await Promise.all([
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,lease_end,tenure,monthly_payment_aed').in('unit_id', probe),
          supabaseClient.from('invoices').select('id,amount_aed,status,due_date,unit_id,created_at,resident_profile_id').in('unit_id', probe),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,resolved_at,unit_id,resident_profile_id').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('visits').select('id,visit_date,status,visitor_name,type').in('unit_id', probe),
          // For the 'missing title deed' attention row.
          supabaseClient.from('unit_attachments').select('unit_id,kind').eq('kind', 'title_deed'),
          // First photo per unit so each Asset card can show a thumbnail.
          supabaseClient.from('unit_attachments').select('unit_id,storage_path,created_at').eq('kind', 'photo').order('created_at', { ascending: true }),
          // Resident profiles so the overdue drill modal can resolve
          // human names from invoice.resident_profile_id and
          // resident_assignments.profile_id (instead of a generic
          // "Tenant" placeholder).
          supabaseClient.from('profiles').select('id,full_name').eq('role', 'resident'),
        ]);
        if (!mounted) return;

        const today = new Date().toISOString().slice(0,10);
        const now = new Date();
        // Same rule as Service Charges / UnitDetailModal: split DB-Pending into
        // Upcoming (due >30 days out) vs the actually-outstanding ones.
        const dayMs = 24 * 60 * 60 * 1000;
        const effectiveStatusOf = (i) => {
          if (!i) return 'Pending';
          if (i.status === 'Paid' || i.status === 'Cancelled') return i.status;
          if (!i.due_date) return i.status;
          const due = new Date(i.due_date);
          if (isNaN(due.getTime())) return i.status;
          const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / dayMs);
          if (daysUntilDue < 0)  return 'Overdue';
          if (daysUntilDue > 30) return 'Upcoming';
          return 'Pending';
        };
        // Annotate every invoice once so downstream filters can use it.
        (invoices || []).forEach(i => { i._eff = effectiveStatusOf(i); });
        // Period bounds — depend on the user's time-range pick.
        // For custom mode, fall back to "this month" if either bound is empty
        // so the data still loads sensibly while the user types dates.
        let periodStart, periodEnd;
        if (timeRange === 'custom' && customStart && customEnd) {
          periodStart = customStart;
          periodEnd   = customEnd;
        } else {
          periodStart = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1).toISOString().slice(0,10);
          periodEnd   = today;
        }
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0,10);
        const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0,10);

        // -------- Properties group --------
        // Selected count: if filter is null (user picked nothing), treat as "All buildings".
        const realBuildingsCount = (buildings || []).length;
        const selectedPropsCount = filterB ? filterB.length : realBuildingsCount;
        const totalUnits = filteredUnits.length;
        const occupied = new Set((ras || []).map(r => r.unit_id)).size;
        const occupancyRate = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;
        const lastMonthCollected = (invoices || [])
          .filter(i => i.status === 'Paid' && i.created_at && i.created_at.slice(0,10) >= lastMonthStart && i.created_at.slice(0,10) <= lastMonthEnd)
          .reduce((s, i) => s + Number(i.amount_aed), 0);
        // Only count things that are truly outstanding (Pending due ≤30d + Overdue).
        // Upcoming cheques (>30 days out) are scheduled cash, not outstanding receivables.
        const pendingSCAmount = (invoices || [])
          .filter(i => i._eff === 'Pending' || i._eff === 'Overdue')
          .reduce((s, i) => s + Number(i.amount_aed), 0);
        const upcomingSCAmount = (invoices || [])
          .filter(i => i._eff === 'Upcoming')
          .reduce((s, i) => s + Number(i.amount_aed), 0);

        // -------- Service Requests group --------
        const todaySRs = (srs || []).filter(s => (s.created_at || '').slice(0,10) === today).length;
        const completedToday = (srs || []).filter(s =>
          ['Done','Closed'].includes(s.status) && s.resolved_at && s.resolved_at.slice(0,10) === today
        ).length;
        const pendingRequests = (srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).length;

        // -------- Visitors group --------
        const upcomingVisits = (visits || []).filter(v => v.visit_date > today && v.status === 'Pre-Approved').length;
        const todayVisits = (visits || []).filter(v => v.visit_date === today).length;

        // -------- Service Request Summary (status breakdown bar) --------
        const srStatusCounts = { open: 0, inProgress: 0, scheduled: 0, completed: 0 };
        (srs || []).forEach(s => {
          if (s.status === 'New' || s.status === 'Acknowledged') srStatusCounts.open++;
          else if (s.status === 'In Progress') srStatusCounts.inProgress++;
          else if (s.preferred_date && new Date(s.preferred_date) > new Date()) srStatusCounts.scheduled++;
          else if (s.status === 'Done' || s.status === 'Closed') srStatusCounts.completed++;
          else srStatusCounts.open++;
        });

        // -------- Service Charge Collection (SELECTED PERIOD) --------
        // Three buckets so the card can show Collection / Pending / Outstanding
        // distinctly. periodInvoices honours the user's time-range dropdown.
        const periodInvoices = (invoices || []).filter(i => {
          const d = (i.created_at || '').slice(0,10);
          return d && d >= periodStart && d <= periodEnd;
        });
        const monthBilled = periodInvoices.reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthCollected  = periodInvoices.filter(i => i._eff === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthPending    = periodInvoices.filter(i => i._eff === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthOverdue    = periodInvoices.filter(i => i._eff === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthUpcoming   = periodInvoices.filter(i => i._eff === 'Upcoming').reduce((s, i) => s + Number(i.amount_aed), 0);
        const monthOutstanding = monthPending + monthOverdue;
        const monthCollectionRate = monthBilled > 0 ? Math.round((monthCollected / monthBilled) * 100) : 0;

        // -------- Per-unit payment activity (SELECTED PERIOD) --------
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((buildings || []).map(b => [b.id, b]));
        // Profile lookup → used by residentLabelFor so the overdue
        // attention drill shows real resident names (e.g. "Sofia Conti")
        // instead of a generic "Tenant" placeholder.
        const pMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        const enrich = (u_id, amount, count, oldest_due) => {
          const u = uMap[u_id];
          const b = u && bMap[u.building_id];
          return {
            unit_id: u_id, amount, count, oldest_due,
            unit_number:    u ? u.unit_number : '—',
            floor:          u ? u.floor : null,
            building_name:  b ? b.name : '—',
            building_letter:b ? b.name.slice(0, 1).toUpperCase() : '?',
            // Full unit + building objects so clicking the row can open
            // UnitDetailModal without another round-trip.
            unit:      u || null,
            building:  b || null,
          };
        };

        const paidByUnit = {};
        periodInvoices.filter(i => i.status === 'Paid').forEach(i => {
          if (!paidByUnit[i.unit_id]) paidByUnit[i.unit_id] = { amount: 0, count: 0 };
          paidByUnit[i.unit_id].amount += Number(i.amount_aed);
          paidByUnit[i.unit_id].count++;
        });
        const paidList = Object.entries(paidByUnit)
          .map(([uid, v]) => enrich(uid, v.amount, v.count, null))
          .sort((a, b) => b.amount - a.amount).slice(0, 4);

        const pendingByUnit = {};
        (invoices || []).filter(i => i._eff === 'Pending' || i._eff === 'Overdue').forEach(i => {
          if (!pendingByUnit[i.unit_id]) pendingByUnit[i.unit_id] = { amount: 0, count: 0, oldest_due: null };
          pendingByUnit[i.unit_id].amount += Number(i.amount_aed);
          pendingByUnit[i.unit_id].count++;
          if (!pendingByUnit[i.unit_id].oldest_due || (i.due_date && i.due_date < pendingByUnit[i.unit_id].oldest_due)) {
            pendingByUnit[i.unit_id].oldest_due = i.due_date;
          }
        });
        const pendingList = Object.entries(pendingByUnit)
          .map(([uid, v]) => enrich(uid, v.amount, v.count, v.oldest_due))
          .sort((a, b) => b.amount - a.amount).slice(0, 4);

        // -------- Recent Service Requests (all-status) for the SR section table --------
        const srRecent = (srs || []).slice(0, 10);

        // -------- "Needs your attention" exception list ---------------
        // A ranked watchlist for the landlord — the things they'd want to
        // see first thing on opening the app. Each item carries a
        // severity (red / orange / yellow), a short headline, a detail
        // string, and a `page` route the user can click through to.
        const attention = [];
        const dayMsLocal = 24 * 60 * 60 * 1000;
        const nowLocal = new Date();

        // Overdue invoices = effectiveStatus 'Overdue' (past due AND not paid).
        // We resolve resident_name via the resident_assignments lookup
        // (preferred, since invoices.resident_profile_id is more reliable
        // than the unit's denormalised tenant_name) and fall back to
        // tenant_name on the unit when no assignment is found.
        const raByUnit = {};
        (ras || []).forEach(r => { if (!raByUnit[r.unit_id]) raByUnit[r.unit_id] = r; });
        // Resident-name resolver. Resolution order:
        //   1) invoice.resident_profile_id → profiles.full_name (most
        //      reliable: the invoice itself names the resident).
        //   2) resident_assignments.profile_id → profiles.full_name
        //      (covers units with an assignment but no invoice in scope).
        //   3) unit.tenant_name (commercial occupants live here, e.g.
        //      "Cobalt Engineering Ltd").
        //   4) 'Account' — neutral fallback since the row can be either
        //      a residential tenant or a commercial occupant.
        // If both (1) and (2) resolve to different profiles, the invoice
        // wins because the invoice's resident is the actually-billed
        // party, while the resident_assignments row may lag (e.g. a
        // recent move-in/out).
        const residentLabelFor = (unitId, invoice) => {
          if (invoice && invoice.resident_profile_id && pMap[invoice.resident_profile_id] && pMap[invoice.resident_profile_id].full_name) {
            return pMap[invoice.resident_profile_id].full_name;
          }
          const ra = raByUnit[unitId];
          if (ra && ra.profile_id && pMap[ra.profile_id] && pMap[ra.profile_id].full_name) {
            return pMap[ra.profile_id].full_name;
          }
          const u = uMap[unitId];
          if (u && u.tenant_name) return u.tenant_name;
          return 'Account';
        };
        const overdueInvs = (invoices || []).filter(i => i._eff === 'Overdue');
        if (overdueInvs.length > 0) {
          const overdueTotal = overdueInvs.reduce((s, i) => s + Number(i.amount_aed), 0);
          const overdueUnits = new Set(overdueInvs.map(i => i.unit_id)).size;
          // Worst offender — longest-overdue, biggest-amount.
          const worst = overdueInvs.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
          const wU = uMap[worst.unit_id]; const wB = wU ? bMap[wU.building_id] : null;
          const dayLag = worst.due_date ? Math.max(0, Math.floor((nowLocal - new Date(worst.due_date)) / dayMsLocal)) : 0;
          // Build the per-tenant drill list: one row per unit (not per
          // invoice) so AED is summed and days-late shows the oldest.
          // We also keep one representative invoice per unit so the row
          // can resolve a resident_profile_id → real name.
          const byUnit = {};
          overdueInvs.forEach(i => {
            if (!byUnit[i.unit_id]) byUnit[i.unit_id] = { amount: 0, oldest_due: null, sample_invoice: i };
            byUnit[i.unit_id].amount += Number(i.amount_aed);
            if (!byUnit[i.unit_id].oldest_due || (i.due_date && i.due_date < byUnit[i.unit_id].oldest_due)) {
              byUnit[i.unit_id].oldest_due = i.due_date;
              byUnit[i.unit_id].sample_invoice = i;
            }
            // Prefer an invoice that actually carries a resident_profile_id
            // for label resolution, if the current sample doesn't have one.
            if (!byUnit[i.unit_id].sample_invoice || !byUnit[i.unit_id].sample_invoice.resident_profile_id) {
              if (i.resident_profile_id) byUnit[i.unit_id].sample_invoice = i;
            }
          });
          const overdueItems = Object.entries(byUnit).map(([uid, v]) => {
            const u = uMap[uid]; const b = u ? bMap[u.building_id] : null;
            const daysLate = v.oldest_due ? Math.max(0, Math.floor((nowLocal - new Date(v.oldest_due)) / dayMsLocal)) : 0;
            return {
              id: uid,
              resident_name: residentLabelFor(uid, v.sample_invoice),
              building_id: b ? b.id : null,
              building_name: b ? b.name : '—',
              unit_number: u ? u.unit_number : '—',
              days_late: daysLate,
              amount_aed: v.amount,
            };
          }).sort((a, b) => b.days_late - a.days_late);
          attention.push({
            kind: 'overdue',
            severity: 'red',
            title: overdueUnits + ' account' + (overdueUnits===1?'':'s') + ' overdue · ' + fmt(overdueTotal) + ' at risk',
            detail: 'Worst: ' + (wU ? (wU.unit_number + (wB ? ' · ' + wB.name : '')) : '—') + (dayLag ? ' · ' + dayLag + 'd late' : ''),
            page: 'payment',
            items: overdueItems,
          });
        }

        // High-priority service requests still open.
        const urgentSrs = (srs || []).filter(s => ['New','Acknowledged','In Progress'].includes(s.status) && ['High','Urgent'].includes(s.priority));
        if (urgentSrs.length > 0) {
          const top = urgentSrs[0];
          const tU = uMap[top.unit_id]; const tB = tU ? bMap[tU.building_id] : null;
          attention.push({
            kind: 'srs',
            severity: urgentSrs.some(s => s.priority === 'Urgent') ? 'red' : 'orange',
            title: urgentSrs.length + ' high-priority service request' + (urgentSrs.length===1?'':'s') + ' open',
            detail: 'Latest: ' + (top.category || 'SR') + (tU ? ' · ' + tU.unit_number + (tB ? ' · ' + tB.name : '') : ''),
            page: 'service',
            items: urgentSrs.map(s => {
              const u = uMap[s.unit_id]; const b = u ? bMap[u.building_id] : null;
              return {
                id: s.id,
                category: s.category,
                priority: s.priority,
                status: s.status,
                building_id: b ? b.id : null,
                building_name: b ? b.name : '—',
                unit_number: u ? u.unit_number : '—',
              };
            }),
          });
        }

        // Leases expiring in the next 60 days (residential assignments +
        // non-residential tenant_lease_end). 30 days = orange, ≤30 = red.
        const cutoff60 = new Date(nowLocal.getTime() + 60 * dayMsLocal).toISOString().slice(0, 10);
        const cutoff30 = new Date(nowLocal.getTime() + 30 * dayMsLocal).toISOString().slice(0, 10);
        const today10 = nowLocal.toISOString().slice(0, 10);
        const resLeasesEndingSoon = (ras || []).filter(r => r.lease_end && r.lease_end >= today10 && r.lease_end <= cutoff60 && r.tenure === 'Tenant');
        const tenLeasesEndingSoon = filteredUnits.filter(u => u.tenant_lease_end && u.tenant_lease_end >= today10 && u.tenant_lease_end <= cutoff60);
        const endingSoonCount = resLeasesEndingSoon.length + tenLeasesEndingSoon.length;
        if (endingSoonCount > 0) {
          const within30 = resLeasesEndingSoon.filter(r => r.lease_end <= cutoff30).length
                         + tenLeasesEndingSoon.filter(u => u.tenant_lease_end <= cutoff30).length;
          // Build a unified expiring-lease list (resident + non-residential
          // tenant rows). days_remaining sorts ascending so the most
          // urgent leases land at the top of the drill modal.
          const expiringItems = [
            ...resLeasesEndingSoon.map(r => {
              const u = uMap[r.unit_id]; const b = u ? bMap[u.building_id] : null;
              const daysRemaining = Math.max(0, Math.floor((new Date(r.lease_end) - nowLocal) / dayMsLocal));
              return {
                id: 'ra-' + r.profile_id + '-' + r.unit_id,
                resident_name: residentLabelFor(r.unit_id),
                building_id: b ? b.id : null,
                building_name: b ? b.name : '—',
                unit_number: u ? u.unit_number : '—',
                days_remaining: daysRemaining,
                lease_end: r.lease_end,
              };
            }),
            ...tenLeasesEndingSoon.map(u => {
              const b = bMap[u.building_id];
              const daysRemaining = Math.max(0, Math.floor((new Date(u.tenant_lease_end) - nowLocal) / dayMsLocal));
              return {
                id: 'u-' + u.id,
                resident_name: u.tenant_name || 'Tenant',
                building_id: b ? b.id : null,
                building_name: b ? b.name : '—',
                unit_number: u.unit_number,
                days_remaining: daysRemaining,
                lease_end: u.tenant_lease_end,
              };
            }),
          ].sort((a, b) => a.days_remaining - b.days_remaining);
          attention.push({
            kind: 'expiring',
            severity: within30 > 0 ? 'red' : 'orange',
            title: endingSoonCount + ' lease' + (endingSoonCount===1?'':'s') + ' expiring within 60 days',
            detail: within30 > 0 ? within30 + ' within the next 30 days' : 'All beyond 30 days',
            page: 'reminders',
            items: expiringItems,
          });
        }

        // Vacant units = no resident assignment AND no tenant_name. The
        // landlord usually wants to chase a re-let; calling this out so
        // the gap doesn't sit silently.
        const assignedUnitIds = new Set((ras || []).map(r => r.unit_id));
        const vacantUnits = filteredUnits.filter(u => !assignedUnitIds.has(u.id) && !u.tenant_name);
        if (vacantUnits.length > 0) {
          // Per-unit list so the drill modal can open the matching
          // UnitDetailModal directly when a row is clicked (matches
          // overdue/expiring behaviour). Group/sort by building so
          // related units sit together.
          const vacantItems = vacantUnits.map(u => {
            const b = bMap[u.building_id];
            return {
              id: u.id,
              building_id: u.building_id,
              building_name: b ? b.name : '—',
              property_type: b ? b.property_type : '—',
              unit_number: u.unit_number,
              floor: u.floor,
            };
          }).sort((a, c) => {
            if (a.building_name !== c.building_name) return a.building_name.localeCompare(c.building_name);
            return (a.unit_number || '').localeCompare(c.unit_number || '');
          });
          attention.push({
            kind: 'vacant',
            severity: vacantUnits.length > 5 ? 'orange' : 'yellow',
            title: vacantUnits.length + ' vacant unit' + (vacantUnits.length===1?'':'s'),
            detail: 'Across ' + new Set(vacantUnits.map(u => u.building_id)).size + ' asset(s)',
            page: 'properties',
            items: vacantItems,
          });
        }

        // Missing title deed on at least one unit of an asset. Important
        // for compliance / refinancing — landlords should know.
        const unitsWithDeed = new Set((attsForAttention || []).map(a => a.unit_id));
        const assetsMissingDeed = (buildings || []).filter(b => {
          if (filterB && !filterB.includes(b.id)) return false;
          const bUnits = filteredUnits.filter(u => u.building_id === b.id);
          if (bUnits.length === 0) return false;
          return !bUnits.some(u => unitsWithDeed.has(u.id));
        });
        if (assetsMissingDeed.length > 0) {
          attention.push({
            kind: 'deed',
            severity: 'yellow',
            title: assetsMissingDeed.length + ' asset' + (assetsMissingDeed.length===1?'':'s') + ' missing title deed',
            detail: assetsMissingDeed.slice(0, 2).map(b => b.name).join(', ') + (assetsMissingDeed.length > 2 ? ' +' + (assetsMissingDeed.length - 2) + ' more' : ''),
            page: 'profileCreation',
          });
        }

        const severityRank = { red: 0, orange: 1, yellow: 2 };
        attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

        // -------- Landlord headline: 3 cash-flow stats, range-aware ------
        // Answers in one row: 'what's come in this period · what's late
        // in this period · what's coming due in the next 30 days from
        // invoices issued in this period'. All three tiles now honour the
        // top-bar time-range picker so the eyebrow ("MAY 2026" etc.) ties
        // to every number below, matching Assets → Summary's behaviour.
        const thisMonthInvoices = (invoices || []).filter(i => (i.created_at || '').slice(0, 10) >= thisMonthStart && (i.created_at || '').slice(0, 10) <= today);
        const lastMonthInvoices = (invoices || []).filter(i => (i.created_at || '').slice(0, 10) >= lastMonthStart && (i.created_at || '').slice(0, 10) <= lastMonthEnd);
        const headlineCollected = periodInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
        const headlineOverdue   = periodInvoices.filter(i => i._eff === 'Overdue' || i._eff === 'Pending').reduce((s, i) => s + Number(i.amount_aed), 0);
        const cutoff30Iso = new Date(now.getTime() + 30 * dayMs).toISOString().slice(0, 10);
        const headlineUpcoming  = periodInvoices.filter(i => (i._eff === 'Upcoming' || i._eff === 'Pending') && i.due_date && i.due_date >= today && i.due_date <= cutoff30Iso).reduce((s, i) => s + Number(i.amount_aed), 0);
        // Keep last-month delta computation around for the small caption
        // even though the big progress bar is gone.
        const headlineLastMonth = lastMonthInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);

        // -------- Photo thumbnail per building (first uploaded photo) ----
        // We keep the storage_path here, not a signed URL — the JSX layer
        // creates signed URLs lazily for the assets actually rendered.
        // Auto-generated demo placeholders (the striped "Unit X-101" covers
        // produced by the Document Library bulk-generate sweep) are skipped
        // so those assets fall through to a curated stock cover instead. They
        // are uploaded as `{building}-{unit}-photo.jpg`, so the storage_path
        // always ends with `-photo.jpg`; real uploads keep their own name.
        const isGeneratedPlaceholder = (path) => /-photo\.jpg$/i.test(path || '');
        const photoByBuilding = {};
        for (const a of (photoAtts || [])) {
          if (isGeneratedPlaceholder(a.storage_path)) continue;
          const u = filteredUnits.find(uu => uu.id === a.unit_id);
          if (!u) continue;
          if (!photoByBuilding[u.building_id]) photoByBuilding[u.building_id] = a.storage_path;
        }

        // -------- Per-asset cards ----------------------------------------
        // One card per selected building so the landlord can compare their
        // 5–15 assets side by side without leaving the Overview. Each
        // card shows: occupancy, this-month collected, annualised gross
        // yield (vs purchase_price), and a colour chip flagging
        // overdue / vacant / expiring exceptions.
        const assetCards = (buildings || [])
          .filter(b => !filterB || filterB.includes(b.id))
          .map(b => {
            const bUnits = filteredUnits.filter(u => u.building_id === b.id);
            const bUnitIds = new Set(bUnits.map(u => u.id));
            const bAssigned = (ras || []).filter(r => bUnitIds.has(r.unit_id));
            const bTenantOccupied = bUnits.filter(u => u.tenant_name).length;
            const occupiedCount = bAssigned.length + bTenantOccupied;
            // Period-aware collected. Honours the top-bar time-range so
            // the figure on each card matches the headline above.
            const periodCollected = periodInvoices.filter(i => bUnitIds.has(i.unit_id) && i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
            // Annualised gross yield = (annual rent at target) / purchase_price.
            const annualTarget = bAssigned.reduce((s, r) => s + Number(r.monthly_payment_aed || 0), 0) * 12
                               + bUnits.reduce((s, u) => s + Number(u.tenant_monthly_payment_aed || 0), 0) * 12;
            const yieldPct = b.purchase_price && Number(b.purchase_price) > 0
              ? (annualTarget / Number(b.purchase_price)) * 100
              : null;
            // Counts + amounts for the inline exception chips.
            const overdueCount = (invoices || []).filter(i => bUnitIds.has(i.unit_id) && i._eff === 'Overdue').length;
            const overdueAmount = (invoices || []).filter(i => bUnitIds.has(i.unit_id) && i._eff === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
            const expiringLeasesCount = bAssigned.filter(r => r.lease_end && r.lease_end >= today10 && r.lease_end <= cutoff60).length
                                      + bUnits.filter(u => u.tenant_lease_end && u.tenant_lease_end >= today10 && u.tenant_lease_end <= cutoff60).length;
            const vacantCount = bUnits.length - occupiedCount;
            return {
              id: b.id, name: b.name, property_type: b.property_type, address: b.address,
              purchase_price: b.purchase_price, current_value: b.current_value, acquired_on: b.acquired_on,
              total_units: bUnits.length, occupied_count: occupiedCount, vacant_count: Math.max(0, vacantCount),
              occupancy_pct: bUnits.length > 0 ? Math.round(100 * occupiedCount / bUnits.length) : 0,
              period_collected: periodCollected,
              annual_target: annualTarget,
              yield_pct: yieldPct,
              overdue_count: overdueCount,
              overdue_amount: overdueAmount,
              expiring_leases_count: expiringLeasesCount,
              raw_building: b,
              photo_path: photoByBuilding[b.id] || null,
            };
          })
          .sort((a, b) => (b.yield_pct || 0) - (a.yield_pct || 0));

        setStats({
          // Portfolio Summary KPIs
          selectedPropsCount, totalUnits, occupied, occupancyRate, lastMonthCollected, pendingSCAmount, upcomingSCAmount,
          // Service Requests KPIs
          todaySRs, completedToday, pendingRequests,
          // Visitors KPIs
          upcomingVisits, todayVisits,
          // Financial Summary cards
          monthBilled, monthCollected, monthPending, monthOverdue, monthUpcoming, monthOutstanding, monthCollectionRate,
          paidList, pendingList,
          totalUnitsPaid:    paidList.length    > 0 ? Object.keys(paidByUnit).length    : 0,
          totalUnitsPending: pendingList.length > 0 ? Object.keys(pendingByUnit).length : 0,
          totalArrears:      Object.values(pendingByUnit).reduce((s, a) => s + a.amount, 0),
          // Service Requests table
          srRecent,
          // Landlord watchlist
          attention,
          // Lookups exposed so the attention drill modal can open
          // UnitDetailModal directly (overdue/expiring rows) without
          // bouncing through Assets first.
          uMap, bMap, raByUnit, pMap,
          // Landlord headline + per-asset cards
          headlineCollected, headlineOverdue, headlineUpcoming, headlineLastMonth,
          assetCards,
        });
      } catch (e) {
        if (mounted) setError(String(e.message || e));
      }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(','), timeRange, customStart, customEnd]);

  const fmt = (n) => 'AED ' + Math.round(n).toLocaleString();

  // Dynamic current-month label, e.g. "May 2026". Auto-updates when the
  // calendar month changes — the user explicitly asked for this.
  const monthLabel = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  // Human label for the selected time-range dropdown (used in KPI captions + card title).
  const periodLabel = timeRange === 'custom'
    ? (customStart && customEnd ? customStart + ' → ' + customEnd : monthLabel)
    : timeRange === '1m'
      ? monthLabel
      : 'Last ' + monthsBack + ' Months';

  // Explicit "1 May – 28 May 2026" range — shows the actual start and end
  // days the KPIs below were filtered against. Sits as a subtitle just
  // under the Overview title so the user always sees the bounds.
  const explicitRange = (() => {
    const fmtDay = (d, withYear) => {
      const day  = d.getDate();
      const mon  = d.toLocaleString('en-GB', { month: 'long' });
      return withYear ? (day + ' ' + mon + ' ' + d.getFullYear()) : (day + ' ' + mon);
    };
    let start, end;
    if (timeRange === 'custom') {
      if (!customStart || !customEnd) return 'Pick start and end dates';
      start = new Date(customStart);
      end   = new Date(customEnd);
    } else {
      const _now = new Date();
      start = new Date(_now.getFullYear(), _now.getMonth() - monthsBack + 1, 1);
      end   = _now;
    }
    const sameYear = start.getFullYear() === end.getFullYear();
    return fmtDay(start, !sameYear) + ' – ' + fmtDay(end, true);
  })();

  if (error) return (<div><div className="page-header"><h1>Overview</h1></div><div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div></div>);

  const statusBadge = (s) => {
    const c = ({
      'New':         { bg: '#E6EAE9', fg: '#61707D' },
      'Acknowledged':{ bg: '#E6EAE9', fg: '#4a4540' },
      'In Progress': { bg: '#a07d3c', fg: '#fff' },
      'Done':        { bg: '#e6efe1', fg: '#5a6b4f' },
      'Closed':      { bg: '#ccc8c1', fg: '#4a4540' },
      'Rejected':    { bg: '#fdf2f1', fg: '#8b4a42' },
    })[s] || { bg: '#E6EAE9', fg: '#888' };
    return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{s}</span>;
  };

  const daysOverdue = (d) => {
    if (!d) return 0;
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Eyebrow style shared across the KPI sub-group headers
  const groupEyebrow = { fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-secondary)', fontWeight:600, margin:'20px 0 12px' };

  // KPI card — entire surface clickable. We dropped the redundant
  // "View details →" link below the value; the hover lift now carries
  // the "I'm interactive" signal instead.
  const KpiCard = ({ label, value, color, page }) => (
    <div
      className="kpi-card"
      style={{cursor:'pointer'}}
      onClick={() => setPage && setPage(page)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
    >
      <div className="label">{label}</div>
      <div className="value" style={color ? {color} : undefined}>{value}</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <div style={{marginTop:6,fontSize:14,color:'var(--text-secondary)',fontWeight:500,letterSpacing:'-0.01em'}}>
            {explicitRange}
          </div>
        </div>
        <TimeRangePicker/>
      </div>

      {!stats ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : (<>
        {/* ============ HEADLINE — three cash-flow stats, range-aware ===== */}
        {(() => {
          // Caption reflects the user's time-range pick so 'collected'
          // means the same thing as the period the rest of the page is
          // showing. The other two stats are a snapshot of the now.
          const rangeLabel = timeRange === 'custom' && customStart && customEnd
            ? customStart + ' → ' + customEnd
            : timeRange === '1m' ? new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })
            : 'Last ' + monthsBack + ' months';
          // Hero tiles are now clickable — all three land on Assets →
          // Summary, where the portfolio breakdown lives (KPIs, revenue
          // by type, top contributors, main outstanding invoices). The
          // sessionStorage flag tells the Assets page which tab to open.
          const navToSummary = () => {
            try { sessionStorage.setItem('vars:scroll-to-asset-type', 'Summary'); } catch (_) {}
            if (setPage) setPage('properties');
          };
          const Stat = ({ label, value, color, sub, onClick }) => (
            <div onClick={onClick}
              title={onClick ? 'View the portfolio breakdown in Assets → Summary' : ''}
              style={{flex:'1 1 200px', minWidth:180, padding:'2px 4px', borderRadius:8, cursor: onClick ? 'pointer' : 'default', transition:'background 0.15s, transform 0.15s'}}
              onMouseEnter={e => { if (onClick) { e.currentTarget.style.background = 'rgba(122,90,31,0.06)'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:6}}>{label}</div>
              <div style={{fontSize:30,fontWeight:600,letterSpacing:'-0.02em',color:color || 'var(--text-dark)',lineHeight:1}}>{value}</div>
              {sub && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>{sub}</div>}
            </div>
          );
          return (
            <div className="card" style={{padding:'22px 26px',marginBottom:16,background:'linear-gradient(135deg, #fff 0%, #faf7f0 100%)'}}>
              <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:14}}>
                {rangeLabel}
              </div>
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                <Stat label="Collected"           value={fmt(stats.headlineCollected)} color="#5a6b4f"
                      sub={'For the selected period · last month ' + fmt(stats.headlineLastMonth)}
                      onClick={navToSummary}/>
                <Stat label="Overdue"             value={fmt(stats.headlineOverdue)}  color="#8b4a42"
                      sub="Past due, in the selected period"
                      onClick={navToSummary}/>
                <Stat label="Upcoming · 30 days"  value={fmt(stats.headlineUpcoming)} color="#a07d3c"
                      sub="Due within 30 days, in the selected period"
                      onClick={navToSummary}/>
              </div>
            </div>
          );
        })()}

        {/* ============ NEEDS YOUR ATTENTION ============ */}
        {(() => {
          const items = stats.attention || [];
          const tones = {
            red:    { dot:'#8b4a42', label:'Urgent',     bg:'#fdf2f1', border:'#f0d9d6' },
            orange: { dot:'#a07d3c', label:'Soon',       bg:'#fdf5e6', border:'#efe1be' },
            yellow: { dot:'#7a5a1f', label:'Heads up',   bg:'#fbf6e9', border:'#ebe1c1' },
          };
          return (
            <>
              <div style={groupEyebrow}>Needs Your Attention</div>
              {items.length === 0 ? (
                <div className="card" style={{padding:'18px 22px',display:'flex',alignItems:'center',gap:12,background:'#e6efe1',border:'1px solid #c8d4be',marginBottom:0}}>
                  <span style={{fontSize:18,color:'#5a6b4f'}}>✓</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:'#5a6b4f'}}>All caught up.</div>
                    <div style={{fontSize:12,color:'#6f7d65',marginTop:2}}>Nothing requires your attention right now across the selected assets.</div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{padding:0,marginBottom:0,overflow:'hidden'}}>
                  {items.map((it, idx) => {
                    const t = tones[it.severity] || tones.yellow;
                    // Row-specific behaviour. SR rows skip the drill
                    // modal entirely and go straight to the SR page
                    // pre-filtered to high-priority + open; the other
                    // kinds (overdue / expiring / vacant) open the
                    // AttentionDrillModal so the user can pick a
                    // specific tenant/lease/building.
                    const openRow = () => {
                      if (it.kind === 'srs') {
                        // TODO(consumer): pmc-service-requests.js should
                        // read 'vars:sr-prefilter' on mount and apply
                        // the priority + status filters from it.
                        // 'highPriorityOpen' = priority IN (High, Urgent) AND
                        // status IN (New, Acknowledged, In Progress) — matches
                        // the count shown on this attention row exactly.
                        // (Single-value filter dropdowns can't express the
                        // compound query, so we pass a named preset and let
                        // the SR page apply the right semantics.)
                        try { sessionStorage.setItem('vars:sr-prefilter', JSON.stringify({ preset: 'highPriorityOpen' })); } catch (_) {}
                        if (setPage) setPage('service');
                        return;
                      }
                      if (it.kind === 'deed') {
                        if (setPage) setPage(it.page || 'profileCreation');
                        return;
                      }
                      if (it.kind === 'overdue' || it.kind === 'expiring' || it.kind === 'vacant') {
                        setAttentionDrill({ kind: it.kind, items: it.items || [], title: it.title });
                        return;
                      }
                      // Default fallback: route by the item's `page`.
                      if (setPage && it.page) setPage(it.page);
                    };
                    return (
                      <div key={idx}
                        onClick={openRow}
                        title={it.kind === 'srs' ? 'Open Service Requests filtered to high-priority' : 'Drill into the underlying records'}
                        style={{display:'flex',alignItems:'center',gap:14,padding:'14px 20px',cursor:'pointer',background:'#fff',borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--border-light)',transition:'background 0.12s'}}
                        onMouseEnter={e => { e.currentTarget.style.background = t.bg; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                        <span style={{width:10,height:10,borderRadius:'50%',background:t.dot,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{it.title}</div>
                          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>{it.detail}</div>
                        </div>
                        <span style={{fontSize:10,letterSpacing:'0.05em',textTransform:'uppercase',color:t.dot,fontWeight:700,whiteSpace:'nowrap'}}>{t.label}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a98a2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* ============ YOUR PORTFOLIO — per-asset cards, grouped by type ============ */}
        {(() => {
          const cards = stats.assetCards || [];
          if (cards.length === 0) return null;
          const typeChip = { 'Residential':'#5a6b4f', 'Commercial':'#3E4C59', 'Villa':'#a07d3c', 'Commercial Land':'#61707D' };
          // Section order + display label per property type. Matches the
          // Database / Assets page so the user gets a consistent mental
          // model across the app.
          const TYPE_ORDER = ['Residential', 'Commercial', 'Villa', 'Commercial Land'];
          const TYPE_LABEL = {
            'Residential': 'Residential',
            'Commercial': 'Commercial buildings',
            'Villa': 'Villas',
            'Commercial Land': 'Lands',
          };
          const byType = {};
          TYPE_ORDER.forEach(t => { byType[t] = []; });
          cards.forEach(c => {
            const t = TYPE_ORDER.includes(c.property_type) ? c.property_type : 'Residential';
            byType[t].push(c);
          });
          // Highest-yield in green, lowest in red so the eye finds the
          // underperformer instantly. Threshold based on portfolio median.
          const yieldsSorted = cards.map(c => c.yield_pct).filter(v => v != null).sort((a, b) => a - b);
          const median = yieldsSorted.length > 0 ? yieldsSorted[Math.floor(yieldsSorted.length / 2)] : 0;
          const yieldTone = (y) => y == null ? 'var(--text-muted)' : y >= median + 0.5 ? '#5a6b4f' : y <= median - 0.5 ? '#8b4a42' : 'var(--text-dark)';
          return (
            <>
              <div style={{...groupEyebrow,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span>Your Portfolio</span>
                <span style={{fontSize:11,letterSpacing:0,textTransform:'none',color:'var(--text-muted)',fontWeight:400}}>{cards.length} asset{cards.length===1?'':'s'} · grouped by type</span>
              </div>
              {TYPE_ORDER.map(type => {
                const list = byType[type] || [];
                if (list.length === 0) return null;
                // Sort highest yield first within each section.
                list.sort((a, b) => (b.yield_pct || 0) - (a.yield_pct || 0));
                return (
                  <div key={type} style={{marginBottom:18}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:10,paddingBottom:6,borderBottom:'1px solid var(--border-light)'}}>
                      <span style={{fontSize:14,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-dark)'}}>{TYPE_LABEL[type]}</span>
                      <span style={{fontSize:11,color:'var(--text-muted)'}}>· {list.length} asset{list.length===1?'':'s'}</span>
                    </div>
                    {/* Period-aware label so the figure on every card matches
                        the time-range pick at the top of the page. */}
                    {(() => null)()}
                    {/* Group-deduped stock covers: assets without a real photo
                        get a curated cover, walking the pool from their
                        deterministic pick to the first one not already used in
                        this row — so two side-by-side cards never repeat. */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))',gap:14}}>
                      {(() => {
                        const usedStock = new Set();
                        const stockFor = {};
                        for (const c of list) {
                          if (c.photo_path) continue; // real photo wins
                          const pool = STOCK_BUILDING_PHOTOS[c.property_type] || STOCK_BUILDING_PHOTOS['Residential'];
                          let idx = Math.abs((c.id || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)) % pool.length;
                          for (let k = 0; k < pool.length && usedStock.has(pool[idx]); k++) idx = (idx + 1) % pool.length;
                          stockFor[c.id] = pool[idx];
                          usedStock.add(pool[idx]);
                        }
                        return list.map(c => {
                        // Per-property-type vocab for the vacant chip — landlords
                        // want to read 'vacant flats' on a residential card, not
                        // 'vacant units'.
                        const vacantWord = ({ 'Residential':'flats', 'Commercial':'offices', 'Villa':'villas', 'Commercial Land':'plots' })[c.property_type] || 'units';
                        const periodCollectedLabel = timeRange === 'custom' && customStart && customEnd
                          ? customStart + ' → ' + customEnd
                          : timeRange === '1m' ? new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })
                          : 'Last ' + monthsBack + ' months';
                        const chips = [];
                        // Always show occupancy so the user sees how full the
                        // asset is at a glance.
                        chips.push({ label: c.occupancy_pct + '% occupied', color:'#5a6b4f' });
                        if (c.overdue_count > 0) chips.push({ label: c.overdue_count + ' overdue · AED ' + Math.round(c.overdue_amount || 0).toLocaleString(), color:'#8b4a42' });
                        if (c.vacant_count > 0)  chips.push({ label: c.vacant_count  + ' vacant ' + vacantWord,  color:'#a07d3c' });
                        if (c.expiring_leases_count > 0) chips.push({ label: c.expiring_leases_count + ' lease end', color:'#7a5a1f' });
                        return (
                          <div key={c.id}
                            onClick={() => { try { sessionStorage.setItem('vars:scroll-to-asset', c.id); sessionStorage.setItem('vars:scroll-to-asset-type', c.property_type || 'Residential'); } catch (_) {} if (setPage) setPage('properties'); }}
                            style={{background:'#fff',border:'1px solid var(--border-light)',borderRadius:10,padding:0,cursor: setPage ? 'pointer' : 'default',transition:'box-shadow 0.15s, transform 0.15s',display:'flex',flexDirection:'column',overflow:'hidden'}}
                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(19,31,35,0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                            title="Open this asset on the Assets page">
                            {/* Photo strip — fallback to a deterministic colour-block when none uploaded */}
                            <AssetCardPhoto storagePath={c.photo_path} assetId={c.id} typeChipColor={typeChip[c.property_type] || '#61707D'} propertyType={c.property_type} name={c.name} stockUrl={stockFor[c.id]}/>
                            <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
                              {/* Name + address */}
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:15,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-dark)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.address || '—'}</div>
                              </div>
                              {/* Period-aware collected — the one number that matters,
                                  and it always matches the time-range pick. */}
                              <div style={{paddingTop:10,borderTop:'1px solid var(--border-light)'}}>
                                <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Collected · {periodCollectedLabel}</div>
                                <div style={{fontSize:22,fontWeight:600,color:'#5a6b4f',letterSpacing:'-0.015em',lineHeight:1}}>{fmt(c.period_collected)}</div>
                              </div>
                              {/* Status chips: occupancy + exceptions */}
                              {chips.length > 0 && (
                                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                  {chips.map((iss, i) => (
                                    <span key={i} style={{fontSize:10,fontWeight:600,letterSpacing:'0.03em',textTransform:'uppercase',color:iss.color,background:'rgba(0,0,0,0.04)',padding:'3px 8px',borderRadius:3}}>{iss.label}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                        });
                      })()}
                    </div>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Overview ends after Your Portfolio per landlord product
            direction — Portfolio Summary / Financial Summary / Unit
            Payment Activity / Service Requests / Visitors all live on
            their own dedicated pages now. */}
      </>)}
      {openedUnit && (
        <UnitDetailModal
          unit={openedUnit.unit}
          building={openedUnit.building}
          onClose={() => setOpenedUnit(null)}
        />
      )}
      {attentionDrill && (
        <AttentionDrillModal
          kind={attentionDrill.kind}
          title={attentionDrill.title}
          items={attentionDrill.items}
          onClose={() => setAttentionDrill(null)}
          navigate={(it) => {
            // Drill straight into UnitDetailModal for any per-unit row
            // (overdue / expiring / vacant — all item shapes carry an
            // `id` equal to the unit_id). The Assets page is no longer
            // a required hop — the user sees the unit + resident +
            // financial activity right here. Look the unit + building
            // up via the maps we stashed on stats so we don't need a
            // separate fetch.
            const kindL = attentionDrill.kind;
            const unitMap = stats && stats.uMap;
            const buildingMap = stats && stats.bMap;
            if ((kindL === 'overdue' || kindL === 'expiring' || kindL === 'vacant')
                && it && it.id && unitMap && buildingMap) {
              const u = unitMap[it.id];
              const b = u ? buildingMap[u.building_id] : null;
              if (u && b) {
                setAttentionDrill(null);
                setOpenedUnit({ unit: u, building: b });
                return;
              }
            }
            // Defensive fallback — if we can't resolve the unit (stale
            // data, race), fall through to the old Assets hop.
            try {
              if (it && it.building_id) {
                sessionStorage.setItem('vars:scroll-to-asset', it.building_id);
              }
            } catch (_) {}
            setAttentionDrill(null);
            if (setPage) setPage('properties');
          }}
        />
      )}
    </div>
  );
};

