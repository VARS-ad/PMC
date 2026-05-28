// ==================== PROFILE CREATION (PMC admin) ====================

const PC_TEMPLATES = {
  buildings: {
    label: 'Buildings',
    headers: ['Building name','Floor','Unit','Address','Notes'],
    examples: [
      ['Aljil Tower',1,'A-101','Sheikh Zayed Rd, Dubai, UAE','Mixed residential/commercial.'],
      ['Aljil Tower',1,'A-102','',''],
      ['Aljil Tower',2,'A-201','',''],
      ['Al Qurm View',1,'Q-101','Shams Abu Dhabi, Al Reem Island, Abu Dhabi','Low-rise residential.'],
    ],
    filename: 'buildings-template',
    rules: [
      'One row per unit. A building with 100 units = 100 rows; the same building name repeats on every row.',
      'Address and Notes are optional. Fill them on the FIRST row of each building; subsequent rows can leave them blank.',
      'Re-running the upload is safe: existing buildings/units are skipped (matched on Building + Unit).',
    ],
  },
  residents: {
    label: 'Residents',
    headers: [
      'Full name','Email','Phone','Building name','Floor','Unit number','Temporary password',
      'Date of birth','Passport number','Emirates ID',
      'Emergency contact name','Emergency contact phone','Employer','Occupation',
      'Tenure','Lease start','Lease end','Monthly payment (AED)','Ownership start',
    ],
    examples: [
      ['Aisha Al Mansoori','aisha.almansoori@example.ae','+971 50 412 8839','Aljil Tower',12,'B-1204','Welcome2026!','1988-04-15','AB1234567','784-1988-1234567-1','Mariam Al Mansoori','+971 50 444 9988','Emirates Group','Cabin Crew Manager','Owner','','','','2021-09-10'],
      ['Mohammed Al Hammadi','mohammed.alhammadi@example.ae','+971 55 234 1187','Aljil Tower',8,'A-803','Welcome2026!','1990-11-22','CD7654321','784-1990-7654321-2','Khalid Al Hammadi','+971 55 988 1234','Mubadala','Financial Analyst','Tenant','2025-03-01','2026-02-28',12000,''],
    ],
    filename: 'residents-template',
    rules: [
      'Building name must match an existing building exactly (e.g. \'Aljil Tower\').',
      'Unit number must match an existing unit in that building.',
      'Temporary password is what the resident uses on first sign-in. They can change it afterwards.',
      'Email must be unique across all VARS users.',
      'Date of birth — use ISO format YYYY-MM-DD.',
      'Emirates ID — 15-digit UAE ID (e.g. 784-1988-1234567-1). Optional but recommended.',
      'Passport number, Emergency contact, Employer, Occupation — all optional.',
      'Tenure — one of: Owner, Tenant.',
      'Tenants: fill Lease start, Lease end, Monthly payment (AED). Leave Ownership start empty.',
      'Owners: fill Ownership start. Leave Lease start / Lease end / Monthly payment empty.',
    ],
  },
  security: {
    label: 'Security',
    headers: ['Full name','Email','Phone','Building name','Shift','Temporary password','Date of birth','Passport number'],
    examples: [
      ['Ivan Petrov','ivan.petrov@example.ae','+971 50 111 2233','Aljil Tower','Day','Welcome2026!','1985-07-14','AB1234567'],
      ['Hassan Al Marri','hassan.almarri@example.ae','+971 55 778 4412','Al Qurm View','Night','Welcome2026!','1990-02-03','CD7654321'],
    ],
    filename: 'security-template',
    rules: [
      'Building name must match an existing building exactly.',
      'Shift must be one of: Day, Night, 24h.',
      'Email must be unique across all VARS users.',
      'Date of birth — use ISO format YYYY-MM-DD.',
      'Passport number — letters + digits, as printed on the document.',
    ],
  },
  vendors: {
    label: 'Vendors',
    headers: [
      'Company name','Service category','Contact person','Phone','Email','Address',
      'Contract start','Contract end','Contract value (AED)',
      'Trade license','TRN','Buildings covered','Status','Notes',
    ],
    examples: [
      ['AquaFix Plumbing LLC','Plumbing','Hassan Al Awadi','+971 50 111 2233','hassan@aquafix.ae','Sheikh Zayed Rd, Dubai','2026-01-01','2026-12-31',30000,'1234567','123456789012345','Aljil Tower, Al Qurm View','Active','Quarterly inspections + emergency callout'],
      ['Spark Electric Services','Electrical','Maryam Al Suwaidi','+971 55 444 5566','info@sparkelectric.ae','Al Reem Island, Abu Dhabi','2025-06-15','2026-06-14',18500,'7890123','987654321098765','Aljil Tower','Expiring Soon','Annual maintenance contract'],
      ['CrystalClean Co.','Cleaning','Aisha Al Marzouqi','+971 50 909 1212','ops@crystalclean.ae','Al Quoz, Dubai','2025-09-01','2026-08-31',24000,'5566778','455667788990011','Al Qurm View','Active','Daily cleaning of common areas'],
    ],
    filename: 'vendors-template',
    rules: [
      'Company name and Service category are required.',
      'Service category must be one of: Plumbing, Electrical, HVAC, Cleaning, Security, Gardening, Pest Control, Lift Maintenance, General Handyman, Other.',
      'Status — Active, Expiring Soon, Expired, or Terminated. Defaults to Active when blank.',
      'Dates use ISO format YYYY-MM-DD.',
      'Buildings covered — comma-separated list of existing building names (e.g. "Aljil Tower, Al Qurm View"). Names that don\'t match an existing building are skipped silently.',
      'Re-running the upload is safe: vendors are matched on Company name and skipped if already present.',
      'After the metadata upload completes, an optional "Bulk attach documents" section appears where you can drag-drop multiple files at once.',
    ],
  },
  amenities:   { label: 'Amenities',   readOnly: true },
  maintenance: { label: 'Maintenance', readOnly: true },
  payments:    { label: 'Payments',    readOnly: true },
};

function downloadAsXlsx(filename, headers, rows) {
  if (!window.XLSX) { alert('XLSX library not available'); return; }
  const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Template');
  window.XLSX.writeFile(wb, filename + '.xlsx');
}

function downloadAsCsv(filename, headers, rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function parseUploadedFile(file) {
  if (!window.XLSX) throw new Error('XLSX library not available');
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) {
    const text = await file.text();
    const wb = window.XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  }
  const buffer = await file.arrayBuffer();
  const wb = window.XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
}

function findHeaderRowIndex(rows, expectedHeaders) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = (rows[i] || []).map(c => c == null ? '' : String(c).trim().toLowerCase());
    const allFound = expectedHeaders.every(h => row.includes(h.toLowerCase()));
    if (allFound) return i;
  }
  return -1;
}

function rowsToObjects(parsedRows, headers) {
  const idx = findHeaderRowIndex(parsedRows, headers);
  if (idx < 0) throw new Error('Header row not found. Expected columns: ' + headers.join(', '));
  const headerRow = parsedRows[idx].map(c => c == null ? '' : String(c).trim());
  const colIndex = {};
  headers.forEach(h => {
    colIndex[h] = headerRow.findIndex(hh => hh.toLowerCase() === h.toLowerCase());
  });
  const dataRows = parsedRows.slice(idx + 1).filter(r => r && r.some(c => c != null && String(c).trim() !== ''));
  return dataRows.map(r => {
    const obj = {};
    headers.forEach(h => {
      const v = r[colIndex[h]];
      obj[h] = (v == null || v === '') ? null : (typeof v === 'string' ? v.trim() : v);
    });
    return obj;
  });
}

