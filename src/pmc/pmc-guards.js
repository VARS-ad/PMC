// ==================== PMC GUARDS PAGE ====================
// Replaces the legacy blank page. Reads security profiles + assignments from Supabase,
// computes on-duty status from current Dubai time + shift, exposes Chat/Report stubs.

const PMCGuardsPage = () => {
  const { selectedProperties = [] } = useApp();
  const [guards, setGuards] = useState(null);
  const [error, setError] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showExport, setShowExport] = useState(false);

  const load = async () => {
    setError(null);
    if (!supabaseClient) return;
    const { data: profs, error: e1 } = await supabaseClient.from('profiles').select('id,full_name,phone,created_at').eq('role','security').order('full_name');
    if (e1) { setError(e1.message); setGuards([]); return; }
    const ids = (profs || []).map(p => p.id);
    let assignments = [];
    if (ids.length) {
      const { data } = await supabaseClient.from('security_assignments').select('profile_id,building_id,shift').in('profile_id', ids);
      assignments = data || [];
    }
    const buildingIds = [...new Set(assignments.map(a => a.building_id))];
    let bs = [];
    if (buildingIds.length) {
      const { data } = await supabaseClient.from('buildings').select('id,name').in('id', buildingIds);
      bs = data || [];
    }
    setBuildings(bs);
    const buildingById = Object.fromEntries(bs.map(b => [b.id, b]));
    setGuards((profs || []).map(p => {
      const sa = assignments.find(a => a.profile_id === p.id);
      return {
        ...p,
        building_id: sa ? sa.building_id : null,
        building_name: sa && buildingById[sa.building_id] ? buildingById[sa.building_id].name : '—',
        shift: sa ? sa.shift : null,
      };
    }));
  };
  useEffect(() => { load(); }, []);

  // Asia/Dubai is UTC+4. On-duty schedule: Day 06–18, Night 18–06, 24h always.
  const isOnDuty = (shift) => {
    if (!shift) return false;
    if (shift === '24h') return true;
    const now = new Date();
    const dubaiHour = (now.getUTCHours() + 4) % 24;
    if (shift === 'Day')   return dubaiHour >= 6  && dubaiHour < 18;
    if (shift === 'Night') return dubaiHour >= 18 || dubaiHour < 6;
    return false;
  };

  const filtered = (guards || []).filter(g => {
    if (selectedProperties.length > 0 && !selectedProperties.includes(g.building_id)) return false;
    if (shiftFilter !== 'all' && g.shift !== shiftFilter) return false;
    if (search && !(g.full_name || '').toLowerCase().includes(search.toLowerCase()) && !(g.phone || '').includes(search)) return false;
    return true;
  });

  const onDutyCount = filtered.filter(g => isOnDuty(g.shift)).length;
  const offDutyCount = filtered.length - onDutyCount;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Guards</h1>
          <div className="subtitle">Security staff across managed buildings — duty status, contact, and oversight actions.</div>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowExport(true)} disabled={!guards || guards.length === 0}>Export / Print</button>
          <button className="btn btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        title="Guards"
        sheetName="Guards"
        filenameBase="guards"
        rows={filtered.map(g => ({ ...g, on_duty: isOnDuty(g.shift) ? 'On Duty' : 'Off Duty' }))}
        dateField="created_at"
        columns={[
          { key: 'full_name',     header: 'Name',     width: 26 },
          { key: 'phone',         header: 'Phone',    width: 18 },
          { key: 'building_name', header: 'Building', width: 26 },
          { key: 'shift',         header: 'Shift',    width: 10 },
          { key: 'on_duty',       header: 'Status',   width: 12 },
          { key: 'created_at',    header: 'Joined',   width: 14,
            value: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '' },
        ]}
        extraMetadata={{
          'Shift Filter':   shiftFilter === 'all' ? 'All' : shiftFilter,
          'Search':         search || '—',
          'On Duty Now':    String(onDutyCount),
          'Off Duty':       String(offDutyCount),
        }}
      />

      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4, minmax(0, 1fr))'}}>
        <div className="kpi-card"><div className="label">Total Guards</div><div className="value">{filtered.length}</div></div>
        <div className="kpi-card"><div className="label">On Duty Now</div><div className="value" style={{color:'#5a6b4f'}}>{onDutyCount}</div></div>
        <div className="kpi-card"><div className="label">Off Duty</div><div className="value" style={{color:'#61707D'}}>{offDutyCount}</div></div>
        <div className="kpi-card"><div className="label">Buildings Covered</div><div className="value">{new Set(filtered.map(g => g.building_id).filter(Boolean)).size}</div></div>
      </div>

      <div className="card">
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14,padding:'8px 12px',background:'var(--bg-page)',borderRadius:6,border:'1px solid var(--border-light)'}}>
          {selectedProperties.length === 0
            ? 'Showing guards across all buildings. Use the property selector in the top bar to scope to specific buildings.'
            : selectedProperties.length === 1
              ? 'Scoped to 1 building (from the top-bar property selector).'
              : 'Scoped to ' + selectedProperties.length + ' buildings (from the top-bar property selector).'
          }
        </div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{flex:'1 1 160px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Shift</label>
            <select className="form-input" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
              <option value="all">All shifts</option>
              <option>Day</option><option>Night</option><option>24h</option>
            </select>
          </div>
          <div style={{flex:'2 1 200px'}}>
            <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Search</label>
            <input type="text" className="form-input" placeholder="Name or phone…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-sm" onClick={() => { setShiftFilter('all'); setSearch(''); }}>Clear filters</button>
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{filtered.length} guard{filtered.length===1?'':'s'}</div>
        </div>
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {guards === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No guards match these filters. Add some via <strong>Profile Creation → Security</strong>.</div>
        ) : (
          <table className="data-table" style={{tableLayout:'auto'}}>
            <thead><tr><th style={{width:'24%'}}>Guard</th><th style={{width:'14%'}}>Phone</th><th style={{width:'18%'}}>Building</th><th style={{width:'9%'}}>Shift</th><th style={{width:'12%'}}>Status</th><th style={{width:'10%'}}>Onboarded</th><th style={{width:'13%',textAlign:'right'}}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(g => {
                const onDuty = isOnDuty(g.shift);
                const initials = (g.full_name || '').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
                return (
                  <tr key={g.id} style={{transition:'background 0.12s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-surface)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'14px 12px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{width:38,height:38,borderRadius:'50%',background: onDuty ? 'linear-gradient(135deg, #d4c8c0 0%, #61707D 100%)' : 'var(--bg-surface)',border: onDuty ? 'none' : '1px solid var(--border-light)',display:'flex',alignItems:'center',justifyContent:'center',color: onDuty ? '#fff' : 'var(--text-secondary)',fontSize:12,fontWeight:600,flexShrink:0,letterSpacing:'0.04em'}}>{initials}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>{g.full_name}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>{g.id.slice(0,8).toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{fontSize:12,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{g.phone || '—'}</td>
                    <td>
                      <span style={{fontSize:12,padding:'4px 10px',background:'var(--bg-surface)',borderRadius:4,border:'1px solid var(--border-light)'}}>{g.building_name}</span>
                    </td>
                    <td><span style={{fontSize:12,fontWeight:500,padding:'3px 10px',background: g.shift === '24h' ? '#131F23' : g.shift === 'Night' ? '#5a4a40' : '#E6EAE9',color: g.shift === 'Day' ? '#5a4a40' : '#fff',borderRadius:3}}>{g.shift || '—'}</span></td>
                    <td>
                      <span style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:12,padding:'4px 10px',background: onDuty ? '#eef2e8' : 'var(--bg-surface)',color: onDuty ? '#4a5a3f' : '#61707D',borderRadius:4,fontWeight:500}}>
                        <span style={{position:'relative',width:8,height:8}}>
                          <span style={{position:'absolute',inset:0,borderRadius:4,background: onDuty ? '#5a6b4f' : '#D0D6D5'}}/>
                          {onDuty && <span style={{position:'absolute',inset:-3,borderRadius:7,background:'#5a6b4f',opacity:0.25,animation:'pulse 2s ease-in-out infinite'}}/>}
                        </span>
                        {onDuty ? 'On duty' : 'Off duty'}
                      </span>
                    </td>
                    <td style={{fontSize:12,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                      <button onClick={() => alert('Direct chat with ' + g.full_name + ' coming soon')} style={{padding:'6px 14px',fontSize:11,background:'#fff',border:'1px solid var(--border-medium)',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6,fontWeight:500}}>Chat</button>
                      <button onClick={() => alert('Report concern to FM company about ' + g.full_name + ' — coming soon')} style={{padding:'6px 14px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer',fontWeight:500}}>Report</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

