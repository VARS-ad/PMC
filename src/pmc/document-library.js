// ==================== DOCUMENT LIBRARY ====================
// Single page that surfaces every attachment in the system grouped by
// Building → Unit → Type (Title deed / Photo / Layout / Other). PMC
// can also bulk-generate placeholder title-deed PDFs and unit photos
// from this page, with all files uploaded to the existing
// `unit-attachments` Supabase storage bucket and linked through the
// public.unit_attachments table.

const DocumentLibrary_BUCKET = 'unit-attachments';

// ---- Client-side title-deed PDF -------------------------------------------
// Generates a single-page A4 PDF that LOOKS like a UAE-style asset title
// deed: header band, asset block, owner block, plot details, an issuing
// authority footer, and a faint diagonal "DEMO" watermark so nobody
// mistakes it for a real legal document.
async function generateTitleDeedPdf({ building, units }) {
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) throw new Error('PDF library not loaded');
  const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Background sand band
  doc.setFillColor(244, 238, 228); doc.rect(0, 0, W, 110, 'F');
  doc.setFillColor(62, 76, 89);    doc.rect(0, 90, W, 4, 'F');

  // Title band text
  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.text('TITLE DEED', 48, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(97, 112, 125);
  doc.text('UAE Property Registry · Demo Issuance', 48, 76);

  // Right-side metadata
  doc.setTextColor(19, 31, 35);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Deed No.', W - 200, 46);
  doc.text('Issued',   W - 200, 64);
  doc.text('Folio',    W - 200, 82);
  doc.setFont('helvetica', 'normal');
  doc.text('TD-' + (building.name || '').replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase() + '-' + (new Date().getFullYear()), W - 140, 46);
  doc.text(new Date().toISOString().slice(0, 10), W - 140, 64);
  doc.text(String(Math.abs(((building.id || '').split('-')[0] || '').slice(0, 6) || '000000')), W - 140, 82);

  // ----- Section: Asset -----
  let y = 150;
  const sectionTitle = (label) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setTextColor(97, 112, 125);
    doc.text(label.toUpperCase(), 48, y);
    doc.setDrawColor(230, 234, 233); doc.line(48, y + 6, W - 48, y + 6);
    y += 26;
    doc.setTextColor(19, 31, 35);
  };
  const row = (label, value) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.setTextColor(97, 112, 125);
    doc.text(label, 48, y);
    doc.setTextColor(19, 31, 35);
    doc.setFont('helvetica', 'bold');
    const wrapped = doc.splitTextToSize(String(value == null || value === '' ? '—' : value), W - 220);
    doc.text(wrapped, 220, y);
    y += 12 * wrapped.length + 6;
  };

  sectionTitle('Asset');
  row('Name',          building.name);
  row('Type',          building.property_type);
  row('Address',       building.address);
  row('Plot area',     building.plot_area_sqft ? Number(building.plot_area_sqft).toLocaleString() + ' sqft' : null);
  row('GLA',           building.gross_leasable_area_sqft ? Number(building.gross_leasable_area_sqft).toLocaleString() + ' sqft' : null);
  row('Units / floors', (units && units.length ? units.length : (building.villa_count || '—')));

  // ----- Section: Registered Owner (use first non-empty owner_name across units) -----
  const firstOwner = (units || []).find(u => u.owner_name);
  if (firstOwner) {
    y += 8;
    sectionTitle('Registered Owner');
    row('Name',         firstOwner.owner_name);
    row('Phone',        firstOwner.owner_phone);
    row('Email',        firstOwner.owner_email);
    row('Passport',     firstOwner.owner_passport_number);
    row('Emirates ID',  firstOwner.owner_emirates_id);
    row('Purchase date', firstOwner.purchase_date);
  }

  // ----- Footer -----
  doc.setDrawColor(62, 76, 89);
  doc.line(48, H - 96, W - 48, H - 96);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(97, 112, 125);
  doc.text('Issued for: VARS Property Manager · Demo Workspace', 48, H - 76);
  doc.text('This deed is generated for demonstration purposes and carries no legal weight.', 48, H - 60);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(19, 31, 35);
  doc.text('Signature: __________________________', 48, H - 32);

  // Watermark
  doc.setTextColor(220, 220, 220);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(80);
  doc.text('DEMO', W / 2 - 90, H / 2 + 30, { angle: 25 });

  return doc.output('blob');
}

