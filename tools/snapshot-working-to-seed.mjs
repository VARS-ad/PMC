#!/usr/bin/env node
// =============================================================================
// snapshot-working-to-seed.mjs
// =============================================================================
// Reads the curated PMC profile from the WORKING Supabase project (the one
// hosting pmc.vars.ae) and rewrites the demo seed function to plant that exact
// dataset for every new demo signup.
//
// Anonymises personal data along the way: full names, phones, emails, owner
// names, tenant contact info, emirates IDs and passport numbers all get
// swapped for plausible-looking but fake values. Building names, addresses,
// vendor business names, invoice numbers, amounts and dates are kept as-is.
//
// Storage paths on attachments are preserved. Since the files don't live in
// the demo bucket, the existing UI fallback in unit-attachments.js opens a
// stock thumbnail. Copying real files is a separate (later) job.
//
// USAGE
// -----
//   1. Open the Supabase dashboard for VARS - PMC (working).
//      Settings -> API -> 'service_role' key. Copy it.
//   2. From the repo root:
//      WORKING_SUPABASE_URL=https://khhguxuxvkxvycndkron.supabase.co \
//      WORKING_SERVICE_KEY=eyJhbG... \
//      node tools/snapshot-working-to-seed.mjs
//   3. The script overwrites:
//        supabase/_demo-only/05_seed_v2_from_data_files.sql
//      Inspect, commit, push.
//   4. Re-run that file in the demo Supabase SQL editor. New signups get the
//      snapshot from then on.
//
// The script is read-only against the working project. It mutates nothing.
// =============================================================================

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'supabase', '_demo-only', '05_seed_v2_from_data_files.sql');