const ProfileCreationPage = () => {
  // Allow other pages (e.g. the Vendors page's "Bulk Upload" button) to land
  // the user directly on a specific section by setting this global hint
  // before calling setPage('profileCreation'). We consume + clear it once.
  const [section, setSection] = useState(() => {
    const hint = (typeof window !== 'undefined') ? window._profileCreationInitialSection : null;
    if (hint) { try { window._profileCreationInitialSection = null; } catch(e) {} return hint; }
    return 'buildings';
  });
  const [inner, setInner] = useState('summary');
  const [authChecked, setAuthChecked] = useState(false);
  const [pmcSession, setPmcSession] = useState(null);
  const isReadOnly = !!(PC_TEMPLATES[section] && PC_TEMPLATES[section].readOnly);
  // Vendors only has a Bulk upload sub-tab (no Summary / Manual — that lives
  // on the dedicated Vendors page in the sidebar).
  const vendorsOnly = section === 'vendors';
  const effectiveInner = isReadOnly ? 'summary' : (vendorsOnly ? 'bulk' : inner);
  const innerTabs = vendorsOnly ? ['bulk'] : ['summary','bulk','manual'];

  useEffect(() => {
    if (!supabaseClient) { setAuthChecked(true); return; }
    supabaseClient.auth.getSession().then(({ data }) => {
      setPmcSession(data?.session || null);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) {
    return <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Checking session…</div></div>;
  }

  const authRole = pmcSession?.user?.app_metadata?.role;
  if (!pmcSession || authRole !== 'pmc') {
    return (
      <div>
        <div className="page-header"><div><h1>Profile Creation</h1><div className="subtitle">Sign in with your PMC account to manage buildings, residents, and security.</div></div></div>
        <div className="card" style={{padding:32,textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:14}}>
            {pmcSession ? 'Your account does not have PMC privileges.' : 'You are not signed in to a real VARS account yet.'}
          </div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>Log out (top-right) and sign in with email <strong>pmc@vars.ae</strong> / <strong>Welcome2026!</strong> to access this section.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Profile Creation</h1>
          <div className="subtitle">Onboard buildings, residents, and security staff. Bulk via Excel/CSV or one by one.</div>
        </div>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:20,borderBottom:'1px solid var(--border-light)'}}>
        {Object.entries(PC_TEMPLATES).map(([id, cfg]) => (
          <div key={id}
            onClick={() => { setSection(id); setInner(id === 'vendors' ? 'bulk' : 'summary'); }}
            style={{padding:'10px 18px',cursor:'pointer',fontSize:13,fontWeight:section===id?500:400,color:section===id?'var(--text-dark)':'var(--text-secondary)',borderBottom: section===id ? '2px solid var(--bg-warm-dark)' : '2px solid transparent',marginBottom:-1,letterSpacing:'-0.01em'}}>
            {cfg.label}
          </div>
        ))}
      </div>

      {!isReadOnly && innerTabs.length > 1 && (
        <div style={{display:'flex',gap:8,marginBottom:24}}>
          {innerTabs.map(id => (
            <div key={id}
              onClick={() => setInner(id)}
              style={{padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:inner===id?500:400,color:inner===id?'var(--text-dark)':'var(--text-secondary)',border: inner===id ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',borderRadius:8,background:inner===id?'var(--bg-surface)':'#fff',letterSpacing:'-0.01em'}}>
              {id === 'bulk' ? 'Bulk upload' : id === 'manual' ? 'Manual upload' : 'Summary'}
            </div>
          ))}
        </div>
      )}

      {effectiveInner === 'summary' && <PCSummary section={section}/>}
      {effectiveInner === 'bulk'    && <PCBulkUpload section={section}/>}
      {effectiveInner === 'manual'  && <PCManualUpload section={section}/>}
    </div>
  );
};

const PCSummary = ({ section }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [editing, setEditing] = useState(null); // { kind: 'building' | 'resident' | 'security', record }
  const [viewingResident, setViewingResident] = useState(null);

  const reload = async () => {
    setError(null); setRows(null);
    if (!supabaseClient) { setError('Supabase not initialized'); return; }
    try {
      let data;
      if (section === 'buildings') {
        const { data: buildings, error: be } = await supabaseClient.from('buildings').select('id,name,address,notes,created_at').order('name');
        if (be) throw be;
        const { data: units, error: ue } = await supabaseClient.from('units').select('id,building_id,floor,unit_number').order('floor').order('unit_number');
        if (ue) throw ue;
        data = (buildings || []).map(b => ({ ...b, units: (units || []).filter(u => u.building_id === b.id) }));
      } else if (section === 'residents') {
        const { data: profs, error: pe } = await supabaseClient.from('profiles').select('id,full_name,phone,created_at,date_of_birth,passport_number').eq('role','resident').order('full_name');
        if (pe) throw pe;
        const ids = (profs || []).map(p => p.id);
        let assignments = [];
        let emailMap = {};
        if (ids.length) {
          const [{ data: ras }, { data: emails }] = await Promise.all([
            supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,lease_start,lease_end,monthly_payment_aed,ownership_start').in('profile_id', ids),
            supabaseClient.rpc('get_emails_for_profiles', { p_ids: ids }),
          ]);
          assignments = ras || [];
          emailMap = Object.fromEntries((emails || []).map(e => [e.id, e.email]));
        }
        const unitIds = assignments.map(a => a.unit_id);
        let units = [];
        if (unitIds.length) {
          const { data: us } = await supabaseClient.from('units').select('id,floor,unit_number,building_id').in('id', unitIds);
          units = us || [];
        }
        const buildingIds = [...new Set(units.map(u => u.building_id))];
        let buildings = [];
        if (buildingIds.length) {
          const { data: bs } = await supabaseClient.from('buildings').select('id,name').in('id', buildingIds);
          buildings = bs || [];
        }
        const unitById = Object.fromEntries(units.map(u => [u.id, u]));
        const buildingById = Object.fromEntries(buildings.map(b => [b.id, b]));
        data = (profs || []).map(p => {
          const ra = assignments.find(a => a.profile_id === p.id);
          const unit = ra && unitById[ra.unit_id];
          const building = unit && buildingById[unit.building_id];
          return {
            id: p.id, full_name: p.full_name, phone: p.phone, created_at: p.created_at,
            email: emailMap[p.id] || '—',
            date_of_birth: p.date_of_birth, passport_number: p.passport_number,
            building_name: building ? building.name : '—',
            floor: unit ? unit.floor : '—',
            unit_number: unit ? unit.unit_number : '—',
            tenure: ra ? ra.tenure : null,
            lease_start: ra ? ra.lease_start : null,
            lease_end: ra ? ra.lease_end : null,
            monthly_payment_aed: ra ? ra.monthly_payment_aed : null,
            ownership_start: ra ? ra.ownership_start : null,
          };
        });
      } else if (section === 'security') {
        const { data: profs, error: pe } = await supabaseClient.from('profiles').select('id,full_name,phone,created_at,date_of_birth,passport_number').eq('role','security').order('full_name');
        if (pe) throw pe;
        const ids = (profs || []).map(p => p.id);
        let assignments = [];
        let emailMap = {};
        if (ids.length) {
          const [{ data: sas }, { data: emails }] = await Promise.all([
            supabaseClient.from('security_assignments').select('profile_id,building_id,shift').in('profile_id', ids),
            supabaseClient.rpc('get_emails_for_profiles', { p_ids: ids }),
          ]);
          assignments = sas || [];
          emailMap = Object.fromEntries((emails || []).map(e => [e.id, e.email]));
        }
        const buildingIds = [...new Set(assignments.map(a => a.building_id))];
        let buildings = [];
        if (buildingIds.length) {
          const { data: bs } = await supabaseClient.from('buildings').select('id,name').in('id', buildingIds);
          buildings = bs || [];
        }
        const buildingById = Object.fromEntries(buildings.map(b => [b.id, b]));
        data = (profs || []).map(p => {
          const sa = assignments.find(a => a.profile_id === p.id);
          return {
            id: p.id, full_name: p.full_name, phone: p.phone, created_at: p.created_at,
            email: emailMap[p.id] || '—',
            date_of_birth: p.date_of_birth,
            passport_number: p.passport_number,
            building_id: sa ? sa.building_id : null,
            building_name: sa && buildingById[sa.building_id] ? buildingById[sa.building_id].name : '—',
            shift: sa ? sa.shift : '—',
          };
        });
      } else if (section === 'amenities') {
        const { data: bookings, error: e1 } = await supabaseClient.from('amenity_bookings').select('id,amenity_name,booking_date,start_time,end_time,guests,status,building_id,unit_id,resident_profile_id,created_at').order('booking_date', { ascending: false });
        if (e1) throw e1;
        const bIds = [...new Set((bookings || []).map(b => b.building_id))];
        const uIds = [...new Set((bookings || []).map(b => b.unit_id).filter(Boolean))];
        const rIds = [...new Set((bookings || []).map(b => b.resident_profile_id).filter(Boolean))];
        const [bRes, uRes, rRes] = await Promise.all([
          bIds.length ? supabaseClient.from('buildings').select('id,name').in('id', bIds) : Promise.resolve({ data: [] }),
          uIds.length ? supabaseClient.from('units').select('id,unit_number').in('id', uIds) : Promise.resolve({ data: [] }),
          rIds.length ? supabaseClient.from('profiles').select('id,full_name').in('id', rIds) : Promise.resolve({ data: [] }),
        ]);
        const bMap = Object.fromEntries((bRes.data || []).map(b => [b.id, b]));
        const uMap = Object.fromEntries((uRes.data || []).map(u => [u.id, u]));
        const rMap = Object.fromEntries((rRes.data || []).map(r => [r.id, r]));
        data = (bookings || []).map(b => ({
          ...b,
          building_name: (bMap[b.building_id] && bMap[b.building_id].name) || '—',
          unit_label: (b.unit_id && uMap[b.unit_id] && uMap[b.unit_id].unit_number) || '—',
          resident_name: (b.resident_profile_id && rMap[b.resident_profile_id] && rMap[b.resident_profile_id].full_name) || '—',
        }));
      } else if (section === 'maintenance') {
        const { data: srs, error: e1 } = await supabaseClient.from('service_requests').select('id,category,description,priority,status,preferred_date,unit_id,resident_profile_id,created_at').order('created_at', { ascending: false });
        if (e1) throw e1;
        const uIds = [...new Set((srs || []).map(s => s.unit_id).filter(Boolean))];
        const rIds = [...new Set((srs || []).map(s => s.resident_profile_id).filter(Boolean))];
        const [uRes, rRes] = await Promise.all([
          uIds.length ? supabaseClient.from('units').select('id,unit_number,building_id').in('id', uIds) : Promise.resolve({ data: [] }),
          rIds.length ? supabaseClient.from('profiles').select('id,full_name').in('id', rIds) : Promise.resolve({ data: [] }),
        ]);
        const bIds = [...new Set((uRes.data || []).map(u => u.building_id))];
        const bRes = bIds.length ? await supabaseClient.from('buildings').select('id,name').in('id', bIds) : { data: [] };
        const uMap = Object.fromEntries((uRes.data || []).map(u => [u.id, u]));
        const rMap = Object.fromEntries((rRes.data || []).map(r => [r.id, r]));
        const bMap = Object.fromEntries((bRes.data || []).map(b => [b.id, b]));
        data = (srs || []).map(s => {
          const u = s.unit_id && uMap[s.unit_id];
          return {
            ...s,
            unit_label: u ? u.unit_number : '—',
            building_name: (u && bMap[u.building_id] && bMap[u.building_id].name) || '—',
            resident_name: (s.resident_profile_id && rMap[s.resident_profile_id] && rMap[s.resident_profile_id].full_name) || '—',
          };
        });
      } else if (section === 'payments') {
        const { data: invs, error: e1 } = await supabaseClient.from('invoices').select('id,invoice_number,description,amount_aed,due_date,status,source_type,unit_id,resident_profile_id,created_at').order('created_at', { ascending: false });
        if (e1) throw e1;
        const uIds = [...new Set((invs || []).map(i => i.unit_id).filter(Boolean))];
        const rIds = [...new Set((invs || []).map(i => i.resident_profile_id).filter(Boolean))];
        const [uRes, rRes] = await Promise.all([
          uIds.length ? supabaseClient.from('units').select('id,unit_number,building_id').in('id', uIds) : Promise.resolve({ data: [] }),
          rIds.length ? supabaseClient.from('profiles').select('id,full_name').in('id', rIds) : Promise.resolve({ data: [] }),
        ]);
        const bIds = [...new Set((uRes.data || []).map(u => u.building_id))];
        const bRes = bIds.length ? await supabaseClient.from('buildings').select('id,name').in('id', bIds) : { data: [] };
        const uMap = Object.fromEntries((uRes.data || []).map(u => [u.id, u]));
        const rMap = Object.fromEntries((rRes.data || []).map(r => [r.id, r]));
        const bMap = Object.fromEntries((bRes.data || []).map(b => [b.id, b]));
        data = (invs || []).map(i => {
          const u = i.unit_id && uMap[i.unit_id];
          return {
            ...i,
            unit_label: u ? u.unit_number : '—',
            building_name: (u && bMap[u.building_id] && bMap[u.building_id].name) || '—',
            resident_name: (i.resident_profile_id && rMap[i.resident_profile_id] && rMap[i.resident_profile_id].full_name) || '—',
          };
        });
      }
      setRows(data);
    } catch (e) {
      setError(String(e.message || e));
    }
  };
  useEffect(() => { reload(); }, [section]);

  if (error) return (<div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div>);
  if (rows === null) return (<div className="card"><div style={{color:'var(--text-muted)',fontSize:13,padding:24}}>Loading…</div></div>);
  if (rows.length === 0) {
    const ro = !!(PC_TEMPLATES[section] && PC_TEMPLATES[section].readOnly);
    return (<div className="card"><div style={{color:'var(--text-muted)',fontSize:13,padding:32,textAlign:'center'}}>No {section} yet.{ro ? '' : <> Use the <strong>Bulk upload</strong> tab to add some.</>}</div></div>);
  }

  if (section === 'buildings') {
    return (
      <>
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} building{rows.length===1?'':'s'} · click a row to see floors & units</div>
            <button className="btn btn-sm" onClick={reload}>Refresh</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Address</th><th>Floors</th><th>Units</th><th>Created</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
            <tbody>
              {rows.map(b => {
                const floors = new Set((b.units||[]).map(u => u.floor)).size;
                return (
                  <tr key={b.id} style={{cursor:'pointer'}} onClick={() => setSelectedBuilding(b)}>
                    <td style={{fontWeight:500}}>{b.name}</td>
                    <td>{b.address || '—'}</td>
                    <td>{floors}</td>
                    <td>{(b.units||[]).length}</td>
                    <td>{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                      <button onClick={(e) => { e.stopPropagation(); setEditing({ kind: 'building', record: b }); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm('Delete "' + b.name + '" and all its ' + (b.units||[]).length + ' unit(s)? This cannot be undone.')) return;
                        supabaseClient.from('buildings').delete().eq('id', b.id).then(({error}) => {
                          if (error) alert('Delete failed: ' + error.message); else reload();
                        });
                      }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selectedBuilding && <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)}/>}
        {editing && <EditRecordModal kind={editing.kind} record={editing.record} onClose={() => setEditing(null)} onSaved={reload}/>}
      </>
    );
  }

  if (section === 'residents') {
    return (
      <>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} resident{rows.length===1?'':'s'}</div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Passport</th><th>DOB</th><th>Building</th><th>Floor</th><th>Unit</th><th>Created</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} onClick={() => setViewingResident(r)} style={{cursor:'pointer'}}>
                <td style={{fontWeight:500}}>{r.full_name}</td>
                <td style={{fontSize:12,color:'var(--accent-warm-dark)'}}>{r.email}</td>
                <td>{r.phone || '—'}</td>
                <td>{r.passport_number || '—'}</td>
                <td>{r.date_of_birth || '—'}</td>
                <td>{r.building_name}</td>
                <td>{r.floor}</td>
                <td>{r.unit_number}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                  <button onClick={(e) => { e.stopPropagation(); setEditing({ kind: 'resident', record: r }); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (!window.confirm('Delete resident "' + r.full_name + '"? This removes their login too.')) return;
                    const out = await deleteUsersViaFunction([r.id]);
                    const first = out && out.results && out.results[0];
                    if (!first || !first.ok) alert('Delete failed: ' + ((first && first.error) || (out && out.error) || 'Unknown'));
                    reload();
                  }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <EditRecordModal kind={editing.kind} record={editing.record} onClose={() => setEditing(null)} onSaved={reload}/>}
      {viewingResident && <ResidentDetailModal resident={viewingResident} onClose={() => setViewingResident(null)}/>}
      </>
    );
  }

  if (section === 'amenities') {
    return (
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} booking{rows.length===1?'':'s'} · read-only</div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Amenity</th><th>Building</th><th>Unit</th><th>Resident</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{fontWeight:500}}>{r.amenity_name}</td>
                <td>{r.building_name}</td>
                <td>{r.unit_label}</td>
                <td>{r.resident_name}</td>
                <td>{r.booking_date}</td>
                <td>{r.start_time ? (r.start_time + (r.end_time ? '–' + r.end_time : '')) : '—'}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (section === 'maintenance') {
    return (
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} request{rows.length===1?'':'s'} · read-only</div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Category</th><th>Description</th><th>Building</th><th>Unit</th><th>Resident</th><th>Priority</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{fontWeight:500}}>{r.category}</td>
                <td style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.description}>{r.description}</td>
                <td>{r.building_name}</td>
                <td>{r.unit_label}</td>
                <td>{r.resident_name}</td>
                <td>{r.priority}</td>
                <td>{r.status}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (section === 'payments') {
    return (
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} invoice{rows.length===1?'':'s'} · read-only</div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Invoice #</th><th>Description</th><th>Building</th><th>Unit</th><th>Resident</th><th style={{textAlign:'right'}}>Amount (AED)</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{fontWeight:500}}>{r.invoice_number || '—'}</td>
                <td style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.description}>{r.description}</td>
                <td>{r.building_name}</td>
                <td>{r.unit_label}</td>
                <td>{r.resident_name}</td>
                <td style={{textAlign:'right'}}>{Number(r.amount_aed).toLocaleString()}</td>
                <td>{r.due_date || '—'}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} guard{rows.length===1?'':'s'}</div>
        <button className="btn btn-sm" onClick={reload}>Refresh</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Passport</th><th>DOB</th><th>Building</th><th>Shift</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{fontWeight:500}}>{r.full_name}</td>
              <td style={{fontSize:12,color:'var(--accent-warm-dark)'}}>{r.email}</td>
              <td>{r.phone || '—'}</td>
              <td>{r.passport_number || '—'}</td>
              <td>{r.date_of_birth || '—'}</td>
              <td>{r.building_name}</td>
              <td>{r.shift}</td>
              <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                <button onClick={() => setEditing({ kind: 'security', record: r })} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
                <button onClick={async () => {
                  if (!window.confirm('Delete guard "' + r.full_name + '"? This removes their login too.')) return;
                  const out = await deleteUsersViaFunction([r.id]);
                  const first = out && out.results && out.results[0];
                  if (!first || !first.ok) alert('Delete failed: ' + ((first && first.error) || (out && out.error) || 'Unknown'));
                  reload();
                }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {editing && <EditRecordModal kind={editing.kind} record={editing.record} onClose={() => setEditing(null)} onSaved={reload}/>}
    </>
  );
};