// ---- Client-side placeholder unit photo ----------------------------------
// Draws a 1200x800 canvas with a soft warm-grey background, an asset
// title, and a unit-number label centred. Exports as JPEG so file sizes
// stay manageable across hundreds of units.
async function generateUnitPhotoBlob({ building, unit }) {
  return new Promise((resolve) => {
    const W = 1200, H = 800;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    // Soft gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#f4eee4');
    grad.addColorStop(1, '#dbc5ae');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Decorative diagonal stripes
    ctx.fillStyle = 'rgba(62,76,89,0.06)';
    for (let i = -H; i < W; i += 80) {
      ctx.fillRect(i, 0, 40, H);
    }
    // Slate badge
    ctx.fillStyle = '#3E4C59';
    ctx.fillRect(80, 80, 200, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
    ctx.fillText('VARS · DEMO', 100, 118);
    // Main title (building)
    ctx.fillStyle = '#131F23';
    ctx.font = 'bold 64px Helvetica, Arial, sans-serif';
    ctx.fillText(building.name || 'Asset', 80, H / 2 - 40);
    // Unit chip
    ctx.fillStyle = '#fff';
    ctx.fillRect(80, H / 2 + 10, 360, 80);
    ctx.strokeStyle = '#3E4C59'; ctx.lineWidth = 2;
    ctx.strokeRect(80, H / 2 + 10, 360, 80);
    ctx.fillStyle = '#131F23';
    ctx.font = 'bold 44px Helvetica, Arial, sans-serif';
    ctx.fillText('Unit ' + (unit.unit_number || '—'), 100, H / 2 + 64);
    // Floor caption
    ctx.fillStyle = '#61707D';
    ctx.font = '24px Helvetica, Arial, sans-serif';
    ctx.fillText('Floor ' + (unit.floor != null ? unit.floor : '—'), 80, H / 2 + 130);
    // Property-type tag bottom-right
    ctx.fillStyle = 'rgba(62,76,89,0.85)';
    ctx.fillRect(W - 340, H - 100, 260, 60);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
    ctx.fillText((building.property_type || 'Asset').toUpperCase(), W - 320, H - 60);
    canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85);
  });
}

