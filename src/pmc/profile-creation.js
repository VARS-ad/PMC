// ==================== PROFILE CREATION (PMC admin) ====================

// Per-property-type sub-templates rendered in the Buildings ('Properties')
// Bulk upload tab. Each one has its own example rows + download buttons.
// The unified parser (uploadBuildingsBulk) accepts a mix of all four so
// the single upload box at the bottom can ingest any combination.
// Column conventions across the four templates:
//   B-* = Building / unit columns
//   O-* = Owner columns (the asset record)
//   R-* = Resident columns (residential / villa — full personal data)
//   T-* = Tenant columns (commercial — corporate fields only)
const OWNER_COLS = ['Owner name','Owner phone','Owner email','Owner passport','Owner Emirates ID','Purchase date'];
// Residential resident columns: per the user, emergency contact fields
// are dropped (not relevant for billing / records). Only residential
// residents get a Supabase Auth account, so this is the ONLY template
// that carries a temp-password column.
const RESIDENT_COLS = [
  'Resident full name','Resident email','Resident phone','Resident temp password',
  'Resident date of birth','Resident passport','Resident Emirates ID',
  'Resident employer','Resident occupation',
  'Resident tenure','Lease start','Lease end','Monthly payment (AED)','Ownership start','Cheques per year','Contract #',
];
// Villa resident columns: same as RESIDENT_COLS minus the temp password
// (villa residents do NOT get an Auth account — contact info only).
const VILLA_RESIDENT_COLS = RESIDENT_COLS.filter(c => c !== 'Resident temp password');
// Commercial tenant columns: corporate-only. No DOB / Passport / Emirates
// ID / emergency contact / employer / occupation / ownership_start /
// cheques / temp password. Contract # first; tenant block; Owner block at
// the end of the Commercial row.
const TENANT_COLS = [
  'Contract #','Tenant name','Tenant email','Tenant phone',
  'Tenant tenure','Lease start','Lease end','Monthly payment (AED)',
];
// Commercial Land uses "Client" terminology instead of "Tenant". Same
// shape, same parser branch. Each row is one client on the plot —
// a single plot can have many client rows (yard subdivisions, multi-
// tenant lease arrangements, etc.) and the parser de-dupes by Contract #
// or by an auto-incremented slot number when Contract # is blank.
// No temp password — clients do not get Auth accounts.
const CLIENT_COLS = [
  'Contract #','Client name','Client email','Client phone',
  'Lease start','Lease end','Monthly payment (AED)',
];

const BUILDINGS_BY_TYPE = {
  Residential: {
    label: 'Residential buildings',
    headers: ['Building name','Property type','Floor','Unit','Address','Notes', ...OWNER_COLS, ...RESIDENT_COLS],
    examples: [
      // Owner-occupied — owner_is_resident flag set by parser when Owner email matches Resident email.
      ['Aljil Tower','Residential',1,'A-101','Sheikh Zayed Rd, Dubai, UAE','High-rise residential, mixed amenities (pool, gym).',
        'Khalid Al Mansoori','+971 50 111 2233','khalid.almansoori@example.ae','AB1234567','784-1980-1234567-1','2018-03-12',
        'Khalid Al Mansoori','khalid.almansoori@example.ae','+971 50 111 2233','Welcome2026!',
        '1980-05-14','AB1234567','784-1980-1234567-1','Emirates NBD','Senior Banker',
        'Owner','','','','2018-03-12','',''],
      // Tenant-occupied — owner different from resident.
      ['Aljil Tower','Residential',1,'A-102','','',
        'Mohammed Al Hammadi','+971 55 234 1187','mohammed.alhammadi@example.ae','CD7654321','784-1990-7654321-2','2019-09-01',
        'Reem Al Suwaidi','reem.alsuwaidi@example.ae','+971 56 887 3300','Welcome2026!',
        '1992-11-08','EF1122334','784-1992-1122334-3','Mubadala','HR Analyst',
        'Tenant','2026-01-01','2026-12-31',12000,'',12,'RNT-2026-A102'],
      // Vacant unit — owner present, no resident yet.
      ['Aljil Tower','Residential',2,'A-201','','',
        'Mohammed Al Hammadi','+971 55 234 1187','mohammed.alhammadi@example.ae','CD7654321','784-1990-7654321-2','2019-09-01',
        '','','','','','','','','','','','','',''],
      // New building — Owner only on the FIRST row; later units inherit it on parse.
      ['Al Qurm View','Residential',1,'Q-101','Shams Abu Dhabi, Al Reem Island, Abu Dhabi, UAE','Low-rise residential by Aldar Properties.',
        'Hassan Al Awadi','+971 50 808 4040','hassan.awadi@example.ae','GH5566778','784-1975-5566778-9','2015-06-20',
        'Hassan Al Awadi','hassan.awadi@example.ae','+971 50 808 4040','Welcome2026!',
        '1975-01-30','GH5566778','784-1975-5566778-9','Self-employed','Real estate investor',
        'Owner','','','','2015-06-20','',''],
    ],
    filename: 'residential-template',
    rules: [
      'ONE ROW PER UNIT — a 100-unit tower = 100 rows; repeat the Building name on every row.',
      'Floor and Unit are both required.',
      'Building-level fields (Address, Notes) live on the FIRST row of each building.',
      'OWNER columns describe the property owner — required for at least the FIRST unit of each building; later units inherit the owner if blank.',
      'RESIDENT columns describe the current occupant — leave blank if the unit is vacant.',
      'If the Resident email matches the Owner email we automatically flag the unit as owner-occupied.',
      'Resident tenure must be one of: Owner, Tenant.',
    ],
  },
  Commercial: {
    label: 'Commercial buildings',
    // One row per OFFICE / RETAIL UNIT. User shape:
    //   Building 1 = 4 floors × 2 offices per floor = 8 rows.
    //   Building 2 = 5 floors × 2 offices per floor = 10 rows.
    headers: ['Building name','Property type','Floor','Unit','Address','Notes','Commercial use','Gross leasable area (sqft)','Parking spots', ...TENANT_COLS, ...OWNER_COLS],
    examples: [
      // Compact 4-row example: one building × 2 floors × 2 offices per
      // floor. Row 1 carries the building-level fields; rows 2-4 leave
      // them blank (parser inherits). Row 4 shows a vacant unit.
      ['Boulevard Plaza Offices','Commercial',1,'B-101','Sheikh Mohammed bin Rashid Blvd, Downtown Dubai, UAE','Grade A office tower (2 floors, 2 offices per floor).','Office',180000,400,
        'CMT-BLV-101','TechCorp ME FZ-LLC','tenancy@techcorp.me','+971 4 778 2200','Tenant','2026-02-01','2027-01-31',45000,
        'Downtown Holding LLC','+971 4 555 1000','contracts@downtownholding.ae','-','-','2013-11-20'],
      ['Boulevard Plaza Offices','Commercial',1,'B-102','','','','','',
        'CMT-BLV-102','Apex Consulting ME','admin@apexconsulting.ae','+971 4 224 5500','Tenant','2026-01-15','2027-01-14',38000,
        '','','','','',''],
      ['Boulevard Plaza Offices','Commercial',2,'B-201','','','','','',
        'CMT-BLV-201','Sigma Health Group','finance@sigmahealth.ae','+971 4 990 1100','Tenant','2026-03-01','2028-02-28',42000,
        '','','','','',''],
      ['Boulevard Plaza Offices','Commercial',2,'B-202','','','','','',
        '','','','','','','','',
        '','','','','',''],
    ],
    filename: 'commercial-template',
    rules: [
      'ONE ROW PER OFFICE (or retail unit). Floor and Unit are both required.',
      'A 4-floor building with 2 offices per floor = 8 rows; 5 floors × 2 offices = 10 rows.',
      'Commercial use must be one of: Office, Retail, Mixed.',
      'Building-level fields (Address, Notes, GLA, Parking, Commercial use) go on the FIRST row of each building.',
      'TENANT block (Contract #, name, email, phone, lease) describes the corporate tenant. Personal fields like DOB / passport / emergency contact intentionally aren’t collected here.',
      'No Tenant temp password — commercial tenants do NOT get a Supabase Auth account (only Residential residents do).',
      'OWNER block sits at the END — usually a holding company. Fill on the FIRST row of each building; later rows inherit.',
    ],
  },
  Villa: {
    label: 'Villas',
    // One row per individual villa (not per compound). Each villa is its
    // own building record with its own owner + resident. The 'Villa count'
    // column from the old compound shape is gone — each row IS one villa.
    headers: ['Villa name','Property type','Address','Notes','Bedrooms','Plot area (sqft)', ...OWNER_COLS, ...VILLA_RESIDENT_COLS],
    examples: [
      // Palm Jumeirah villa — rented to a tenant.
      ['Palm Frond M-23','Villa','Palm Jumeirah, Frond M, Dubai, UAE','Signature villa, private beach access, 3 floors.',6,12500,
        'Layla Al Maktoum','+971 50 778 9900','layla.maktoum@example.ae','MM1122334','784-1981-1122334-1','2014-09-22',
        'Stefan Hartmann','stefan.hartmann@example.ae','+971 52 119 8877','1979-04-12','DE2233445','','BMW ME','Regional CEO','Tenant','2026-01-01','2027-12-31',38000,'',12,'RNT-PALM-M23'],
      // Emirates Hills mansion — owner-occupied.
      ['Emirates Hills V-14','Villa','Emirates Hills, Street 7, Dubai, UAE','Mansion-style villa, golf course frontage, 2 floors.',8,18000,
        'Mohammed Al Habtoor','+971 50 224 5500','mohammed.habtoor@example.ae','HB7788990','784-1972-7788990-5','2009-11-08',
        'Mohammed Al Habtoor','mohammed.habtoor@example.ae','+971 50 224 5500','1972-03-30','HB7788990','784-1972-7788990-5','Al Habtoor Group','Chairman','Owner','','','','2009-11-08','',''],
      // Saadiyat villa — rented.
      ['Saadiyat Beach B-7','Villa','Saadiyat Beach Villas, Saadiyat Island, Abu Dhabi, UAE','Aldar Saadiyat Beach community villa, 2 floors.',5,9500,
        'Ahmed Al Marzouqi','+971 50 119 2244','ahmed.marzouqi@example.ae','MZ1122334','784-1977-1122334-3','2017-06-04',
        'Eric Lambert','eric.lambert@example.ae','+971 55 663 7788','1983-11-20','FR4455667','','TotalEnergies','Country GM','Tenant','2026-02-01','2027-01-31',32000,'',4,'RNT-SAAD-B7'],
      // Al Barari villa — corporate owner, rented.
      ['Al Barari Forest Villa F-3','Villa','Al Barari, Forest Villas, Dubai, UAE','Forest villa, private pool, 3 floors.',7,15000,
        'Al Barari Investments LLC','+971 4 339 7788','contracts@albarariinv.ae','-','-','2015-03-18',
        'Patricia Romano','patricia.r@example.ae','+971 56 778 9911','1985-07-14','IT2233445','','L Catterton','Partner, Private Equity','Tenant','2026-03-01','2027-02-28',45000,'',12,'RNT-BARARI-F3'],
    ],
    filename: 'villas-template',
    rules: [
      'ONE ROW per individual villa (no compound grouping, no Floor / Unit columns).',
      'Bedrooms and Plot area describe THIS villa.',
      'OWNER columns describe whoever holds title to the villa (individual or corporate).',
      'RESIDENT columns describe the current occupant; leave blank for vacant villas.',
      'No Resident temp password — villa residents do NOT get a Supabase Auth account (only Residential building residents do).',
      'If the Resident email matches the Owner email we automatically flag the villa as owner-occupied.',
    ],
  },
  'Commercial Land': {
    label: 'Commercial land',
    // 'Plot name' is the user-facing label; data still maps to
    // buildings.name (the parser accepts either header). One plot may
    // host multiple clients — each row is one client lease on the plot.
    headers: ['Plot name','Property type','Address','Notes','Plot area (sqft)', ...OWNER_COLS, ...CLIENT_COLS],
    examples: [
      // Compact 4-row example: one multi-client plot (2 rows), one vacant
      // plot, one single-client plot. Demonstrates plot-level field
      // inheritance on row 2 (blank → carried over from row 1).
      ['Al Quoz Industrial Plot 14','Commercial Land','Al Quoz Industrial Area 3, Dubai, UAE','Industrial plot subdivided into 2 yards, leased to logistics tenants.',85000,
        'Khalifa Industrial Holdings','+971 4 252 9900','plots@kih.ae','-','-','2009-02-04',
        'CL-AQ14-A','Aramex Yards','contracts@aramex.com','+971 4 778 1100','2026-01-01','2028-12-31',120000],
      ['Al Quoz Industrial Plot 14','Commercial Land','','','','','','','','','',
        'CL-AQ14-B','DHL Express UAE','accounts@dhl.ae','+971 4 224 5511','2026-02-01','2027-01-31',95000],
      ['DIP Phase 2 Plot 38','Commercial Land','Dubai Investment Park, Phase 2, Dubai, UAE','Mixed light-industrial / showroom plot, currently vacant.',45000,
        'Dubai Investments PJSC','+971 4 812 0700','plots@dubaiinvestments.ae','-','-','2003-07-21',
        '','','','','','',''],
      ['KIZAD South Plot 22','Commercial Land','Khalifa Industrial Zone Abu Dhabi (KIZAD) South, Abu Dhabi, UAE','Heavy-industrial plot, 30-year ground lease.',120000,
        'AD Ports Group','+971 2 695 2000','plots@adports.ae','-','-','2015-10-12',
        'CL-KZ22-Main','JAFZA-Logistic Co','contracts@jafzalogistic.ae','+971 2 511 3300','2025-10-01','2055-09-30',225000],
    ],
    filename: 'commercial-land-template',
    rules: [
      'ONE row per CLIENT lease. A plot leased to 3 tenants = 3 rows; repeat the Plot name on every row.',
      'Plot-level fields (Address, Notes, Plot area, Owner block) go on the FIRST row of each plot; later rows can leave them blank.',
      'Each client row must have a unique Contract # — that becomes the slot id under the plot. Leave blank for vacant plots.',
      'OWNER columns describe the title holder (usually a holding company).',
      'CLIENT columns describe whoever is currently leasing the slot; corporate fields only (no DOB / passport / Emirates ID).',
      'No Client temp password — commercial-land clients do NOT get a Supabase Auth account (only Residential building residents do).',
    ],
  },
};

