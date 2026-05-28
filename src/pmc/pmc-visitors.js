// ==================== PMC VISITORS PAGE ====================
// New: reads from the public.visits table (filterable), replaces the legacy blank page.

const PMCVisitorsPage = () => {
  const { selectedProperties = [] } = useApp();
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showExport, setShowExport] = useState(false);

  const load = async () => {
    setError(null);
    if (!supabaseClient) return;
    const { data: vs, error: e1 } = await supabaseClient.from('visits')
      .select('id,unit_id,type,visitor_name,visitor_phone,visit_date,visit_time,status,permit_ref,purpose,vehicle,created_at')
      .order('visit_date', { ascending: false });
    if (e1) { setError(e1.message); setVisits([]); return; }
    const unitIds = [...new Set((vs || []).map(v => v.unit_id))];
    let units = [];
    if (unitIds.length) {
      const { data: us } = await supabaseClient.from('units').select('id,unit_number,floor,building_id').in('id', unitIds);
      units = us || [];
    }
    const buildingIds = [...new Set(units.map(u => u.building_id))];
    let bs = [];
    if (buildingIds.length) {
      const { data: bres } = await supabaseClient.from('buildings').select('id,name').in('id', buildingIds);
      bs = bres || [];
    }
    setBuildings(bs);
    const uMap = Object.fromEntries(units.map(u => [u.id, u]));
    const bMap = Object.fromEntries(bs.map(b => [b.id, b]));
    setVisits((vs || []).map(v => {
      const u = uMap[v.unit_id];
      return {
        ...v,
        unit_number: u ? u.unit_number : '—',
        floor: u ? u.floor : null,
        building_id: u ? u.building_id : null,
        building_name: u && bMap[u.building_id] ? bMap[u.building_id].name : '—',
      };
    }));
  };
  useEffect(() => { load(); }, []);

  const filtered = (visits || []).filter(v => {
    if (selectedProperties.length > 0 && !selectedProperties.includes(v.building_id)) return false;
    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
    if (typeFilter !== 'all' && v.type !== typeFilter) return false;
    if (dateFromFilter && v.visit_date < dateFromFilter) return false;
    if (dateToFilter && v.visit_date > dateToFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = (v.visitor_name + ' ' + (v.visitor_phone || '') + ' ' + v.unit_number + ' ' + (v.permit_ref || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const counts = {
    total: filtered.length,
    today: filtered.filter(v => v.visit_date === today).length,
    onPremise: filtered.filter(v => v.status === 'On-Premise').length,
    upcoming: filtered.filter(v => v.visit_date > today && v.status === 'Pre-Approved').length,
    checkedOut: filtered.filter(v => v.status === 'Checked-Out').length,
  };

  const statusBadge = (s) => {
    const c = ({
      'Pre-Approved': { bg: '#E6EAE9', fg: '#4a4540' },
      'On-Premise':   { bg: '#3E4C59', fg: '#fff' },
      'Checked-Out':  { bg: '#ccc8c1', fg: '#4a4540' },
      'No-Show':      { bg: '#E6EAE9', fg: '#61707D' },
      'Rejected':     { bg: '#8b4a42', fg: '#fff' },
      'Cancelled':    { bg: '#E6EAE9', fg: '#61707D' },
    })[s] || { bg: '#E6EAE9', fg: '#888' };
    return <span style={{padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:500,background:c.bg,color:c.fg}}>{s}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Visitors</h1>
          <div className="subtitle">All visitor activity across managed buildings — past, today, and scheduled.</div>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowExport(true)} disabled={!visits || visits.length === 0}>Export / Print</button>
          <button className="btn btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        title="Visitors"
        sheetName="Visitors"
        filenameBase="visitors"
        rows={filtered}
        dateField="visit_date"
        columns={[
          { key: 'permit_ref',    header: 'Permit Ref', width: 14 },
          { key: 'visitor_name',  header: 'Visitor',    width: 26 },
          { key: 'visitor_phone', header: 'Phone',      width: 18 },
          { key: 'type',          header: 'Type',       width: 16 },
          { key: 'unit_number',   header: 'Unit',       width: 10 },
          { key: 'building_name', header: 'Building',   width: 24 },
          { key: 'visit_date',    header: 'Visit Date', width: 12 },
          { key: 'visit_time',    header: 'Visit Time', width: 12 },
          { key: 'purpose',       header: 'Purpose',    width: 24 },
          { key: 'vehicle',       header: 'Vehicle',    width: 14 },
          { key: 'status',        header: 'Status',     width: 14 },
        ]}
        extraMetadata={{
          'Status Filter': statusFilter === 'all' ? 'All'  : statusFilter,
          'Type Filter':   typeFilter   === 'all' ? 'All'  : typeFilter,
          'Search':        search || '—',
          'On-Premise Now':String(counts.onPremise),
          'Upcoming':      String(counts.upcoming),
        }}
      />

      <div className="kpi-row">
        <div className="kpi-card"><div className="label">Total</div><div className="value">{counts.total}</div></div>
        <div className="kpi-card"><div className="label">Today</div><div className="value">{counts.today}</div></div>
        <div className="kpi-card"><div className="label">On-Premise</div><div className="value" style={{color:'#3E4C59'}}>{counts.onPremise}</div></div>
        <div className="kpi-card"><div className="label">Upcoming</div><div className="value">{counts.upcoming}</div></div>
        <div className="kpi-card"><div className="label">Checked-Out</div><div className="value" style={{color:'#61707D'}}>{counts.checkedOut}</div></div>
      </div>

      <div className="card">
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14,padding:'8px 12px',background:'var(--bg-page)',borderRadius:6,border:'1px solid var(--border-light)'}}>
          {selectedProperties.length === 0
            ? 'Showing visitors across all buildings. Use the property selector in the top bar to scope to specific buildings.'
            : selectedProperties.length === 1
              ? 'Scoped to 1 building (from the top-bar property selector).'
              : 'Scoped to ' + selectedProperties.length + ' buildings (from the top-bar property selector).'
          }
        </div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Status</label>
            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option>Pre-Approved</option><option>On-Premise</option><option>Checked-Out</option>
              <option>No-Show</option><option>Rejected</option><option>Cancelled</option>
            </select>
          </div>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Type</label>
            <select className="form-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All types</option>
              <option>Pre-Approved</option><option>Walk-In</option><option>Delivery</option>
              <option>Service Vendor</option><option>Resident Guest</option><option>Contractor</option>
            </select>
          </div>
          <div style={{flex:'1 1 140px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>From</label>
            <input type="date" className="form-input" value={dateFromFilter} onChange={e => setDateFromFilter(e.target.value)}/>
          </div>
          <div style={{flex:'1 1 140px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>To</label>
            <input type="date" className="form-input" value={dateToFilter} onChange={e => setDateToFilter(e.target.value)}/>
          </div>
          <div style={{flex:'2 1 200px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Search</label>
            <input type="text" className="form-input" placeholder="Name, phone, unit, permit…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-sm" onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setDateFromFilter(''); setDateToFilter(''); setSearch(''); }}>Clear filters</button>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{filtered.length} visit{filtered.length===1?'':'s'}{filtered.length > 200 ? ' (showing first 200)' : ''}</div>
        </div>
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {visits === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No visits match these filters.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Time</th><th>Visitor</th><th>Type</th><th>Building / Unit</th><th>Permit</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.slice(0, 200).map(v => (
                <tr key={v.id}>
                  <td>{v.visit_date}</td>
                  <td>{v.visit_time || '—'}</td>
                  <td style={{fontWeight:500}}>
                    {v.visitor_name}
                    {v.visitor_phone && <div style={{fontSize:11,color:'var(--text-muted)'}}>{v.visitor_phone}</div>}
                  </td>
                  <td>{v.type}</td>
                  <td>
                    {v.building_name}
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>Floor {v.floor || '—'} · Unit {v.unit_number}</div>
                  </td>
                  <td style={{fontSize:11,color:'var(--text-muted)'}}>{v.permit_ref || '—'}</td>
                  <td>{statusBadge(v.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