const BuildingDetailModal = ({ building, onClose }) => {
  const [unitForAttachments, setUnitForAttachments] = useState(null);
  const byFloor = {};
  (building.units || []).forEach(u => { (byFloor[u.floor] = byFloor[u.floor] || []).push(u); });
  Object.keys(byFloor).forEach(f => byFloor[f].sort((a,b) => String(a.unit_number).localeCompare(String(b.unit_number))));
  const floors = Object.keys(byFloor).map(Number).sort((a,b) => a-b);
  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:680}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Building</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">{building.address || ''}</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:6}}>{floors.length} floor{floors.length===1?'':'s'} · {(building.units||[]).length} units</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{maxHeight:480,overflowY:'auto'}}>
          {floors.map(f => (
            <div key={f} style={{marginBottom:18,paddingBottom:14,borderBottom:'1px solid var(--border-light)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>Floor {f}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{byFloor[f].length} unit{byFloor[f].length===1?'':'s'}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',gap:6}}>
                {byFloor[f].map(u => (
                  <div key={u.id} onClick={() => setUnitForAttachments(u)} style={{padding:'8px 10px',border:'1px solid var(--border-light)',borderRadius:6,fontSize:12,background:'var(--bg-surface)',textAlign:'center',cursor:'pointer',transition:'background 0.15s'}} onMouseEnter={e => e.currentTarget.style.background='var(--accent-warm-light)'} onMouseLeave={e => e.currentTarget.style.background='var(--bg-surface)'} title="Click to manage attachments">{u.unit_number}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    {unitForAttachments && <UnitAttachmentsModal unit={unitForAttachments} buildingName={building.name} onClose={() => setUnitForAttachments(null)}/>}
    </>
  );
};

const PCBulkUpload = ({ section }) => {
  const cfg = PC_TEMPLATES[section];
  const fileInputRef = useRef(null);
  const [parsedRows, setParsedRows] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [conflictMode, setConflictMode] = useState('skip'); // 'skip' | 'update' — what happens when an email already exists

  const handleFile = async (e) => {
    setError(null); setResults(null); setParsedRows(null);
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseUploadedFile(file);
      const objs = rowsToObjects(rows, cfg.headers);
      setParsedRows(objs);
    } catch (err) {
      setError(String(err.message || err));
    }
  };

  const submit = async () => {
    if (!parsedRows || parsedRows.length === 0) return;
    setUploading(true); setError(null); setResults(null);
    try {
      if (section === 'buildings') {
        const res = await uploadBuildingsBulk(parsedRows);
        setResults(res);
      } else if (section === 'vendors') {
        const res = await uploadVendorsBulk(parsedRows);
        setResults(res);
      } else {
        const records = parsedRows.map(r => {
          if (section === 'residents') {
            return {
              email: r['Email'], password: r['Temporary password'], full_name: r['Full name'],
              phone: r['Phone'], role: 'resident',
              building_name: r['Building name'], unit_number: r['Unit number'],
              date_of_birth: r['Date of birth'] || null,
              passport_number: r['Passport number'] || null,
              emirates_id: r['Emirates ID'] || null,
              emergency_contact_name: r['Emergency contact name'] || null,
              emergency_contact_phone: r['Emergency contact phone'] || null,
              employer: r['Employer'] || null,
              occupation: r['Occupation'] || null,
              tenure: r['Tenure'] || null,
              lease_start: r['Lease start'] || null,
              lease_end: r['Lease end'] || null,
              monthly_payment_aed: r['Monthly payment (AED)'] != null && r['Monthly payment (AED)'] !== '' ? Number(r['Monthly payment (AED)']) : null,
              ownership_start: r['Ownership start'] || null,
            };
          }
          return {
            email: r['Email'], password: r['Temporary password'], full_name: r['Full name'],
            phone: r['Phone'], role: 'security',
            building_name: r['Building name'], shift: r['Shift'],
            date_of_birth: r['Date of birth'] || null,
            passport_number: r['Passport number'] || null,
          };
        });
        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers = { 'Content-Type': 'application/json' };
        if (session && session.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
        const resp = await fetch(SUPABASE_URL + '/functions/v1/bulk-onboard', {
          method: 'POST', headers, body: JSON.stringify({ records, mode: conflictMode }),
        });
        const out = await resp.json();
        setResults(out);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
    setUploading(false);
  };

  return (
    <div>
      <div className="card" style={{background:'var(--accent-warm-light)',border:'1px solid var(--border-medium)'}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>How bulk onboarding works</div>
        <ol style={{fontSize:12,color:'var(--text-secondary)',paddingLeft:18,lineHeight:1.8,margin:0}}>
          <li>Download the template (.xlsx or .csv).</li>
          <li>Open it in Excel, Google Sheets, or any spreadsheet tool. Replace the example rows with your real data.</li>
          <li>Save and upload it back. We'll preview the rows, flag duplicates and errors, then create the records in batch.</li>
        </ol>
      </div>

      <div className="card">
        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:12}}>1. Example data</div>
        <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>The template is pre-populated with rows that look like this. Replace them with your real data before uploading.</div>
        <div style={{overflowX:'auto'}}>
          <table className="data-table" style={{fontSize:12}}>
            <thead><tr>{cfg.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{cfg.examples.map((row,i) => (<tr key={i}>{row.map((v,j) => <td key={j}>{v == null || v === '' ? '—' : v}</td>)}</tr>))}</tbody>
          </table>
        </div>
        <ul style={{fontSize:12,color:'var(--text-secondary)',paddingLeft:20,marginTop:14,marginBottom:0,lineHeight:1.8}}>
          {cfg.rules.map((r,i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

      <div className="card">
        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6}}>2. Download template</div>
        <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14}}>Same example rows as above, in the format you prefer.</div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn btn-primary" onClick={() => downloadAsXlsx(cfg.filename, cfg.headers, cfg.examples)}>Download .xlsx</button>
          <button className="btn" onClick={() => downloadAsCsv(cfg.filename, cfg.headers, cfg.examples)}>Download .csv</button>
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:12}}>3. Upload completed file</div>
        {section !== 'buildings' && (
          <div style={{marginBottom:14,padding:'12px 14px',background:'var(--bg-page)',borderRadius:8,border:'1px solid var(--border-light)'}}>
            <div style={{fontSize:11,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:10,fontWeight:500}}>When an email already exists</div>
            <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
              <label style={{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer',fontSize:12,flex:'1 1 240px'}}>
                <input type="radio" name={'conflictMode_' + section} value="skip" checked={conflictMode==='skip'} onChange={e => setConflictMode(e.target.value)} style={{marginTop:3,cursor:'pointer'}}/>
                <div>
                  <div style={{fontWeight:500,color:'var(--text-dark)'}}>Skip existing (default)</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,lineHeight:1.4}}>Rows whose email is already registered are ignored. The existing account is left untouched.</div>
                </div>
              </label>
              <label style={{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer',fontSize:12,flex:'1 1 240px'}}>
                <input type="radio" name={'conflictMode_' + section} value="update" checked={conflictMode==='update'} onChange={e => setConflictMode(e.target.value)} style={{marginTop:3,cursor:'pointer'}}/>
                <div>
                  <div style={{fontWeight:500,color:'var(--text-dark)'}}>Update existing</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,lineHeight:1.4}}>Refresh name, phone, building/unit, shift, and reset the temp password. The Supabase Auth account UUID and all history (visits, bookings, invoices) stay intact.</div>
                </div>
              </label>
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={handleFile} style={{fontSize:12}}/>
        {error && <div style={{color:'#8b4a42',fontSize:12,marginTop:12,padding:10,background:'#fdf2f1',borderRadius:6}}>Error: {error}</div>}
        {parsedRows && (
          <div style={{marginTop:16}}>
            <div style={{fontSize:12,fontWeight:500,marginBottom:8}}>Preview — {parsedRows.length} row{parsedRows.length===1?'':'s'}</div>
            <div style={{maxHeight:280,overflowY:'auto',border:'1px solid var(--border-light)',borderRadius:6}}>
              <table className="data-table" style={{fontSize:11}}>
                <thead><tr>{cfg.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{parsedRows.slice(0,50).map((r,i) => (<tr key={i}>{cfg.headers.map(h => <td key={h}>{r[h] == null ? '—' : String(r[h])}</td>)}</tr>))}</tbody>
              </table>
              {parsedRows.length > 50 && <div style={{padding:8,fontSize:11,color:'var(--text-muted)',textAlign:'center'}}>… and {parsedRows.length - 50} more rows.</div>}
            </div>
            <button className="btn btn-primary" style={{marginTop:14}} disabled={uploading} onClick={submit}>
              {uploading ? 'Uploading…' : 'Create ' + parsedRows.length + ' record' + (parsedRows.length === 1 ? '' : 's')}
            </button>
          </div>
        )}
        {results && (
          <div style={{marginTop:16,padding:14,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
            <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Upload results</div>
            <BulkUploadResults section={section} results={results}/>
          </div>
        )}
      </div>

      {/* Vendors: optional bulk attachments step shown only after a successful metadata upload */}
      {section === 'vendors' && results && (results.results || []).some(r => r.ok) && (
        <PCVendorAttachments createdVendors={(results.results || []).filter(r => r.ok)}/>
      )}
    </div>
  );
};

async function uploadBuildingsBulk(parsedRows) {
  const results = [];
  const buildingMap = {};
  for (const row of parsedRows) {
    const bname = (row['Building name'] || '').toString().trim();
    if (!bname) { results.push({ row: JSON.stringify(row), ok: false, error: 'Missing building name' }); continue; }
    if (!buildingMap[bname]) {
      buildingMap[bname] = { name: bname, address: row['Address'] || null, notes: row['Notes'] || null, units: [] };
    }
    if (!buildingMap[bname].address && row['Address']) buildingMap[bname].address = row['Address'];
    if (!buildingMap[bname].notes && row['Notes']) buildingMap[bname].notes = row['Notes'];
    buildingMap[bname].units.push({
      floor: row['Floor'] != null ? Number(row['Floor']) : null,
      unit_number: row['Unit'] != null ? String(row['Unit']).trim() : null,
    });
  }
  for (const bname of Object.keys(buildingMap)) {
    const b = buildingMap[bname];
    const { data: existing } = await supabaseClient.from('buildings').select('id').eq('name', bname).maybeSingle();
    let buildingId;
    if (existing) {
      buildingId = existing.id;
    } else {
      const { data: newB, error: bErr } = await supabaseClient.from('buildings').insert({ name: bname, address: b.address, notes: b.notes }).select('id').single();
      if (bErr) { results.push({ building: bname, ok: false, error: 'building insert: ' + bErr.message }); continue; }
      buildingId = newB.id;
    }
    const { data: existingUnits } = await supabaseClient.from('units').select('unit_number').eq('building_id', buildingId);
    const existingNumbers = new Set((existingUnits || []).map(u => u.unit_number));
    const toInsert = b.units
      .filter(u => u.unit_number && !existingNumbers.has(u.unit_number) && u.floor != null && !isNaN(u.floor))
      .map(u => ({ building_id: buildingId, floor: u.floor, unit_number: u.unit_number }));
    let unitsAdded = 0;
    if (toInsert.length) {
      const { error: uErr } = await supabaseClient.from('units').insert(toInsert);
      if (uErr) { results.push({ building: bname, ok: false, error: 'units insert: ' + uErr.message }); continue; }
      unitsAdded = toInsert.length;
    }
    results.push({ building: bname, ok: true, units_added: unitsAdded, units_skipped: b.units.length - unitsAdded });
  }
  return { results };
}

// =========================================================================
// uploadVendorsBulk — insert vendor rows + vendor_buildings M2M from parsed
// spreadsheet rows. Skips vendors whose `Company name` already exists. Each
// row's `Buildings covered` cell is parsed as a comma-separated list and
// matched (case-insensitive) against existing buildings; unmatched names are
// silently dropped.
// =========================================================================
async function uploadVendorsBulk(parsedRows) {
  const results = [];
  const validCategories = ['Plumbing','Electrical','HVAC','Cleaning','Security','Gardening','Pest Control','Lift Maintenance','General Handyman','Other'];
  const validStatuses   = ['Active','Expiring Soon','Expired','Terminated'];

  // Pre-fetch existing vendors + buildings so we can dedupe + resolve names
  const { data: existingVendors } = await supabaseClient.from('vendors').select('id,name');
  const existingByName = Object.fromEntries((existingVendors || []).map(v => [v.name.toLowerCase(), v]));
  const { data: buildings } = await supabaseClient.from('buildings').select('id,name');
  const buildingByName = Object.fromEntries((buildings || []).map(b => [b.name.toLowerCase(), b]));

  for (const row of parsedRows) {
    const name = (row['Company name'] || '').toString().trim();
    if (!name) { results.push({ vendor: '(blank)', ok: false, error: 'Company name is required' }); continue; }
    if (existingByName[name.toLowerCase()]) {
      results.push({ vendor: name, ok: true, action: 'skipped', skipped: true });
      continue;
    }
    const category = (row['Service category'] || '').toString().trim();
    if (!validCategories.includes(category)) {
      results.push({ vendor: name, ok: false, error: 'Service category "' + category + '" is not one of: ' + validCategories.join(', ') });
      continue;
    }
    const rawStatus = (row['Status'] || '').toString().trim() || 'Active';
    if (!validStatuses.includes(rawStatus)) {
      results.push({ vendor: name, ok: false, error: 'Status "' + rawStatus + '" is not one of: ' + validStatuses.join(', ') });
      continue;
    }
    const value = row['Contract value (AED)'];
    const payload = {
      name,
      service_category:    category,
      contact_person:      (row['Contact person'] || '').toString().trim() || null,
      contact_phone:       (row['Phone']          || '').toString().trim() || null,
      contact_email:       (row['Email']          || '').toString().trim() || null,
      address:             (row['Address']        || '').toString().trim() || null,
      contract_start:      row['Contract start']  || null,
      contract_end:        row['Contract end']    || null,
      contract_value_aed:  (value === '' || value == null) ? null : Number(value),
      trade_license:       (row['Trade license']  || '').toString().trim() || null,
      trn_number:          (row['TRN']            || '').toString().trim() || null,
      status:              rawStatus,
      notes:               (row['Notes']          || '').toString().trim() || null,
    };
    const { data: inserted, error: ie } = await supabaseClient.from('vendors').insert(payload).select('id').single();
    if (ie) { results.push({ vendor: name, ok: false, error: ie.message }); continue; }

    // Resolve buildings covered (comma-separated string of names → building IDs)
    const buildingsCsv = (row['Buildings covered'] || '').toString().trim();
    let buildingsLinked = 0, buildingsSkipped = 0;
    if (buildingsCsv) {
      const names = buildingsCsv.split(',').map(s => s.trim()).filter(Boolean);
      const ids = [];
      for (const n of names) {
        const b = buildingByName[n.toLowerCase()];
        if (b) ids.push(b.id); else buildingsSkipped++;
      }
      if (ids.length) {
        const linkRows = ids.map(bid => ({ vendor_id: inserted.id, building_id: bid }));
        const { error: le } = await supabaseClient.from('vendor_buildings').insert(linkRows);
        if (!le) buildingsLinked = ids.length;
      }
    }
    results.push({ vendor: name, ok: true, action: 'created', vendor_id: inserted.id, buildings_linked: buildingsLinked, buildings_skipped: buildingsSkipped });
  }
  return { results };
}

// =========================================================================
// PCVendorAttachments — optional bulk-attachments uploader shown after a
// successful vendor bulk upload. User picks (or drags) one or many files.
// For each file we auto-suggest:
//   • vendor      — the just-created vendor whose name is the longest
//                   case-insensitive substring of the filename (overridable)
//   • kind        — keyword in filename: "contract" → contract,
//                   "receipt" or "payment" → payment_receipt,
//                   "invoice" → invoice, else → other (overridable)
// Files upload sequentially to the maintenance-documents bucket; metadata
// goes to vendor_documents.
// =========================================================================
const PCVendorAttachments = ({ createdVendors }) => {
  const fileInputRef = useRef(null);
  const [pending, setPending] = useState([]); // [{ id, file, vendorId, kind, status, error }]
  const [busy, setBusy] = useState(false);

  // Build a quick map for filename → best vendor match (longest name substring)
  const knownVendors = (createdVendors || []).filter(r => r.vendor_id);
  const guessVendor = (filename) => {
    const lower = filename.toLowerCase();
    let best = null;
    knownVendors.forEach(v => {
      if (!v.vendor) return;
      const n = v.vendor.toLowerCase();
      if (n && lower.indexOf(n) !== -1 && (!best || v.vendor.length > best.vendor.length)) best = v;
    });
    return best ? best.vendor_id : (knownVendors[0]?.vendor_id || '');
  };
  const guessKind = (filename) => {
    const lower = filename.toLowerCase();
    if (/contract|agreement/.test(lower)) return 'contract';
    if (/receipt|payment[\s_-]*proof/.test(lower)) return 'payment_receipt';
    if (/invoice/.test(lower)) return 'invoice';
    return 'other';
  };

  const addFiles = (files) => {
    const additions = Array.from(files).map((f, i) => ({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + i,
      file: f,
      vendorId: guessVendor(f.name),
      kind: guessKind(f.name),
      status: 'pending', // pending | uploading | ok | error
      error: null,
    }));
    setPending(prev => [...prev, ...additions]);
  };

  const updatePending = (id, patch) => setPending(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  const removePending = (id) => setPending(prev => prev.filter(p => p.id !== id));

  const uploadAll = async () => {
    setBusy(true);
    for (const item of pending) {
      if (item.status === 'ok') continue;
      if (!item.vendorId) { updatePending(item.id, { status: 'error', error: 'Pick a vendor' }); continue; }
      updatePending(item.id, { status: 'uploading', error: null });
      try {
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = item.vendorId + '/' + item.kind + '-' + Date.now() + '-' + safeName;
        const { error: upErr } = await supabaseClient.storage.from('maintenance-documents').upload(path, item.file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabaseClient.from('vendor_documents').insert({
          vendor_id: item.vendorId, kind: item.kind, filename: item.file.name, storage_path: path,
        });
        if (insErr) throw insErr;
        updatePending(item.id, { status: 'ok' });
      } catch (e) {
        updatePending(item.id, { status: 'error', error: e.message || String(e) });
      }
    }
    setBusy(false);
  };

  const vendorOptions = knownVendors;
  const okCount  = pending.filter(p => p.status === 'ok').length;
  const errCount = pending.filter(p => p.status === 'error').length;
  const todoCount = pending.filter(p => p.status === 'pending').length;

  return (
    <div className="card" style={{marginTop: 18}}>
      <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6}}>4. Bulk attach documents (optional)</div>
      <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14}}>
        Attach contracts, receipts, invoices, or other files for the {knownVendors.length} vendor{knownVendors.length === 1 ? '' : 's'} you just uploaded.
        We try to guess the vendor and document kind from each filename — adjust as needed before uploading.
      </div>

      <input ref={fileInputRef} type="file" multiple accept=".pdf,image/*,.doc,.docx" style={{display:'none'}}
             onChange={e => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ''; }}/>
      <button className="btn" onClick={() => fileInputRef.current && fileInputRef.current.click()}>+ Choose files…</button>

      {pending.length > 0 && (
        <div style={{marginTop: 16}}>
          <div style={{maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 6}}>
            <table className="data-table" style={{fontSize: 12}}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Vendor</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(p => (
                  <tr key={p.id}>
                    <td style={{maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{p.file.name}</td>
                    <td>
                      <select className="form-input" value={p.vendorId} onChange={e => updatePending(p.id, { vendorId: e.target.value })} disabled={p.status === 'ok' || p.status === 'uploading'} style={{fontSize: 11, padding: '4px 6px'}}>
                        <option value="">— Pick vendor —</option>
                        {vendorOptions.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="form-input" value={p.kind} onChange={e => updatePending(p.id, { kind: e.target.value })} disabled={p.status === 'ok' || p.status === 'uploading'} style={{fontSize: 11, padding: '4px 6px'}}>
                        <option value="contract">Contract</option>
                        <option value="payment_receipt">Payment Receipt</option>
                        <option value="invoice">Invoice</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td style={{fontSize: 11}}>
                      {p.status === 'pending'   && <span style={{color: 'var(--text-muted)'}}>Pending</span>}
                      {p.status === 'uploading' && <span style={{color: '#a07d3c'}}>Uploading…</span>}
                      {p.status === 'ok'        && <span style={{color: '#5a6b4f', fontWeight: 500}}>✓ Uploaded</span>}
                      {p.status === 'error'     && <span style={{color: '#8b4a42'}}>{p.error || 'Failed'}</span>}
                    </td>
                    <td style={{textAlign: 'right'}}>
                      {p.status !== 'ok' && p.status !== 'uploading' && (
                        <button onClick={() => removePending(p.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#8b4a42', fontSize: 12}}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14}}>
            <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>
              {okCount > 0 && <span style={{color: '#5a6b4f', marginRight: 12}}>✓ {okCount} uploaded</span>}
              {errCount > 0 && <span style={{color: '#8b4a42', marginRight: 12}}>✗ {errCount} failed</span>}
              {todoCount > 0 && <span>{todoCount} pending</span>}
            </div>
            <button className="btn btn-primary" onClick={uploadAll} disabled={busy || todoCount === 0}>
              {busy ? 'Uploading…' : 'Upload ' + todoCount + ' file' + (todoCount === 1 ? '' : 's')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const BulkUploadResults = ({ section, results }) => {
  if (results.error) return <div style={{color:'#8b4a42',fontSize:12}}>{results.error}</div>;
  const arr = results.results || [];
  const okCount = arr.filter(r => r.ok).length;
  const createdCount = arr.filter(r => r.ok && r.action === 'created').length;
  const updatedCount = arr.filter(r => r.ok && r.action === 'updated').length;
  const errCount = arr.filter(r => !r.ok).length;
  const breakdownSuffix = (createdCount > 0 || updatedCount > 0)
    ? ' (' + [
        createdCount > 0 ? createdCount + ' created' : null,
        updatedCount > 0 ? updatedCount + ' updated' : null,
      ].filter(Boolean).join(', ') + ')'
    : '';
  return (
    <div>
      <div style={{display:'flex',gap:16,marginBottom:10,fontSize:12}}>
        <div style={{color:'#4a7a4a',fontWeight:500}}>✓ {okCount} succeeded{breakdownSuffix}</div>
        {errCount > 0 && <div style={{color:'#8b4a42',fontWeight:500}}>✗ {errCount} failed</div>}
      </div>
      {section === 'buildings' && arr.filter(r => r.ok).length > 0 && (
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:8}}>
          {arr.filter(r => r.ok).map((r,i) => (
            <div key={i}>{r.building}: +{r.units_added} units{r.units_skipped > 0 ? ' (' + r.units_skipped + ' already existed)' : ''}</div>
          ))}
        </div>
      )}
      {section === 'vendors' && arr.filter(r => r.ok).length > 0 && (
        <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:8}}>
          {arr.filter(r => r.ok).map((r,i) => (
            <div key={i}>
              {r.vendor}: {r.action === 'skipped' ? 'already existed (skipped)' : 'created'}
              {r.buildings_linked > 0 ? ', linked to ' + r.buildings_linked + ' building' + (r.buildings_linked === 1 ? '' : 's') : ''}
              {r.buildings_skipped > 0 ? ' (' + r.buildings_skipped + ' building name' + (r.buildings_skipped === 1 ? '' : 's') + ' not found)' : ''}
            </div>
          ))}
        </div>
      )}
      {errCount > 0 && (
        <div style={{maxHeight:200,overflowY:'auto',marginTop:6}}>
          {arr.filter(r => !r.ok).map((r,i) => (
            <div key={i} style={{fontSize:11,color:'#8b4a42',padding:'4px 0'}}>
              {r.email || r.vendor || r.building || ('Row ' + (i+1))}: {r.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PCManualUpload = ({ section }) => {
  if (section === 'buildings') return <BuildingManualForm/>;
  if (section === 'residents') return <ResidentManualForm/>;
  return <SecurityManualForm/>;
};

const PCField = ({ label, value, onChange, type, placeholder, required, textarea }) => (
  <div>
    {label !== '' && <label style={{display:'block',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>{label}{required && ' *'}</label>}
    {textarea ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} className="form-input" style={{minHeight:60,resize:'vertical'}}/>
    ) : (
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} className="form-input"/>
    )}
  </div>
);

const PCSelect = ({ label, value, onChange, options, disabled, required }) => (
  <div>
    {label !== '' && <label style={{display:'block',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>{label}{required && ' *'}</label>}
    <select className="form-input" value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? 'var(--bg-page)' : '#fff'}}>
      <option value="">— Pick one —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const FormBanner = ({ result }) => result ? (
  <div style={{marginTop:14,padding:12,borderRadius:6,background:result.ok ? '#e6efe1' : '#fdf2f1',color:result.ok ? '#4a7a4a' : '#8b4a42',fontSize:12,fontWeight:500}}>
    {result.ok ? '✓ ' + result.msg : '✗ ' + result.error}
  </div>
) : null;

const BuildingManualForm = () => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [units, setUnits] = useState([{ floor: '', unit_number: '' }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const { data: existing } = await supabaseClient.from('buildings').select('id').eq('name', name).maybeSingle();
      let buildingId = existing && existing.id;
      if (!buildingId) {
        const { data: b, error } = await supabaseClient.from('buildings').insert({ name: name.trim(), address: address.trim() || null, notes: notes.trim() || null }).select('id').single();
        if (error) { setResult({ ok: false, error: 'building: ' + error.message }); setBusy(false); return; }
        buildingId = b.id;
      }
      const validUnits = units
        .filter(u => u.unit_number && u.floor !== '' && !isNaN(Number(u.floor)))
        .map(u => ({ building_id: buildingId, floor: Number(u.floor), unit_number: String(u.unit_number).trim() }));
      let inserted = 0;
      if (validUnits.length) {
        const { data: existingU } = await supabaseClient.from('units').select('unit_number').eq('building_id', buildingId);
        const existingSet = new Set((existingU || []).map(u => u.unit_number));
        const toInsert = validUnits.filter(u => !existingSet.has(u.unit_number));
        if (toInsert.length) {
          const { error } = await supabaseClient.from('units').insert(toInsert);
          if (error) { setResult({ ok: false, error: 'units: ' + error.message }); setBusy(false); return; }
          inserted = toInsert.length;
        }
      }
      setResult({ ok: true, msg: 'Saved "' + name + '" with ' + inserted + ' new unit' + (inserted === 1 ? '' : 's') + '.' });
      setName(''); setAddress(''); setNotes(''); setUnits([{ floor: '', unit_number: '' }]);
    } catch (e) {
      setResult({ ok: false, error: String(e.message || e) });
    }
    setBusy(false);
  };

  return (
    <div className="card">
      <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Add a building</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Building name" required value={name} onChange={setName} placeholder="e.g. Aljil Tower"/>
        <PCField label="Address" value={address} onChange={setAddress} placeholder="Optional"/>
      </div>
      <PCField label="Notes" value={notes} onChange={setNotes} textarea placeholder="Optional"/>
      <div style={{margin:'20px 0 10px',fontSize:10,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Units (optional — you can add them later via bulk upload)</div>
      {units.map((u, i) => (
        <div key={i} style={{display:'grid',gridTemplateColumns:'130px 1fr 40px',gap:10,marginBottom:8,alignItems:'start'}}>
          <PCField label="" type="number" placeholder="Floor" value={u.floor} onChange={v => setUnits(us => us.map((x,j) => j===i ? {...x, floor:v} : x))}/>
          <PCField label="" placeholder="Unit number (e.g. A-101)" value={u.unit_number} onChange={v => setUnits(us => us.map((x,j) => j===i ? {...x, unit_number:v} : x))}/>
          <button className="btn btn-sm" style={{padding:'10px 8px'}} onClick={() => setUnits(us => us.length > 1 ? us.filter((_, j) => j !== i) : us)} title="Remove">×</button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => setUnits(us => [...us, { floor: '', unit_number: '' }])} style={{marginBottom:18}}>+ Add another unit</button>
      <div>
        <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Saving…' : 'Create building'}</button>
      </div>
      <FormBanner result={result}/>
    </div>
  );
};

const RESIDENT_FORM_DEFAULTS = {
  fullName: '', email: '', phone: '', password: 'Welcome2026!',
  buildingId: '', unitId: '',
  dob: '', passport: '', emiratesId: '',
  emergencyContactName: '', emergencyContactPhone: '',
  employer: '', occupation: '',
  tenure: '', leaseStart: '', leaseEnd: '', monthlyPayment: '', ownershipStart: '',
};

const ResidentManualForm = () => {
  const [form, setForm] = useState(RESIDENT_FORM_DEFAULTS);
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!supabaseClient) return;
    supabaseClient.from('buildings').select('id,name').order('name').then(({ data }) => setBuildings(data || []));
  }, []);
  useEffect(() => {
    if (!form.buildingId || !supabaseClient) { setUnits([]); setForm(f => ({ ...f, unitId: '' })); return; }
    supabaseClient.from('units').select('id,floor,unit_number').eq('building_id', form.buildingId).order('floor').order('unit_number').then(({ data }) => setUnits(data || []));
  }, [form.buildingId]);

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const building = buildings.find(b => b.id === form.buildingId);
      const unit = units.find(u => u.id === form.unitId);
      if (!building || !unit) { setResult({ ok: false, error: 'Pick a building and unit' }); setBusy(false); return; }
      const { data: { session } } = await supabaseClient.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session && session.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      const resp = await fetch(SUPABASE_URL + '/functions/v1/bulk-onboard', {
        method: 'POST', headers,
        body: JSON.stringify({ records: [{
          email: form.email.trim(), password: form.password, full_name: form.fullName.trim(), phone: form.phone.trim() || null,
          role: 'resident', building_name: building.name, unit_number: unit.unit_number,
          date_of_birth:           form.dob || null,
          passport_number:         form.passport.trim() || null,
          emirates_id:             form.emiratesId.trim() || null,
          emergency_contact_name:  form.emergencyContactName.trim() || null,
          emergency_contact_phone: form.emergencyContactPhone.trim() || null,
          employer:                form.employer.trim() || null,
          occupation:              form.occupation.trim() || null,
          tenure:                  form.tenure || null,
          lease_start:             form.leaseStart || null,
          lease_end:               form.leaseEnd   || null,
          monthly_payment_aed:     form.monthlyPayment === '' ? null : Number(form.monthlyPayment),
          ownership_start:         form.ownershipStart || null,
        }]}),
      });
      const out = await resp.json();
      const r = out.results && out.results[0];
      if (r && r.ok) {
        setResult({ ok: true, msg: 'Created resident ' + form.email + ' (sign in with the temp password to test)' });
        setForm(RESIDENT_FORM_DEFAULTS);
      } else {
        setResult({ ok: false, error: (r && r.error) || out.error || 'Unknown error' });
      }
    } catch (e) {
      setResult({ ok: false, error: String(e.message || e) });
    }
    setBusy(false);
  };

  const isTenant = form.tenure === 'Tenant';
  const isOwner  = form.tenure === 'Owner';
  const canSubmit = form.fullName.trim() && form.email.trim() && form.buildingId && form.unitId && form.password;
  const sectionLabel = { fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '4px 0 10px' };

  return (
    <div className="card">
      <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Add a resident</div>
      <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:18}}>Creates a Supabase Auth account so this person can immediately sign in with the temp password.</div>

      <div style={sectionLabel}>Personal</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Full name" required value={form.fullName} onChange={set('fullName')}/>
        <PCField label="Email" type="email" required value={form.email} onChange={set('email')}/>
        <PCField label="Phone" value={form.phone} onChange={set('phone')} placeholder="+971 …"/>
        <PCField label="Temporary password" required value={form.password} onChange={set('password')}/>
        <PCField label="Date of birth" type="date" value={form.dob} onChange={set('dob')}/>
        <PCField label="Passport number" value={form.passport} onChange={set('passport')} placeholder="e.g. AB1234567"/>
        <PCField label="Emirates ID" value={form.emiratesId} onChange={set('emiratesId')} placeholder="784-YYYY-NNNNNNN-N"/>
      </div>

      <div style={sectionLabel}>Emergency contact</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Contact name" value={form.emergencyContactName} onChange={set('emergencyContactName')}/>
        <PCField label="Contact phone" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="+971 …"/>
      </div>

      <div style={sectionLabel}>Employment</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Employer" value={form.employer} onChange={set('employer')}/>
        <PCField label="Occupation" value={form.occupation} onChange={set('occupation')}/>
      </div>

      <div style={sectionLabel}>Location</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCSelect label="Building" required value={form.buildingId} onChange={set('buildingId')} options={buildings.map(b => ({ value: b.id, label: b.name }))}/>
        <PCSelect label="Unit" required value={form.unitId} onChange={set('unitId')} disabled={!form.buildingId} options={units.map(u => ({ value: u.id, label: 'Floor ' + u.floor + ' · ' + u.unit_number }))}/>
      </div>

      <div style={sectionLabel}>Tenure</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCSelect label="Tenure" value={form.tenure} onChange={set('tenure')} options={[{value:'Owner',label:'Owner'},{value:'Tenant',label:'Tenant'}]}/>
        <div/>
        <PCField label="Lease start" type="date" value={form.leaseStart} onChange={set('leaseStart')} />
        <PCField label="Lease end"   type="date" value={form.leaseEnd}   onChange={set('leaseEnd')}   />
        <PCField label="Monthly payment (AED)" type="number" value={form.monthlyPayment} onChange={set('monthlyPayment')} placeholder="Tenant only"/>
        <PCField label="Ownership start" type="date" value={form.ownershipStart} onChange={set('ownershipStart')} />
      </div>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:18,marginTop:-4}}>
        {isTenant && 'Fill Lease start, Lease end, and Monthly payment. Ownership start should be empty.'}
        {isOwner  && 'Fill Ownership start. Lease fields should be empty.'}
        {!form.tenure && 'Pick a tenure to see which fields apply.'}
      </div>

      <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>{busy ? 'Creating…' : 'Create resident'}</button>
      <FormBanner result={result}/>
    </div>
  );
};

const SECURITY_FORM_DEFAULTS = {
  fullName: '', email: '', phone: '', password: 'Welcome2026!',
  buildingId: '', shift: 'Day',
  dob: '', passport: '',
};

const SecurityManualForm = () => {
  const [form, setForm] = useState(SECURITY_FORM_DEFAULTS);
  const [buildings, setBuildings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!supabaseClient) return;
    supabaseClient.from('buildings').select('id,name').order('name').then(({ data }) => setBuildings(data || []));
  }, []);

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const building = buildings.find(b => b.id === form.buildingId);
      if (!building) { setResult({ ok: false, error: 'Pick a building' }); setBusy(false); return; }
      const { data: { session } } = await supabaseClient.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session && session.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      const resp = await fetch(SUPABASE_URL + '/functions/v1/bulk-onboard', {
        method: 'POST', headers,
        body: JSON.stringify({ records: [{
          email: form.email.trim(), password: form.password, full_name: form.fullName.trim(), phone: form.phone.trim() || null,
          role: 'security', building_name: building.name, shift: form.shift,
          date_of_birth:   form.dob || null,
          passport_number: form.passport.trim() || null,
        }]}),
      });
      const out = await resp.json();
      const r = out.results && out.results[0];
      if (r && r.ok) {
        setResult({ ok: true, msg: 'Created guard ' + form.email + ' assigned to ' + building.name + ' (' + form.shift + ' shift)' });
        setForm(SECURITY_FORM_DEFAULTS);
      } else {
        setResult({ ok: false, error: (r && r.error) || out.error || 'Unknown error' });
      }
    } catch (e) {
      setResult({ ok: false, error: String(e.message || e) });
    }
    setBusy(false);
  };

  const canSubmit = form.fullName.trim() && form.email.trim() && form.buildingId && form.shift && form.password;
  return (
    <div className="card">
      <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Add a security guard</div>
      <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:18}}>Creates a Supabase Auth account so this guard can immediately sign in with the temp password.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Full name" required value={form.fullName} onChange={set('fullName')}/>
        <PCField label="Email" type="email" required value={form.email} onChange={set('email')}/>
        <PCField label="Phone" value={form.phone} onChange={set('phone')} placeholder="+971 …"/>
        <PCField label="Temporary password" required value={form.password} onChange={set('password')}/>
        <PCField label="Date of birth" type="date" value={form.dob} onChange={set('dob')}/>
        <PCField label="Passport number" value={form.passport} onChange={set('passport')} placeholder="e.g. AB1234567"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
        <PCSelect label="Building" required value={form.buildingId} onChange={set('buildingId')} options={buildings.map(b => ({ value: b.id, label: b.name }))}/>
        <PCSelect label="Shift" required value={form.shift} onChange={set('shift')} options={[{value:'Day',label:'Day'},{value:'Night',label:'Night'},{value:'24h',label:'24h'}]}/>
      </div>
      <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>{busy ? 'Creating…' : 'Create guard'}</button>
      <FormBanner result={result}/>
    </div>
  );
};