const WORKING_URL = process.env.WORKING_SUPABASE_URL || 'https://khhguxuxvkxvycndkron.supabase.co';
const SERVICE_KEY = process.env.WORKING_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing WORKING_SERVICE_KEY env var.');
  console.error('Find it in: Supabase dashboard -> Settings -> API -> service_role.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Anonymisation pools + helpers
// ---------------------------------------------------------------------------

const FAKE_FIRST = [
  'Ahmed','Fatima','Omar','Aisha','Khalid','Mariam','Yousef','Layla','Hassan','Noor',
  'Ibrahim','Zahra','Mohammed','Hanan','Ali','Sara','Saif','Dalia','Rashid','Leena',
  'Faisal','Huda','Tariq','Yasmin','Nasser','Amira','Abdullah','Maryam','Jamal','Reem',
  'Sofia','Liu','Daniel','Patricia','Yuki','Pierre','Stefan','Eric','John','Anna',
  'Marco','Wei','Carlos','Aditi','Hiroshi','James','Karim','Sami','Tania','Vera',
];
const FAKE_LAST = [
  'Al-Mansoori','Al-Nahyan','Al-Maktoum','Al-Qasimi','Al-Falasi','Al-Zaabi','Al-Suwaidi',
  'Al-Mazrouei','Al-Ketbi','Al-Kaabi','Al-Tunaiji','Al-Dhaheri','Al-Shamsi','Al-Nuaimi',
  'Al-Hammadi','Al-Amiri','Al-Hosani','Al-Jaberi','Al-Bastaki','Al-Awadhi','Al-Breiki',
  'Al-Farsi','Al-Remeithi','Al-Ali','Conti','Wei','Cohen','Romano','Tanaka','Dubois',
  'Hartmann','Lambert','Smith','Mueller','Rossi','Chen','Mendez','Sharma','Sato',
];

// Deterministic-ish RNG so re-runs over the same snapshot produce the same
// anonymisation. Seeds itself from a string.
let _rngSeed = 0xdeadbeef;
const seedRng = (s) => {
  let h = 0xdeadbeef;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  _rngSeed = h >>> 0;
};
const rnd = () => {
  _rngSeed = (Math.imul(_rngSeed, 1664525) + 1013904223) >>> 0;
  return _rngSeed / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pad = (n, w) => String(n).padStart(w, '0');

// Cache name -> anonymised name so the same person shows up consistently.
const _nameMap = new Map();
const fakeName = (original) => {
  if (!original) return original;
  if (_nameMap.has(original)) return _nameMap.get(original);
  seedRng(original);
  const fn = pick(FAKE_FIRST);
  const ln = pick(FAKE_LAST);
  const out = fn + ' ' + ln;
  _nameMap.set(original, out);
  return out;
};

const _phoneMap = new Map();
const fakePhone = (original) => {
  if (!original) return original;
  if (_phoneMap.has(original)) return _phoneMap.get(original);
  seedRng('p:' + original);
  const prefix = pick(['50','52','54','55','56','58']);
  const block1 = pad(Math.floor(rnd() * 1000), 3);
  const block2 = pad(Math.floor(rnd() * 10000), 4);
  const out = '+971 ' + prefix + ' ' + block1 + ' ' + block2;
  _phoneMap.set(original, out);
  return out;
};

const _emailMap = new Map();
const fakeEmail = (original, nameHint) => {
  if (!original) return original;
  if (_emailMap.has(original)) return _emailMap.get(original);
  const name = nameHint ? fakeName(nameHint) : fakeName(original);
  const slug = name.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
  const out = slug + '@example.ae';
  _emailMap.set(original, out);
  return out;
};

const fakeEmiratesId = (original) => {
  if (!original) return original;
  seedRng('eid:' + original);
  return '784-' + (1970 + Math.floor(rnd() * 50)) + '-' +
         pad(Math.floor(rnd() * 10000000), 7) + '-' +
         Math.floor(rnd() * 10);
};

const fakePassport = (original) => {
  if (!original) return original;
  seedRng('pp:' + original);
  const letter = String.fromCharCode(65 + Math.floor(rnd() * 26));
  return letter + pad(Math.floor(rnd() * 10000000), 7);
};

const fakeContract = (original) => {
  if (!original) return original;
  seedRng('c:' + original);
  return 'CTR-' + pad(Math.floor(rnd() * 100000), 5);
};

// Field-by-field anonymiser. Returns the row with PII replaced.
const ANON_RULES = {
  profiles: (r) => ({
    ...r,
    full_name: fakeName(r.full_name),
    phone: fakePhone(r.phone),
    passport_number: fakePassport(r.passport_number),
    emirates_id: fakeEmiratesId(r.emirates_id),
    emergency_contact_name: fakeName(r.emergency_contact_name),
    emergency_contact_phone: fakePhone(r.emergency_contact_phone),
  }),
  units: (r) => ({
    ...r,
    owner_name: fakeName(r.owner_name),
    owner_phone: fakePhone(r.owner_phone),
    owner_email: fakeEmail(r.owner_email, r.owner_name),
    owner_passport_number: fakePassport(r.owner_passport_number),
    owner_emirates_id: fakeEmiratesId(r.owner_emirates_id),
    tenant_name: fakeName(r.tenant_name),
    tenant_phone: fakePhone(r.tenant_phone),
    tenant_email: fakeEmail(r.tenant_email, r.tenant_name),
    tenant_contract_number: fakeContract(r.tenant_contract_number),
  }),
  resident_assignments: (r) => ({
    ...r,
    contract_number: fakeContract(r.contract_number),
  }),
  visits: (r) => ({
    ...r,
    visitor_name: r.visitor_name && /(delivery|cleaning|pest|hvac|lift|electric|plumb|guard|maint|noon|talabat|aramex|dhl)/i.test(r.visitor_name)
      ? r.visitor_name   // keep vendor / company-style visitor names
      : fakeName(r.visitor_name),
    visitor_phone: fakePhone(r.visitor_phone),
  }),
};

const anonymiseRow = (table, row) => (ANON_RULES[table] ? ANON_RULES[table](row) : row);

// ---------------------------------------------------------------------------
// 2. Supabase fetch helper (PostgREST + service_role)
// ---------------------------------------------------------------------------

const fetchTable = async (table) => {
  const all = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const url = `${WORKING_URL}/rest/v1/${table}?select=*&order=created_at.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || /relation .* does not exist|column .* does not exist|PGRST/.test(body)) {
        console.warn(`  (skipped ${table}: ${res.status} ${body.slice(0, 80)})`);
        return [];
      }
      throw new Error(`${table}: ${res.status} ${body}`);
    }
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
};

// Order matters: each entry refers only to entries above it.
const TABLES = [
  'buildings',
  'units',
  'profiles',
  'resident_assignments',
  'security_assignments',
  'visits',
  'unit_attachments',
  'amenity_bookings',
  'service_requests',
  'invoices',
  'resident_documents',
  'vendors',
  'vendor_buildings',
  'vendor_payments',
  'vendor_documents',
  'invoice_attachments',
  // Best-effort: these may or may not exist on the working project.
  'contracts',
  'announcements',
  'reminder_settings',
];

// ---------------------------------------------------------------------------
// 3. SQL emission helpers
// ---------------------------------------------------------------------------

const sqlLit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

// PostgREST returns ISO timestamps; truncate to date for date columns and to
// timestamptz literal for timestamp columns. We don't know the column type
// from the API, so we keep the raw string — Postgres accepts ISO for both.

// Replaces an originally-stored UUID with either a per-entity variable name
// (when later inserts need to FK to it) or NULL when missing.
const refOrNull = (map, id) => id && map.has(id) ? map.get(id) : 'NULL';

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

const main = async () => {
  console.log('Fetching from', WORKING_URL);
  const data = {};
  for (const t of TABLES) {
    process.stdout.write(`  ${t} ... `);
    try {
      data[t] = await fetchTable(t);
      console.log(`${data[t].length} rows`);
    } catch (e) {
      console.log(`SKIP (${e.message.slice(0, 80)})`);
      data[t] = [];
    }
  }

  // Anonymise.
  for (const t of Object.keys(data)) {
    data[t] = data[t].map(r => anonymiseRow(t, r));
  }

  // ----- Build per-table UUID -> var-name maps -----
  const buildingVar = new Map();
  data.buildings.forEach((r, i) => buildingVar.set(r.id, `b_${pad(i + 1, 3)}`));

  const unitVar = new Map();
  data.units.forEach((r, i) => unitVar.set(r.id, `u_${pad(i + 1, 3)}`));

  const profileVar = new Map();
  // Only resident / security profiles — never the PMC owner profile (that's
  // the demo signup's own auth user row, owned by them via the trigger).
  const seedableProfiles = data.profiles.filter(p => p.role !== 'pmc');
  seedableProfiles.forEach((r, i) => profileVar.set(r.id, `p_${pad(i + 1, 3)}`));

  const vendorVar = new Map();
  data.vendors.forEach((r, i) => vendorVar.set(r.id, `v_${pad(i + 1, 3)}`));

  const invoiceVar = new Map();
  data.invoices.forEach((r, i) => invoiceVar.set(r.id, `inv_${pad(i + 1, 4)}`));

  const vendorPaymentVar = new Map();
  data.vendor_payments.forEach((r, i) => vendorPaymentVar.set(r.id, `vp_${pad(i + 1, 4)}`));

  // ----- Render -----
  const declarations = [
    ...[...buildingVar.values()].map(v => `${v} uuid := gen_random_uuid();`),
    ...[...unitVar.values()].map(v => `${v} uuid := gen_random_uuid();`),
    ...[...profileVar.values()].map(v => `${v} uuid := gen_random_uuid();`),
    ...[...vendorVar.values()].map(v => `${v} uuid := gen_random_uuid();`),
    ...[...invoiceVar.values()].map(v => `${v} uuid := gen_random_uuid();`),
    ...[...vendorPaymentVar.values()].map(v => `${v} uuid := gen_random_uuid();`),
  ];

  // INSERT renderers. For each table, choose the columns we want to seed,
  // map FKs through the variable maps, and emit one VALUES tuple per row.
  const renderInsert = (table, rows, columns, mapRow) => {
    if (!rows.length) return `-- (no ${table} rows in source)\n`;
    const valuesLines = rows.map(r => {
      const mapped = mapRow(r);
      const tuple = columns.map(c => mapped[c]).join(', ');
      return `    (${tuple})`;
    }).join(',\n');
    return `INSERT INTO public.${table} (${columns.join(', ')}) VALUES\n${valuesLines};\n`;
  };

  // Buildings -----------------------------------------------------------------
  const buildingsSql = renderInsert('buildings',
    data.buildings,
    ['id','name','address','notes','property_type','commercial_use_type','gross_leasable_area_sqft','parking_spots','service_charge_rate_aed_per_sqft','villa_count','plot_area_sqft','bedrooms_per_villa','amenities','purchase_price','current_value','acquired_on','created_at','owner_id'],
    (r) => ({
      id: buildingVar.get(r.id),
      name: sqlLit(r.name),
      address: sqlLit(r.address),
      notes: sqlLit(r.notes),
      property_type: sqlLit(r.property_type || 'Residential'),
      commercial_use_type: sqlLit(r.commercial_use_type),
      gross_leasable_area_sqft: sqlLit(r.gross_leasable_area_sqft),
      parking_spots: sqlLit(r.parking_spots),
      service_charge_rate_aed_per_sqft: sqlLit(r.service_charge_rate_aed_per_sqft),
      villa_count: sqlLit(r.villa_count),
      plot_area_sqft: sqlLit(r.plot_area_sqft),
      bedrooms_per_villa: sqlLit(r.bedrooms_per_villa),
      amenities: sqlLit(r.amenities),
      purchase_price: sqlLit(r.purchase_price),
      current_value: sqlLit(r.current_value),
      acquired_on: sqlLit(r.acquired_on),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // Units --------------------------------------------------------------------
  const unitsSql = renderInsert('units',
    data.units.filter(r => buildingVar.has(r.building_id)),
    ['id','building_id','floor','unit_number','notes','owner_name','owner_phone','owner_email','owner_passport_number','owner_emirates_id','purchase_date','owner_is_resident','tenant_name','tenant_email','tenant_phone','tenant_tenure','tenant_contract_number','tenant_lease_start','tenant_lease_end','tenant_monthly_payment_aed','created_at','owner_id'],
    (r) => ({
      id: unitVar.get(r.id),
      building_id: refOrNull(buildingVar, r.building_id),
      floor: sqlLit(r.floor),
      unit_number: sqlLit(r.unit_number),
      notes: sqlLit(r.notes),
      owner_name: sqlLit(r.owner_name),
      owner_phone: sqlLit(r.owner_phone),
      owner_email: sqlLit(r.owner_email),
      owner_passport_number: sqlLit(r.owner_passport_number),
      owner_emirates_id: sqlLit(r.owner_emirates_id),
      purchase_date: sqlLit(r.purchase_date),
      owner_is_resident: sqlLit(r.owner_is_resident),
      tenant_name: sqlLit(r.tenant_name),
      tenant_email: sqlLit(r.tenant_email),
      tenant_phone: sqlLit(r.tenant_phone),
      tenant_tenure: sqlLit(r.tenant_tenure),
      tenant_contract_number: sqlLit(r.tenant_contract_number),
      tenant_lease_start: sqlLit(r.tenant_lease_start),
      tenant_lease_end: sqlLit(r.tenant_lease_end),
      tenant_monthly_payment_aed: sqlLit(r.tenant_monthly_payment_aed),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // Profiles (residents + security only) -------------------------------------
  const profilesSql = renderInsert('profiles',
    seedableProfiles,
    ['id','full_name','phone','role','date_of_birth','passport_number','emirates_id','emergency_contact_name','emergency_contact_phone','employer','occupation','created_at','owner_id'],
    (r) => ({
      id: profileVar.get(r.id),
      full_name: sqlLit(r.full_name),
      phone: sqlLit(r.phone),
      role: sqlLit(r.role || 'resident'),
      date_of_birth: sqlLit(r.date_of_birth),
      passport_number: sqlLit(r.passport_number),
      emirates_id: sqlLit(r.emirates_id),
      emergency_contact_name: sqlLit(r.emergency_contact_name),
      emergency_contact_phone: sqlLit(r.emergency_contact_phone),
      employer: sqlLit(r.employer),
      occupation: sqlLit(r.occupation),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // resident_assignments -----------------------------------------------------
  const rasSql = renderInsert('resident_assignments',
    data.resident_assignments.filter(r => profileVar.has(r.profile_id) && unitVar.has(r.unit_id)),
    ['profile_id','unit_id','tenure','lease_start','lease_end','monthly_payment_aed','ownership_start','cheques_per_year','contract_number','assigned_at','owner_id'],
    (r) => ({
      profile_id: profileVar.get(r.profile_id),
      unit_id: unitVar.get(r.unit_id),
      tenure: sqlLit(r.tenure),
      lease_start: sqlLit(r.lease_start),
      lease_end: sqlLit(r.lease_end),
      monthly_payment_aed: sqlLit(r.monthly_payment_aed),
      ownership_start: sqlLit(r.ownership_start),
      cheques_per_year: sqlLit(r.cheques_per_year),
      contract_number: sqlLit(r.contract_number),
      assigned_at: sqlLit(r.assigned_at),
      owner_id: 'p_uid',
    }));

  // security_assignments -----------------------------------------------------
  const saSql = renderInsert('security_assignments',
    data.security_assignments.filter(r => profileVar.has(r.profile_id) && buildingVar.has(r.building_id)),
    ['profile_id','building_id','shift','assigned_at','owner_id'],
    (r) => ({
      profile_id: profileVar.get(r.profile_id),
      building_id: refOrNull(buildingVar, r.building_id),
      shift: sqlLit(r.shift),
      assigned_at: sqlLit(r.assigned_at),
      owner_id: 'p_uid',
    }));

  // visits -------------------------------------------------------------------
  const visitsSql = renderInsert('visits',
    data.visits.filter(r => unitVar.has(r.unit_id)),
    ['id','unit_id','type','visitor_name','visitor_phone','visit_date','visit_time','status','purpose','created_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      unit_id: unitVar.get(r.unit_id),
      type: sqlLit(r.type),
      visitor_name: sqlLit(r.visitor_name || 'Visitor'),
      visitor_phone: sqlLit(r.visitor_phone),
      visit_date: sqlLit(r.visit_date),
      visit_time: sqlLit(r.visit_time),
      status: sqlLit(r.status || 'Pre-Approved'),
      purpose: sqlLit(r.purpose),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // unit_attachments ---------------------------------------------------------
  const uaSql = renderInsert('unit_attachments',
    data.unit_attachments.filter(r => unitVar.has(r.unit_id)),
    ['id','unit_id','kind','filename','storage_path','created_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      unit_id: unitVar.get(r.unit_id),
      kind: sqlLit(r.kind),
      filename: sqlLit(r.filename),
      storage_path: sqlLit(r.storage_path),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // amenity_bookings ---------------------------------------------------------
  const abSql = renderInsert('amenity_bookings',
    data.amenity_bookings.filter(r => buildingVar.has(r.building_id)),
    ['id','building_id','unit_id','resident_profile_id','amenity_name','booking_date','start_time','end_time','guests','status','created_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      building_id: refOrNull(buildingVar, r.building_id),
      unit_id: r.unit_id && unitVar.has(r.unit_id) ? unitVar.get(r.unit_id) : 'NULL',
      resident_profile_id: r.resident_profile_id && profileVar.has(r.resident_profile_id) ? profileVar.get(r.resident_profile_id) : 'NULL',
      amenity_name: sqlLit(r.amenity_name),
      booking_date: sqlLit(r.booking_date),
      start_time: sqlLit(r.start_time),
      end_time: sqlLit(r.end_time),
      guests: sqlLit(r.guests),
      status: sqlLit(r.status || 'Confirmed'),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // service_requests ---------------------------------------------------------
  const srSql = renderInsert('service_requests',
    data.service_requests.filter(r => !r.unit_id || unitVar.has(r.unit_id)),
    ['id','unit_id','resident_profile_id','category','description','priority','status','preferred_date','resolved_at','created_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      unit_id: r.unit_id && unitVar.has(r.unit_id) ? unitVar.get(r.unit_id) : 'NULL',
      resident_profile_id: r.resident_profile_id && profileVar.has(r.resident_profile_id) ? profileVar.get(r.resident_profile_id) : 'NULL',
      category: sqlLit(r.category),
      description: sqlLit(r.description),
      priority: sqlLit(r.priority || 'Normal'),
      status: sqlLit(r.status || 'New'),
      preferred_date: sqlLit(r.preferred_date),
      resolved_at: sqlLit(r.resolved_at),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // invoices -----------------------------------------------------------------
  const invSql = renderInsert('invoices',
    data.invoices.filter(r => unitVar.has(r.unit_id)),
    ['id','unit_id','resident_profile_id','invoice_number','description','amount_aed','due_date','status','source_type','source_id','created_at','owner_id'],
    (r) => ({
      id: invoiceVar.get(r.id),
      unit_id: unitVar.get(r.unit_id),
      resident_profile_id: r.resident_profile_id && profileVar.has(r.resident_profile_id) ? profileVar.get(r.resident_profile_id) : 'NULL',
      invoice_number: sqlLit(r.invoice_number),
      description: sqlLit(r.description),
      amount_aed: sqlLit(r.amount_aed),
      due_date: sqlLit(r.due_date),
      status: sqlLit(r.status || 'Pending'),
      source_type: sqlLit(r.source_type),
      source_id: 'NULL',
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // resident_documents -------------------------------------------------------
  const rdSql = renderInsert('resident_documents',
    data.resident_documents.filter(r => profileVar.has(r.profile_id)),
    ['id','profile_id','kind','filename','storage_path','created_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      profile_id: profileVar.get(r.profile_id),
      kind: sqlLit(r.kind),
      filename: sqlLit(r.filename),
      storage_path: sqlLit(r.storage_path),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // vendors ------------------------------------------------------------------
  const vendorsSql = renderInsert('vendors',
    data.vendors,
    ['id','name','service_category','contact_person','contact_phone','contact_email','contract_start','contract_end','contract_value_aed','status','trade_license','trn_number','created_at','owner_id'],
    (r) => ({
      id: vendorVar.get(r.id),
      name: sqlLit(r.name),
      service_category: sqlLit(r.service_category),
      contact_person: sqlLit(r.contact_person ? fakeName(r.contact_person) : r.contact_person),
      contact_phone: sqlLit(fakePhone(r.contact_phone)),
      contact_email: sqlLit(r.contact_email),
      contract_start: sqlLit(r.contract_start),
      contract_end: sqlLit(r.contract_end),
      contract_value_aed: sqlLit(r.contract_value_aed),
      status: sqlLit(r.status || 'Active'),
      trade_license: sqlLit(r.trade_license),
      trn_number: sqlLit(r.trn_number),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // vendor_buildings ---------------------------------------------------------
  const vbSql = renderInsert('vendor_buildings',
    data.vendor_buildings.filter(r => vendorVar.has(r.vendor_id) && buildingVar.has(r.building_id)),
    ['vendor_id','building_id','owner_id'],
    (r) => ({
      vendor_id: vendorVar.get(r.vendor_id),
      building_id: buildingVar.get(r.building_id),
      owner_id: 'p_uid',
    }));

  // vendor_payments ----------------------------------------------------------
  const vpSql = renderInsert('vendor_payments',
    data.vendor_payments.filter(r => vendorVar.has(r.vendor_id)),
    ['id','vendor_id','invoice_number','invoice_date','description','category','amount_aed','payment_status','paid_date','payment_method','payment_reference','notes','created_at','owner_id'],
    (r) => ({
      id: vendorPaymentVar.get(r.id),
      vendor_id: vendorVar.get(r.vendor_id),
      invoice_number: sqlLit(r.invoice_number),
      invoice_date: sqlLit(r.invoice_date),
      description: sqlLit(r.description),
      category: sqlLit(r.category),
      amount_aed: sqlLit(r.amount_aed),
      payment_status: sqlLit(r.payment_status || 'Pending'),
      paid_date: sqlLit(r.paid_date),
      payment_method: sqlLit(r.payment_method),
      payment_reference: sqlLit(r.payment_reference),
      notes: sqlLit(r.notes),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // vendor_documents ---------------------------------------------------------
  const vdSql = renderInsert('vendor_documents',
    data.vendor_documents.filter(r => vendorVar.has(r.vendor_id)),
    ['id','vendor_id','payment_id','kind','filename','storage_path','created_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      vendor_id: vendorVar.get(r.vendor_id),
      payment_id: r.payment_id && vendorPaymentVar.has(r.payment_id) ? vendorPaymentVar.get(r.payment_id) : 'NULL',
      kind: sqlLit(r.kind),
      filename: sqlLit(r.filename),
      storage_path: sqlLit(r.storage_path),
      created_at: sqlLit(r.created_at),
      owner_id: 'p_uid',
    }));

  // invoice_attachments ------------------------------------------------------
  const iaSql = renderInsert('invoice_attachments',
    data.invoice_attachments.filter(r => invoiceVar.has(r.invoice_id)),
    ['id','invoice_id','kind','storage_path','file_name','mime_type','size_bytes','uploaded_at','owner_id'],
    (r) => ({
      id: 'gen_random_uuid()',
      invoice_id: invoiceVar.get(r.invoice_id),
      kind: sqlLit(r.kind),
      storage_path: sqlLit(r.storage_path),
      file_name: sqlLit(r.file_name),
      mime_type: sqlLit(r.mime_type),
      size_bytes: sqlLit(r.size_bytes),
      uploaded_at: sqlLit(r.uploaded_at),
      owner_id: 'p_uid',
    }));

  // contracts (best-effort; columns inferred from the working row) -----------
  const contractsSql = data.contracts.length === 0 ? '' : `INSERT INTO public.contracts (${Object.keys(data.contracts[0]).filter(k => k !== 'owner_id').concat(['owner_id']).join(', ')}) VALUES\n` +
    data.contracts.map(r => {
      const cols = Object.keys(data.contracts[0]).filter(k => k !== 'owner_id');
      const vals = cols.map(c => {
        if (c === 'id') return 'gen_random_uuid()';
        if (c === 'building_id') return refOrNull(buildingVar, r[c]);
        return sqlLit(r[c]);
      });
      vals.push('p_uid');
      return `    (${vals.join(', ')})`;
    }).join(',\n') + ';\n';

  // ----- Assemble the function -----
  const banner = `-- =============================================================================
-- DEMO-ONLY · Seed for new demo signups (snapshot of pmc.vars.ae)
-- =============================================================================
-- Generated by tools/snapshot-working-to-seed.mjs against:
--   ${WORKING_URL}
-- on ${new Date().toISOString().slice(0, 10)}.
--
-- This is a frozen copy of the curated working portfolio with personal data
-- swapped for fakes. Re-run the snapshot tool whenever you want the demo to
-- catch up with new invoices / proofs / units added in the working profile.
--
-- Row counts in this snapshot:
${Object.entries(data).map(([t, rs]) => `--   ${t.padEnd(28)} ${rs.length}`).join('\n')}
-- =============================================================================
`;

  const body = `
CREATE OR REPLACE FUNCTION public.seed_demo_portfolio_for(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  ${declarations.join('\n  ')}
BEGIN
  -- ---- Wipe any existing data on this owner (idempotent re-seed) ----
  DELETE FROM public.invoice_attachments  WHERE owner_id = p_uid;
  DELETE FROM public.invoices             WHERE owner_id = p_uid;
  DELETE FROM public.vendor_documents     WHERE owner_id = p_uid;
  DELETE FROM public.vendor_payments      WHERE owner_id = p_uid;
  DELETE FROM public.vendor_buildings     WHERE owner_id = p_uid;
  DELETE FROM public.vendors              WHERE owner_id = p_uid;
  DELETE FROM public.amenity_bookings     WHERE owner_id = p_uid;
  DELETE FROM public.unit_attachments     WHERE owner_id = p_uid;
  DELETE FROM public.visits               WHERE owner_id = p_uid;
  DELETE FROM public.service_requests     WHERE owner_id = p_uid;
  DELETE FROM public.security_assignments WHERE owner_id = p_uid;
  DELETE FROM public.resident_documents   WHERE owner_id = p_uid;
  DELETE FROM public.resident_assignments WHERE owner_id = p_uid;
  DELETE FROM public.profiles             WHERE owner_id = p_uid AND id <> p_uid;
  DELETE FROM public.units                WHERE owner_id = p_uid;
  DELETE FROM public.buildings            WHERE owner_id = p_uid;

  -- ---- Insert in FK-dependency order ----
  ${buildingsSql}
  ${unitsSql}
  ${profilesSql}
  ${rasSql}
  ${saSql}
  ${visitsSql}
  ${uaSql}
  ${abSql}
  ${srSql}
  ${invSql}
  ${rdSql}
  ${vendorsSql}
  ${vbSql}
  ${vpSql}
  ${vdSql}
  ${iaSql}
  ${contractsSql}
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger wrapper: fires when a new auth.users row is created, seeds that
--    user's portfolio. SECURITY DEFINER on the worker handles RLS bypass.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_user_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Ensure a profile row exists for the new auth user before child tables
  -- reference it.
  INSERT INTO public.profiles (id, full_name, role, owner_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 'pmc', NEW.id)
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.seed_demo_portfolio_for(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block signup if seeding fails. Surfaces via Postgres logs.
  RAISE WARNING 'seed_demo_user_portfolio failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_portfolio ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_portfolio
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_demo_user_portfolio();
`;

  const out = banner + body;
  writeFileSync(OUT_PATH, out);
  console.log(`\nWrote ${out.length.toLocaleString()} bytes to ${OUT_PATH}`);
  console.log('Next: paste that file into the demo Supabase SQL editor and Run.');
};

main().catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
