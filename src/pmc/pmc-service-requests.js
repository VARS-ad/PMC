// ==================== PMC SERVICE REQUESTS PAGE ====================
// Replaces the legacy ServiceRequestsPage. Live from public.service_requests,
// scoped by top-bar property selector. Click row to see details. Export menu.

const PMCServiceRequestDetailModal = ({ sr, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:560,maxHeight:'85vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Service Request</div>
            <h2>{sr.category}</h2>
            <div className="modal-sub">{sr.building_name} · {sr.unit_number ? 'Unit ' + sr.unit_number : '—'}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'14px 16px',background:'var(--bg-surface)',borderRadius:8,fontSize:13,marginBottom:18,lineHeight:1.55}}>{sr.description}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
          <PMCStat label="Priority" value={sr.priority || '—'}/>
          <PMCStat label="Status" value={sr.status || '—'} color={sr.status === 'Done' || sr.status === 'Closed' ? '#5a6b4f' : sr.status === 'In Progress' ? '#a07d3c' : sr.status === 'Rejected' ? '#8b4a42' : null}/>
          <PMCStat label="Resident" value={sr.resident_name || '—'}/>
          <PMCStat label="Preferred date" value={sr.preferred_date || '—'}/>
          <PMCStat label="Created" value={sr.created_at ? new Date(sr.created_at).toLocaleString() : '—'}/>
          <PMCStat label="Resolved" value={sr.resolved_at ? new Date(sr.resolved_at).toLocaleString() : '—'}/>
        </div>
        {sr.notes && (
          <div>
            <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>Internal notes</div>
            <div style={{padding:12,background:'var(--bg-page)',borderRadius:6,fontSize:12,lineHeight:1.5}}>{sr.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const PMCServiceRequestsPage = () => {
  const { selectedProperties = [] } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSR, setSelectedSR] = useState(null);
  const [showDownload, setShowDownload] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setRows(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const { data: units } = await supabaseClient.from('units').select('id,building_id,unit_number,floor');
        const filteredUnits = (units || []).filter(u => !filterB || filterB.includes(u.building_id));
        const fIds = filteredUnits.map(u => u.id);
        const probe = fIds.length ? fIds : ['00000000-0000-0000-0000-000000000000'];
        const [{ data: srs }, { data: bs }, { data: profs }] = await Promise.all([
          supabaseClient.from('service_requests').select('id,category,description,priority,status,preferred_date,preferred_time,unit_id,resident_profile_id,resolved_at,notes,created_at,updated_at').in('unit_id', probe).order('created_at', { ascending: false }),
          supabaseClient.from('buildings').select('id,name'),
          supabaseClient.from('profiles').select('id,full_name').eq('role', 'resident'),
        ]);
        if (!mounted) return;
        const uMap = Object.fromEntries(filteredUnits.map(u => [u.id, u]));
        const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
        const pMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
        setRows((srs || []).map(s => {
          const u = uMap[s.unit_id];
          return {
            ...s,
            unit_number: u ? u.unit_number : '—',
            floor: u ? u.floor : null,
            building_id: u ? u.building_id : null,
            building_name: u && bMap[u.building_id] ? bMap[u.building_id].name : '—',
            resident_name: s.resident_profile_id && pMap[s.resident_profile_id] ? pMap[s.resident_profile_id].full_name : '—',
          };
        }));
      } catch (e) { if (mounted) setError(String(e.message || e)); }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(','), reloadKey]);

  const filtered = (rows || []).filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && s.priority !== priorityFilter) return false;
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
    if (dateFrom && (s.created_at || '').slice(0,10) < dateFrom) return false;
    if (dateTo && (s.created_at || '').slice(0,10) > dateTo) return false;
    if (search) {
      const hay = ((s.category || '') + ' ' + (s.description || '') + ' ' + (s.resident_name || '') + ' ' + (s.unit_number || '')).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const categories = [...new Set((rows || []).map(s => s.category))].sort();

  const counts = {
    total: filtered.length,
    open:        filtered.filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).length,
    inProgress:  filtered.filter(s => s.status === 'In Progress').length,
    done:        filtered.filter(s => s.status === 'Done' || s.status === 'Closed').length,
    urgent:      filtered.filter(s => s.priority === 'Urgent' && !['Done','Closed'].includes(s.status)).length,
  };

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Service Requests</h1>
        </div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Service Request</button>
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!rows || rows.length === 0}>Download Data</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id:           'service_requests',
            label:        'Service Requests',
            title:        'Service Requests',
            sheetName:    'Service Requests',
            filenameBase: 'service_requests',
            dateField:    'created_at',
            rows:         filtered,
            columns: [
              { key: 'id',             header: 'ID',          width: 14 },
              { key: 'category',       header: 'Category',    width: 18 },
              { key: 'description',    header: 'Description', width: 36 },
              { key: 'priority',       header: 'Priority',    width: 10 },
              { key: 'status',         header: 'Status',      width: 14 },
              { key: 'building_name',  header: 'Building',    width: 22 },
              { key: 'unit_number',    header: 'Unit',        width: 10 },
              { key: 'resident_name',  header: 'Resident',    width: 22 },
              { key: 'preferred_date', header: 'Preferred',   width: 12 },
              { key: 'created_at',     header: 'Created',     width: 18,
                value: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '' },
              { key: 'resolved_at',    header: 'Resolved',    width: 18,
                value: (r) => r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : '' },
            ],
            extraMetadata: {
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Status Filter':   statusFilter   === 'all' ? 'All' : statusFilter,
              'Priority Filter': priorityFilter === 'all' ? 'All' : priorityFilter,
              'Category Filter': categoryFilter === 'all' ? 'All' : categoryFilter,
              'Date Range':      (dateFrom || dateTo) ? ((dateFrom || '…') + ' → ' + (dateTo || '…')) : 'All',
              'Search':          search || '—',
              'Open Tickets':    String(counts.open),
              'Urgent Open':     String(counts.urgent),
            },
          },
          {
            id:           'status_summary',
            label:        'Status Summary',
            title:        'Service Requests — Status Summary',
            sheetName:    'Status Summary',
            filenameBase: 'service_requests-status_summary',
            rows: (() => {
              const total = Math.max((filtered || []).length, 1);
              const statuses = ['New','Acknowledged','In Progress','Done','Closed','Rejected'];
              return statuses.map(s => {
                const count = (filtered || []).filter(r => r.status === s).length;
                return { status: s, count, pct: Math.round(count / total * 100) };
              });
            })(),
            columns: [
              { key: 'status', header: 'Status',     width: 18 },
              { key: 'count',  header: 'Count',      width: 12, halign: 'right', numeric: true },
              { key: 'pct',    header: '% of Total', width: 14, halign: 'right', numeric: true,
                value: (r) => (r.pct || 0) + '%' },
            ],
            extraMetadata: {
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Total Tickets':   String((filtered || []).length),
              'Open Tickets':    String(counts.open),
              'Urgent Open':     String(counts.urgent),
            },
          },
        ]}
      />

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(5, minmax(0, 1fr))'}}>
        <PMCSRKpiTile
          label="Total"
          value={counts.total}
          active={statusFilter === 'all' && priorityFilter === 'all' && categoryFilter === 'all' && !dateFrom && !dateTo && !search}
          onClick={() => { setStatusFilter('all'); setPriorityFilter('all'); setCategoryFilter('all'); setDateFrom(''); setDateTo(''); setSearch(''); }}
        />
        {/* TODO: filter UI is single-select; 'Open' currently maps to status='New' only.
            A multi-status mode (New + Acknowledged + In Progress) would require turning
            statusFilter into an array and updating the <select> to a multi-select chip group. */}
        <PMCSRKpiTile
          label="Open"
          value={counts.open}
          valueColor="#a07d3c"
          active={statusFilter === 'New' && priorityFilter === 'all'}
          onClick={() => { setStatusFilter('New'); setPriorityFilter('all'); }}
        />
        <PMCSRKpiTile
          label="In Progress"
          value={counts.inProgress}
          active={statusFilter === 'In Progress' && priorityFilter === 'all'}
          onClick={() => { setStatusFilter('In Progress'); setPriorityFilter('all'); }}
        />
        <PMCSRKpiTile
          label="Done / Closed"
          value={counts.done}
          valueColor="#5a6b4f"
          active={statusFilter === 'Done' && priorityFilter === 'all'}
          onClick={() => { setStatusFilter('Done'); setPriorityFilter('all'); }}
        />
        <PMCSRKpiTile
          label="Urgent open"
          value={counts.urgent}
          valueColor="#8b4a42"
          active={priorityFilter === 'Urgent' && statusFilter === 'New'}
          onClick={() => { setPriorityFilter('Urgent'); setStatusFilter('New'); }}
        />
      </div>

      <div className="card">
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',marginBottom:14}}>
          <div style={{flex:'1 1 140px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Status</label>
            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option>New</option><option>Acknowledged</option><option>In Progress</option><option>Done</option><option>Closed</option><option>Rejected</option>
            </select>
          </div>
          <div style={{flex:'1 1 130px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Priority</label>
            <select className="form-input" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="all">All</option>
              <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
            </select>
          </div>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Category</label>
            <select className="form-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">All</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{flex:'1 1 130px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>From</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
          </div>
          <div style={{flex:'1 1 130px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>To</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
          </div>
          <div style={{flex:'2 1 180px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Search</label>
            <input type="text" className="form-input" placeholder="Category, description, resident, unit…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-sm" onClick={() => { setStatusFilter('all'); setPriorityFilter('all'); setCategoryFilter('all'); setDateFrom(''); setDateTo(''); setSearch(''); }}>Clear</button>
        </div>

        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {rows === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No service requests match these filters.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th style={{width:'12%'}}>Category</th><th style={{width:'30%'}}>Description</th><th style={{width:'14%'}}>Resident</th><th style={{width:'16%'}}>Building / Unit</th><th style={{width:'8%'}}>Priority</th><th style={{width:'12%'}}>Status</th><th style={{width:'8%'}}>Created</th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map(s => (
                <tr key={s.id} style={{cursor:'pointer'}} onClick={() => setSelectedSR(s)}>
                  <td style={{fontWeight:500}}>{s.category}</td>
                  <td style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:0}} title={s.description}>{s.description}</td>
                  <td>{s.resident_name}</td>
                  <td>{s.building_name}<div style={{fontSize:11,color:'var(--text-muted)'}}>Unit {s.unit_number}</div></td>
                  <td>{s.priority}</td>
                  <td>{statusBadge(s.status)}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedSR && <PMCServiceRequestDetailModal sr={selectedSR} onClose={() => setSelectedSR(null)}/>}
      {showCreate && (
        <CreateServiceRequestModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setReloadKey(k => k + 1); }}
        />
      )}
    </div>
  );
};

// ==================== KPI TILE (clickable) ====================
const PMCSRKpiTile = ({ label, value, valueColor, active, onClick }) => {
  const [hover, setHover] = useState(false);
  const bg = active ? 'var(--accent-warm-light)' : hover ? 'var(--accent-warm-light)' : '#fff';
  const borderColor = active ? 'var(--accent-warm)' : hover ? 'var(--accent-warm)' : 'var(--border-light)';
  return (
    <div
      className="kpi-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer',
        background: bg,
        borderColor: borderColor,
        transition: 'background 120ms ease, border-color 120ms ease, transform 120ms ease',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
      title={'Filter: ' + label}
    >
      <div className="label">{label}</div>
      <div className="value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
    </div>
  );
};

// ==================== CREATE SERVICE REQUEST MODAL ====================
const CreateServiceRequestModal = ({ onClose, onCreated }) => {
  const [buildings, setBuildings] = useState(null);
  const [units, setUnits] = useState([]);
  const [residents, setResidents] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadingResidents, setLoadingResidents] = useState(false);

  const [buildingId, setBuildingId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [residentId, setResidentId] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const CATEGORIES = ['Plumbing','Electrical','HVAC','General Handyman','Pest Control','Cleaning','Security','Other'];
  const PRIORITIES = ['Low','Normal','High','Urgent'];

  // Load buildings on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      const { data, error: e } = await supabaseClient.from('buildings').select('id, name, property_type').order('name');
      if (!mounted) return;
      if (e) { setError(e.message); return; }
      setBuildings(data || []);
    })();
    return () => { mounted = false; };
  }, []);

  // Load units when building changes
  useEffect(() => {
    setUnitId('');
    setUnits([]);
    setResidentId('');
    setResidents([]);
    if (!buildingId || !supabaseClient) return;
    let mounted = true;
    setLoadingUnits(true);
    (async () => {
      const { data, error: e } = await supabaseClient.from('units').select('id, unit_number, floor').eq('building_id', buildingId).order('unit_number');
      if (!mounted) return;
      setLoadingUnits(false);
      if (e) { setError(e.message); return; }
      setUnits(data || []);
    })();
    return () => { mounted = false; };
  }, [buildingId]);

  // Load residents for selected unit
  useEffect(() => {
    setResidentId('');
    setResidents([]);
    if (!unitId || !supabaseClient) return;
    let mounted = true;
    setLoadingResidents(true);
    (async () => {
      const { data, error: e } = await supabaseClient
        .from('resident_assignments')
        .select('profile_id, profiles(full_name)')
        .eq('unit_id', unitId);
      if (!mounted) return;
      setLoadingResidents(false);
      if (e) { /* non-fatal: resident is optional */ setResidents([]); return; }
      setResidents((data || []).map(r => ({
        profile_id: r.profile_id,
        full_name: (r.profiles && r.profiles.full_name) || '—',
      })));
    })();
    return () => { mounted = false; };
  }, [unitId]);

  const validate = () => {
    if (!buildingId) return 'Building is required.';
    if (!unitId) return 'Unit is required.';
    if (!category) return 'Category is required.';
    if (!priority) return 'Priority is required.';
    if (!description || description.trim().length < 10) return 'Description must be at least 10 characters.';
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setBusy(true);
    try {
      const payload = {
        unit_id: unitId,
        resident_profile_id: residentId || null,
        category,
        description: description.trim(),
        priority,
        status: 'New',
        preferred_date: preferredDate || null,
        preferred_time: preferredTime || null,
      };
      const { error: e } = await supabaseClient.from('service_requests').insert(payload);
      if (e) throw e;
      onCreated && onCreated();
    } catch (e) {
      setError(String(e.message || e));
      setBusy(false);
    }
  };

  const labelStyle = { fontSize:11, color:'var(--text-secondary)', marginBottom:4, display:'block', fontWeight:500, letterSpacing:'0.04em', textTransform:'uppercase' };
  const inputStyle = { width:'100%', padding:'10px 12px', border:'1px solid var(--border-light)', borderRadius:6, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff' };
  const sectionLabel = { fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:10, fontWeight:600 };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:640, maxHeight:'90vh', padding:0, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 28px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>New Service Request</div>
            <h2>Create Service Request</h2>
            <div className="modal-sub">PMC composer — file an SR on behalf of a building or resident.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{padding:'20px 28px 24px 28px', overflowY:'auto'}}>
          {error && (
            <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>
          )}

          <div style={sectionLabel}>Property</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:18}}>
            <div>
              <label style={labelStyle}>Building <span style={{color:'#8b4a42'}}>*</span></label>
              <select style={inputStyle} value={buildingId} onChange={e => setBuildingId(e.target.value)} disabled={buildings === null}>
                <option value="">{buildings === null ? 'Loading…' : 'Select a building…'}</option>
                {(buildings || []).map(b => (
                  <option key={b.id} value={b.id}>{b.name}{b.property_type ? ' · ' + b.property_type : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unit <span style={{color:'#8b4a42'}}>*</span></label>
              <select style={inputStyle} value={unitId} onChange={e => setUnitId(e.target.value)} disabled={!buildingId || loadingUnits}>
                <option value="">{!buildingId ? 'Choose building first' : loadingUnits ? 'Loading…' : units.length === 0 ? 'No units' : 'Select a unit…'}</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_number}{u.floor != null ? ' · Floor ' + u.floor : ''}</option>
                ))}
              </select>
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <label style={labelStyle}>Resident <span style={{color:'var(--text-muted)',fontWeight:400,textTransform:'none',letterSpacing:0}}>(optional)</span></label>
              <select style={inputStyle} value={residentId} onChange={e => setResidentId(e.target.value)} disabled={!unitId || loadingResidents || residents.length === 0}>
                <option value="">{!unitId ? 'Choose unit first' : loadingResidents ? 'Loading…' : residents.length === 0 ? 'No assigned residents' : 'No specific resident'}</option>
                {residents.map(r => (
                  <option key={r.profile_id} value={r.profile_id}>{r.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={sectionLabel}>Request</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
            <div>
              <label style={labelStyle}>Category <span style={{color:'#8b4a42'}}>*</span></label>
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Select a category…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority <span style={{color:'#8b4a42'}}>*</span></label>
              <select style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:18}}>
            <label style={labelStyle}>Description <span style={{color:'#8b4a42'}}>*</span></label>
            <textarea
              style={{...inputStyle, minHeight:90, resize:'vertical', fontFamily:'inherit', lineHeight:1.5}}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the issue, location in the unit, and any relevant detail (min 10 chars)…"
            />
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{description.trim().length} / 10 characters</div>
          </div>

          <div style={sectionLabel}>Scheduling (optional)</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:6}}>
            <div>
              <label style={labelStyle}>Preferred date</label>
              <input type="date" style={inputStyle} value={preferredDate} onChange={e => setPreferredDate(e.target.value)}/>
            </div>
            <div>
              <label style={labelStyle}>Preferred time</label>
              <input type="time" style={inputStyle} value={preferredTime} onChange={e => setPreferredTime(e.target.value)}/>
            </div>
          </div>
        </div>

        <div style={{padding:'14px 28px 20px 28px', borderTop:'1px solid var(--border-light)', background:'#fff', display:'flex', justifyContent:'flex-end', gap:8}}>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create request'}</button>
        </div>
      </div>
    </div>
  );
};