const PC_TEMPLATES = {
  buildings: {
    label: 'Assets',
    headers: [
      'Building name','Property type','Floor','Unit','Address','Notes',
      'Plot area (sqft)','Villa count','Bedrooms per villa',
      'Commercial use','Gross leasable area (sqft)','Parking spots',
    ],
    examples: [
      // RESIDENTIAL — one row per unit, floor + unit number required.
      ['Aljil Tower','Residential',1,'A-101','Sheikh Zayed Rd, Dubai, UAE','Mixed residential/commercial tower.','','','','','',''],
      ['Aljil Tower','Residential',1,'A-102','','','','','','','',''],
      ['Aljil Tower','Residential',2,'A-201','','','','','','','',''],
      ['Al Qurm View','Residential',1,'Q-101','Shams Abu Dhabi, Al Reem Island, Abu Dhabi','Low-rise residential.','','','','','',''],
      // COMMERCIAL — same row-per-unit, plus building-level GLA / parking / use on the first row.
      ['Marina Bay Offices','Commercial',3,'305','Dubai Marina, Dubai, UAE','Office tower.','','','','Office',12000,80],
      ['Marina Bay Offices','Commercial',3,'306','','','','','','','',''],
      // VILLA — one row for the WHOLE compound. Floor + Unit stay blank.
      ['Palm Villas Compound','Villa','','','Palm Jumeirah, Dubai, UAE','Gated compound.',8000,5,4,'','',''],
      // COMMERCIAL LAND — raw plot, no floors, no units, no buildings on it.
      ['Al Wasl Plot 14','Commercial Land','','','Al Wasl Rd, Dubai, UAE','Vacant plot, leased for events.',25000,'','','','',''],
    ],
    filename: 'buildings-template',
    rules: [
      'Property type must be one of: Residential, Commercial, Villa, Commercial Land.',
      'Residential and Commercial: ONE ROW PER UNIT. Floor and Unit are required. A 100-unit tower = 100 rows; repeat Building name on every row.',
      'Villa: ONE ROW per villa compound. Leave Floor and Unit blank. Fill Villa count, Plot area, Bedrooms per villa.',
      'Commercial Land: ONE ROW per plot. Leave Floor and Unit blank. Fill Plot area.',
      'Building-level fields (Property type, Address, Notes, Plot area, Villa count, GLA, Parking, etc.) are read from the FIRST row of each building; later rows can leave them blank.',
      'Commercial use must be one of: Office, Retail, Mixed (only for Commercial buildings).',
      'Re-running the upload is safe: existing buildings/units are skipped (matched on Building + Unit).',
    ],
  },
  // The standalone Residents tab is gone — resident records are now
  // ingested as part of the Properties bulk upload (one row per unit with
  // Owner + Resident columns). The PCSummary / PCBulkUpload / PCManualUpload
  // handlers still recognise the 'residents' section key so existing
  // resident-detail-modal flows and per-row Edit modals (opened from the
  // Properties summary tab when we surface residents per unit) keep
  // working without a top-level tab.
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
    label: 'Maintenance Companies',
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
    filename: 'maintenance-companies-template',
    rules: [
      'Company name and Service category are required.',
      'Service category must be one of: Plumbing, Electrical, HVAC, Cleaning, Security, Gardening, Pest Control, Lift Maintenance, General Handyman, Other.',
      'Status — Active, Expiring Soon, Expired, or Terminated. Defaults to Active when blank.',
      'Dates use ISO format YYYY-MM-DD.',
      'Buildings covered — comma-separated list of existing building names (e.g. "Aljil Tower, Al Qurm View"). Names that don\'t match an existing building are skipped silently.',
      'Re-running the upload is safe: maintenance companies are matched on Company name and skipped if already present.',
      'After the metadata upload completes, an optional "Bulk attach documents" section appears where you can drag-drop multiple files at once.',
    ],
  },
  documents:        { label: 'Document database', singlePane: true },
  reminderSettings: { label: 'Reminder Email',   singlePane: true },
};

