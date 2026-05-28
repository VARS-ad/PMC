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
  }, [selectedProperties.join(',')]);

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
        <div className="kpi-card"><div className="label">Total</div><div className="value">{counts.total}</div></div>
        <div className="kpi-card"><div className="label">Open</div><div className="value" style={{color:'#a07d3c'}}>{counts.open}</div></div>
        <div className="kpi-card"><div className="label">In Progress</div><div className="value">{counts.inProgress}</div></div>
        <div className="kpi-card"><div className="label">Done / Closed</div><div className="value" style={{color:'#5a6b4f'}}>{counts.done}</div></div>
        <div className="kpi-card"><div className="label">Urgent open</div><div className="value" style={{color:'#8b4a42'}}>{counts.urgent}</div></div>
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
    </div>
  );
};

