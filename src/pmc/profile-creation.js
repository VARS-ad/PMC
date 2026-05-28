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
  contracts:        { label: 'Contracts',        singlePane: true },
  reminderSettings: { label: 'Reminder Email',   singlePane: true },
  invoiceDocuments: { label: 'Invoice Docs',     singlePane: true },
  amenities:        { label: 'Amenities',        readOnly: true },
  maintenance:      { label: 'Maintenance',      readOnly: true },
  payments:         { label: 'Payments',         readOnly: true },
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
  // Contracts uses a single-pane custom UI (no Summary / Bulk / Manual sub-tabs).
  const isSinglePane = !!(PC_TEMPLATES[section] && PC_TEMPLATES[section].singlePane);
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
        <div className="page-header"><div><h1>Profile Creation</h1></div></div>
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

      {!isReadOnly && !isSinglePane && innerTabs.length > 1 && (
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

      {isSinglePane && section === 'contracts'        && <ContractsSection/>}
      {isSinglePane && section === 'reminderSettings' && <ReminderSettingsSection/>}
      {isSinglePane && section === 'invoiceDocuments' && <InvoiceDocumentsBulkSection/>}
      {!isSinglePane && effectiveInner === 'summary' && <PCSummary section={section}/>}
      {!isSinglePane && effectiveInner === 'bulk'    && <PCBulkUpload section={section}/>}
      {!isSinglePane && effectiveInner === 'manual'  && <PCManualUpload section={section}/>}
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
        const { data: buildings, error: be } = await supabaseClient.from('buildings').select('id,name,address,notes,created_at,property_type,commercial_use_type,gross_leasable_area_sqft,parking_spots,service_charge_rate_aed_per_sqft,villa_count,plot_area_sqft,bedrooms_per_villa,amenities').order('name');
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
            <thead><tr><th style={{width:'22%'}}>Name</th><th style={{width:'42%'}}>Address</th><th style={{width:'8%'}}>Floors</th><th style={{width:'8%'}}>Units</th><th style={{width:'12%'}}>Created</th><th style={{width:'8%',textAlign:'right'}}>Actions</th></tr></thead>
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
          <thead><tr><th style={{width:'14%'}}>Name</th><th style={{width:'18%'}}>Email</th><th style={{width:'11%'}}>Phone</th><th style={{width:'10%'}}>Passport</th><th style={{width:'8%'}}>DOB</th><th style={{width:'14%'}}>Building</th><th style={{width:'5%'}}>Floor</th><th style={{width:'5%'}}>Unit</th><th style={{width:'8%'}}>Created</th><th style={{width:'7%',textAlign:'right'}}>Actions</th></tr></thead>
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
          <thead><tr><th style={{width:'16%'}}>Amenity</th><th style={{width:'18%'}}>Building</th><th style={{width:'8%'}}>Unit</th><th style={{width:'22%'}}>Resident</th><th style={{width:'12%'}}>Date</th><th style={{width:'12%'}}>Time</th><th style={{width:'12%'}}>Status</th></tr></thead>
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
          <thead><tr><th style={{width:'12%'}}>Category</th><th style={{width:'28%'}}>Description</th><th style={{width:'14%'}}>Building</th><th style={{width:'7%'}}>Unit</th><th style={{width:'15%'}}>Resident</th><th style={{width:'8%'}}>Priority</th><th style={{width:'9%'}}>Status</th><th style={{width:'7%'}}>Created</th></tr></thead>
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
          <thead><tr><th style={{width:'10%'}}>Invoice #</th><th style={{width:'26%'}}>Description</th><th style={{width:'14%'}}>Building</th><th style={{width:'7%'}}>Unit</th><th style={{width:'15%'}}>Resident</th><th style={{width:'11%',textAlign:'right'}}>Amount (AED)</th><th style={{width:'8%'}}>Due</th><th style={{width:'9%'}}>Status</th></tr></thead>
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
        <thead><tr><th style={{width:'16%'}}>Name</th><th style={{width:'20%'}}>Email</th><th style={{width:'12%'}}>Phone</th><th style={{width:'11%'}}>Passport</th><th style={{width:'10%'}}>DOB</th><th style={{width:'15%'}}>Building</th><th style={{width:'8%'}}>Shift</th><th style={{width:'8%',textAlign:'right'}}>Actions</th></tr></thead>
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
  const [selectedUnit, setSelectedUnit] = useState(null);
  // unit_id -> { assignment, profile } so the tooltip on each unit chip
  // can show "Reem Al Maktoum · Tenant" or "Vacant" at a glance, and
  // UnitDetailModal can be opened without a second fetch.
  const [residentByUnit, setResidentByUnit] = useState({});
  useEffect(() => {
    let mounted = true;
    if (!supabaseClient) return;
    const unitIds = (building.units || []).map(u => u.id);
    if (unitIds.length === 0) return;
    (async () => {
      const { data: as } = await supabaseClient
        .from('resident_assignments')
        .select('profile_id,unit_id,tenure,monthly_payment_aed,lease_start,lease_end,ownership_start')
        .in('unit_id', unitIds);
      const profIds = [...new Set((as || []).map(a => a.profile_id).filter(Boolean))];
      let profs = [];
      if (profIds.length) {
        const { data } = await supabaseClient.from('profiles').select('id,full_name,phone').in('id', profIds);
        profs = data || [];
      }
      const pMap = Object.fromEntries(profs.map(p => [p.id, p]));
      const out = {};
      (as || []).forEach(a => { out[a.unit_id] = { assignment: a, profile: pMap[a.profile_id] || null }; });
      if (mounted) setResidentByUnit(out);
    })();
    return () => { mounted = false; };
  }, [building.id]);

  const byFloor = {};
  (building.units || []).forEach(u => { (byFloor[u.floor] = byFloor[u.floor] || []).push(u); });
  Object.keys(byFloor).forEach(f => byFloor[f].sort((a,b) => String(a.unit_number).localeCompare(String(b.unit_number))));
  const floors = Object.keys(byFloor).map(Number).sort((a,b) => a-b);
  const unitChipTitle = (u) => {
    const r = residentByUnit[u.id];
    if (r && r.profile) return r.profile.full_name + (r.assignment ? ' · ' + r.assignment.tenure : '');
    return 'Vacant';
  };
  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1040,maxHeight:'90vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Building</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">{building.address || ''}</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:6}}>{floors.length} floor{floors.length===1?'':'s'} · {(building.units||[]).length} units</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{padding:'20px 32px 28px',overflowY:'auto',flex:1}}>
          {floors.map(f => (
            <div key={f} style={{marginBottom:18,paddingBottom:14,borderBottom:'1px solid var(--border-light)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>Floor {f}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{byFloor[f].length} unit{byFloor[f].length===1?'':'s'}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',gap:6}}>
                {byFloor[f].map(u => (
                  <div key={u.id} onClick={() => setSelectedUnit(u)} style={{padding:'8px 10px',border:'1px solid var(--border-light)',borderRadius:6,fontSize:12,background: residentByUnit[u.id] ? 'var(--bg-surface)' : '#fff',textAlign:'center',cursor:'pointer',transition:'background 0.15s'}} onMouseEnter={e => e.currentTarget.style.background='var(--accent-warm-light)'} onMouseLeave={e => e.currentTarget.style.background = residentByUnit[u.id] ? 'var(--bg-surface)' : '#fff'} title={unitChipTitle(u)}>{u.unit_number}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    {selectedUnit && (
      <UnitDetailModal
        unit={selectedUnit}
        building={building}
        assignment={residentByUnit[selectedUnit.id]?.assignment || null}
        profile={residentByUnit[selectedUnit.id]?.profile || null}
        onClose={() => setSelectedUnit(null)}
      />
    )}
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

const VILLA_AMENITIES = ['Pool', 'Garden', 'Gym', '24h Security'];

// Build the property-type-specific payload subset for insert/update on buildings.
// Always returns ALL eight type-specific columns: the unrelated ones are
// explicitly set to null so switching property type clears stale data.
const buildBuildingTypePayload = (propertyType, fields) => {
  const numOrNull = (v) => (v === '' || v == null) ? null : Number(v);
  const intOrNull = (v) => (v === '' || v == null) ? null : parseInt(v, 10);
  const isCommercial = propertyType === 'Commercial';
  const isVilla = propertyType === 'Villa';
  return {
    property_type: propertyType,
    commercial_use_type:              isCommercial ? (fields.commercial_use_type || null) : null,
    gross_leasable_area_sqft:         isCommercial ? numOrNull(fields.gross_leasable_area_sqft) : null,
    parking_spots:                    isCommercial ? intOrNull(fields.parking_spots) : null,
    service_charge_rate_aed_per_sqft: isCommercial ? numOrNull(fields.service_charge_rate_aed_per_sqft) : null,
    villa_count:                      isVilla ? intOrNull(fields.villa_count) : null,
    plot_area_sqft:                   isVilla ? numOrNull(fields.plot_area_sqft) : null,
    bedrooms_per_villa:               isVilla ? intOrNull(fields.bedrooms_per_villa) : null,
    amenities:                        isVilla ? (Array.isArray(fields.amenities) ? fields.amenities : []) : null,
  };
};

const BuildingManualForm = () => {
  const [propertyType, setPropertyType] = useState('Residential');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  // Commercial-only
  const [commercialUseType, setCommercialUseType] = useState('');
  const [gla, setGla] = useState('');
  const [parkingSpots, setParkingSpots] = useState('');
  const [serviceChargeRate, setServiceChargeRate] = useState('');
  // Villa-only
  const [villaCount, setVillaCount] = useState('');
  const [plotArea, setPlotArea] = useState('');
  const [bedroomsPerVilla, setBedroomsPerVilla] = useState('');
  const [amenities, setAmenities] = useState([]);
  const [units, setUnits] = useState([{ floor: '', unit_number: '' }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const toggleAmenity = (label) => {
    setAmenities(prev => prev.includes(label) ? prev.filter(a => a !== label) : [...prev, label]);
  };

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const typePayload = buildBuildingTypePayload(propertyType, {
        commercial_use_type: commercialUseType,
        gross_leasable_area_sqft: gla,
        parking_spots: parkingSpots,
        service_charge_rate_aed_per_sqft: serviceChargeRate,
        villa_count: villaCount,
        plot_area_sqft: plotArea,
        bedrooms_per_villa: bedroomsPerVilla,
        amenities: amenities,
      });
      const { data: existing } = await supabaseClient.from('buildings').select('id').eq('name', name).maybeSingle();
      let buildingId = existing && existing.id;
      if (!buildingId) {
        const { data: b, error } = await supabaseClient.from('buildings').insert({ name: name.trim(), address: address.trim() || null, notes: notes.trim() || null, ...typePayload }).select('id').single();
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
      setPropertyType('Residential');
      setCommercialUseType(''); setGla(''); setParkingSpots(''); setServiceChargeRate('');
      setVillaCount(''); setPlotArea(''); setBedroomsPerVilla(''); setAmenities([]);
    } catch (e) {
      setResult({ ok: false, error: String(e.message || e) });
    }
    setBusy(false);
  };

  const sectionLabelStyle = {margin:'20px 0 10px',fontSize:10,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em'};
  return (
    <div className="card">
      <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Add a building</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCSelect label="Property type" required value={propertyType} onChange={setPropertyType} options={[{value:'Residential',label:'Residential'},{value:'Commercial',label:'Commercial'},{value:'Villa',label:'Villa'}]}/>
        <div/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Building name" required value={name} onChange={setName} placeholder="e.g. Aljil Tower"/>
        <PCField label="Address" value={address} onChange={setAddress} placeholder="Optional"/>
      </div>
      <PCField label="Notes" value={notes} onChange={setNotes} textarea placeholder="Optional"/>
      {propertyType === 'Commercial' && (
        <>
          <div style={sectionLabelStyle}>Commercial details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <PCSelect label="Commercial use type" value={commercialUseType} onChange={setCommercialUseType} options={[{value:'Office',label:'Office'},{value:'Retail',label:'Retail'},{value:'Mixed',label:'Mixed'}]}/>
            <PCField label="Gross Leasable Area (sqft)" type="number" value={gla} onChange={setGla} placeholder="Optional"/>
            <PCField label="Parking spots" type="number" value={parkingSpots} onChange={setParkingSpots} placeholder="Optional"/>
            <PCField label="Service charge rate (AED / sqft / year)" type="number" value={serviceChargeRate} onChange={setServiceChargeRate} placeholder="Optional"/>
          </div>
        </>
      )}
      {propertyType === 'Villa' && (
        <>
          <div style={sectionLabelStyle}>Villa details</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <PCField label="Number of villas" type="number" value={villaCount} onChange={setVillaCount} placeholder="Optional"/>
            <PCField label="Plot area per villa (sqft)" type="number" value={plotArea} onChange={setPlotArea} placeholder="Optional"/>
            <PCField label="Bedrooms per villa" type="number" value={bedroomsPerVilla} onChange={setBedroomsPerVilla} placeholder="Optional"/>
            <div/>
          </div>
          <div>
            <label style={{display:'block',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>Amenities</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:14}}>
              {VILLA_AMENITIES.map(a => (
                <label key={a} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer'}}>
                  <input type="checkbox" checked={amenities.includes(a)} onChange={() => toggleAmenity(a)}/>
                  <span>{a}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
      <div style={sectionLabelStyle}>Units (optional — you can add them later via bulk upload)</div>
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
  contractNumber: '', chequesPerYear: '',
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
          contract_number:         form.contractNumber.trim() || null,
          cheques_per_year:        form.chequesPerYear === '' ? null : Number(form.chequesPerYear),
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
        <PCField label="Cheques per year" type="number" value={form.chequesPerYear} onChange={set('chequesPerYear')} placeholder="Tenant only e.g. 1, 4, 12"/>
        <PCField label="Contract #" value={form.contractNumber} onChange={set('contractNumber')} placeholder="Tenancy contract number"/>
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

// ==================== EDIT RECORD MODAL ====================
// Opened from the Summary tab (Edit button on each row). The building variant
// mirrors BuildingManualForm: property-type selector + conditional fields,
// persisting null for the unrelated subset so type switches clear stale data.
const EditRecordModal = ({ kind, record, onClose, onSaved }) => {
  const initial = (() => {
    if (kind === 'building') return {
      name: record.name || '',
      address: record.address || '',
      notes: record.notes || '',
      property_type: record.property_type || 'Residential',
      commercial_use_type: record.commercial_use_type || '',
      gross_leasable_area_sqft: record.gross_leasable_area_sqft == null ? '' : String(record.gross_leasable_area_sqft),
      parking_spots: record.parking_spots == null ? '' : String(record.parking_spots),
      service_charge_rate_aed_per_sqft: record.service_charge_rate_aed_per_sqft == null ? '' : String(record.service_charge_rate_aed_per_sqft),
      villa_count: record.villa_count == null ? '' : String(record.villa_count),
      plot_area_sqft: record.plot_area_sqft == null ? '' : String(record.plot_area_sqft),
      bedrooms_per_villa: record.bedrooms_per_villa == null ? '' : String(record.bedrooms_per_villa),
      amenities: Array.isArray(record.amenities) ? record.amenities : [],
    };
    if (kind === 'resident') return { full_name: record.full_name || '', phone: record.phone || '' };
    if (kind === 'contract') return {
      name:          record.name || '',
      contract_type: record.contract_type || '',
      counterparty:  record.counterparty || '',
      start_date:    record.start_date || '',
      end_date:      record.end_date || '',
      value_aed:     record.value_aed == null ? '' : String(record.value_aed),
      building_id:   record.building_id || '',
      notes:         record.notes || '',
    };
    return { full_name: record.full_name || '', phone: record.phone || '', shift: record.shift || 'Day' };
  })();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Contracts edit needs a buildings list for the (optional) building_id select.
  const [buildingsList, setBuildingsList] = useState([]);
  useEffect(() => {
    if (kind !== 'contract' || !supabaseClient) return;
    supabaseClient.from('buildings').select('id,name').order('name').then(({ data }) => setBuildingsList(data || []));
  }, [kind]);
  const setF = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const toggleAmenity = (label) => setForm(f => ({ ...f, amenities: f.amenities.includes(label) ? f.amenities.filter(a => a !== label) : [...f.amenities, label] }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (kind === 'building') {
        const typePayload = buildBuildingTypePayload(form.property_type, form);
        const { error: e } = await supabaseClient.from('buildings').update({
          name: form.name.trim(),
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          ...typePayload,
        }).eq('id', record.id);
        if (e) throw e;
      } else if (kind === 'contract') {
        if (!form.name.trim()) { setError('Contract name is required'); setBusy(false); return; }
        if (!form.end_date)    { setError('End date is required');     setBusy(false); return; }
        const { error: e } = await supabaseClient.from('contracts').update({
          name:          form.name.trim(),
          counterparty:  form.counterparty.trim() || null,
          contract_type: form.contract_type || null,
          start_date:    form.start_date || null,
          end_date:      form.end_date,
          value_aed:     form.value_aed === '' ? null : Number(form.value_aed),
          building_id:   form.building_id || null,
          notes:         form.notes.trim() || null,
        }).eq('id', record.id);
        if (e) throw e;
      } else if (kind === 'resident' || kind === 'security') {
        const { error: e } = await supabaseClient.from('profiles').update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
        }).eq('id', record.id);
        if (e) throw e;
        if (kind === 'security' && form.shift !== record.shift) {
          const { error: se } = await supabaseClient.from('security_assignments').update({
            shift: form.shift,
          }).eq('profile_id', record.id);
          if (se) throw se;
        }
      }
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };

  const sectionLabelStyle = {margin:'14px 0 10px',fontSize:10,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em'};

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1050}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:560}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Edit {kind}</div>
            <h2>{kind === 'building' || kind === 'contract' ? record.name : record.full_name}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {kind === 'building' && (
          <div>
            <div style={{marginBottom:14}}><PCSelect label="Property type" required value={form.property_type} onChange={setF('property_type')} options={[{value:'Residential',label:'Residential'},{value:'Commercial',label:'Commercial'},{value:'Villa',label:'Villa'}]}/></div>
            <div style={{marginBottom:14}}><PCField label="Building name" required value={form.name} onChange={setF('name')}/></div>
            <div style={{marginBottom:14}}><PCField label="Address" value={form.address} onChange={setF('address')}/></div>
            <div style={{marginBottom:14}}><PCField label="Notes" value={form.notes} onChange={setF('notes')} textarea/></div>
            {form.property_type === 'Commercial' && (
              <>
                <div style={sectionLabelStyle}>Commercial details</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                  <PCSelect label="Commercial use type" value={form.commercial_use_type} onChange={setF('commercial_use_type')} options={[{value:'Office',label:'Office'},{value:'Retail',label:'Retail'},{value:'Mixed',label:'Mixed'}]}/>
                  <PCField label="Gross Leasable Area (sqft)" type="number" value={form.gross_leasable_area_sqft} onChange={setF('gross_leasable_area_sqft')}/>
                  <PCField label="Parking spots" type="number" value={form.parking_spots} onChange={setF('parking_spots')}/>
                  <PCField label="Service charge rate (AED / sqft / year)" type="number" value={form.service_charge_rate_aed_per_sqft} onChange={setF('service_charge_rate_aed_per_sqft')}/>
                </div>
              </>
            )}
            {form.property_type === 'Villa' && (
              <>
                <div style={sectionLabelStyle}>Villa details</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                  <PCField label="Number of villas" type="number" value={form.villa_count} onChange={setF('villa_count')}/>
                  <PCField label="Plot area per villa (sqft)" type="number" value={form.plot_area_sqft} onChange={setF('plot_area_sqft')}/>
                  <PCField label="Bedrooms per villa" type="number" value={form.bedrooms_per_villa} onChange={setF('bedrooms_per_villa')}/>
                  <div/>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={{display:'block',fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,fontWeight:500}}>Amenities</label>
                  <div style={{display:'flex',flexWrap:'wrap',gap:14}}>
                    {VILLA_AMENITIES.map(a => (
                      <label key={a} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer'}}>
                        <input type="checkbox" checked={form.amenities.includes(a)} onChange={() => toggleAmenity(a)}/>
                        <span>{a}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {kind === 'resident' && (
          <div>
            <div style={{marginBottom:14}}><PCField label="Full name" required value={form.full_name} onChange={setF('full_name')}/></div>
            <div style={{marginBottom:14}}><PCField label="Phone" value={form.phone} onChange={setF('phone')}/></div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:14,padding:10,background:'var(--bg-page)',borderRadius:6}}>Email, building, and unit cannot be changed here. Delete and re-add the resident to move them to a different unit.</div>
          </div>
        )}
        {kind === 'contract' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <PCField label="Contract name" required value={form.name} onChange={setF('name')} placeholder="e.g. Building insurance 2026"/>
              <PCSelect label="Contract type" value={form.contract_type} onChange={setF('contract_type')} options={[{value:'Insurance',label:'Insurance'},{value:'Government',label:'Government'},{value:'Utility',label:'Utility'},{value:'Other',label:'Other'}]}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <PCField label="Counterparty" value={form.counterparty} onChange={setF('counterparty')} placeholder="e.g. AXA Gulf"/>
              <PCSelect label="Building" value={form.building_id} onChange={setF('building_id')} options={[{value:'',label:'All buildings / portfolio-wide'}, ...buildingsList.map(b => ({ value: b.id, label: b.name }))]}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
              <PCField label="Start date" type="date" value={form.start_date} onChange={setF('start_date')}/>
              <PCField label="End date" type="date" required value={form.end_date} onChange={setF('end_date')}/>
              <PCField label="Value (AED)" type="number" value={form.value_aed} onChange={setF('value_aed')} placeholder="Optional"/>
            </div>
            <div style={{marginBottom:14}}><PCField label="Notes" value={form.notes} onChange={setF('notes')} textarea placeholder="Optional"/></div>
          </div>
        )}
        {kind === 'security' && (
          <div>
            <div style={{marginBottom:14}}><PCField label="Full name" required value={form.full_name} onChange={setF('full_name')}/></div>
            <div style={{marginBottom:14}}><PCField label="Phone" value={form.phone} onChange={setF('phone')}/></div>
            <div style={{marginBottom:14}}><PCSelect label="Shift" value={form.shift} onChange={setF('shift')} options={[{value:'Day',label:'Day'},{value:'Night',label:'Night'},{value:'24h',label:'24h'}]}/></div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:14,padding:10,background:'var(--bg-page)',borderRadius:6}}>Email and building cannot be changed here. Delete and re-add to move the guard to a different building.</div>
          </div>
        )}
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:8}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
};

// ==================== CONTRACTS ====================
// Insurance / Government / Utility / Other contracts at the portfolio or
// per-building level. Single-pane UI (no Bulk / Manual sub-tabs) — summary
// table + inline "Add Contract" form + per-row Edit / Delete / Attachments.
// end_date drives expiry status badges and the Reminders page (separate file).
const CONTRACT_TYPES = [
  { value: 'Insurance',  label: 'Insurance'  },
  { value: 'Government', label: 'Government' },
  { value: 'Utility',    label: 'Utility'    },
  { value: 'Other',      label: 'Other'      },
];

const CONTRACT_FORM_DEFAULTS = {
  name: '', contract_type: '', counterparty: '',
  start_date: '', end_date: '', value_aed: '',
  building_id: '', notes: '',
};

const ContractsSection = () => {
  const [rows, setRows] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);     // { record }
  const [viewing, setViewing] = useState(null);     // contract row for attachments modal
  const [showAdd, setShowAdd] = useState(false);

  const reload = async () => {
    setError(null);
    if (!supabaseClient) { setError('Supabase not initialized'); return; }
    try {
      const [{ data: cs, error: ce }, { data: bs }] = await Promise.all([
        supabaseClient.from('contracts')
          .select('id,name,counterparty,contract_type,start_date,end_date,value_aed,building_id,notes,created_at')
          .order('end_date', { ascending: true, nullsFirst: false }),
        supabaseClient.from('buildings').select('id,name').order('name'),
      ]);
      if (ce) throw ce;
      const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
      setBuildings(bs || []);
      setRows((cs || []).map(c => ({
        ...c,
        building_name: c.building_id && bMap[c.building_id] ? bMap[c.building_id].name : 'Portfolio-wide',
      })));
    } catch (e) {
      setError(String(e.message || e));
    }
  };
  useEffect(() => { reload(); }, []);

  const daysToExpiry = (end_date) => {
    if (!end_date) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(end_date);
    return Math.round((end - today) / (1000 * 60 * 60 * 24));
  };

  const statusBadge = (end_date) => {
    const d = daysToExpiry(end_date);
    if (d == null) return null;
    if (d < 0)   return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:10,background:'#fdf2f1',color:'#8b4a42',fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>Expired</span>;
    if (d <= 90) return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:10,background:'#fdf6e3',color:'#a07d3c',fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>Expiring soon</span>;
    return       <span style={{display:'inline-block',padding:'2px 8px',borderRadius:10,background:'#e6efe1',color:'#5a6b4f',fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>Active</span>;
  };

  if (error) return (<div className="card"><div style={{color:'#8b4a42',fontSize:13}}>{error}</div></div>);
  if (rows === null) return (<div className="card"><div style={{color:'var(--text-muted)',fontSize:13,padding:24}}>Loading…</div></div>);

  return (
    <>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>{rows.length} contract{rows.length===1?'':'s'} · sorted by expiry</div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-sm" onClick={reload}>Refresh</button>
            <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>+ Add contract</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div style={{color:'var(--text-muted)',fontSize:13,padding:32,textAlign:'center'}}>
            No contracts yet. Click <strong>+ Add contract</strong> to create the first one.
          </div>
        ) : (
          <table className="data-table">
            <thead><tr>
              <th style={{width:'20%'}}>Name</th>
              <th style={{width:'14%'}}>Counterparty</th>
              <th style={{width:'10%'}}>Type</th>
              <th style={{width:'10%'}}>End date</th>
              <th style={{width:'8%'}}>Days left</th>
              <th style={{width:'12%'}}>Building</th>
              <th style={{width:'10%',textAlign:'right'}}>Value (AED)</th>
              <th style={{width:'8%'}}>Status</th>
              <th style={{width:'8%',textAlign:'right'}}>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(c => {
                const d = daysToExpiry(c.end_date);
                return (
                  <tr key={c.id} onClick={() => setViewing(c)} style={{cursor:'pointer'}}>
                    <td style={{fontWeight:500}}>{c.name}</td>
                    <td>{c.counterparty || '—'}</td>
                    <td>{c.contract_type || '—'}</td>
                    <td>{c.end_date || '—'}</td>
                    <td style={{color: d != null && d < 0 ? '#8b4a42' : (d != null && d <= 90 ? '#a07d3c' : 'var(--text-secondary)')}}>{d == null ? '—' : d}</td>
                    <td>{c.building_name}</td>
                    <td style={{textAlign:'right'}}>{c.value_aed == null ? '—' : Number(c.value_aed).toLocaleString()}</td>
                    <td>{statusBadge(c.end_date)}</td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                      <button onClick={(e) => { e.stopPropagation(); setEditing({ record: c }); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm('Delete contract "' + c.name + '"? This cannot be undone.')) return;
                        supabaseClient.from('contracts').delete().eq('id', c.id).then(({ error: de }) => {
                          if (de) alert('Delete failed: ' + de.message); else reload();
                        });
                      }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <ContractManualForm
          buildings={buildings}
          onCancel={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); reload(); }}
        />
      )}

      {editing && <EditRecordModal kind="contract" record={editing.record} onClose={() => setEditing(null)} onSaved={reload}/>}
      {viewing && <ContractDetailModal contract={viewing} onClose={() => setViewing(null)}/>}
    </>
  );
};

// Inline "Add contract" form rendered below the summary table. Mirrors the
// Building/Resident manual-form pattern but is collapsed by default so the
// section starts at the summary view.
const ContractManualForm = ({ buildings, onCancel, onSaved }) => {
  const [form, setForm] = useState(CONTRACT_FORM_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const canSubmit = form.name.trim() && form.end_date;

  const submit = async () => {
    setBusy(true); setResult(null);
    try {
      const payload = {
        name:          form.name.trim(),
        counterparty:  form.counterparty.trim() || null,
        contract_type: form.contract_type || null,
        start_date:    form.start_date || null,
        end_date:      form.end_date,
        value_aed:     form.value_aed === '' ? null : Number(form.value_aed),
        building_id:   form.building_id || null,
        notes:         form.notes.trim() || null,
      };
      const { error } = await supabaseClient.from('contracts').insert([payload]);
      if (error) { setResult({ ok: false, error: error.message }); setBusy(false); return; }
      setResult({ ok: true, msg: 'Contract "' + payload.name + '" created.' });
      setForm(CONTRACT_FORM_DEFAULTS);
      if (onSaved) setTimeout(onSaved, 400);
    } catch (e) {
      setResult({ ok: false, error: String(e.message || e) });
    }
    setBusy(false);
  };

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600}}>Add a contract</div>
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Contract name" required value={form.name} onChange={set('name')} placeholder="e.g. Building insurance 2026"/>
        <PCSelect label="Contract type" value={form.contract_type} onChange={set('contract_type')} options={CONTRACT_TYPES}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Counterparty" value={form.counterparty} onChange={set('counterparty')} placeholder="e.g. AXA Gulf"/>
        <PCSelect label="Building" value={form.building_id} onChange={set('building_id')} options={[{value:'',label:'All buildings / portfolio-wide'}, ...buildings.map(b => ({ value: b.id, label: b.name }))]}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
        <PCField label="Start date" type="date" value={form.start_date} onChange={set('start_date')}/>
        <PCField label="End date" type="date" required value={form.end_date} onChange={set('end_date')}/>
        <PCField label="Value (AED)" type="number" value={form.value_aed} onChange={set('value_aed')} placeholder="Optional"/>
      </div>
      <div style={{marginBottom:14}}>
        <PCField label="Notes" value={form.notes} onChange={set('notes')} textarea placeholder="Optional"/>
      </div>
      <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>{busy ? 'Saving…' : 'Create contract'}</button>
      <FormBanner result={result}/>
    </div>
  );
};

// Click-through detail modal — shows contract summary + attachment uploader
// (same UnitAttachmentSection helper used for residents/units).
const ContractDetailModal = ({ contract, onClose }) => {
  const [documents, setDocuments] = useState(null);
  const [uploadingKind, setUploadingKind] = useState(null);
  const [error, setError] = useState(null);

  const reloadDocs = async () => {
    if (!supabaseClient) return;
    const { data, error: e } = await supabaseClient.from('contract_documents')
      .select('id,kind,filename,storage_path,created_at')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false });
    if (e) setError(e.message); else { setDocuments(data || []); setError(null); }
  };
  useEffect(() => { reloadDocs(); }, [contract.id]);

  const handleUpload = async (kind, file) => {
    if (!file || !supabaseClient) return;
    setUploadingKind(kind); setError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = contract.id + '/' + kind + '-' + Date.now() + '-' + safeName;
    const { error: upErr } = await supabaseClient.storage.from('contract-documents').upload(path, file);
    if (upErr) { setError('Upload failed: ' + upErr.message); setUploadingKind(null); return; }
    const { error: insErr } = await supabaseClient.from('contract_documents').insert({
      contract_id: contract.id, kind, filename: file.name, storage_path: path,
    });
    if (insErr) setError('Metadata: ' + insErr.message);
    setUploadingKind(null);
    await reloadDocs();
  };
  const handleDelete = async (doc) => {
    if (!supabaseClient) return;
    if (!window.confirm('Delete ' + doc.filename + '?')) return;
    await supabaseClient.storage.from('contract-documents').remove([doc.storage_path]);
    await supabaseClient.from('contract_documents').delete().eq('id', doc.id);
    await reloadDocs();
  };

  const docSections = [
    { kind: 'contract',  label: 'Contract document',  accept: '.pdf,image/*', multiple: false },
    { kind: 'amendment', label: 'Amendments / Annexes', accept: '.pdf,image/*', multiple: true  },
    { kind: 'invoice',   label: 'Invoices / Receipts', accept: '.pdf,image/*', multiple: true  },
    { kind: 'other',     label: 'Other Documents',    accept: '*/*',          multiple: true  },
  ];
  const groupedDocs = (documents || []).reduce((acc, d) => { (acc[d.kind] = acc[d.kind] || []).push(d); return acc; }, {});

  const InfoCell = ({ label, value }) => (
    <div>
      <div style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:4}}>{label}</div>
      <div style={{fontSize:13,color:'var(--text-dark)'}}>{value == null || value === '' ? '—' : value}</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose} style={{zIndex:1050}}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:680,maxHeight:'85vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div>
            <div style={{fontSize:10,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Contract</div>
            <h2>{contract.name}</h2>
            <div className="modal-sub">{contract.counterparty || '—'}{contract.contract_type ? ' · ' + contract.contract_type : ''}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:18,padding:'14px 0',borderBottom:'1px solid var(--border-light)'}}>
          <InfoCell label="Start date" value={contract.start_date}/>
          <InfoCell label="End date"   value={contract.end_date}/>
          <InfoCell label="Value (AED)" value={contract.value_aed == null ? null : Number(contract.value_aed).toLocaleString()}/>
          <InfoCell label="Building"   value={contract.building_name}/>
          <InfoCell label="Notes"      value={contract.notes}/>
        </div>

        <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:10,fontWeight:500}}>Documents</div>
        {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
        {documents === null ? (
          <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
        ) : (
          <div>
            {docSections.map(s => (
              <UnitAttachmentSection key={s.kind} section={s} files={groupedDocs[s.kind] || []} uploading={uploadingKind === s.kind} onUpload={handleUpload} onDelete={handleDelete} bucket="contract-documents"/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== REMINDER SETTINGS SECTION ====================
// Single-row config (reminder_settings.id = 1) drives the digest email sent
// by the reminders-digest Edge Function. The cron job runs every 30 minutes;
// the function gates on the user's configured cadence / days / time so the
// digest only fires inside the configured window (and at most once per day).
const DOW_LIST = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const ReminderSettingsSection = () => {
  const [settings, setSettings] = useState(null);
  const [draftEmail, setDraftEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);   // object URL for the PDF
  const [previewError, setPreviewError] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    if (!supabaseClient) return;
    const { data, error: e } = await supabaseClient.from('reminder_settings').select('*').eq('id', 1).maybeSingle();
    if (e) setError(e.message);
    setSettings(data || {
      id: 1, email_enabled: false, email_recipients: [],
      digest_cadence: 'daily', digest_days_of_week: [...DOW_LIST],
      digest_time_local: '09:00', digest_timezone: 'Asia/Dubai',
    });
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (previewSrc) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

  // Persist a partial update; merge with current settings and write to DB.
  const patch = async (partial) => {
    setSaving(true); setError(null);
    const next = { ...settings, ...partial };
    const { error: e } = await supabaseClient.from('reminder_settings').update({
      email_enabled:       next.email_enabled,
      email_recipients:    next.email_recipients,
      digest_cadence:      next.digest_cadence,
      digest_days_of_week: next.digest_days_of_week,
      digest_time_local:   next.digest_time_local,
      digest_timezone:     next.digest_timezone,
      updated_at:          new Date().toISOString(),
    }).eq('id', 1);
    if (e) setError(e.message);
    setSaving(false);
    await load();
  };

  const toggleEnabled = () => patch({ email_enabled: !settings.email_enabled });
  const addRecipient  = async () => {
    const e = (draftEmail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setError('Enter a valid email address.'); return; }
    if ((settings.email_recipients || []).includes(e)) { setError('That email is already on the list.'); return; }
    setDraftEmail('');
    await patch({ email_recipients: [...(settings.email_recipients || []), e] });
  };
  const removeRecipient = async (e) => patch({ email_recipients: (settings.email_recipients || []).filter(x => x !== e) });

  const setCadence = async (cadence) => {
    let days = settings.digest_days_of_week || DOW_LIST;
    if (cadence === 'daily')    days = [...DOW_LIST];
    if (cadence === 'weekdays') days = ['Mon','Tue','Wed','Thu','Fri'];
    if (cadence === 'weekly')   days = ['Mon'];
    await patch({ digest_cadence: cadence, digest_days_of_week: days });
  };
  const toggleDay = async (day) => {
    const current = settings.digest_days_of_week || [];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    // Sort by canonical order
    const sorted = DOW_LIST.filter(d => next.includes(d));
    await patch({ digest_cadence: 'custom', digest_days_of_week: sorted });
  };
  const setTime = (val) => patch({ digest_time_local: val });

  const sendTest = async () => {
    setTestStatus({ ok: null, message: 'Sending…' });
    try {
      const { data, error: e } = await supabaseClient.functions.invoke('reminders-digest', {
        body: { recipients: settings.email_recipients, force: true },
      });
      if (e) { setTestStatus({ ok: false, message: e.message || String(e) }); return; }
      if (data && data.ok === false) {
        setTestStatus({ ok: false, message: data.error || ('Resend rejected: ' + JSON.stringify(data.body || data)) });
        return;
      }
      setTestStatus({ ok: true, message: 'Sent to ' + (data?.sent_to || []).join(', ') + ' · ' + (data?.count ?? 0) + ' reminder' + ((data?.count ?? 0) === 1 ? '' : 's') });
    } catch (err) {
      setTestStatus({ ok: false, message: err.message || String(err) });
    }
  };

  const showPreview = async () => {
    setPreviewError(null);
    setPreviewBusy(true);
    if (previewSrc) { URL.revokeObjectURL(previewSrc); setPreviewSrc(null); }
    try {
      const { data, error: e } = await supabaseClient.functions.invoke('reminders-digest', {
        body: { preview: true },
      });
      if (e || !data || data.ok === false) {
        setPreviewError((e && e.message) || (data && data.error) || 'Preview failed.');
        return;
      }
      // data.pdf_base64 → blob URL
      const bin = atob(data.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setPreviewSrc(URL.createObjectURL(blob));
    } catch (err) {
      setPreviewError(err.message || String(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  if (!settings) {
    return <div className="card"><div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div></div>;
  }

  const labelStyle = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6, display: 'block', fontWeight: 500 };
  const daysSummary = (() => {
    const d = settings.digest_days_of_week || [];
    if (d.length === 7)                          return 'Every day';
    if (d.length === 5 && !d.includes('Sat') && !d.includes('Sun')) return 'Weekdays only';
    if (d.length === 0)                          return 'No days selected';
    return d.join(' · ');
  })();

  return (
    <div className="card">
      <div style={{marginBottom:18}}>
        <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>Reminder email</div>
        <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
          A short email is sent with a branded PDF attachment summarising every open contract reminder. Pick the days, the time, the recipients.
        </div>
      </div>

      {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}

      {/* ---- Enable toggle ---- */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background: settings.email_enabled ? '#e6efe1' : 'var(--bg-surface)',border:'1px solid ' + (settings.email_enabled ? '#c8d6c0' : 'var(--border-light)'),borderRadius:6,marginBottom:18,cursor:'pointer'}}
           onClick={() => !saving && toggleEnabled()}>
        <input type="checkbox" checked={!!settings.email_enabled} readOnly style={{width:16,height:16,accentColor:'#5a6b4f'}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:500,color: settings.email_enabled ? '#3f4f37' : 'var(--text-dark)'}}>
            {settings.email_enabled ? 'Email digest is ON' : 'Email digest is OFF'}
          </div>
          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
            {settings.email_enabled
              ? 'Next digest fires at ' + (settings.digest_time_local || '09:00') + ' Dubai · ' + daysSummary
              : 'No emails will be sent. In-app reminders keep working.'}
          </div>
        </div>
      </div>

      {/* ---- Schedule ---- */}
      <div style={{marginBottom:18}}>
        <label style={labelStyle}>Cadence</label>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          {[
            { id: 'daily',    label: 'Every day' },
            { id: 'weekdays', label: 'Weekdays (Mon–Fri)' },
            { id: 'weekly',   label: 'Weekly (Mon)' },
            { id: 'custom',   label: 'Custom days' },
          ].map(opt => (
            <button key={opt.id} className={'btn btn-sm' + (settings.digest_cadence === opt.id ? ' btn-primary' : '')}
                    onClick={() => setCadence(opt.id)} disabled={saving}>
              {opt.label}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Days of the week</label>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {DOW_LIST.map(d => {
            const on = (settings.digest_days_of_week || []).includes(d);
            return (
              <button key={d}
                onClick={() => toggleDay(d)}
                disabled={saving}
                style={{padding:'6px 12px',borderRadius:14,border:'1px solid ' + (on ? '#3E4C59' : 'var(--border-light)'),background: on ? '#3E4C59' : '#fff',color: on ? '#fff' : 'var(--text-dark)',fontSize:12,fontWeight:500,cursor:'pointer',minWidth:54}}>
                {d}
              </button>
            );
          })}
        </div>

        <div style={{display:'flex',gap:14,alignItems:'flex-end'}}>
          <div style={{flex:'0 0 160px'}}>
            <label style={labelStyle}>Time (Dubai)</label>
            <input type="time" className="form-input" value={settings.digest_time_local || '09:00'} onChange={e => setTime(e.target.value)} step="60"/>
          </div>
          <div style={{flex:1,fontSize:11,color:'var(--text-muted)',paddingBottom:9}}>
            The digest fires at this local time on each selected day. The cron job runs every 30 minutes and only sends once per scheduled window.
          </div>
        </div>
      </div>

      {/* ---- Recipients ---- */}
      <div style={{marginBottom:18,paddingTop:14,borderTop:'1px solid var(--border-light)'}}>
        <label style={labelStyle}>Recipients</label>
        {(settings.email_recipients || []).length === 0 ? (
          <div style={{fontSize:13,color:'var(--text-muted)',padding:'8px 0'}}>No recipients yet. Add at least one to receive the digest.</div>
        ) : (
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
            {(settings.email_recipients || []).map(addr => (
              <span key={addr} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'5px 10px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:14,fontSize:12,color:'var(--text-dark)'}}>
                {addr}
                <span onClick={() => removeRecipient(addr)} title="Remove" style={{cursor:'pointer',color:'#8b4a42',fontWeight:600,fontSize:14,lineHeight:1}}>×</span>
              </span>
            ))}
          </div>
        )}
        <div style={{display:'flex',gap:8}}>
          <input
            type="email"
            className="form-input"
            placeholder="name@company.com"
            value={draftEmail}
            onChange={e => setDraftEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
            style={{flex:1}}
          />
          <button className="btn" onClick={addRecipient} disabled={saving}>Add</button>
        </div>
      </div>

      {/* ---- Preview ---- */}
      <div style={{marginBottom:18,paddingTop:14,borderTop:'1px solid var(--border-light)'}}>
        <label style={labelStyle}>Preview the PDF attachment</label>
        <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
          This is exactly what's attached to the email — built right now from your current portfolio.
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12}}>
          <button className="btn" onClick={showPreview} disabled={previewBusy}>
            {previewBusy ? 'Generating…' : (previewSrc ? 'Refresh preview' : 'Show preview')}
          </button>
          {previewError && <span style={{fontSize:12,color:'#8b4a42'}}>{previewError}</span>}
        </div>
        {previewSrc && (
          <iframe src={previewSrc} title="Reminder digest PDF preview" style={{width:'100%',height:520,border:'1px solid var(--border-light)',borderRadius:6,background:'#fff'}}/>
        )}
      </div>

      {/* ---- Test send ---- */}
      <div style={{paddingTop:14,borderTop:'1px solid var(--border-light)'}}>
        <label style={labelStyle}>Test the digest</label>
        <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
          Sends a real email right now to the recipient list above, regardless of the toggle. Useful to confirm delivery and check the PDF in your inbox.
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button className="btn btn-primary" onClick={sendTest} disabled={saving || (settings.email_recipients || []).length === 0}>
            Send test now
          </button>
          {testStatus && (
            <span style={{fontSize:12,color: testStatus.ok === false ? '#8b4a42' : testStatus.ok === true ? '#5a6b4f' : 'var(--text-muted)'}}>
              {testStatus.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== INVOICE DOCUMENTS — BULK UPLOAD ====================
// Drop a folder of PDFs / images named {invoice_number}_{kind}.{ext}
// and the page parses each filename, batch-looks-up the matching invoice,
// uploads to the right Storage bucket, and inserts metadata. Works for
// two targets:
//   • Resident invoices  → invoices + invoice_attachments + invoice-attachments
//   • Contractor invoices → vendor_payments + vendor_documents + maintenance-documents
// Both targets share the same filename convention; the "kind" hint
// (payment / receipt / proof) maps to the right DB enum per target.

// Generic parser — returns { invoice_number, hint } or null. The hint is
// resolved into a concrete kind by the active target's kindMap.
function parseInvoiceDocFilename(name) {
  const dot  = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const u    = base.lastIndexOf('_');
  if (u <= 0) return null;
  const invoice_number = base.slice(0, u).trim();
  const hint           = base.slice(u + 1).trim().toLowerCase();
  if (!invoice_number || !hint) return null;
  return { invoice_number, hint };
}

const INVOICE_BULK_TARGETS = {
  resident: {
    label:        'Resident invoices',
    lookupTable:  'invoices',
    lookupSelect: 'id,invoice_number',
    metaTable:    'invoice_attachments',
    metaFkColumn: 'invoice_id',
    bucket:       'invoice-attachments',
    kindMap: {
      invoice: 'invoice', bill: 'invoice',
      payment: 'payment_proof', payment_proof: 'payment_proof', proof: 'payment_proof', receipt: 'payment_proof',
    },
    storagePath: (parent, kind, file) => parent.id + '/' + kind + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
    metaRow:     (parent, kind, path, file) => ({
      invoice_id:   parent.id,
      kind,
      storage_path: path,
      file_name:    file.name,
      mime_type:    file.type || null,
      size_bytes:   file.size || null,
    }),
    replaceExisting: false,
    slotHints: ['invoice (or bill)', 'payment_proof (or payment, proof, receipt)'],
  },
  contractor: {
    label:        'Contractor invoices',
    lookupTable:  'vendor_payments',
    lookupSelect: 'id,invoice_number,vendor_id',
    metaTable:    'vendor_documents',
    metaFkColumn: 'payment_id',
    bucket:       'maintenance-documents',
    kindMap: {
      invoice: 'invoice', bill: 'invoice',
      payment: 'payment_receipt', payment_receipt: 'payment_receipt', proof: 'payment_receipt', receipt: 'payment_receipt',
    },
    storagePath: (parent, kind, file) => parent.vendor_id + '/payment-' + parent.id + '/' + kind + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
    metaRow:     (parent, kind, path, file) => ({
      vendor_id:    parent.vendor_id,
      payment_id:   parent.id,
      kind,
      storage_path: path,
      filename:     file.name,
    }),
    replaceExisting: false,
    slotHints: ['invoice (or bill)', 'payment_receipt (or payment, proof, receipt)'],
  },
};

const InvoiceDocumentsBulkSection = () => {
  const [targetKey, setTargetKey] = useState('resident');
  const [files,     setFiles]     = useState([]);
  const [busy,      setBusy]      = useState(false);
  const [results,   setResults]   = useState(null);
  const inputRef = useRef(null);
  const target = INVOICE_BULK_TARGETS[targetKey];

  const reset = () => { setFiles([]); setResults(null); if (inputRef.current) inputRef.current.value = ''; };

  const switchTarget = (key) => { setTargetKey(key); reset(); };

  const handlePick = async (fileList) => {
    setResults(null);
    const arr = Array.from(fileList || []);
    if (arr.length === 0) { setFiles([]); return; }

    // 1. Parse filenames + resolve hint → DB kind for this target.
    const parsedRows = arr.map(file => {
      const parsed = parseInvoiceDocFilename(file.name);
      if (!parsed) return { file, parsed: null, kind: null, status: 'skip-unparseable', message: 'Filename must be {invoice_number}_{kind}.pdf' };
      const kind = target.kindMap[parsed.hint] || null;
      if (!kind) return { file, parsed, kind: null, status: 'skip-unparseable', message: 'Unknown kind "' + parsed.hint + '" for ' + target.label.toLowerCase() };
      return { file, parsed, kind, status: 'parsed', message: null };
    });

    // 2. Batch-lookup parents by invoice_number.
    const numbers = Array.from(new Set(parsedRows.filter(r => r.kind).map(r => r.parsed.invoice_number)));
    let parentByNumber = {};
    if (numbers.length > 0 && supabaseClient) {
      const { data, error } = await supabaseClient
        .from(target.lookupTable)
        .select(target.lookupSelect)
        .in('invoice_number', numbers);
      if (error) {
        setFiles(parsedRows.map(r => ({ ...r, status: 'error', message: 'Lookup failed: ' + error.message })));
        return;
      }
      (data || []).forEach(row => { parentByNumber[row.invoice_number] = row; });
    }

    // 3. Annotate each row with the matched parent.
    const withMatches = parsedRows.map(r => {
      if (!r.kind) return r;
      const parent = parentByNumber[r.parsed.invoice_number];
      if (!parent) return { ...r, status: 'skip-no-invoice', message: 'No ' + target.lookupTable + ' with number ' + r.parsed.invoice_number };
      return { ...r, status: 'ready', parent, message: 'Will upload to ' + r.kind + ' slot' };
    });
    setFiles(withMatches);
  };

  const handleUpload = async () => {
    if (!supabaseClient) { alert('Supabase client not configured.'); return; }
    const ready = files.filter(r => r.status === 'ready');
    if (ready.length === 0) { alert('No files ready to upload.'); return; }
    setBusy(true);

    const rows = [];
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      const { file, parsed, kind, parent } = r;
      try {
        // a) If this target enforces one-per-slot, delete the existing one first.
        let replaced = false;
        if (target.replaceExisting) {
          const { data: existing } = await supabaseClient
            .from(target.metaTable)
            .select('id,storage_path')
            .eq(target.metaFkColumn, parent.id)
            .eq('kind', kind)
            .maybeSingle();
          if (existing) {
            await supabaseClient.storage.from(target.bucket).remove([existing.storage_path]);
            await supabaseClient.from(target.metaTable).delete().eq('id', existing.id);
            replaced = true;
          }
        }
        // b) Upload object.
        const path = target.storagePath(parent, kind, file);
        const { error: upErr } = await supabaseClient.storage
          .from(target.bucket)
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);
        // c) Insert metadata row.
        const { error: insErr } = await supabaseClient.from(target.metaTable).insert(target.metaRow(parent, kind, path, file));
        if (insErr) throw new Error(insErr.message);
        rows.push({ name: file.name, invoice_number: parsed.invoice_number, kind, ok: true, replaced });
      } catch (e) {
        rows.push({ name: file.name, invoice_number: parsed.invoice_number, kind, ok: false, error: e.message || String(e) });
      }
    }

    const ok       = rows.filter(r => r.ok).length;
    const replaced = rows.filter(r => r.ok && r.replaced).length;
    const skipped  = files.filter(r => r.status !== 'ready').length;
    const errored  = rows.filter(r => !r.ok).length;
    setResults({ ok, replaced, skipped, errored, rows });
    setBusy(false);
  };

  const statusPill = (status) => {
    const colours = {
      ready:             { bg:'#e6efe1', fg:'#5a6b4f', label:'Ready' },
      'skip-unparseable':{ bg:'#fdf2dc', fg:'#7a5a1f', label:'Filename unrecognized' },
      'skip-no-invoice': { bg:'#fdf2f1', fg:'#8b4a42', label:'No matching invoice' },
      error:             { bg:'#fdf2f1', fg:'#8b4a42', label:'Error' },
      parsed:            { bg:'#E6EAE9', fg:'#61707D', label:'Parsing…' },
    };
    const c = colours[status] || colours.parsed;
    return <span style={{padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:c.bg,color:c.fg,whiteSpace:'nowrap'}}>{c.label}</span>;
  };

  const readyCount     = files.filter(r => r.status === 'ready').length;
  const unparseable    = files.filter(r => r.status === 'skip-unparseable').length;
  const noInvoice      = files.filter(r => r.status === 'skip-no-invoice').length;

  const examplesFor = (key) => key === 'resident'
    ? 'RNT-2026-00431_invoice.pdf, RNT-2026-00431_payment.pdf, INV-MD-202605-cc08f0_receipt.jpg'
    : 'INV-VENDOR-001_invoice.pdf, INV-VENDOR-001_receipt.pdf, BILL-2025-09_payment.jpg';

  return (
    <div className="card">
      <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Bulk upload invoice documents</div>
      <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14}}>
        Backfill historical invoice files in one batch. The system reads each filename, matches it to an existing invoice, and uploads the file into the matching slot.
        {target.replaceExisting
          ? ' Re-uploading the same slot replaces the previous file.'
          : ' Multiple files can land in the same slot (no replace).'}
      </div>

      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {Object.entries(INVOICE_BULK_TARGETS).map(([key, t]) => (
          <div key={key}
            onClick={() => switchTarget(key)}
            style={{padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:targetKey===key?500:400,color:targetKey===key?'var(--text-dark)':'var(--text-secondary)',border: targetKey===key ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',borderRadius:8,background:targetKey===key?'var(--bg-surface)':'#fff'}}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{padding:14,background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:8,marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>Filename convention</div>
        <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:10}}>
          Each file must be named <code style={{padding:'1px 6px',background:'#fff',borderRadius:4,border:'1px solid var(--border-light)'}}>{'{invoice_number}_{kind}.{ext}'}</code>. For <strong>{target.label.toLowerCase()}</strong>, kind is one of:
        </div>
        <ul style={{fontSize:12,color:'var(--text-secondary)',margin:0,paddingLeft:18,lineHeight:1.7}}>
          {target.slotHints.map((h, i) => <li key={i}><strong>{h.split(' (')[0]}</strong>{h.includes('(') ? ' (' + h.split('(')[1] : ''}</li>)}
        </ul>
        <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:10}}>
          Examples: <code>{examplesFor(targetKey)}</code>
        </div>
      </div>

      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:14}}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          style={{display:'none'}}
          onChange={e => handlePick(e.target.files)}
        />
        <button className="btn" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>
          Choose files…
        </button>
        {files.length > 0 && (
          <button className="btn" onClick={reset} disabled={busy} style={{color:'var(--text-secondary)'}}>Clear</button>
        )}
        {files.length > 0 && (
          <div style={{fontSize:12,color:'var(--text-muted)'}}>
            {files.length} file{files.length===1?'':'s'} picked
            {readyCount     > 0 && ' · ' + readyCount + ' ready'}
            {unparseable    > 0 && ' · ' + unparseable + ' unrecognized'}
            {noInvoice      > 0 && ' · ' + noInvoice + ' unmatched'}
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div style={{marginBottom:14,maxHeight:320,overflowY:'auto',border:'1px solid var(--border-light)',borderRadius:8}}>
          <table className="data-table" style={{fontSize:12}}>
            <thead>
              <tr>
                <th style={{width:'34%'}}>File</th>
                <th style={{width:'24%'}}>Invoice #</th>
                <th style={{width:'14%'}}>Slot</th>
                <th style={{width:'28%'}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((r, i) => (
                <tr key={i}>
                  <td style={{wordBreak:'break-all'}}>{r.file.name}</td>
                  <td>{r.parsed ? r.parsed.invoice_number : '—'}</td>
                  <td>{r.kind || '—'}</td>
                  <td>
                    {statusPill(r.status)}
                    {r.message && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{r.message}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {readyCount > 0 && !results && (
        <button className="btn btn-primary" disabled={busy} onClick={handleUpload}>
          {busy ? 'Uploading…' : 'Upload ' + readyCount + ' file' + (readyCount===1?'':'s')}
        </button>
      )}

      {results && (
        <div style={{padding:14,background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:8,marginTop:6}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>Done</div>
          <div style={{fontSize:12,display:'flex',gap:18,flexWrap:'wrap',marginBottom:10}}>
            <span style={{color:'#5a6b4f',fontWeight:500}}>✓ {results.ok} uploaded{results.replaced > 0 ? ' (' + results.replaced + ' replaced existing)' : ''}</span>
            {results.errored > 0 && <span style={{color:'#8b4a42',fontWeight:500}}>✗ {results.errored} failed</span>}
            {results.skipped > 0 && <span style={{color:'#7a5a1f'}}>{results.skipped} skipped (see table above)</span>}
          </div>
          {results.errored > 0 && (
            <div style={{fontSize:11,color:'var(--text-secondary)',maxHeight:140,overflowY:'auto'}}>
              {results.rows.filter(r => !r.ok).map((r, i) => (
                <div key={i} style={{marginBottom:4}}><strong>{r.name}</strong> — {r.error}</div>
              ))}
            </div>
          )}
          <button className="btn btn-sm" style={{marginTop:10}} onClick={reset}>Upload another batch</button>
        </div>
      )}
    </div>
  );
};

