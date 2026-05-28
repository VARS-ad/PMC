// ==================== PMC PROPERTIES PAGE ====================
// Grouped into three sections (Residential, Commercial, Villas) driven
// by the `property_type` column on `buildings`. Each card aggregates:
// units count · occupancy (subline) · billed · collected · outstanding · open SRs.
// Commercial cards additionally show monthly run-rate.
// Click a card → BuildingDetailModal (reused from Profile Creation).

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
          supabaseClient.from('buildings').select('id,name,address,notes,property_type,created_at').order('name'),
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
              { key: 'property_type',  header: 'Type',          width: 12 },
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
      ) : (() => {
          // Shared eyebrow header style (mirrors pmc-overview.js groupEyebrow)
          const sectionEyebrow = { fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-secondary)', fontWeight:600 };

          // Render a single building card. `kind` controls whether
          // Commercial gets the extra Monthly Run-Rate column (6 cards
          // instead of 5).
          const renderBuildingCard = (b, kind) => {
            const occupancyPct = b.unitCount > 0 ? Math.round((b.occupiedCount / b.unitCount) * 100) : 0;
            const totalBilled = b.collected + b.outstanding;
            const open = () => setSelectedBuilding(b);
            const isCommercial = kind === 'Commercial';
            const cols = isCommercial ? 6 : 5;
            return (
              <div key={b.id} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={open}>
                    <div style={{fontSize:18,fontWeight:600,color:'var(--text-dark)'}}>{b.name}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{b.address || '—'}</div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:`repeat(${cols}, minmax(0, 1fr))`,gap:8,marginTop:14}}>
                  {/* Custom Units stat: value · % occupied subline · existing hint.
                      Mirrors PMCStat styling so it lines up with the rest. */}
                  <div
                    onClick={(e) => { e.stopPropagation(); open(); }}
                    style={{padding:'12px 14px',background:'var(--bg-surface)',borderRadius:6,border:'1px solid var(--border-light)',cursor:'pointer',transition:'background 0.15s, border-color 0.15s'}}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-warm-light)'; e.currentTarget.style.borderColor = 'var(--accent-warm)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                  >
                    <div style={{fontSize:10,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>Units</div>
                    <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)'}}>{b.unitCount}</div>
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{occupancyPct}% occupied</div>
                    <div style={{fontSize:10,color:'var(--text-muted)',marginTop:3}}>View floors & units</div>
                  </div>
                  {isCommercial && (
                    <PMCStat label="Monthly Run-Rate"  value={'AED ' + Math.round(b.monthlyRev).toLocaleString()}          onClick={() => setDrill({ building: b, view: 'tenants' })}        hint="Tenants + lease rates"/>
                  )}
                  <PMCStat label="Total Billed"      value={'AED ' + Math.round(totalBilled).toLocaleString()}           onClick={() => setDrill({ building: b, view: 'invoices' })}       hint="All invoices for this building"/>
                  <PMCStat label="Collected"         value={'AED ' + Math.round(b.collected).toLocaleString()}           onClick={() => setDrill({ building: b, view: 'collected' })}      color="#5a6b4f" hint="Paid invoices only"/>
                  <PMCStat label="Outstanding"       value={'AED ' + Math.round(b.outstanding).toLocaleString()}         onClick={() => setDrill({ building: b, view: 'outstanding' })}    color={b.outstanding > 0 ? '#8b4a42' : null} hint="Pending + Overdue"/>
                  <PMCStat label="Open SRs"          value={b.openSRs + ' open · ' + b.totalSRs + ' total'}              onClick={() => setDrill({ building: b, view: 'srs' })}            hint="Service requests for this building"/>
                </div>
              </div>
            );
          };

          // Section block: eyebrow + count subline + cards (or empty state).
          const renderSection = (label, kind, list) => (
            <div style={{marginBottom:32}}>
              <div style={{...sectionEyebrow, marginBottom:4}}>{label}</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14}}>
                {list.length} {list.length === 1 ? 'building' : 'buildings'}
              </div>
              {list.length === 0 ? (
                <div className="card"><div style={{padding:32,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>No {label.toLowerCase()} buildings yet. Add via <strong>Profile Creation → Buildings</strong>.</div></div>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'1fr',gap:18}}>
                  {list.map(b => renderBuildingCard(b, kind))}
                </div>
              )}
            </div>
          );

          const residential = buildings.filter(b => b.property_type === 'Residential');
          const commercial  = buildings.filter(b => b.property_type === 'Commercial');
          const villas      = buildings.filter(b => b.property_type === 'Villa');

          return (
            <>
              {renderSection('Residential', 'Residential', residential)}
              {renderSection('Commercial',  'Commercial',  commercial)}
              {renderSection('Villas',      'Villa',       villas)}
            </>
          );
        })()
      }

      {selectedBuilding && <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)}/>}
    </div>
  );
};