const DocumentLibraryPage = () => {
  const { selectedProperties } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [expanded, setExpanded] = useState({});      // { [buildingId]: bool }
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState('all');
  const [genStatus, setGenStatus] = useState(null);  // { phase, current, total }
  const [signedUrls, setSignedUrls] = useState({}); // attachmentId -> url

  const reload = async () => {
    setLoading(true); setError(null);
    if (!supabaseClient) { setError('Supabase not initialised'); setLoading(false); return; }
    try {
      const [{ data: bs }, { data: us }, { data: atts }] = await Promise.all([
        supabaseClient.from('buildings').select('id,name,address,property_type,plot_area_sqft,gross_leasable_area_sqft,villa_count').order('name'),
        supabaseClient.from('units').select('id,building_id,unit_number,floor,owner_name,owner_phone,owner_email,owner_passport_number,owner_emirates_id,purchase_date').order('unit_number'),
        supabaseClient.from('unit_attachments').select('id,unit_id,kind,filename,storage_path,created_at').order('created_at', { ascending: false }),
      ]);
      setBuildings(bs || []);
      setUnits(us || []);
      setAttachments(atts || []);
    } catch (e) {
      setError(String(e.message || e));
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  // --- Open a file: lazy signed-URL ------------------------------------
  const openAttachment = async (att) => {
    let url = signedUrls[att.id];
    if (!url) {
      const { data, error: e } = await supabaseClient.storage.from(DocumentLibrary_BUCKET).createSignedUrl(att.storage_path, 600);
      if (e) { alert('Could not open: ' + e.message); return; }
      url = data.signedUrl;
      setSignedUrls(prev => ({ ...prev, [att.id]: url }));
    }
    window.open(url, '_blank', 'noopener');
  };

  // --- Bulk generators --------------------------------------------------
  // Title deeds: one PDF per BUILDING attached to the building's first
  // unit (the schema only has unit_attachments — we mirror the existing
  // 'title_deed' kind so the unit modal also surfaces it). Skip a
  // building if it already has at least one title deed across its units.
  const bulkGenerateTitleDeeds = async () => {
    if (!buildings.length) return;
    setGenStatus({ phase: 'Generating title deeds…', current: 0, total: buildings.length });
    let done = 0, skipped = 0, errors = 0;
    for (const b of buildings) {
      const buildingUnits = units.filter(u => u.building_id === b.id);
      const target = buildingUnits[0];
      if (!target) { skipped++; done++; setGenStatus({ phase: 'Generating title deeds…', current: done, total: buildings.length }); continue; }
      const alreadyHas = attachments.some(a => a.kind === 'title_deed' && buildingUnits.some(u => u.id === a.unit_id));
      if (alreadyHas) { skipped++; done++; setGenStatus({ phase: b.name + ' · already has a title deed (skipped)', current: done, total: buildings.length }); continue; }
      try {
        setGenStatus({ phase: 'Drawing ' + b.name + '…', current: done, total: buildings.length });
        const blob = await generateTitleDeedPdf({ building: b, units: buildingUnits });
        const safeBuilding = (b.name || 'asset').replace(/[^A-Za-z0-9._-]/g, '_');
        const filename = 'title-deed-' + safeBuilding + '.pdf';
        const path = target.id + '/title_deed-' + Date.now() + '-' + filename;
        const { error: upErr } = await supabaseClient.storage.from(DocumentLibrary_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabaseClient.from('unit_attachments').insert({
          unit_id: target.id, kind: 'title_deed', filename, storage_path: path,
        });
        if (insErr) throw insErr;
        done++;
        setGenStatus({ phase: 'Uploaded title deed for ' + b.name, current: done, total: buildings.length });
      } catch (e) {
        errors++; done++;
        console.error('Title deed for ' + b.name + ' failed:', e);
      }
    }
    setGenStatus({ phase: 'Done · ' + (done - skipped - errors) + ' generated, ' + skipped + ' skipped, ' + errors + ' failed', current: done, total: buildings.length });
    setTimeout(() => setGenStatus(null), 2500);
    await reload();
  };

  // Placeholder photos: one PNG per UNIT that doesn't already have a
  // photo attachment. Capped at 60 generations per click so a large
  // portfolio doesn't bury Supabase storage in a single batch — clicking
  // again continues from the next batch.
  const bulkGenerateUnitPhotos = async () => {
    const todoUnits = units.filter(u => !attachments.some(a => a.kind === 'photo' && a.unit_id === u.id));
    const batch = todoUnits.slice(0, 60);
    if (batch.length === 0) { setGenStatus({ phase: 'Every unit already has a photo.', current: 0, total: 0 }); setTimeout(() => setGenStatus(null), 2000); return; }
    setGenStatus({ phase: 'Generating placeholder photos…', current: 0, total: batch.length });
    let done = 0, errors = 0;
    for (const u of batch) {
      const b = buildings.find(bb => bb.id === u.building_id);
      if (!b) { done++; continue; }
      try {
        setGenStatus({ phase: 'Rendering ' + b.name + ' · ' + u.unit_number, current: done, total: batch.length });
        const blob = await generateUnitPhotoBlob({ building: b, unit: u });
        const filename = 'photo-' + (u.unit_number || u.id).replace(/[^A-Za-z0-9._-]/g, '_') + '.jpg';
        const path = u.id + '/photo-' + Date.now() + '-' + filename;
        const { error: upErr } = await supabaseClient.storage.from(DocumentLibrary_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabaseClient.from('unit_attachments').insert({
          unit_id: u.id, kind: 'photo', filename, storage_path: path,
        });
        if (insErr) throw insErr;
        done++;
      } catch (e) {
        errors++; done++;
        console.error('Photo for ' + u.unit_number + ' failed:', e);
      }
      setGenStatus({ phase: 'Uploaded ' + done + ' / ' + batch.length, current: done, total: batch.length });
    }
    setGenStatus({ phase: 'Done · ' + (done - errors) + ' uploaded, ' + errors + ' failed' + (todoUnits.length > batch.length ? ' · ' + (todoUnits.length - batch.length) + ' more pending (click again)' : ''), current: done, total: batch.length });
    setTimeout(() => setGenStatus(null), 3500);
    await reload();
  };

  if (loading) {
    return (<div className="page-padding"><h1>Documents</h1><div className="card"><div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>Loading library…</div></div></div>);
  }
  if (error) {
    return (<div className="page-padding"><h1>Documents</h1><div className="card"><div style={{padding:24,color:'#8b4a42',fontSize:13}}>Error: {error}</div></div></div>);
  }

  // ---- Group + filter -------------------------------------------------
  const buildingFilterIds = new Set(selectedProperties || []);
  const visibleBuildings = buildings.filter(b => buildingFilterIds.size === 0 || buildingFilterIds.has(b.id));
  const unitsByBuilding = {};
  for (const u of units) (unitsByBuilding[u.building_id] = unitsByBuilding[u.building_id] || []).push(u);
  const attsByUnit = {};
  for (const a of attachments) (attsByUnit[a.unit_id] = attsByUnit[a.unit_id] || []).push(a);

  const lowerSearch = search.trim().toLowerCase();
  const kindLabel = { photo: 'Photo', title_deed: 'Title deed', layout: 'Layout', other: 'Other' };
  const kindColor = { photo: '#5a6b4f', title_deed: '#3E4C59', layout: '#a07d3c', other: '#61707D' };

  // ---- Stats ---------------------------------------------------------
  const visibleAtts = attachments.filter(a => {
    const u = units.find(x => x.id === a.unit_id);
    if (!u) return false;
    if (buildingFilterIds.size && !buildingFilterIds.has(u.building_id)) return false;
    if (filterKind !== 'all' && a.kind !== filterKind) return false;
    if (lowerSearch) {
      const b = buildings.find(x => x.id === u.building_id);
      const hay = (a.filename + ' ' + (u.unit_number || '') + ' ' + (b ? b.name : '')).toLowerCase();
      if (!hay.includes(lowerSearch)) return false;
    }
    return true;
  });
  const stats = {
    total: visibleAtts.length,
    photo: visibleAtts.filter(a => a.kind === 'photo').length,
    title_deed: visibleAtts.filter(a => a.kind === 'title_deed').length,
    layout: visibleAtts.filter(a => a.kind === 'layout').length,
    other: visibleAtts.filter(a => a.kind === 'other').length,
  };

  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); } catch (_) { return s; } };
  const kpiBox = { background:'#fff', border:'1px solid var(--border-light)', borderRadius:8, padding:'14px 16px', display:'flex', flexDirection:'column', gap:4 };

  return (
    <div className="page-padding">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:8,flexWrap:'wrap',gap:14}}>
        <div>
          <h1 style={{margin:0}}>Documents</h1>
          <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>Every attachment in the system, grouped by asset. Generate title deeds and unit photos in bulk.</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" onClick={bulkGenerateUnitPhotos} disabled={!!genStatus}>Generate placeholder photos</button>
          <button className="btn btn-primary" onClick={bulkGenerateTitleDeeds} disabled={!!genStatus}>Generate title deeds</button>
        </div>
      </div>

      {genStatus && (
        <div style={{margin:'8px 0 18px',padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:8}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-secondary)',marginBottom:6}}>
            <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{genStatus.phase}</span>
            {genStatus.total > 0 && <span style={{fontWeight:600,color:'var(--text-dark)'}}>{genStatus.current} / {genStatus.total}</span>}
          </div>
          <div style={{width:'100%',height:6,background:'#e6eae9',borderRadius:3,overflow:'hidden'}}>
            <div style={{width: (genStatus.total > 0 ? Math.round((genStatus.current / genStatus.total) * 100) : 100) + '%', height:'100%', background:'#3E4C59', transition:'width 0.2s ease'}}/>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5, minmax(0, 1fr))',gap:12,marginBottom:18}}>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Total Documents</div>
          <div style={{fontSize:22,fontWeight:600}}>{stats.total}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Photos</div>
          <div style={{fontSize:22,fontWeight:600,color:'#5a6b4f'}}>{stats.photo}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Title Deeds</div>
          <div style={{fontSize:22,fontWeight:600,color:'#3E4C59'}}>{stats.title_deed}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Layouts</div>
          <div style={{fontSize:22,fontWeight:600,color:'#a07d3c'}}>{stats.layout}</div>
        </div>
        <div style={kpiBox}>
          <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>Other</div>
          <div style={{fontSize:22,fontWeight:600,color:'#61707D'}}>{stats.other}</div>
        </div>
      </div>

      {/* Filter row */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search filename / unit / asset…"
          style={{flex:'1 1 280px',minWidth:240,padding:'9px 12px',fontSize:13,border:'1px solid var(--border-light)',borderRadius:6,outline:'none',background:'#fff'}}/>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)}
          style={{padding:'9px 12px',fontSize:13,border:'1px solid var(--border-light)',borderRadius:6,background:'#fff',cursor:'pointer'}}>
          <option value="all">All types</option>
          <option value="photo">Photos</option>
          <option value="title_deed">Title deeds</option>
          <option value="layout">Layouts</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Building → Unit → Files tree */}
      <div style={{display:'grid',gap:14}}>
        {visibleBuildings.map(b => {
          const us = (unitsByBuilding[b.id] || []).slice().sort((a, b) => (a.floor || 0) - (b.floor || 0) || String(a.unit_number || '').localeCompare(String(b.unit_number || '')));
          const bAtts = visibleAtts.filter(a => us.some(u => u.id === a.unit_id));
          if (bAtts.length === 0 && lowerSearch) return null;
          const isExpanded = expanded[b.id] !== false; // default expanded
          return (
            <div key={b.id} className="card" style={{padding:0,overflow:'hidden'}}>
              <div onClick={() => setExpanded(prev => ({ ...prev, [b.id]: !isExpanded }))}
                style={{padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',background:'#FAFAFA',borderBottom: isExpanded ? '1px solid var(--border-light)' : 'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#61707D" strokeWidth="2"
                    style={{transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)', transition:'transform 0.15s'}}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)'}}>{b.name}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{b.property_type} · {us.length} unit{us.length===1?'':'s'} · {bAtts.length} document{bAtts.length===1?'':'s'}</div>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div style={{padding:'4px 0 8px'}}>
                  {us.map(u => {
                    const ua = (attsByUnit[u.id] || []).filter(a => filterKind === 'all' || a.kind === filterKind)
                      .filter(a => !lowerSearch || (a.filename + ' ' + (u.unit_number || '') + ' ' + b.name).toLowerCase().includes(lowerSearch));
                    if (ua.length === 0) return null;
                    return (
                      <div key={u.id} style={{padding:'8px 18px 8px 38px',borderBottom:'1px solid #f4f4f4'}}>
                        <div style={{display:'flex',alignItems:'baseline',gap:10,marginBottom:6}}>
                          <span style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>Unit {u.unit_number}</span>
                          <span style={{fontSize:11,color:'var(--text-muted)'}}>Floor {u.floor != null ? u.floor : '—'}</span>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))',gap:6}}>
                          {ua.map(a => (
                            <div key={a.id} onClick={() => openAttachment(a)}
                              style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'8px 10px',background:'#fff',border:'1px solid var(--border-light)',borderRadius:6,cursor:'pointer',transition:'background 0.12s'}}
                              onMouseEnter={e => e.currentTarget.style.background='#FAFAFA'}
                              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                              <div style={{minWidth:0,flex:1}}>
                                <div style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.filename}</div>
                                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{fmtDate(a.created_at)}</div>
                              </div>
                              <span style={{fontSize:9,letterSpacing:'0.05em',textTransform:'uppercase',color:'#fff',background:kindColor[a.kind] || '#61707D',padding:'2px 7px',borderRadius:3,fontWeight:600,whiteSpace:'nowrap'}}>{kindLabel[a.kind] || a.kind}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {bAtts.length === 0 && (
                    <div style={{padding:'18px 18px 18px 38px',fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>
                      No documents yet for this asset. Use the buttons above to generate placeholders.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visibleBuildings.length === 0 && (
          <div className="card"><div style={{padding:32,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No assets match the current filter.</div></div>
        )}
      </div>
    </div>
  );
};