function downloadAsXlsx(filename, headers, rows) {
  if (!window.XLSX) { alert('XLSX library not available'); return; }
  const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Template');
  window.XLSX.writeFile(wb, filename + '.xlsx');
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
  // Documents / Reminder Email use single-pane custom UIs
  // (no Summary / Bulk / Manual sub-tabs).
  const isSinglePane = !!(PC_TEMPLATES[section] && PC_TEMPLATES[section].singlePane);
  const effectiveInner = isReadOnly ? 'summary' : inner;
  const innerTabs = ['summary','bulk','manual'];

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
        <div className="page-header"><div><h1>Database</h1></div></div>
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
          <h1>Database</h1>
        </div>
      </div>

      <div style={{display:'flex',gap:4,marginBottom:22,borderBottom:'1px solid var(--border-light)',overflowX:'auto'}}>
        {Object.entries(PC_TEMPLATES).map(([id, cfg]) => (
          <div key={id}
            onClick={() => { setSection(id); setInner('summary'); }}
            style={{padding:'12px 20px',cursor:'pointer',fontSize:14,fontWeight:section===id?500:400,color:section===id?'var(--text-dark)':'var(--text-secondary)',borderBottom: section===id ? '2px solid var(--bg-warm-dark)' : '2px solid transparent',marginBottom:-1,letterSpacing:'-0.01em',whiteSpace:'nowrap',transition:'color 0.15s'}}
            onMouseEnter={e => { if (section !== id) e.currentTarget.style.color = 'var(--text-dark)'; }}
            onMouseLeave={e => { if (section !== id) e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {cfg.label}
          </div>
        ))}
      </div>

      {!isReadOnly && !isSinglePane && innerTabs.length > 1 && (
        <div style={{display:'flex',gap:8,marginBottom:24}}>
          {innerTabs.map(id => (
            <div key={id}
              onClick={() => setInner(id)}
              style={{padding:'8px 16px',cursor:'pointer',fontSize:13,fontWeight:inner===id?500:400,color:inner===id?'var(--text-dark)':'var(--text-secondary)',border: inner===id ? '1.5px solid var(--bg-warm-dark)' : '1px solid var(--border-light)',borderRadius:8,background:inner===id?'var(--bg-surface)':'#fff',letterSpacing:'-0.01em',transition:'color 0.15s,border-color 0.15s'}}>
              {id === 'bulk' ? 'Bulk upload' : id === 'manual' ? 'Manual upload' : 'Summary'}
            </div>
          ))}
        </div>
      )}

      {isSinglePane && section === 'documents'        && <DocumentLibraryPage embedded/>}
      {isSinglePane && section === 'reminderSettings' && <ReminderSettingsSection/>}
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
  // Cascade-delete confirm modal. Shape: { building, counts, deleting }
  // where counts has units / residents / invoices / etc. so the user
  // sees exactly what's about to be erased before confirming.
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // Maintenance Companies inline edit / detail. We reuse the global
  // VendorEditModal + VendorDetailModal from src/pmc/vendors.js so the
  // Database → Maintenance Companies → Summary surface gets the full
  // Details · Documents · Payments experience without a sidebar hop.
  const [editingVendor, setEditingVendor] = useState(null);
  const [detailVendor, setDetailVendor] = useState(null);
  const [vendorBuildingsList, setVendorBuildingsList] = useState([]);
  const [vendorBuildingsMap, setVendorBuildingsMap] = useState({});

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
      } else if (section === 'vendors') {
        // Maintenance Companies summary — list of every vendor with the
        // headline fields, sorted alphabetically. Clicking a row opens
        // VendorDetailModal (Details · Documents · Payments) inline; the
        // Edit button opens VendorEditModal — both reused from
        // src/pmc/vendors.js, so this is the same surface as the sidebar
        // Maintenance Companies page (no navigation hop needed).
        const [{ data: vs, error: ve }, { data: bs }, { data: vbs }] = await Promise.all([
          supabaseClient.from('vendors').select('*').order('name'),
          supabaseClient.from('buildings').select('id,name').order('name'),
          supabaseClient.from('vendor_buildings').select('vendor_id,building_id'),
        ]);
        if (ve) throw ve;
        const vbMap = {};
        (vbs || []).forEach(vb => {
          (vbMap[vb.vendor_id] = vbMap[vb.vendor_id] || []).push(vb.building_id);
        });
        setVendorBuildingsList(bs || []);
        setVendorBuildingsMap(vbMap);
        data = vs || [];
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
    const emptyLabel = section === 'vendors' ? 'maintenance companies' : section;
    return (<div className="card"><div style={{color:'var(--text-muted)',fontSize:13,padding:32,textAlign:'center'}}>No {emptyLabel} yet.{ro ? '' : <> Use the <strong>Bulk upload</strong> tab to add some.</>}</div></div>);
  }

  if (section === 'buildings') {
    // Split the rows into 4 buckets by property_type. Each bucket renders
    // its own card with type-tailored columns (Residential / Commercial
    // show Floors + Units; Villa shows Villas + Plot + Bedrooms;
    // Commercial Land shows Plot area).
    const groups = [
      { type:'Residential',     label:'Residential properties' },
      { type:'Commercial',      label:'Commercial properties'  },
      { type:'Villa',           label:'Villas'                 },
      { type:'Commercial Land', label:'Commercial land'        },
    ];
    const byType = {};
    (rows || []).forEach(b => {
      const t = b.property_type || 'Residential';
      (byType[t] = byType[t] || []).push(b);
    });
    const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());
    // Two-step delete: first open the modal with live dependent counts, then
    // call the cascading RPC on confirm. The RPC drops residents'
    // assignments, invoices, visits, SRs, attachments, bookings, vendor
    // links, security assignments, contracts, units, and the building in
    // one transaction so the FK constraints are satisfied.
    const openDeleteConfirm = async (b) => {
      setDeleteConfirm({ building: b, counts: null, deleting: false });
      // Count dependents in parallel so the modal can show the user what
      // they're about to erase. Each query is scoped to this building.
      try {
        const { data: unitRows } = await supabaseClient.from('units').select('id').eq('building_id', b.id);
        const unitIds = (unitRows || []).map(u => u.id);
        const counts = { units: unitIds.length, residents: 0, invoices: 0, visits: 0, srs: 0, attachments: 0, bookings: 0 };
        if (unitIds.length > 0) {
          const [ra, inv, vis, srs, att, bk] = await Promise.all([
            supabaseClient.from('resident_assignments').select('profile_id', { count: 'exact', head: true }).in('unit_id', unitIds),
            supabaseClient.from('invoices').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
            supabaseClient.from('visits').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
            supabaseClient.from('service_requests').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
            supabaseClient.from('unit_attachments').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
            supabaseClient.from('amenity_bookings').select('id', { count: 'exact', head: true }).in('unit_id', unitIds),
          ]);
          counts.residents   = ra.count   || 0;
          counts.invoices    = inv.count  || 0;
          counts.visits      = vis.count  || 0;
          counts.srs         = srs.count  || 0;
          counts.attachments = att.count  || 0;
          counts.bookings    = bk.count   || 0;
        }
        setDeleteConfirm(prev => prev && prev.building.id === b.id ? { ...prev, counts } : prev);
      } catch (_) {
        setDeleteConfirm(prev => prev && prev.building.id === b.id ? { ...prev, counts: { units: 0, residents: 0, invoices: 0, visits: 0, srs: 0, attachments: 0, bookings: 0 } } : prev);
      }
    };
    const performCascadeDelete = async () => {
      if (!deleteConfirm || !deleteConfirm.building) return;
      setDeleteConfirm(prev => ({ ...prev, deleting: true }));
      const { error: rpcErr } = await supabaseClient.rpc('delete_building_cascade', { p_building_id: deleteConfirm.building.id });
      if (rpcErr) {
        alert('Delete failed: ' + rpcErr.message);
        setDeleteConfirm(prev => ({ ...prev, deleting: false }));
        return;
      }
      setDeleteConfirm(null);
      try { window.dispatchEvent(new CustomEvent('vars:buildings-changed')); } catch (_) {}
      reload();
    };
    const editBtn = (b) => (
      <button onClick={(e) => { e.stopPropagation(); setEditing({ kind: 'building', record: b }); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
    );
    const delBtn = (b) => (
      <button onClick={(e) => { e.stopPropagation(); openDeleteConfirm(b); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
    );
    const tableFor = (type, list) => {
      const isStructure = type === 'Residential' || type === 'Commercial';
      if (isStructure) {
        const extraHead = type === 'Commercial' ? <><th>Use</th><th>GLA (sqft)</th><th>Parking</th></> : null;
        return (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Address</th><th>Floors</th><th>Units</th>{extraHead}<th>Created</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
            <tbody>
              {list.map(b => {
                const floors = new Set((b.units||[]).map(u => u.floor)).size;
                return (
                  <tr key={b.id} style={{cursor:'pointer'}} onClick={() => setSelectedBuilding(b)}>
                    <td style={{fontWeight:500}}>{b.name}</td>
                    <td>{b.address || '—'}</td>
                    <td>{floors}</td>
                    <td>{(b.units||[]).length}</td>
                    {type === 'Commercial' && <>
                      <td>{b.commercial_use_type || '—'}</td>
                      <td>{fmtNum(b.gross_leasable_area_sqft)}</td>
                      <td>{fmtNum(b.parking_spots)}</td>
                    </>}
                    <td>{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>{editBtn(b)}{delBtn(b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }
      if (type === 'Villa') {
        return (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Address</th><th>Villas</th><th>Plot (sqft)</th><th>Bedrooms/villa</th><th>Created</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
            <tbody>
              {list.map(b => (
                <tr key={b.id} style={{cursor:'pointer'}} onClick={() => setSelectedBuilding(b)}>
                  <td style={{fontWeight:500}}>{b.name}</td>
                  <td>{b.address || '—'}</td>
                  <td>{fmtNum(b.villa_count)}</td>
                  <td>{fmtNum(b.plot_area_sqft)}</td>
                  <td>{fmtNum(b.bedrooms_per_villa)}</td>
                  <td>{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
                  <td style={{textAlign:'right',whiteSpace:'nowrap'}}>{editBtn(b)}{delBtn(b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      // Commercial Land
      return (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Address</th><th>Plot (sqft)</th><th>Created</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
          <tbody>
            {list.map(b => (
              <tr key={b.id} style={{cursor:'pointer'}} onClick={() => setSelectedBuilding(b)}>
                <td style={{fontWeight:500}}>{b.name}</td>
                <td>{b.address || '—'}</td>
                <td>{fmtNum(b.plot_area_sqft)}</td>
                <td>{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
                <td style={{textAlign:'right',whiteSpace:'nowrap'}}>{editBtn(b)}{delBtn(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    };
    return (
      <>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>{(rows||[]).length} propert{(rows||[]).length === 1 ? 'y' : 'ies'} · click a row to see floors & units</div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        {groups.map(g => {
          const list = byType[g.type] || [];
          if (list.length === 0) return null;
          return (
            <div key={g.type} className="card" style={{marginBottom:18}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12,gap:10}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>{g.label}</div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>{list.length} {list.length === 1 ? 'record' : 'records'}</div>
              </div>
              <div className="data-table-scroll">{tableFor(g.type, list)}</div>
            </div>
          );
        })}
        {selectedBuilding && <BuildingDetailModal building={selectedBuilding} onClose={() => setSelectedBuilding(null)}/>}
        {editing && <EditRecordModal kind={editing.kind} record={editing.record} onClose={() => setEditing(null)} onSaved={reload}/>}
        {deleteConfirm && (() => {
          const { building, counts, deleting } = deleteConfirm;
          const T = { ink:'#131F23', muted:'#61707D', border:'#E6EAE9', danger:'#8b4a42', dangerBg:'#fdf2f1', warm:'#F4EEE4' };
          const rows = counts && [
            { label: 'Units',                count: counts.units },
            { label: 'Resident assignments', count: counts.residents },
            { label: 'Invoices',             count: counts.invoices },
            { label: 'Visits',               count: counts.visits },
            { label: 'Service requests',     count: counts.srs },
            { label: 'Unit attachments',     count: counts.attachments },
            { label: 'Amenity bookings',     count: counts.bookings },
          ];
          return (
            <div onClick={() => { if (!deleting) setDeleteConfirm(null); }} style={{position:'fixed',inset:0,background:'rgba(19,31,35,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
              <div onClick={e => e.stopPropagation()} style={{background:'#fff',borderRadius:12,maxWidth:520,width:'100%',border:'1px solid '+T.border,boxShadow:'0 20px 60px rgba(19,31,35,0.25)',overflow:'hidden'}}>
                <div style={{padding:'20px 24px 16px',borderBottom:'1px solid '+T.border,background:T.dangerBg}}>
                  <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:T.danger,fontWeight:600,marginBottom:4}}>Permanent deletion</div>
                  <div style={{fontSize:18,fontWeight:600,color:T.ink}}>Delete "{building.name}"?</div>
                </div>
                <div style={{padding:'18px 24px 8px',fontSize:13,color:T.muted,lineHeight:1.55}}>
                  This action cannot be undone. The building and every row that references it will be permanently removed from the database.
                </div>
                <div style={{padding:'4px 24px 16px'}}>
                  {!counts ? (
                    <div style={{padding:'12px 0',fontSize:12,color:T.muted}}>Loading impacted records…</div>
                  ) : (
                    <div style={{background:T.warm,borderRadius:8,padding:'10px 14px'}}>
                      <div style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:T.muted,fontWeight:600,marginBottom:8}}>Will also delete</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 18px'}}>
                        {rows.map(r => (
                          <div key={r.label} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:r.count > 0 ? T.ink : T.muted}}>
                            <span>{r.label}</span>
                            <span style={{fontWeight:600}}>{r.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{padding:'14px 24px 18px',background:'#FAFAFA',borderTop:'1px solid '+T.border,display:'flex',justifyContent:'flex-end',gap:10}}>
                  <button type="button" disabled={deleting} onClick={() => setDeleteConfirm(null)}
                    style={{padding:'9px 16px',fontSize:13,fontWeight:500,background:'#fff',border:'1px solid '+T.border,borderRadius:6,cursor: deleting ? 'default' : 'pointer',color:T.ink}}>
                    Cancel
                  </button>
                  <button type="button" disabled={deleting || !counts} onClick={performCascadeDelete}
                    style={{padding:'9px 18px',fontSize:13,fontWeight:500,background:T.danger,border:'none',borderRadius:6,cursor:(deleting || !counts) ? 'default' : 'pointer',color:'#fff',opacity:(deleting || !counts) ? 0.6 : 1}}>
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </>
    );
  }

  if (section === 'residents') {
    return (
      <>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>{rows.length} resident{rows.length===1?'':'s'}</div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        <div className="data-table-scroll">
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
      </div>
      {editing && <EditRecordModal kind={editing.kind} record={editing.record} onClose={() => setEditing(null)} onSaved={reload}/>}
      {viewingResident && <ResidentDetailModal resident={viewingResident} onClose={() => setViewingResident(null)}/>}
      </>
    );
  }

  if (section === 'vendors') {
    // Maintenance Companies summary. Mirrors the Assets / Security idiom:
    // count chip + Refresh on the top row, a card with a compact table,
    // every row is click-to-view (opens VendorDetailModal — same Details ·
    // Documents · Payments tabs as the sidebar page) and an Actions
    // column with Edit + Delete buttons mirroring the Security summary
    // (line ~992) and Buildings table (line ~711).
    const statusBadge = (status) => {
      const s = String(status || 'Active');
      const colour = s === 'Active' ? { bg:'#e6efe1', fg:'#5a6b4f' }
                   : s === 'Expiring Soon' ? { bg:'#fdf6e3', fg:'#a07d3c' }
                   : s === 'Expired' ? { bg:'#fdf2f1', fg:'#8b4a42' }
                   : s === 'Terminated' ? { bg:'#f0eded', fg:'#8b4a42' }
                   : { bg:'#eef1f3', fg:'#3E4C59' };
      return <span style={{display:'inline-block',padding:'2px 8px',borderRadius:10,background:colour.bg,color:colour.fg,fontSize:10,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>{s}</span>;
    };
    const deleteVendor = async (v) => {
      if (!window.confirm('Delete maintenance company "' + v.name + '" and all its documents and payments? This cannot be undone.')) return;
      try {
        const { data: docs } = await supabaseClient.from('vendor_documents').select('storage_path').eq('vendor_id', v.id);
        if (docs && docs.length) {
          await supabaseClient.storage.from('maintenance-documents').remove(docs.map(d => d.storage_path));
        }
        const { error: de } = await supabaseClient.from('vendors').delete().eq('id', v.id);
        if (de) { alert('Delete failed: ' + de.message); return; }
        reload();
      } catch (e) {
        alert('Delete failed: ' + (e.message || String(e)));
      }
    };
    return (
      <>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:10,flexWrap:'wrap'}}>
          <div style={{fontSize:13,color:'var(--text-muted)'}}>
            {rows.length} maintenance compan{rows.length === 1 ? 'y' : 'ies'} · click a row to view documents & payments
          </div>
          <button className="btn btn-sm" onClick={reload}>Refresh</button>
        </div>
        <div className="data-table-scroll">
          <table className="data-table">
            <thead><tr>
              <th>Name</th>
              <th>Category</th>
              <th>Status</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Contract end</th>
              <th style={{textAlign:'right'}}>Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(v => (
                <tr key={v.id} style={{cursor:'pointer'}} onClick={() => setDetailVendor(v)}>
                  <td style={{fontWeight:500}}>{v.name}</td>
                  <td>{v.service_category || '—'}</td>
                  <td>{statusBadge(v.status)}</td>
                  <td>{v.contact_person || '—'}</td>
                  <td>{v.contact_phone || '—'}</td>
                  <td>{v.contract_end || '—'}</td>
                  <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                    <button onClick={(e) => { e.stopPropagation(); setEditingVendor(v); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteVendor(v); }} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editingVendor && (
        <VendorEditModal
          vendor={editingVendor}
          buildings={vendorBuildingsList}
          vendorBuildingIds={editingVendor?.id ? (vendorBuildingsMap[editingVendor.id] || []) : []}
          onSaved={async () => { setEditingVendor(null); await reload(); }}
          onClose={() => setEditingVendor(null)}
        />
      )}
      {detailVendor && !editingVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          buildings={vendorBuildingsList}
          vendorBuildingIds={vendorBuildingsMap[detailVendor.id] || []}
          onClose={() => setDetailVendor(null)}
          onEdit={() => setEditingVendor(detailVendor)}
          onDeleted={async () => { setDetailVendor(null); await reload(); }}
          onChanged={reload}
        />
      )}
      </>
    );
  }

  // Group guards by building so the Security summary mirrors the
  // Properties summary's per-type sections. A guard with no building
  // assignment shows in an 'Unassigned' bucket.
  const guardsByBuilding = {};
  (rows || []).forEach(r => {
    const key = r.building_name || '(Unassigned)';
    (guardsByBuilding[key] = guardsByBuilding[key] || []).push(r);
  });
  const buildingNamesSorted = Object.keys(guardsByBuilding).sort((a, b) => {
    if (a === '(Unassigned)') return 1;
    if (b === '(Unassigned)') return -1;
    return a.localeCompare(b);
  });
  const deleteGuard = async (r) => {
    if (!window.confirm('Delete guard "' + r.full_name + '"? This removes their login too.')) return;
    const out = await deleteUsersViaFunction([r.id]);
    const first = out && out.results && out.results[0];
    if (!first || !first.ok) alert('Delete failed: ' + ((first && first.error) || (out && out.error) || 'Unknown'));
    reload();
  };

  return (
    <>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
      <div style={{fontSize:13,color:'var(--text-muted)'}}>{(rows||[]).length} guard{(rows||[]).length===1?'':'s'} across {buildingNamesSorted.length} building{buildingNamesSorted.length===1?'':'s'}</div>
      <button className="btn btn-sm" onClick={reload}>Refresh</button>
    </div>
    {buildingNamesSorted.map(bname => {
      const list = guardsByBuilding[bname];
      return (
        <div key={bname} className="card" style={{marginBottom:18}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12,gap:10}}>
            <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>{bname}</div>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>{list.length} guard{list.length===1?'':'s'}</div>
          </div>
          <div className="data-table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Passport</th><th>DOB</th><th>Shift</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td style={{fontWeight:500}}>{r.full_name}</td>
                    <td style={{fontSize:12,color:'var(--accent-warm-dark)'}}>{r.email}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.passport_number || '—'}</td>
                    <td>{r.date_of_birth || '—'}</td>
                    <td>{r.shift}</td>
                    <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                      <button onClick={() => setEditing({ kind: 'security', record: r })} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'var(--text-dark)',cursor:'pointer',marginRight:6}}>Edit</button>
                      <button onClick={() => deleteGuard(r)} style={{padding:'4px 10px',fontSize:11,background:'#fff',border:'1px solid #D0D6D5',borderRadius:4,color:'#8b4a42',cursor:'pointer'}}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    })}
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
  // A unit counts as occupied if either:
  //  - residential: there's a resident_assignments row (loaded into residentByUnit above), OR
  //  - commercial / villa / land: the unit row itself carries a non-empty tenant_name.
  // Otherwise the unit is vacant.
  const isOccupied = (u) => {
    if (residentByUnit[u.id]) return true;
    if (u && u.tenant_name && String(u.tenant_name).trim() !== '') return true;
    return false;
  };
  const unitChipTitle = (u) => {
    const r = residentByUnit[u.id];
    if (r && r.profile) return r.profile.full_name + (r.assignment ? ' · ' + r.assignment.tenure : '');
    if (u && u.tenant_name && String(u.tenant_name).trim() !== '') return String(u.tenant_name) + ' · Tenant';
    return 'Vacant';
  };
  // Totals for the modal sub-line ("· N occupied · M vacant").
  const allUnits = building.units || [];
  const occupiedCount = allUnits.filter(isOccupied).length;
  const vacantCount = allUnits.length - occupiedCount;
  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:1040,maxHeight:'90vh',padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div className="modal-header" style={{position:'sticky',top:0,background:'#fff',padding:'24px 28px 18px 32px',margin:0,borderBottom:'1px solid var(--border-light)',zIndex:2}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Building</div>
            <h2>{building.name}</h2>
            <div className="modal-sub">{building.address || ''}</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:6}}>{floors.length} floor{floors.length===1?'':'s'} · {allUnits.length} units · <span style={{color:'#5a6b4f'}}>{occupiedCount} occupied</span> · <span style={{color:'#a07d3c'}}>{vacantCount} vacant</span></div>
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
                {byFloor[f].map(u => {
                  const occ = isOccupied(u);
                  // Light tinted backgrounds so occupancy reads at-a-glance:
                  //   • Occupied — soft warm-green (#e6efe1) with a darker
                  //     green border + label colour.
                  //   • Vacant   — soft warm-amber (#fdf5e6) with a darker
                  //     amber border + label colour.
                  // Bigger 9×9 dot top-right with a ring against the tint
                  // so the indicator stays visible on hover.
                  const restBg     = occ ? '#e6efe1' : '#fdf5e6';
                  const hoverBg    = occ ? '#d8e6cf' : '#fbeccf';
                  const borderCol  = occ ? '#c8d4be' : '#efe1be';
                  const labelCol   = occ ? '#3d4d33' : '#7a5a1f';
                  const dotColor   = occ ? '#5a6b4f' : '#a07d3c';
                  return (
                    <div key={u.id} onClick={() => setSelectedUnit(u)}
                      style={{position:'relative',padding:'10px 10px',border:'1px solid ' + borderCol,borderRadius:6,fontSize:12,fontWeight:600,background: restBg,color: labelCol,textAlign:'center',cursor:'pointer',transition:'background 0.15s, border-color 0.15s'}}
                      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = restBg; }}
                      title={unitChipTitle(u) + ' · ' + (occ ? 'Occupied' : 'Vacant')}>
                      <span aria-hidden="true" style={{position:'absolute',top:6,right:6,width:9,height:9,borderRadius:'50%',background:dotColor,boxShadow:'0 0 0 2px ' + restBg}}/>
                      {u.unit_number}
                    </div>
                  );
                })}
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
  // One file-input ref per Buildings sub-picker (keyed by BUILDINGS_BY_TYPE
  // key) so the Remove-file button can clear the right input visually.
  const buildingFileRefs = useRef({});
  const [parsedRows, setParsedRows] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [conflictMode, setConflictMode] = useState('skip'); // 'skip' | 'update' — what happens when an email already exists
  // Tracks which BUILDINGS_BY_TYPE picker the current preview came from.
  // Lets the preview show ONLY that type's columns (e.g. residential should
  // never display Plot area / Villa count / Commercial use / GLA / Parking).
  const [previewType, setPreviewType] = useState(null);
  // Live progress for the in-flight upload — { label, current, total }.
  // uploadBuildingsBulk calls back on every building / unit / onboarding
  // step so the UI can show a percent + a description of what it's doing.
  const [progress, setProgress] = useState(null);

  // For Buildings ('Assets') each property type has its own Upload control
  // wired to its own header list (Residential / Commercial / Villa /
  // Commercial Land). For every other section the shared upload at the
  // bottom uses cfg.headers as before.
  const handleFileWithHeaders = (expectedHeaders, typeKey = null) => async (e) => {
    setError(null); setResults(null); setParsedRows(null); setPreviewType(null);
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseUploadedFile(file);
      const objs = rowsToObjects(rows, expectedHeaders);
      setParsedRows(objs);
      setPreviewType(typeKey);
    } catch (err) {
      setError(String(err.message || err));
    }
  };
  const handleFile = handleFileWithHeaders(cfg.headers);

  // Clear the picked file (preview, error, results, and reset the actual
  // <input type="file"> elements so the same file can be re-picked).
  const clearPreview = () => {
    setParsedRows(null);
    setPreviewType(null);
    setError(null);
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    Object.values(buildingFileRefs.current).forEach(el => { if (el) el.value = ''; });
  };

  const submit = async () => {
    if (!parsedRows || parsedRows.length === 0) return;
    setUploading(true); setError(null); setResults(null);
    setProgress({ label: 'Preparing…', current: 0, total: 0 });
    try {
      if (section === 'buildings') {
        const res = await uploadBuildingsBulk(parsedRows, conflictMode, (p) => setProgress(p));
        setResults(res);
        // Tell the TopBar (and any other listener) to re-fetch buildings so
        // newly-onboarded properties appear in the property selector and
        // every per-building view immediately — no page reload required.
        try { window.dispatchEvent(new CustomEvent('vars:buildings-changed')); } catch (_) {}
      } else if (section === 'vendors') {
        const res = await uploadVendorsBulk(parsedRows, conflictMode);
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
    setProgress(null);
  };

  return (
    <div>
      <div className="card" style={{background:'var(--accent-warm-light)',border:'1px solid var(--border-medium)'}}>
        <div style={{fontSize:15,fontWeight:600,color:'var(--text-dark)',marginBottom:10,letterSpacing:'-0.015em'}}>How bulk onboarding works</div>
        <ol style={{fontSize:13,color:'var(--text-secondary)',paddingLeft:20,lineHeight:1.7,margin:0}}>
          <li>Download the template (.xlsx or .csv).</li>
          <li>Open it in Excel or Google Sheets and replace the example rows with your real data.</li>
          <li>Upload it back. We'll preview, flag any errors, then create the records in batch.</li>
        </ol>
      </div>

      {/* For Buildings ('Properties') we render four separate Example +
          Download blocks, one per property type. For every other section
          we render the single combined block. */}
      {section === 'buildings' ? (
        <>
          <div className="card">
            <div style={{fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:18,fontWeight:600}}>1 · Example data</div>
            {Object.entries(BUILDINGS_BY_TYPE).map(([typeKey, t]) => (
              <div key={typeKey} style={{marginBottom:22,paddingBottom:18,borderBottom:'1px solid var(--border-light)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:14,flexWrap:'wrap'}}>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)',letterSpacing:'-0.01em'}}>{t.label}</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button className="btn btn-sm btn-primary" onClick={() => downloadAsXlsx(t.filename, t.headers, t.examples)}>Download .xlsx</button>
                  </div>
                </div>
                <div className="data-table-scroll">
                  <table className="data-table" style={{fontSize:12}}>
                    <thead><tr>{t.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{t.examples.map((row,i) => (<tr key={i}>{row.map((v,j) => <td key={j}>{v == null || v === '' ? '—' : v}</td>)}</tr>))}</tbody>
                  </table>
                </div>
                {typeKey === 'Residential' && (
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:10,lineHeight:1.5}}>
                    One row per unit (Floor and Unit required); OWNER columns describe the owner — repeat the building name on every row; RESIDENT columns describe the current occupant; leave blank for vacant units.
                  </div>
                )}
              </div>
            ))}
            <div style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>Use the per-type upload pickers in step 2 below so each file is checked against the right column set.</div>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div style={{fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:14,fontWeight:600}}>1 · Example data</div>
            <div className="data-table-scroll">
              <table className="data-table" style={{fontSize:12}}>
                <thead><tr>{cfg.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{cfg.examples.map((row,i) => (<tr key={i}>{row.map((v,j) => <td key={j}>{v == null || v === '' ? '—' : v}</td>)}</tr>))}</tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:8,fontWeight:600}}>2 · Download template</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Excel template with the example rows ready to replace.</div>
            <button className="btn btn-primary" onClick={() => downloadAsXlsx(cfg.filename, cfg.headers, cfg.examples)}>Download .xlsx</button>
          </div>
        </>
      )}

      <div className="card">
        <div style={{fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:14,fontWeight:600}}>
          {section === 'buildings' ? '2 · Upload completed file' : '3 · Upload completed file'}
        </div>
        {/* Conflict mode toggle now shown for every section. The
            'Update existing' branch is only honoured by the bulk-onboard
            edge function today (residents / security). Buildings,
            vendors and contracts skip duplicates regardless of the
            toggle — the UI hint reflects that. */}
        <div style={{marginBottom:14,padding:'12px 14px',background:'var(--bg-page)',borderRadius:8,border:'1px solid var(--border-light)'}}>
          <div style={{fontSize:11,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:10,fontWeight:500}}>
            {section === 'buildings' ? 'When a building name already exists'
              : section === 'vendors' ? 'When a vendor name already exists'
              : 'When an email already exists'}
          </div>
          <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
            <label style={{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer',fontSize:12,flex:'1 1 240px'}}>
              <input type="radio" name={'conflictMode_' + section} value="skip" checked={conflictMode==='skip'} onChange={e => setConflictMode(e.target.value)} style={{marginTop:3,cursor:'pointer'}}/>
              <div>
                <div style={{fontWeight:500,color:'var(--text-dark)'}}>Skip existing (default)</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,lineHeight:1.4}}>
                  {section === 'buildings' ? 'Buildings whose name is already in the system are left untouched. New units on existing buildings are still added.'
                    : section === 'vendors' ? 'Vendors whose company name is already registered are ignored. The existing record stays untouched.'
                    : 'Rows whose email is already registered are ignored. The existing account is left untouched.'}
                </div>
              </div>
            </label>
            <label style={{display:'flex',alignItems:'flex-start',gap:8,cursor:'pointer',fontSize:12,flex:'1 1 240px'}}>
              <input type="radio" name={'conflictMode_' + section} value="update" checked={conflictMode==='update'} onChange={e => setConflictMode(e.target.value)} style={{marginTop:3,cursor:'pointer'}}/>
              <div>
                <div style={{fontWeight:500,color:'var(--text-dark)'}}>Update existing</div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,lineHeight:1.4}}>
                  {section === 'buildings' ? 'Refresh Address, Notes, Property type and per-type fields (plot area, villa count, GLA, parking…) from the new rows. Unit history stays intact.'
                    : section === 'vendors' ? 'Refresh contact details, contract dates, status and notes from the new rows. The vendor UUID and all linked payments/documents stay intact.'
                    : 'Refresh name, phone, building/unit, shift, and reset the temp password. The Supabase Auth account UUID and all history (visits, bookings, invoices) stay intact.'}
                </div>
              </div>
            </label>
          </div>
        </div>
        {section === 'buildings' ? (
          // Four per-type file pickers — each validates the file against
          // THIS type's column set. The user picks the row that matches
          // the template they downloaded; the chosen file is then parsed
          // and previewed in the table below, same as other sections.
          // Each picker has its own × clear button so a stuck filename
          // label (e.g. after a read error) can be reset without page reload.
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',gap:10}}>
            {Object.entries(BUILDINGS_BY_TYPE).map(([typeKey, t]) => (
              <label key={typeKey} style={{display:'flex',flexDirection:'column',gap:6,padding:'12px 14px',background:'#fff',border:'1px solid var(--border-light)',borderRadius:8,cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <span style={{fontSize:11,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',fontWeight:600}}>{t.label}</span>
                  <button
                    type="button"
                    title="Clear file"
                    onClick={e => { e.preventDefault(); clearPreview(); }}
                    style={{border:'none',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:13,padding:'0 4px',lineHeight:1}}
                  >×</button>
                </div>
                <input
                  ref={el => { buildingFileRefs.current[typeKey] = el; }}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileWithHeaders(t.headers, typeKey)}
                  style={{fontSize:12}}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{marginTop:4,fontSize:11}}
                  title={'Export the ' + t.label.toLowerCase() + ' currently in the database, in the same column shape as the template above.'}
                  onClick={e => { e.preventDefault(); downloadCurrentBuildingsAsXlsx(typeKey); }}
                >Download current data</button>
              </label>
            ))}
          </div>
        ) : (
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={handleFile} style={{fontSize:12}}/>
        )}
        {error && <div style={{color:'#8b4a42',fontSize:12,marginTop:12,padding:10,background:'#fdf2f1',borderRadius:6}}>Error: {error}</div>}
        {parsedRows && (() => {
          // For Buildings: use the columns of the property type the user
          // picked, so e.g. Residential never shows Plot area / Villa count
          // / Commercial use / GLA / Parking. For every other section we
          // fall back to cfg.headers (single template).
          const previewHeaders = (section === 'buildings' && previewType)
            ? BUILDINGS_BY_TYPE[previewType].headers
            : cfg.headers;
          // Visual inheritance of building-level fields: the user fills
          // Address / Notes / Property type / per-type fields on the FIRST
          // row of each building; the parser inherits them on later rows
          // of the same building. Mirror that in the preview so the user
          // doesn't see blanks where the data is actually carried over.
          const INHERIT = new Set([
            'Property type','Address','Notes',
            'Plot area (sqft)','Villa count','Bedrooms per villa','Bedrooms',
            'Commercial use','Gross leasable area (sqft)','Parking spots',
            'Owner name','Owner phone','Owner email','Owner passport','Owner Emirates ID','Purchase date',
          ]);
          const nameCols = ['Building name','Plot name','Villa name'];
          const lastByGroup = {};
          const displayRows = parsedRows.slice(0, 50).map(r => {
            const name = nameCols.map(c => r[c]).find(v => v != null && v !== '') || '__unknown__';
            if (!lastByGroup[name]) lastByGroup[name] = {};
            const out = { ...r };
            for (const h of previewHeaders) {
              if (!INHERIT.has(h)) continue;
              if (out[h] != null && out[h] !== '') {
                lastByGroup[name][h] = out[h];
              } else if (lastByGroup[name][h] != null && lastByGroup[name][h] !== '') {
                out[h] = lastByGroup[name][h];
              }
            }
            return out;
          });
          return (
            <div style={{marginTop:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:12,flexWrap:'wrap'}}>
                <div style={{fontSize:12,fontWeight:500}}>Preview — {parsedRows.length} row{parsedRows.length===1?'':'s'}{previewType ? ' · ' + BUILDINGS_BY_TYPE[previewType].label : ''}</div>
                <button type="button" className="btn btn-sm" onClick={clearPreview}>Remove file</button>
              </div>
              <div className="data-table-scroll" style={{maxHeight:280,overflowY:'auto',border:'1px solid var(--border-light)',borderRadius:6}}>
                <table className="data-table" style={{fontSize:11}}>
                  <thead><tr>{previewHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{displayRows.map((r,i) => (<tr key={i}>{previewHeaders.map(h => <td key={h}>{r[h] == null || r[h] === '' ? '—' : String(r[h])}</td>)}</tr>))}</tbody>
                </table>
                {parsedRows.length > 50 && <div style={{padding:8,fontSize:11,color:'var(--text-muted)',textAlign:'center'}}>… and {parsedRows.length - 50} more rows.</div>}
              </div>
              {(() => {
                const pct = progress && progress.total > 0
                  ? Math.min(100, Math.round((progress.current / progress.total) * 100))
                  : null;
                return (
                  <>
                    <button className="btn btn-primary" style={{marginTop:14}} disabled={uploading} onClick={submit}>
                      {uploading
                        ? (pct != null ? 'Uploading… ' + pct + '%' : 'Uploading…')
                        : 'Create ' + parsedRows.length + ' record' + (parsedRows.length === 1 ? '' : 's')}
                    </button>
                    {uploading && progress && (
                      <div style={{marginTop:12,padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-light)',borderRadius:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:12,color:'var(--text-secondary)',marginBottom:8}}>
                          <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{progress.label || 'Working…'}</span>
                          <span style={{fontWeight:600,color:'var(--text-dark)',whiteSpace:'nowrap'}}>
                            {progress.total > 0 ? `${progress.current} / ${progress.total}` : ''}{pct != null ? ` · ${pct}%` : ''}
                          </span>
                        </div>
                        <div style={{width:'100%',height:6,background:'#e6eae9',borderRadius:3,overflow:'hidden'}}>
                          <div style={{
                            width: (pct != null ? pct : 0) + '%',
                            height:'100%',
                            background:'#3E4C59',
                            transition:'width 0.2s ease',
                          }}/>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })()}
        {results && (
          <div style={{marginTop:16,padding:14,background:'var(--bg-surface)',borderRadius:8,border:'1px solid var(--border-light)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:12,flexWrap:'wrap'}}>
              <div style={{fontSize:13,fontWeight:600}}>Upload results</div>
              <button type="button" className="btn btn-sm" onClick={clearPreview} title="Reset every picker, preview, and these results so you can start a fresh upload.">Clear all & start over</button>
            </div>
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

// Export the currently-stored buildings + units for one property type as an
// xlsx file in the same column shape as BUILDINGS_BY_TYPE[typeKey].headers,
// so the user can review what's onboarded and (if needed) round-trip via the
// upload picker.
//   - Owner block is read from the unit row.
//   - Residential: Resident block is hydrated from profiles +
//     resident_assignments + auth.users.email (via the get_emails_for_profiles
//     RPC). Resident temp password is left blank so re-uploading in Update
//     mode doesn't reset anyone's password.
//   - Commercial / Villa / Commercial Land: Tenant/Client/Villa-resident
//     block is hydrated from the denormalised units.tenant_* columns.
async function downloadCurrentBuildingsAsXlsx(typeKey) {
  const cfg = BUILDINGS_BY_TYPE[typeKey];
  if (!cfg) return;
  const { data: buildings, error: bErr } = await supabaseClient
    .from('buildings')
    .select('id, name, property_type, address, notes, plot_area_sqft, villa_count, bedrooms_per_villa, commercial_use_type, gross_leasable_area_sqft, parking_spots')
    .eq('property_type', typeKey)
    .order('name', { ascending: true });
  if (bErr) { alert('Could not load buildings: ' + bErr.message); return; }
  if (!buildings || buildings.length === 0) { alert('No ' + cfg.label.toLowerCase() + ' in the database yet.'); return; }
  const ids = buildings.map(b => b.id);
  const { data: units, error: uErr } = await supabaseClient
    .from('units')
    .select('id, building_id, floor, unit_number, owner_name, owner_phone, owner_email, owner_passport_number, owner_emirates_id, purchase_date, tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_contract_number, tenant_lease_start, tenant_lease_end, tenant_monthly_payment_aed')
    .in('building_id', ids)
    .order('floor', { ascending: true })
    .order('unit_number', { ascending: true });
  if (uErr) { alert('Could not load units: ' + uErr.message); return; }
  const unitsByBuilding = {};
  const unitIds = [];
  for (const u of (units || [])) {
    (unitsByBuilding[u.building_id] = unitsByBuilding[u.building_id] || []).push(u);
    unitIds.push(u.id);
  }

  // For Residential we hydrate the Resident block from
  // resident_assignments + profiles + auth.users.email so the export is a
  // complete replica of the live DB. unit_id → { ...resident fields } map.
  const residentByUnit = {};
  if (typeKey === 'Residential' && unitIds.length > 0) {
    const { data: assigns } = await supabaseClient
      .from('resident_assignments')
      .select('profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, ownership_start, cheques_per_year, contract_number')
      .in('unit_id', unitIds);
    const profileIds = Array.from(new Set((assigns || []).map(a => a.profile_id).filter(Boolean)));
    let profileById = {};
    let emailById = {};
    if (profileIds.length > 0) {
      const [{ data: profs }, emailsResp] = await Promise.all([
        supabaseClient.from('profiles').select('id, full_name, phone, date_of_birth, passport_number, emirates_id, employer, occupation').in('id', profileIds),
        supabaseClient.rpc('get_emails_for_profiles', { p_ids: profileIds }),
      ]);
      (profs || []).forEach(p => { profileById[p.id] = p; });
      // The RPC is PMC-only; if the caller isn't PMC it just returns []. We
      // tolerate that — emails will be blank but everything else still exports.
      ((emailsResp && emailsResp.data) || []).forEach(r => { emailById[r.id] = r.email; });
    }
    for (const a of (assigns || [])) {
      const p = profileById[a.profile_id] || {};
      residentByUnit[a.unit_id] = {
        full_name:           p.full_name           || '',
        email:               emailById[a.profile_id] || '',
        phone:               p.phone               || '',
        date_of_birth:       p.date_of_birth       || '',
        passport:            p.passport_number     || '',
        emirates_id:         p.emirates_id         || '',
        employer:            p.employer            || '',
        occupation:          p.occupation          || '',
        tenure:              a.tenure              || '',
        lease_start:         a.lease_start         || '',
        lease_end:           a.lease_end           || '',
        monthly_payment_aed: a.monthly_payment_aed ?? '',
        ownership_start:     a.ownership_start     || '',
        cheques_per_year:    a.cheques_per_year    ?? '',
        contract_number:     a.contract_number     || '',
      };
    }
  }

  // Single source-of-truth row builder: for each column name, return the
  // value for THIS unit row. Building-level fields are emitted only on the
  // first row of each building (mirroring the template style).
  const valueFor = (h, b, u, isFirstRow) => {
    const r = u ? (residentByUnit[u.id] || null) : null;
    switch (h) {
      // Identity columns differ per type — accept any of the three.
      case 'Building name':
      case 'Plot name':
      case 'Villa name':       return b.name;
      case 'Property type':    return isFirstRow ? b.property_type : '';
      case 'Floor':            return u && u.floor != null ? u.floor : '';
      case 'Unit':             return u && u.unit_number ? u.unit_number : '';
      case 'Address':          return isFirstRow ? (b.address || '') : '';
      case 'Notes':            return isFirstRow ? (b.notes || '') : '';
      case 'Plot area (sqft)': return isFirstRow ? (b.plot_area_sqft ?? '') : '';
      case 'Villa count':      return isFirstRow ? (b.villa_count ?? '') : '';
      case 'Bedrooms per villa':
      case 'Bedrooms':         return isFirstRow ? (b.bedrooms_per_villa ?? '') : '';
      case 'Commercial use':                return isFirstRow ? (b.commercial_use_type || '') : '';
      case 'Gross leasable area (sqft)':    return isFirstRow ? (b.gross_leasable_area_sqft ?? '') : '';
      case 'Parking spots':                 return isFirstRow ? (b.parking_spots ?? '') : '';
      // Owner block — emitted on every row that has owner data on its unit.
      case 'Owner name':         return u && u.owner_name || '';
      case 'Owner phone':        return u && u.owner_phone || '';
      case 'Owner email':        return u && u.owner_email || '';
      case 'Owner passport':     return u && u.owner_passport_number || '';
      case 'Owner Emirates ID':  return u && u.owner_emirates_id || '';
      case 'Purchase date':      return u && u.purchase_date || '';

      // RESIDENT block (Residential / Villa templates). Residential pulls
      // from resident_assignments + profiles; Villa pulls from units.tenant_*.
      case 'Resident full name':      return r ? r.full_name : (u && u.tenant_name  || '');
      case 'Resident email':          return r ? r.email     : (u && u.tenant_email || '');
      case 'Resident phone':          return r ? r.phone     : (u && u.tenant_phone || '');
      // Always emit a blank temp password on export so re-uploading in
      // "Update existing" mode does NOT reset anyone's password.
      case 'Resident temp password':  return '';
      case 'Resident date of birth':  return r ? r.date_of_birth   : '';
      case 'Resident passport':       return r ? r.passport        : '';
      case 'Resident Emirates ID':    return r ? r.emirates_id     : '';
      case 'Resident employer':       return r ? r.employer        : '';
      case 'Resident occupation':     return r ? r.occupation      : '';
      case 'Resident tenure':         return r ? r.tenure          : (u && u.tenant_tenure || '');

      // TENANT / CLIENT block (Commercial / Commercial Land templates) +
      // shared lease columns also used by the Resident block above.
      case 'Tenant name':   return u && u.tenant_name  || '';
      case 'Tenant email':  return u && u.tenant_email || '';
      case 'Tenant phone':  return u && u.tenant_phone || '';
      case 'Tenant tenure': return u && u.tenant_tenure || '';
      case 'Client name':   return u && u.tenant_name  || '';
      case 'Client email':  return u && u.tenant_email || '';
      case 'Client phone':  return u && u.tenant_phone || '';

      case 'Contract #':            return r ? r.contract_number     : (u && u.tenant_contract_number || '');
      case 'Lease start':           return r ? r.lease_start         : (u && u.tenant_lease_start     || '');
      case 'Lease end':             return r ? r.lease_end           : (u && u.tenant_lease_end       || '');
      case 'Monthly payment (AED)': return r ? r.monthly_payment_aed : (u && u.tenant_monthly_payment_aed != null ? u.tenant_monthly_payment_aed : '');
      case 'Ownership start':       return r ? r.ownership_start     : '';
      case 'Cheques per year':      return r ? r.cheques_per_year    : '';

      default: return '';
    }
  };
  const rows = [];
  for (const b of buildings) {
    const us = unitsByBuilding[b.id] || [];
    if (us.length === 0) {
      // Building with no units yet — emit one row carrying the building-level fields.
      rows.push(cfg.headers.map(h => valueFor(h, b, null, true)));
    } else {
      us.forEach((u, i) => {
        rows.push(cfg.headers.map(h => valueFor(h, b, u, i === 0)));
      });
    }
  }
  const stamp = new Date().toISOString().slice(0, 10);
  downloadAsXlsx(cfg.filename + '-current-' + stamp, cfg.headers, rows);
}

async function uploadBuildingsBulk(parsedRows, conflictMode = 'skip', onProgress = null) {
  // Yield to the React render thread between steps so the progress bar
  // actually paints — otherwise the whole synchronous-await chain blocks
  // until the end and the bar jumps from 0% straight to 100%.
  const report = (label, current, total) => {
    if (onProgress) {
      try { onProgress({ label, current, total }); } catch (_) {}
    }
  };
  const yieldToUi = () => new Promise(r => setTimeout(r, 0));
  const results = [];
  const residentRecords = []; // accumulated for one bulk-onboard call at the end
  const buildingMap = {};
  const takeFirst = (current, incoming) => (current != null && current !== '' ? current : (incoming != null && incoming !== '' ? incoming : current));
  const numOrNull = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const str = (v) => (v == null || v === '' ? null : String(v).toString().trim() || null);
  const validPropTypes = new Set(['Residential','Commercial','Villa','Commercial Land']);
  const validCommUse   = new Set(['Office','Retail','Mixed']);

  // Pull owner / resident columns off a row into structured objects.
  const ownerFrom = (row) => ({
    name:    str(row['Owner name']),
    phone:   str(row['Owner phone']),
    email:   str(row['Owner email']),
    passport_number: str(row['Owner passport']),
    emirates_id:     str(row['Owner Emirates ID']),
    purchase_date:   str(row['Purchase date']),
  });
  const hasOwner = (o) => !!(o && (o.name || o.phone || o.email || o.passport_number || o.emirates_id));
  // Three templates use three different prefixes for the resident block:
  //   Residential / Villa  → 'Resident *' (full personal data)
  //   Commercial buildings → 'Tenant *'   (corporate tenant fields)
  //   Commercial land      → 'Client *'   (corporate client / lessee)
  // The parser accepts any of them so a mixed file ingests cleanly.
  const residentFrom = (row) => ({
    full_name:                str(row['Resident full name']     || row['Tenant name'] || row['Client name']),
    email:                    str(row['Resident email']         || row['Tenant email'] || row['Client email']),
    phone:                    str(row['Resident phone']         || row['Tenant phone'] || row['Client phone']),
    password:                 str(row['Resident temp password'] || row['Tenant temp password'] || row['Client temp password']) || 'Welcome2026!',
    date_of_birth:            str(row['Resident date of birth']),
    passport_number:          str(row['Resident passport']),
    emirates_id:              str(row['Resident Emirates ID']),
    employer:                 str(row['Resident employer']),
    occupation:               str(row['Resident occupation']),
    tenure:                   str(row['Resident tenure']        || row['Tenant tenure']) || (str(row['Client name']) ? 'Tenant' : null),
    lease_start:              str(row['Lease start']),
    lease_end:                str(row['Lease end']),
    monthly_payment_aed:      numOrNull(row['Monthly payment (AED)']),
    ownership_start:          str(row['Ownership start']),
    cheques_per_year:         numOrNull(row['Cheques per year']),
    contract_number:          str(row['Contract #']),
  });
  const hasResident = (r) => !!(r && r.full_name && r.email);

  for (const row of parsedRows) {
    // Accept 'Building name' (Residential / Commercial), 'Plot name'
    // (Commercial Land) or 'Villa name' (Villa template) as the row's
    // building identifier; all three map to public.buildings.name.
    const bname = (row['Building name'] || row['Plot name'] || row['Villa name'] || '').toString().trim();
    if (!bname) { results.push({ row: JSON.stringify(row), ok: false, error: 'Missing building / plot / villa name' }); continue; }
    if (!buildingMap[bname]) {
      buildingMap[bname] = {
        name: bname,
        property_type: null, address: null, notes: null,
        plot_area_sqft: null, villa_count: null, bedrooms_per_villa: null,
        commercial_use_type: null, gross_leasable_area_sqft: null, parking_spots: null,
        defaultOwner: null,   // first non-empty owner block seen — inherited by later units
        units: [],
        _slotCounter: 0,      // synthetic unit numbers for Commercial Land multi-client rows
      };
    }
    const b = buildingMap[bname];
    b.property_type             = takeFirst(b.property_type,             row['Property type']);
    b.address                   = takeFirst(b.address,                   row['Address']);
    b.notes                     = takeFirst(b.notes,                     row['Notes']);
    b.plot_area_sqft            = takeFirst(b.plot_area_sqft,            row['Plot area (sqft)']);
    b.villa_count               = takeFirst(b.villa_count,               row['Villa count']);
    b.bedrooms_per_villa        = takeFirst(b.bedrooms_per_villa,        row['Bedrooms per villa'] || row['Bedrooms']);
    b.commercial_use_type       = takeFirst(b.commercial_use_type,       row['Commercial use']);
    b.gross_leasable_area_sqft  = takeFirst(b.gross_leasable_area_sqft,  row['Gross leasable area (sqft)']);
    b.parking_spots             = takeFirst(b.parking_spots,             row['Parking spots']);

    const rowOwner    = ownerFrom(row);
    const rowResident = residentFrom(row);
    if (!b.defaultOwner && hasOwner(rowOwner)) b.defaultOwner = rowOwner;

    // Structure types (Residential, Commercial) attach owner + resident to
    // a unit row; Villa / Commercial Land carry them on the building's
    // single "phantom" record stored in units[] with floor=null.
    const floor = row['Floor'];
    const unit  = row['Unit'];
    const hasUnit = (floor != null && floor !== '') || (unit != null && unit !== '');
    if (hasUnit) {
      b.units.push({
        floor: floor != null && floor !== '' ? Number(floor) : null,
        unit_number: unit != null && unit !== '' ? String(unit).trim() : null,
        owner:    hasOwner(rowOwner)    ? rowOwner    : null,
        resident: hasResident(rowResident) ? rowResident : null,
      });
    } else if (hasOwner(rowOwner) || hasResident(rowResident)) {
      // No explicit Floor / Unit on this row — Villa (one row = one
      // villa) or Commercial Land (one row = one client lease on the
      // plot, can repeat for multiple clients on the same plot).
      //
      // For Commercial Land we synthesise a unique unit_number per row
      // (Contract # if provided, otherwise an auto-incremented slot id)
      // so multiple clients on the same plot don't collide on the
      // unique (building_id, unit_number) constraint.
      const isLand = (row['Property type'] || '').toString().trim() === 'Commercial Land';
      const synth  = isLand
        ? (rowResident && rowResident.contract_number) || (bname.slice(0, 18) + '-SLOT-' + (++b._slotCounter))
        : null;
      b.units.push({
        floor: null,
        unit_number: synth,
        owner:    hasOwner(rowOwner)    ? rowOwner    : null,
        resident: hasResident(rowResident) ? rowResident : null,
      });
    }
  }

  // Total progress steps = one per building + one per unit + one final
  // bulk-onboard step (always 1 unit of work, even if it ends up no-op).
  const buildingNames = Object.keys(buildingMap);
  const totalUnitsAcrossBuildings = buildingNames.reduce((s, n) => s + (buildingMap[n].units.length || 1), 0);
  const totalSteps = buildingNames.length + totalUnitsAcrossBuildings + 1;
  let step = 0;
  report('Starting…', 0, totalSteps);

  for (const bname of buildingNames) {
    const b = buildingMap[bname];
    const propType = (b.property_type || 'Residential').toString().trim();
    step++;
    report('Processing ' + bname, step, totalSteps);
    await yieldToUi();
    if (!validPropTypes.has(propType)) {
      results.push({ building: bname, ok: false, error: 'Unknown Property type "' + propType + '" — must be one of: Residential, Commercial, Villa, Commercial Land.' });
      continue;
    }
    const commUse = b.commercial_use_type ? b.commercial_use_type.toString().trim() : null;
    if (commUse && !validCommUse.has(commUse)) {
      results.push({ building: bname, ok: false, error: 'Unknown Commercial use "' + commUse + '" — must be Office, Retail or Mixed.' });
      continue;
    }
    const isStructure = propType === 'Residential' || propType === 'Commercial';

    const { data: existing } = await supabaseClient.from('buildings').select('id').eq('name', bname).maybeSingle();
    let buildingId;
    let buildingAction = 'skipped';
    const fields = {
      property_type: propType,
      address: b.address || null,
      notes: b.notes || null,
      plot_area_sqft:           numOrNull(b.plot_area_sqft),
      villa_count:              numOrNull(b.villa_count),
      bedrooms_per_villa:       numOrNull(b.bedrooms_per_villa),
      commercial_use_type:      commUse,
      gross_leasable_area_sqft: numOrNull(b.gross_leasable_area_sqft),
      parking_spots:            numOrNull(b.parking_spots),
    };
    if (existing) {
      buildingId = existing.id;
      if (conflictMode === 'update') {
        const { error: uErr } = await supabaseClient.from('buildings').update(fields).eq('id', buildingId);
        if (uErr) { results.push({ building: bname, ok: false, error: 'building update: ' + uErr.message }); continue; }
        buildingAction = 'updated';
      }
    } else {
      const { data: newB, error: bErr } = await supabaseClient.from('buildings').insert({ name: bname, ...fields }).select('id').single();
      if (bErr) { results.push({ building: bname, ok: false, error: 'building insert: ' + bErr.message }); continue; }
      buildingId = newB.id;
      buildingAction = 'created';
    }
    let unitsAdded = 0;
    let unitsSeen  = b.units.length;
    let residentsQueued = 0;
    let tenantsRecorded = 0;
    if (b.units.length) {
      // Existing units for dedup. For Villa / Commercial Land where unit_number
      // is null, we treat the whole building as one slot (don't dedup).
      const { data: existingUnits } = await supabaseClient.from('units').select('id,unit_number').eq('building_id', buildingId);
      const existingByNumber = Object.fromEntries((existingUnits || []).map(u => [u.unit_number || '__solo__', u]));

      let unitIdx = 0;
      for (const u of b.units) {
        unitIdx++;
        step++;
        report(bname + ' · unit ' + (u.unit_number || unitIdx) + ' (' + unitIdx + '/' + b.units.length + ')', step, totalSteps);
        // Yield every 5 units so the progress bar paints without slowing
        // the upload down too much. (Network roundtrip is the real cost.)
        if (unitIdx % 5 === 0) await yieldToUi();
        const owner = u.owner || b.defaultOwner;
        const ownerPayload = owner ? {
          owner_name:             owner.name             || null,
          owner_phone:            owner.phone            || null,
          owner_email:            owner.email            || null,
          owner_passport_number:  owner.passport_number  || null,
          owner_emirates_id:      owner.emirates_id      || null,
          purchase_date:          owner.purchase_date    || null,
        } : {};
        // owner_is_resident flag: true if resident email matches owner email.
        const ownerIsResident = !!(u.resident && owner && u.resident.email && owner.email && u.resident.email.toLowerCase() === owner.email.toLowerCase());

        // Non-residential tenant block — Villa / Commercial / Commercial Land
        // store the tenant/client/villa-resident contact info denormalised on
        // the unit row itself (no Supabase Auth account is created). For
        // Residential we leave tenant_* alone; the resident lives in
        // auth.users + profiles + resident_assignments instead.
        const tenantPayload = (propType !== 'Residential' && u.resident && (u.resident.full_name || u.resident.email || u.resident.phone)) ? {
          tenant_name:                 u.resident.full_name         || null,
          tenant_email:                u.resident.email             || null,
          tenant_phone:                u.resident.phone             || null,
          tenant_tenure:               u.resident.tenure            || null,
          tenant_contract_number:      u.resident.contract_number   || null,
          tenant_lease_start:          u.resident.lease_start       || null,
          tenant_lease_end:            u.resident.lease_end         || null,
          tenant_monthly_payment_aed:  u.resident.monthly_payment_aed != null ? u.resident.monthly_payment_aed : null,
        } : {};
        const hasTenantPayload = Object.keys(tenantPayload).length > 0;

        const key = u.unit_number || '__solo__';
        const existing = existingByNumber[key];
        let unitId;
        if (existing) {
          unitId = existing.id;
          if (conflictMode === 'update' || Object.keys(ownerPayload).length || hasTenantPayload) {
            await supabaseClient.from('units').update({ ...ownerPayload, ...tenantPayload, owner_is_resident: ownerIsResident }).eq('id', unitId);
            if (hasTenantPayload) tenantsRecorded++;
          }
        } else {
          // For Villa / Commercial Land we still need a placeholder unit row
          // to attach owner fields. Use floor=1, unit_number=<building name>-SOLO.
          const insertPayload = {
            building_id: buildingId,
            floor: u.floor != null && !isNaN(u.floor) ? u.floor : (isStructure ? null : 1),
            unit_number: u.unit_number || (bname.slice(0, 24) + '-SOLO'),
            ...ownerPayload,
            ...tenantPayload,
            owner_is_resident: ownerIsResident,
          };
          // Structure rows missing required floor/unit_number are skipped.
          if (isStructure && (insertPayload.floor == null || !insertPayload.unit_number)) continue;
          const { data: newU, error: uErr } = await supabaseClient.from('units').insert(insertPayload).select('id').single();
          if (uErr) { results.push({ building: bname, ok: false, error: 'unit insert (' + (u.unit_number || 'solo') + '): ' + uErr.message }); continue; }
          unitId = newU.id;
          unitsAdded++;
          if (hasTenantPayload) tenantsRecorded++;
        }

        // Queue resident for bulk-onboard if present — ONLY for Residential
        // property type. Per product spec, Villas, Commercial buildings and
        // Commercial Land record contact info on the unit row (tenant_*)
        // above; no Supabase Auth account is created for them.
        if (propType === 'Residential' && u.resident && u.resident.full_name && u.resident.email) {
          residentRecords.push({
            email:                   u.resident.email,
            password:                u.resident.password || 'Welcome2026!',
            full_name:               u.resident.full_name,
            phone:                   u.resident.phone || null,
            role:                    'resident',
            building_name:           bname,
            unit_number:             u.unit_number || (bname.slice(0, 24) + '-SOLO'),
            date_of_birth:           u.resident.date_of_birth   || null,
            passport_number:         u.resident.passport_number || null,
            emirates_id:             u.resident.emirates_id     || null,
            employer:                u.resident.employer   || null,
            occupation:              u.resident.occupation || null,
            tenure:                  u.resident.tenure || null,
            lease_start:             u.resident.lease_start || null,
            lease_end:               u.resident.lease_end   || null,
            monthly_payment_aed:     u.resident.monthly_payment_aed,
            ownership_start:         u.resident.ownership_start || null,
            cheques_per_year:        u.resident.cheques_per_year,
            contract_number:         u.resident.contract_number || null,
          });
          residentsQueued++;
        }
      }
    } else {
      // Building had no units to process — still consume the one
      // "phantom" step we reserved in totalSteps so the bar advances.
      step++;
      report(bname + ' · no units', step, totalSteps);
    }
    results.push({ building: bname, ok: true, action: buildingAction, property_type: propType, units_added: unitsAdded, units_skipped: unitsSeen - unitsAdded, residents_queued: residentsQueued, tenants_recorded: tenantsRecorded });
  }

  // Bulk-onboard any residents found on the unit rows. We POST in one batch
  // so the edge function handles auth user creation + profile + assignment
  // + conflict mode in a single round-trip. Result rows for residents are
  // surfaced to the caller alongside the building rows.
  let residentResults = [];
  step++;
  if (residentRecords.length > 0) {
    report('Onboarding ' + residentRecords.length + ' resident' + (residentRecords.length === 1 ? '' : 's') + '…', step, totalSteps);
    await yieldToUi();
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session && session.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      const resp = await fetch(SUPABASE_URL + '/functions/v1/bulk-onboard', {
        method: 'POST', headers,
        body: JSON.stringify({ records: residentRecords, mode: conflictMode }),
      });
      const out = await resp.json();
      residentResults = (out && out.results) || [];
    } catch (e) {
      residentResults = [{ ok: false, error: 'Resident onboarding failed: ' + (e.message || e) }];
    }
  } else {
    report('No residents to onboard', step, totalSteps);
  }
  report('Done', totalSteps, totalSteps);
  return { results, resident_results: residentResults };
}

// =========================================================================
// uploadVendorsBulk — insert vendor rows + vendor_buildings M2M from parsed
// spreadsheet rows. Skips vendors whose `Company name` already exists. Each
// row's `Buildings covered` cell is parsed as a comma-separated list and
// matched (case-insensitive) against existing buildings; unmatched names are
// silently dropped.
// =========================================================================
async function uploadVendorsBulk(parsedRows, conflictMode = 'skip') {
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
    const existingVendor = existingByName[name.toLowerCase()];
    if (existingVendor && conflictMode !== 'update') {
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
    let inserted, ie, action;
    if (existingVendor) {
      // Update existing: refresh fields, keep id + linked payments/docs.
      const upd = await supabaseClient.from('vendors').update(payload).eq('id', existingVendor.id).select('id').single();
      inserted = upd.data; ie = upd.error; action = 'updated';
    } else {
      const ins = await supabaseClient.from('vendors').insert(payload).select('id').single();
      inserted = ins.data; ie = ins.error; action = 'created';
    }
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
    results.push({ vendor: name, ok: true, action, vendor_id: inserted.id, buildings_linked: buildingsLinked, buildings_skipped: buildingsSkipped });
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
          <div className="data-table-scroll" style={{maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 6}}>
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
        <PCSelect label="Property type" required value={propertyType} onChange={setPropertyType} options={[{value:'Residential',label:'Residential'},{value:'Commercial',label:'Commercial'},{value:'Villa',label:'Villa'},{value:'Commercial Land',label:'Commercial Land'}]}/>
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
            <div style={{marginBottom:14}}><PCSelect label="Property type" required value={form.property_type} onChange={setF('property_type')} options={[{value:'Residential',label:'Residential'},{value:'Commercial',label:'Commercial'},{value:'Villa',label:'Villa'},{value:'Commercial Land',label:'Commercial Land'}]}/></div>
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
          <div style={{fontSize:13,color:'var(--text-muted)'}}>{rows.length} contract{rows.length===1?'':'s'} · sorted by expiry</div>
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
          <div className="data-table-scroll">
          <table className="data-table">
            <thead><tr>
              <th>Name</th>
              <th>Counterparty</th>
              <th>Type</th>
              <th>End date</th>
              <th>Days left</th>
              <th>Building</th>
              <th style={{textAlign:'right'}}>Value (AED)</th>
              <th>Status</th>
              <th style={{textAlign:'right'}}>Actions</th>
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
          </div>
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

// ---- Digest content categories ----
// The same five-category selection drives THREE surfaces:
//   1. The contracts-reminders composer above (filters the visible list)
//   2. The in-app bell (topbar reads `reminder_settings.digest_categories`)
//   3. The reminders-digest Edge Function (PDF + email body — follow-up)
// Defaults to all five ON; persisted to reminder_settings.digest_categories.
// Each category lists EXACTLY the bullets that show up in the email + PDF.
const DIGEST_CATEGORIES = [
  { id: 'payments',  label: 'Payments', items: [
    'Total amount overdue (resident invoices past due)',
    'Total amount due in the next 30 days',
    'Number of open invoices + their total amount',
    'Leases expiring in the next 30 days',
  ]},
  { id: 'leases',    label: 'Leases', items: [
    'Leases expiring within 60 days',
  ]},
  { id: 'srs',       label: 'Service requests', items: [
    'Open service requests right now (count)',
    'Open service requests with no update for 2+ days',
  ]},
  { id: 'contracts', label: 'Maintenance contracts', items: [
    'Maintenance contracts expiring within 90 days',
    'Outstanding maintenance / vendor invoice amount',
  ]},
  { id: 'ops',       label: 'Today’s ops', items: [
    'Visitors expected today',
    'Move-in / move-out scheduled',
    'Guard shift handovers',
  ]},
];
const DIGEST_DEFAULT = DIGEST_CATEGORIES.map(c => c.id);

// Old → new id remap for previously-saved reminder_settings.digest_categories.
// 'money' was renamed to 'payments'; 'compliance' was dropped entirely.
const _DIGEST_LEGACY_REMAP = { money: 'payments' };
const _DIGEST_VALID = new Set(DIGEST_DEFAULT);
const normalizeDigestCategories = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return [...DIGEST_DEFAULT];
  const out = [];
  for (const raw of arr) {
    const id = _DIGEST_LEGACY_REMAP[raw] || raw;
    if (_DIGEST_VALID.has(id) && !out.includes(id)) out.push(id);
  }
  // Preserve canonical ordering — easier to scan in the DB.
  return DIGEST_DEFAULT.filter(d => out.includes(d));
};

const DigestCategorySelector = ({ value, onChange, saving }) => {
  const selected = normalizeDigestCategories(value);
  const toggle = (id) => {
    if (saving) return;
    const has = selected.includes(id);
    const next = has ? selected.filter(x => x !== id) : [...selected, id];
    // Keep canonical ordering — makes the persisted array easy to scan.
    onChange(DIGEST_DEFAULT.filter(d => next.includes(d)));
  };
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',gap:10}}>
      {DIGEST_CATEGORIES.map(c => {
        const on = selected.includes(c.id);
        return (
          <div key={c.id} onClick={() => toggle(c.id)}
            style={{padding:'14px 16px',border:'1px solid ' + (on ? '#3E4C59' : 'var(--border-light)'),borderRadius:8,background: on ? '#f6f9f3' : '#fff',cursor: saving ? 'default' : 'pointer',display:'flex',gap:10,alignItems:'flex-start',transition:'background .15s,border-color .15s',opacity: saving ? 0.7 : 1}}>
            <input type="checkbox" checked={on} readOnly style={{marginTop:3,width:14,height:14,accentColor:'#3E4C59',flexShrink:0}}/>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-dark)'}}>{c.label}</div>
              <ul style={{fontSize:12,color:'var(--text-secondary)',margin:'8px 0 0',paddingLeft:18,lineHeight:1.55}}>
                {c.items.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Map a reminder.source_type to a digest category id. Used by the embedded
// composer below to honour the saved selection.
const _reminderToCategory = (r) => {
  if (r.source_type === 'lease')    return 'leases';
  if (r.source_type === 'vendor')   return 'contracts';
  if (r.source_type === 'contract') return 'contracts';
  return null;
};

// ---- Embedded contracts-reminders composer ----
// Trimmed reimplementation of PMCRemindersPage (src/pmc/reminders.js) without
// the page-header / TimeRangePicker chrome, so it embeds cleanly inside a tab.
// The standalone Reminders page is still routed at /reminders for deep links;
// this embed reuses the same buildReminders() helper that's already global.
const EmbeddedRemindersComposer = ({ digestCategories }) => {
  const [leases, setLeases]             = useState(null);
  const [vendorsList, setVendorsList]   = useState([]);
  const [contractsList, setContractsList] = useState([]);
  const [dismissals, setDismissals]     = useState([]);
  const [error, setError]               = useState(null);
  const [typeFilter, setTypeFilter]     = useState('all');
  const [leadFilter, setLeadFilter]     = useState('all');
  const [dismissTarget, setDismissTarget] = useState(null);
  const [dismissNote, setDismissNote]   = useState('');
  const [expanded, setExpanded]         = useState(false);

  const reload = async () => {
    setError(null);
    if (!supabaseClient) return;
    try {
      const [{ data: ras }, { data: vs }, { data: cs }, { data: ds }, { data: us }, { data: bs }, { data: profs }] = await Promise.all([
        supabaseClient.from('resident_assignments').select('profile_id,unit_id,tenure,lease_end').not('lease_end','is',null),
        supabaseClient.from('vendors').select('id,name,service_category,contract_end').not('contract_end','is',null),
        supabaseClient.from('contracts').select('id,name,counterparty,contract_type,end_date,building_id'),
        supabaseClient.from('reminder_dismissals').select('id,source_type,source_id,lead_days,dismissal_anchor,dismissed_at,dismissed_by,note'),
        supabaseClient.from('units').select('id,unit_number,floor,building_id'),
        supabaseClient.from('buildings').select('id,name,address,property_type'),
        supabaseClient.from('profiles').select('id,full_name').eq('role','resident'),
      ]);
      const uMap = Object.fromEntries((us || []).map(u => [u.id, u]));
      const bMap = Object.fromEntries((bs || []).map(b => [b.id, b]));
      const pMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
      const leasesEnriched = (ras || []).map(r => ({
        ...r,
        resident_name: pMap[r.profile_id]?.full_name || '—',
        unit_number:   uMap[r.unit_id]?.unit_number || '—',
        building_name: uMap[r.unit_id] && bMap[uMap[r.unit_id].building_id] ? bMap[uMap[r.unit_id].building_id].name : '—',
      }));
      setLeases(leasesEnriched);
      setVendorsList(vs || []);
      setContractsList(cs || []);
      setDismissals(ds || []);
    } catch (e) { setError(e.message || String(e)); }
  };
  useEffect(() => { reload(); }, []);

  const reminders = (leases !== null && typeof buildReminders === 'function')
    ? buildReminders({ leases, vendors: vendorsList, contracts: contractsList, dismissals })
    : [];

  const cats = (digestCategories && digestCategories.length > 0) ? digestCategories : DIGEST_DEFAULT;
  const filtered = reminders.filter(r => {
    const cat = _reminderToCategory(r);
    if (cat && !cats.includes(cat)) return false;
    if (typeFilter !== 'all' && r.source_type !== typeFilter) return false;
    if (leadFilter !== 'all' && r.lead_days !== Number(leadFilter)) return false;
    return true;
  });

  const submitDismiss = async () => {
    const r = dismissTarget;
    if (!r || !supabaseClient) { setDismissTarget(null); return; }
    const { data: u } = await supabaseClient.auth.getUser();
    const { error: e } = await supabaseClient.from('reminder_dismissals').insert([{
      source_type:      r.source_type,
      source_id:        r.source_id,
      lead_days:        r.lead_days,
      dismissal_anchor: r.end_date,
      dismissed_by:     u?.user?.id || null,
      note:             dismissNote || null,
    }]);
    if (e) setError(e.message);
    setDismissTarget(null); setDismissNote('');
    reload();
  };
  const fmtRemain = (d) => d < 0
    ? Math.abs(d) + ' days overdue'
    : d === 0 ? 'Due today' : d + ' day' + (d === 1 ? '' : 's') + ' remaining';

  // Type-badge / lead-badge helpers are defined in reminders.js (_typeBadge,
  // _leadBadge) and present on the global scope by load order. Fall back
  // gracefully if they aren't.
  const tb = (t) => (typeof _typeBadge === 'function') ? _typeBadge(t) : { label: t, bg:'#E6EAE9', fg:'#61707D' };
  const lb = (l) => (typeof _leadBadge === 'function') ? _leadBadge(l) : { label: 'Window', bg:'#E6EAE9', fg:'#61707D' };

  const totalCount   = reminders.length;
  const overdueCount = reminders.filter(r => r.days_until < 0).length;

  return (
    <div className="card" style={{marginBottom:18}}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',userSelect:'none',marginBottom: expanded ? 14 : 0}}
      >
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)',display:'flex',alignItems:'center',gap:10}}>
            Open contract reminders
            {leases !== null && totalCount > 0 && (
              <span style={{padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:500,background:'var(--bg-surface)',color:'var(--text-secondary)',border:'1px solid var(--border-light)'}}>
                {totalCount}
                {overdueCount > 0 && <span style={{color:'#8b4a42',marginLeft:6}}>· {overdueCount} overdue</span>}
              </span>
            )}
          </div>
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
            Leases, vendor contracts and generic contracts expiring within the next 90 days. Mark handled once renewed or actioned.
          </div>
        </div>
        <span style={{fontSize:11,color:'var(--text-muted)',whiteSpace:'nowrap'}}>
          {expanded ? 'Hide ▴' : 'Show ▾'}
        </span>
      </div>

      {expanded && (
      <>
      <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end',marginBottom:14}}>
        <div style={{flex:'1 1 160px'}}>
          <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Type</label>
          <select className="form-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            <option value="lease">Leases</option>
            <option value="vendor">Vendors</option>
            <option value="contract">Contracts</option>
          </select>
        </div>
        <div style={{flex:'1 1 160px'}}>
          <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Window</label>
          <select className="form-input" value={leadFilter} onChange={e => setLeadFilter(e.target.value)}>
            <option value="all">All windows</option>
            <option value="0">Overdue</option>
            <option value="7">Urgent (≤7d)</option>
            <option value="30">Action (≤30d)</option>
            <option value="60">Planning (≤60d)</option>
            <option value="90">Heads-up (≤90d)</option>
          </select>
        </div>
        <button className="btn btn-sm" onClick={() => { setTypeFilter('all'); setLeadFilter('all'); }}>Clear</button>
        <button className="btn btn-sm" onClick={reload} style={{marginLeft:'auto'}}>Refresh</button>
      </div>

      {error && <div style={{padding:10,background:'#fdf2f1',color:'#8b4a42',borderRadius:6,fontSize:12,marginBottom:14}}>{error}</div>}
      {leases === null ? (
        <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{padding:24,color:'var(--text-muted)',fontSize:13,textAlign:'center'}}>
          {reminders.length === 0
            ? 'Nothing expiring in the next 90 days ✓'
            : 'No reminders match the current filters / categories.'}
        </div>
      ) : (
        <table className="data-table" style={{fontSize:13,tableLayout:'fixed',width:'100%'}}>
          <thead>
            <tr>
              <th style={{width:'10%'}}>Type</th>
              <th style={{width:'28%'}}>What</th>
              <th style={{width:'22%'}}>Context</th>
              <th style={{width:'12%'}}>Expires</th>
              <th style={{width:'16%'}}>Remaining</th>
              <th style={{width:'12%',textAlign:'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 25).map(r => {
              const tBadge = tb(r.source_type);
              const remColor = r.lead_days === 0 ? '#8b4a42' : r.lead_days <= 7 ? '#7a5a1f' : 'var(--text-dark)';
              return (
                <tr key={r.key}>
                  <td><span style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:500,background:tBadge.bg,color:tBadge.fg,whiteSpace:'nowrap'}}>{tBadge.label}</span></td>
                  <td style={{fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.title}</td>
                  <td style={{color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.subtitle}</td>
                  <td style={{whiteSpace:'nowrap'}}>{r.end_date}</td>
                  <td style={{whiteSpace:'nowrap',color:remColor,fontWeight:500}}>{fmtRemain(r.days_until)}</td>
                  <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                    <button className="btn btn-sm" style={{padding:'4px 10px',fontSize:11}} onClick={() => setDismissTarget(r)} title="Mark this reminder as handled">Handled</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {filtered.length > 25 && (
        <div style={{padding:'10px 0 0',fontSize:11,color:'var(--text-muted)',textAlign:'center'}}>
          Showing first 25 of {filtered.length}. Open the standalone Reminders view for the full list.
        </div>
      )}
      </>
      )}

      {dismissTarget && (
        <div className="modal-overlay" onClick={() => setDismissTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:480}}>
            <div className="modal-header">
              <div>
                <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Mark Handled</div>
                <h2 style={{fontSize:17}}>{dismissTarget.title}</h2>
                <div className="modal-sub">{dismissTarget.subtitle} · expires {dismissTarget.end_date}</div>
              </div>
              <button className="modal-close" onClick={() => setDismissTarget(null)}>×</button>
            </div>
            <div style={{padding:'4px 0 14px',fontSize:13,color:'var(--text-secondary)'}}>
              This will suppress the reminder for this contract. If the end date changes later (renewal), the reminder will re-open automatically.
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-secondary)',marginBottom:6,display:'block',fontWeight:500}}>Note (optional)</label>
              <textarea className="form-input" rows={3} placeholder="e.g. Renewal agreed verbally, signing next week" value={dismissNote} onChange={e => setDismissNote(e.target.value)}/>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn btn-sm" onClick={() => setDismissTarget(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submitDismiss}>Mark handled</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
    const normalised = data
      ? { ...data, digest_categories: normalizeDigestCategories(data.digest_categories) }
      : {
          id: 1, email_enabled: false, email_recipients: [],
          digest_cadence: 'daily', digest_days_of_week: [...DOW_LIST],
          digest_time_local: '09:00', digest_timezone: 'Asia/Dubai',
          digest_categories: [...DIGEST_DEFAULT],
        };
    setSettings(normalised);
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
      digest_categories:   normalizeDigestCategories(next.digest_categories),
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
    <div>
      {/* ---- Embedded composer (was the standalone Reminders page) ---- */}
      <EmbeddedRemindersComposer digestCategories={settings.digest_categories || DIGEST_DEFAULT}/>

      {/* ---- Digest content selector ---- */}
      <div className="card" style={{marginBottom:18}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>What goes into the digest</div>
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
            Pick which categories appear in the in-app bell and in the daily reminder email. Defaults to all six — toggle any off if a category is noise for your portfolio.
          </div>
        </div>
        <DigestCategorySelector
          value={settings.digest_categories || DIGEST_DEFAULT}
          saving={saving}
          onChange={(next) => patch({ digest_categories: next })}
        />
      </div>

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
    </div>
  );
};

