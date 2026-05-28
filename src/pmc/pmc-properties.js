// ==================== PMC PROPERTIES PAGE ====================
// Replaces the legacy blank-ish PropertiesPage. Each card aggregates:
// units count · occupancy · residents · monthly revenue · collected · outstanding · open SRs.
// Click a card → BuildingDetailModal (reused from Profile Creation).

// Infer the property type from the building name. We don't have a
// `property_type` column in Supabase yet, so this is a heuristic that
// covers the names actually in use ("Tower", "View", "Residences",
// "Villa", "Land", "Plot"). Defaults to "Residential" since most
// of the portfolio is apartment buildings.
const _inferPropertyType = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('villa') || n.includes('compound')) return 'Villa Compound';
  if (n.includes('land') || n.includes('plot'))      return 'Commercial Land';
  if (n.includes('office') || n.includes('retail'))  return 'Commercial';
  return 'Residential';
};

// Colored chip rendered next to the building name. Distinct background
// per type so the user can spot the type at a glance.
const _PropertyTypeChip = ({ type }) => {
  const palette = ({
    'Residential':     { bg: '#CFDFEF', fg: '#1f3a5a' }, // water-blue
    'Villa Compound':  { bg: '#DBC5AE', fg: '#5a4530' }, // sand
    'Commercial Land': { bg: '#D2C7CF', fg: '#4a3a48' }, // mauve
    'Commercial':      { bg: '#D2E4E5', fg: '#2d4a4d' }, // sky-mint
  })[type] || { bg: '#E6EAE9', fg: '#61707D' };
  return (
    <span style={{display:'inline-block',padding:'3px 10px',fontSize:11,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',background:palette.bg,color:palette.fg,borderRadius:4,verticalAlign:'middle',marginLeft:10}}>
      {type}
    </span>
  );
};

const PMCPropertiesPage = ({ setPage }) => {
  const { selectedProperties = [] } = useApp();
  const [buildings, setBuildings] = useState(null);
  const [error, setError] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [drill, setDrill] = useState(null); // { building, view }
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    let mounted = true;
    setBuildings(null);
    (async () => {
      if (!supabaseClient) { setError('Supabase not initialized'); return; }
      try {
        const [{ data: bs }, { data: units }, { data: ras }, { data: invoices }, { data: srs }, { data: profiles }] = await Promise.all([
          supabaseClient.from('buildings').select('id,name,address,notes,created_at').order('name'),
          supabaseClient.from('units').select('id,building_id,floor,unit_number'),
          supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start'),
          supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,source_type,unit_id,resident_profile_id,created_at'),
          supabaseClient.from('service_requests').select('id,category,description,status,priority,created_at,unit_id,resident_profile_id,preferred_date'),
          supabaseClient.from('profiles').select('id,full_name,phone'),
        ]);
        if (!mounted) return;
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        const filterB = selectedProperties.length > 0 ? selectedProperties : null;
        const result = (bs || []).filter(b => !filterB || filterB.includes(b.id)).map(b => {
          const bUnits = (units || []).filter(u => u.building_id === b.id);
          const unitMap = Object.fromEntries(bUnits.map(u => [u.id, u]));
          const unitIds = bUnits.map(u => u.id);
          const occupied = (ras || [])
            .filter(r => unitIds.includes(r.unit_id))
            .map(r => ({
              ...r,
              resident_name: profileMap[r.profile_id]?.full_name || '—',
              resident_phone: profileMap[r.profile_id]?.phone || null,
              unit_number: unitMap[r.unit_id]?.unit_number || '—',
              floor: unitMap[r.unit_id]?.floor ?? null,
            }));
          const tenants = occupied.filter(o => o.tenure === 'Tenant');
          const monthlyRev = tenants.reduce((s, t) => s + Number(t.monthly_payment_aed || 0), 0);
          const bInvoices = (invoices || [])
            .filter(i => unitIds.includes(i.unit_id))
            .map(i => ({
              ...i,
              resident_name: i.resident_profile_id && profileMap[i.resident_profile_id] ? profileMap[i.resident_profile_id].full_name : '—',
              unit_number: unitMap[i.unit_id]?.unit_number || '—',
            }));
          const collected = bInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount_aed), 0);
          const outstanding = bInvoices.filter(i => i.status === 'Pending' || i.status === 'Overdue').reduce((s, i) => s + Number(i.amount_aed), 0);
          const bSRs = (srs || [])
            .filter(s => unitIds.includes(s.unit_id))
            .map(s => ({
              ...s,
              resident_name: s.resident_profile_id && profileMap[s.resident_profile_id] ? profileMap[s.resident_profile_id].full_name : '—',
              unit_number: unitMap[s.unit_id]?.unit_number || '—',
            }));
          const openSRs = bSRs.filter(s => ['New','Acknowledged','In Progress'].includes(s.status)).length;
          return {
            ...b,
            units: bUnits,
            assignments: occupied, // alias for residents
            tenants, // resident_assignments filtered to Tenant
            invoices: bInvoices,
            srs: bSRs,
            unitCount: bUnits.length, occupiedCount: occupied.length,
            monthlyRev, collected, outstanding, openSRs, totalSRs: bSRs.length,
          };
        });
        setBuildings(result);
      } catch (e) { if (mounted) setError(String(e.message || e)); }
    })();
    return () => { mounted = false; };
  }, [selectedProperties.join(',')]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Properties</h1>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setShowDownload(true)} disabled={!buildings || buildings.length === 0}>Download Data</button>
        </div>
      </div>

      <ExportPrintModal
        isOpen={showDownload}
        onClose={() => setShowDownload(false)}
        dataTypes={[
          {
            id:           'buildings',
            label:        'Buildings',
            title:        'Buildings',
            sheetName:    'Buildings',
            filenameBase: 'buildings',
            rows:         buildings || [],
            columns: [
              { key: 'name',           header: 'Building',      width: 28 },
              { key: 'address',        header: 'Address',       width: 36 },
              { key: 'unitCount',      header: 'Units',         width: 8,  halign: 'right', numeric: true },
              { key: 'occupiedCount',  header: 'Occupied',      width: 10, halign: 'right', numeric: true },
              { key: 'monthlyRev',     header: 'Monthly Rev (AED)',  width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.monthlyRev || 0) },
              { key: 'collected',      header: 'Collected (AED)',    width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.collected || 0) },
              { key: 'outstanding',    header: 'Outstanding (AED)',  width: 16, halign: 'right', numeric: true,
                value: (r) => Math.round(r.outstanding || 0) },
              { key: 'openSRs',        header: 'Open SRs',      width: 10, halign: 'right', numeric: true },
              { key: 'totalSRs',       header: 'Total SRs',     width: 10, halign: 'right', numeric: true },
              { key: 'notes',          header: 'Notes',         width: 30 },
            ],
            extraMetadata: {
              'Property Filter': selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
              'Total Buildings': String((buildings || []).length),
            },
          },
          {
            id:           'tenants',
            label:        'Tenants',
            title:        'Tenants',
            sheetName:    'Tenants',
            filenameBase: 'tenants',
            dateField:    'lease_start',
            rows: (buildings || []).flatMap(b => (b.assignments || []).map(a => ({
              ...a,
              building_name: b.name,
            }))),
            columns: [
              { key: 'resident_name',       header: 'Resident',          width: 26 },
              { key: 'resident_phone',      header: 'Phone',             width: 18 },
              { key: 'building_name',       header: 'Building',          width: 24 },
              { key: 'unit_number',         header: 'Unit',              width: 10 },
              { key: 'floor',               header: 'Floor',             width: 8,  halign: 'right', numeric: true },
              { key: 'tenure',              header: 'Tenure',            width: 10 },
              { key: 'monthly_payment_aed', header: 'Monthly (AED)',     width: 14, halign: 'right', numeric: true },
              { key: 'lease_start',         header: 'Lease Start',       width: 12 },
              { key: 'lease_end',           header: 'Lease End',         width: 12 },
              { key: 'ownership_start',     header: 'Ownership Start',   width: 14 },
            ],
            extraMetadata: {
              'Property Filter':  selectedProperties.length === 0 ? 'All buildings' : (selectedProperties.length + ' selected'),
            },
          },
        ]}
      />

      {error && <div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div>}
      {buildings === null ? (
        <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>
      ) : buildings.length === 0 ? (
        <div className="card"><div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No buildings in your portfolio yet. Add some via <strong>Profile Creation → Buildings</strong>.</div></div>
      ) : (
        <>
          {/* Active properties — one full-width card per row */}
          <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18}}>
            {buildings.map(b => {
              const occupancyPct = b.unitCount > 0 ? Math.round((b.occupiedCount / b.unitCount) * 100) : 0;
              const totalBilled = b.collected + b.outstanding;
              const open = () => setSelectedBuilding(b);
              return (
                <div key={b.id} className="card">
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                    <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={open}>
                      <div style={{fontSize:18,fontWeight:600,color:'var(--text-dark)'}}>
                        {b.name}
                        <_PropertyTypeChip type={_inferPropertyType(b.name)}/>
                      </div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{b.address || '—'}</div>
                    </div>
                    <div onClick={open} style={{cursor:'pointer',fontSize:12,fontWeight:500,color:occupancyPct >= 80 ? '#5a6b4f' : occupancyPct >= 50 ? 'var(--text-secondary)' : '#8b4a42',padding:'6px 14px',background:'var(--bg-surface)',borderRadius:4,whiteSpace:'nowrap',marginLeft:10,border:'1px solid var(--border-light)'}}>{occupancyPct}% occupied</div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(7, minmax(0, 1fr))',gap:8,marginTop:14}}>
                    <PMCStat label="Units"             value={b.unitCount}                                                  onClick={open}                                                  hint="View floors & units"/>
                    <PMCStat label="Occupied"          value={b.occupiedCount}                                              onClick={() => setDrill({ building: b, view: 'residents' })}      hint="Residents in this property"/>
                    <PMCStat label="Monthly Run-Rate"  value={'AED ' + Math.round(b.monthlyRev).toLocaleString()}          onClick={() => setDrill({ building: b, view: 'tenants' })}        hint="Tenants + lease rates"/>
                    <PMCStat label="Total Billed"      value={'AED ' + Math.round(totalBilled).toLocaleString()}           onClick={() => setDrill({ building: b, view: 'invoices' })}       hint="All invoices for this building"/>
                    <PMCStat label="Collected"         value={'AED ' + Math.round(b.collected).toLocaleString()}           onClick={() => setDrill({ building: b, view: 'collected' })}      color="#5a6b4f" hint="Paid invoices only"/>
                    <PMCStat label="Outstanding"       value={'AED ' + Math.round(b.outstanding).toLocaleString()}         onClick={() => setDrill({ building: b, view: 'outstanding' })}    color={b.outstanding > 0 ? '#8b4a42' : null} hint="Pending + Overdue"/>
                    <PMCStat label="Open SRs"          value={b.openSRs + ' open · ' + b.totalSRs + ' total'}              onClick={() => setDrill({ building: b, view: 'srs' })}            hint="Service requests for this building"/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coming soon — separate section below the active properties */}
          <div style={{marginTop:36}}>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:600}}>Coming Soon</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:16}}>Asset types currently under development that will appear in this view once onboarded.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr',gap:14}}>
              {COMING_SOON_PROPERTIES.map(cs => (
                <div key={cs.id} className="card" style={{opacity:0.85,position:'relative',background:'var(--bg-surface)'}}>
                  <div style={{position:'absolute',top:14,right:14,fontSize:10,fontWeight:600,color:'#fff',background:'#3E4C59',padding:'4px 12px',borderRadius:4,letterSpacing:'0.04em'}}>COMING SOON</div>
                  <div style={{fontSize:16,fontWeight:600,color:'var(--text-secondary)',marginBottom:4}}>
                    {cs.name}
                    <_PropertyTypeChip type={_inferPropertyType(cs.name)}/>
                  </div>
                  <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14}}>{cs.location}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',lineHeight:1.5,padding:'10px 12px',background:'#fff',borderRadius:6,border:'1px dashed var(--border-light)'}}>
                    {cs.id === 'soon-commercial'
                      ? 'Mixed-use commercial plots: retail, office, F&B. Onboarding workflow under development.'
                      : 'Low-rise villa compounds with private gardens. Onboarding workflow under development.'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {selectedBuilding && <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)}/>}
    </div>
  );
};

