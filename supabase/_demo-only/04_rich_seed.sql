-- =============================================================================
-- DEMO-ONLY · Full-scale seed for the signup trigger
-- =============================================================================
-- Each new demo signup lands in a portfolio shaped like a real working PMC:
--
--   - 9 buildings (3 Residential, 2 Commercial, 3 Villa, 1 Commercial Land)
--   - 100 units distributed across the buildings
--   - ~55 resident profiles + assignments (mix of owner-occupied + tenant,
--     ~20% vacancy)
--   - 10 security guards on rotating shifts
--   - 10 vendors covering all main service categories
--   - 100 invoices (a realistic mix: ~50 Paid, ~30 Pending, ~20 Overdue)
--   - 15 visits today / tomorrow
--   - 15 service requests across categories + priorities
--
-- Names are sample (UAE flavour mixed with expat); phones are different from
-- the working examples so the two sandboxes read as clearly distinct.
--
-- The function uses PL/pgSQL FOR loops + arrays instead of 1000+ explicit
-- VALUES so adjustments stay maintainable. SECURITY DEFINER so it can write
-- through RLS for a user who hasn't received their first JWT yet.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_demo_user_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := NEW.id;

  -- ===== Sample name pools (deterministic, indexed by row counter) =====
  emirati_first text[] := ARRAY[
    'Khalid','Mohammed','Hassan','Ahmed','Faisal','Saif','Tariq','Ibrahim','Yousef',
    'Reem','Aisha','Maryam','Noor','Layla','Sara','Dalia','Huda','Yasmin','Mariam',
    'Abdullah','Saeed','Nasser','Omar','Jamal','Rashid','Salem','Hamad','Sultan'
  ];
  emirati_last text[] := ARRAY[
    'Al Mansoori','Al Maktoum','Al Suwaidi','Al Habtoor','Al Hammadi','Al Awadi',
    'Al Marri','Al Nuaimi','Al Marzouqi','Al Falasi','Al Zaabi','Al Ketbi','Al Kaabi',
    'Al Dhaheri','Al Shamsi','Al Hosani','Al Jaberi','Al Bastaki','Al Awadhi',
    'Al Tunaiji','Al Mazrouei','Al Remeithi','Al Breiki','Al Otaiba','Al Naqbi'
  ];
  expat_full text[] := ARRAY[
    'Sofia Conti','Liu Wei','Daniel Cohen','Patricia Romano','Yuki Tanaka',
    'Pierre Dubois','Stefan Hartmann','Eric Lambert','John Smith','Anna Müller',
    'Marco Rossi','Wei Chen','Carlos Mendez','Aditi Sharma','Hiroshi Sato'
  ];

  -- ===== Building ids (9 buildings) =====
  b_aljil    uuid := gen_random_uuid();  -- Residential — Aljil Tower         (5 floors × 4 = 20 units)
  b_skyline  uuid := gen_random_uuid();  -- Residential — Skyline Heights     (4 floors × 5 = 20 units)
  b_qurm     uuid := gen_random_uuid();  -- Residential — Al Qurm View        (5 floors × 4 = 20 units)
  b_marina   uuid := gen_random_uuid();  -- Commercial  — Marina Bay Offices  (4 floors × 3 =  12 units)
  b_boulev   uuid := gen_random_uuid();  -- Commercial  — Boulevard Plaza     (4 floors × 3 =  12 units)
  b_palm     uuid := gen_random_uuid();  -- Villa       — Palm Frond M-23     (1 unit)
  b_hills    uuid := gen_random_uuid();  -- Villa       — Emirates Hills V-14 (1 unit)
  b_coral    uuid := gen_random_uuid();  -- Villa       — Coral Bay Villa     (1 unit)
  b_plot     uuid := gen_random_uuid();  -- Cml. Land   — Al Quoz Plot 14     (2 client slots, 1 vacant slot = 3 unit rows)
  --                                                                          -- total = 110 units; we cap at 100 in the loops

  -- Loop scratch vars
  v_building_id uuid;
  v_unit_id     uuid;
  v_profile_id  uuid;
  v_floor       int;
  v_unit_num    text;
  v_letter      text;
  v_owner_name  text;
  v_owner_phone text;
  v_owner_email text;
  v_resident_name text;
  v_resident_phone text;
  v_invoice_num text;
  v_status      text;
  v_amount      numeric;
  v_due_date    date;
  v_created_at  date;
  v_unit_pool   uuid[];  -- collected unit ids for downstream loops
  v_resident_pool uuid[];

  v_display text := initcap(replace(replace(split_part(NEW.email, '@', 1), '.', ' '), '_', ' '));
BEGIN
  -- =========================================================================
  -- 1. Self profile (signing-up PMC)
  -- =========================================================================
  INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
  VALUES (v_uid, COALESCE(NULLIF(v_display, ''), 'Property Manager'), NULL, 'pmc', v_uid)
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- 2. Buildings (9)
  -- =========================================================================
  INSERT INTO public.buildings (id, name, address, notes, property_type, parking_spots, gross_leasable_area_sqft, commercial_use_type, villa_count, plot_area_sqft, bedrooms_per_villa, amenities, purchase_price, current_value, acquired_on, owner_id) VALUES
    (b_aljil,   'Aljil Tower',         'Sheikh Zayed Rd, Dubai, UAE',              'High-rise residential, pool + gym, 5 floors x 4 units.','Residential',     40,  NULL, NULL, NULL, NULL, NULL, 'Pool, gym, lobby, concierge, parking', 28500000, 33250000, '2017-04-18', v_uid),
    (b_skyline, 'Skyline Heights',     'Al Wasl Rd, Jumeirah 1, Dubai, UAE',       'Mid-rise residential, 4 floors x 5 units.',            'Residential',     30,  NULL, NULL, NULL, NULL, NULL, 'Pool, gym, parking',                   22000000, 25500000, '2019-06-12', v_uid),
    (b_qurm,    'Al Qurm View',        'Shams Abu Dhabi, Al Reem Island, AD, UAE', 'Low-rise residential, 5 floors x 4 units, sea view.',  'Residential',     35,  NULL, NULL, NULL, NULL, NULL, 'Pool, beach access, gym',              26800000, 30200000, '2018-11-03', v_uid),
    (b_marina,  'Marina Bay Offices',  'Dubai Marina, Dubai, UAE',                 'Grade-B office tower, 4 floors x 3 offices.',          'Commercial',      48,  31000,'Office', NULL, NULL, NULL, 'Building security, lift, parking',     22000000, 25500000, '2016-09-21', v_uid),
    (b_boulev,  'Boulevard Plaza',     'Downtown Dubai, Sheikh Zayed Rd, UAE',     'Grade-A retail + office, 4 floors x 3 units.',         'Commercial',      52,  34000,'Mixed',  NULL, NULL, NULL, 'Lobby, lift, parking, security',       38000000, 42100000, '2015-02-28', v_uid),
    (b_palm,    'Palm Frond M-23',     'Palm Jumeirah, Frond M, Dubai, UAE',       'Signature villa, private beach access.',               'Villa',            4,  NULL, NULL,    1, 12500,    6, 'Private pool, sea front, smart home',  14800000, 17100000, '2014-09-22', v_uid),
    (b_hills,   'Emirates Hills V-14', 'Emirates Hills, Street 7, Dubai, UAE',     'Mansion-style villa, golf course frontage.',           'Villa',            6,  NULL, NULL,    1, 18000,    8, 'Private pool, gardens, gym, sauna',    19500000, 22000000, '2009-11-08', v_uid),
    (b_coral,   'Coral Bay Villa',     'Saadiyat Beach, Saadiyat Island, AD, UAE', 'Beachfront villa, 5 bedrooms.',                        'Villa',            4,  NULL, NULL,    1,  9500,    5, 'Private pool, beach access, garden',   12500000, 14250000, '2021-03-20', v_uid),
    (b_plot,    'Al Quoz Plot 14',     'Al Quoz Industrial Area 3, Dubai, UAE',    'Industrial plot, subdivided into 2 client slots.',     'Commercial Land', NULL, NULL, NULL, NULL, 85000, NULL, NULL,                                    9500000, 11200000, '2009-02-04', v_uid);

  -- =========================================================================
  -- 3. Units — looped per building (100 total)
  -- =========================================================================
  -- Residential / commercial unit layouts share the same loop shape.
  -- Each (building, floors, units_per_floor, prefix) tuple becomes
  -- units. Vacancy is deterministic (every 5th unit vacant) so the data
  -- looks lived-in but not perfect.
  --
  -- Loop pattern: declare an array of building configs, then iterate.
  DECLARE
    cfg record;
    i int; j int; k int := 0;
  BEGIN
    FOR cfg IN
      SELECT * FROM (VALUES
        (b_aljil,   5, 4, 'A',  20),
        (b_skyline, 4, 5, 'S',  20),
        (b_qurm,    5, 4, 'Q',  20),
        (b_marina,  4, 3, '',   12),
        (b_boulev,  4, 3, '',   12)
      ) AS x(bid, floors, ups, prefix, total)
    LOOP
      FOR i IN 1..cfg.floors LOOP
        FOR j IN 1..cfg.ups LOOP
          v_unit_id := gen_random_uuid();
          v_unit_pool := array_append(v_unit_pool, v_unit_id);
          v_floor := i;
          IF cfg.prefix = '' THEN
            -- Commercial: 3-digit numeric unit numbers (e.g. 301, 302...)
            v_unit_num := (i*100 + j)::text;
          ELSE
            -- Residential: A-101, A-102 etc.
            v_unit_num := cfg.prefix || '-' || (i*100 + j)::text;
          END IF;

          k := k + 1;
          v_owner_name  := emirati_first[1 + (k % array_length(emirati_first,1))] || ' ' ||
                           emirati_last [1 + (k % array_length(emirati_last,1))];
          v_owner_phone := '+971 50 ' || lpad(((100 + k) % 1000)::text, 3, '0') || ' '
                                      || lpad(((1000 + k*7) % 10000)::text, 4, '0');
          v_owner_email := lower(replace(v_owner_name,' ','.')) || '@example.ae';

          IF k % 5 = 0 THEN
            -- Vacant unit — no owner / tenant rows.
            INSERT INTO public.units (id, building_id, floor, unit_number, owner_is_resident, owner_id)
              VALUES (v_unit_id, cfg.bid, v_floor, v_unit_num, false, v_uid);
          ELSIF cfg.prefix = '' THEN
            -- Commercial: tenant fields filled, no resident profile.
            INSERT INTO public.units (id, building_id, floor, unit_number,
              owner_name, owner_phone, owner_email, purchase_date, owner_is_resident,
              tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_contract_number, tenant_lease_start, tenant_lease_end, tenant_monthly_payment_aed,
              owner_id)
              VALUES (v_unit_id, cfg.bid, v_floor, v_unit_num,
                v_owner_name, v_owner_phone, v_owner_email, '2017-01-01', false,
                'Tenant Co. ' || k,
                'lease' || k || '@tenant.ae',
                '+971 4 ' || lpad(((400 + k) % 1000)::text, 3, '0') || ' ' || lpad(((1000 + k*13) % 10000)::text, 4, '0'),
                'Tenant',
                'CMT-' || cfg.prefix || '-' || v_unit_num,
                current_date - ((k * 17) % 365),
                current_date + (365 + ((k * 11) % 365)),
                25000 + ((k * 350) % 25000),
                v_uid);
          ELSE
            -- Residential: owner block populated; resident assignments come later.
            INSERT INTO public.units (id, building_id, floor, unit_number,
              owner_name, owner_phone, owner_email, owner_passport_number, owner_emirates_id, purchase_date, owner_is_resident,
              owner_id)
              VALUES (v_unit_id, cfg.bid, v_floor, v_unit_num,
                v_owner_name, v_owner_phone, v_owner_email,
                'XX' || lpad(((1000 + k) % 10000)::text, 7, '0'),
                '784-' || (1970 + (k % 30))::text || '-' || lpad(((1000 + k) % 10000)::text, 7, '0') || '-' || (1 + (k%9))::text,
                '2017-04-18',
                (k % 4 = 0),  -- one in four is owner-occupied
                v_uid);
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END;

  -- Three villa "units" + 2 plot slots (~5 more)
  INSERT INTO public.units (id, building_id, floor, unit_number, owner_name, owner_phone, owner_email, purchase_date, owner_is_resident, tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_contract_number, tenant_lease_start, tenant_lease_end, tenant_monthly_payment_aed, owner_id) VALUES
    (gen_random_uuid(), b_palm,  NULL, 'M-23', 'Layla Al Maktoum',    '+971 50 778 9911', 'layla.maktoum@example.ae',    '2014-09-22', false, 'Stefan Hartmann', 'stefan.hartmann@example.ae', '+971 52 119 8878', 'Tenant', 'RNT-PALM-M23',   '2026-01-01', '2027-12-31', 38000, v_uid),
    (gen_random_uuid(), b_hills, NULL, 'V-14', 'Mohammed Al Habtoor', '+971 50 224 5510', 'mohammed.habtoor@example.ae', '2009-11-08', true,  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (gen_random_uuid(), b_coral, NULL, 'V-01', 'Ahmed Al Marzouqi',   '+971 50 119 2245', 'ahmed.marzouqi@example.ae',   '2017-06-04', false, 'Eric Lambert',    'eric.lambert@example.ae',    '+971 55 663 7789', 'Tenant', 'RNT-CORAL-V1',   '2026-02-01', '2027-01-31', 32000, v_uid),
    (gen_random_uuid(), b_plot,  NULL, 'CL-AQ14-A', 'Khalifa Industrial Holdings', '+971 4 252 9901', 'plots@kih.ae', '2009-02-04', false, 'Aramex Yards',  'contracts@aramex.com', '+971 4 778 1110', 'Tenant', 'CL-AQ14-A', '2026-01-01', '2028-12-31', 120000, v_uid),
    (gen_random_uuid(), b_plot,  NULL, 'CL-AQ14-B', NULL, NULL, NULL, NULL, false,                                                                                                                              'DHL Express UAE', 'accounts@dhl.ae', '+971 4 224 5512', 'Tenant', 'CL-AQ14-B', '2026-02-01', '2027-01-31',  95000, v_uid);

  -- =========================================================================
  -- 4. Resident profiles + assignments
  --    Pull all RESIDENTIAL units (a-z prefix, not vacant), build one
  --    resident per unit. Skips commercial/villa/plot rows.
  -- =========================================================================
  DECLARE
    rec record;
    i int := 0;
  BEGIN
    FOR rec IN
      SELECT u.id AS unit_id, u.owner_name, u.owner_phone, u.owner_is_resident
      FROM public.units u
      WHERE u.owner_id = v_uid
        AND u.unit_number ~ '^[A-Z]-'  -- only residential A-/S-/Q- units
        AND u.owner_name IS NOT NULL
      ORDER BY u.unit_number
    LOOP
      i := i + 1;
      v_profile_id := gen_random_uuid();
      v_resident_pool := array_append(v_resident_pool, v_profile_id);

      IF rec.owner_is_resident THEN
        -- Owner-occupied: resident is the owner.
        INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
          VALUES (v_profile_id, rec.owner_name, rec.owner_phone, 'resident', v_uid);
        INSERT INTO public.resident_assignments (profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, owner_id)
          VALUES (v_profile_id, rec.unit_id, 'Owner', '2018-02-11', NULL, NULL, v_uid);
      ELSE
        -- Tenant — pick a name from the expat pool every 3rd, Emirati otherwise.
        IF i % 3 = 0 THEN
          v_resident_name  := expat_full[1 + (i % array_length(expat_full,1))];
        ELSE
          v_resident_name  := emirati_first[1 + ((i*3) % array_length(emirati_first,1))] || ' ' ||
                              emirati_last [1 + ((i*5) % array_length(emirati_last,1))];
        END IF;
        v_resident_phone := '+971 56 ' || lpad(((100 + i) % 1000)::text, 3, '0') || ' '
                                       || lpad(((1000 + i*7) % 10000)::text, 4, '0');

        INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
          VALUES (v_profile_id, v_resident_name, v_resident_phone, 'resident', v_uid);
        INSERT INTO public.resident_assignments (profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, owner_id)
          VALUES (v_profile_id, rec.unit_id, 'Tenant', current_date - 200, current_date + 200, 8000 + (i*150 % 8000), v_uid);
      END IF;
    END LOOP;
  END;

  -- =========================================================================
  -- 5. Security guards (10 across the buildings)
  -- =========================================================================
  DECLARE
    guards text[] := ARRAY[
      'Anas Khoury','Hassan Al Marri','Ivan Petrov','Rashid Al Bloushi','Tariq Al Naqbi',
      'Yusuf Aziz','Karim Habib','Saeed Al Naqbi','Faruq Hamdan','Marwan Saber'
    ];
    guard_bldg uuid[] := ARRAY[b_aljil,b_aljil,b_skyline,b_skyline,b_qurm,b_qurm,b_marina,b_marina,b_boulev,b_boulev];
    guard_shift text[] := ARRAY['Day','Night','Day','Night','Day','Night','24h','Day','Night','Day'];
    i int;
  BEGIN
    FOR i IN 1..10 LOOP
      v_profile_id := gen_random_uuid();
      INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
        VALUES (v_profile_id, guards[i], '+971 58 ' || lpad((100+i*7)::text,3,'0') || ' ' || lpad((1000+i*13)::text,4,'0'), 'security', v_uid);
      INSERT INTO public.security_assignments (profile_id, building_id, shift, owner_id)
        VALUES (v_profile_id, guard_bldg[i], guard_shift[i], v_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 6. Vendors (10 covering all main categories)
  -- =========================================================================
  DECLARE
    vendors_data record;
    vendor_id uuid;
    i int := 0;
  BEGIN
    FOR vendors_data IN
      SELECT * FROM (VALUES
        ('AquaFix Plumbing LLC',      'Plumbing',           'Hassan Al Awadi',   '+971 50 111 2230', 'hassan@aquafix.ae',       30000, 'Active'),
        ('Spark Electric Services',   'Electrical',         'Maryam Al Suwaidi', '+971 55 444 5560', 'info@sparkelectric.ae',   18500, 'Expiring Soon'),
        ('CrystalClean Co.',          'Cleaning',           'Aisha Al Marzouqi', '+971 50 909 1210', 'ops@crystalclean.ae',     24000, 'Active'),
        ('CoolBreeze HVAC',           'HVAC',               'Saeed Al Naqbi',    '+971 50 778 4410', 'service@coolbreeze.ae',   42000, 'Active'),
        ('AscendLift Maintenance',    'Lift Maintenance',   'Karim Habib',       '+971 50 332 7780', 'contracts@ascendlift.ae', 36000, 'Active'),
        ('GreenLeaf Gardening',       'Gardening',          'Omar Al Shamsi',    '+971 50 887 6650', 'team@greenleaf.ae',       21000, 'Active'),
        ('PestGuard UAE',             'Pest Control',       'Nasser Al Falasi',  '+971 50 554 1120', 'service@pestguard.ae',    14500, 'Active'),
        ('Handy Pros General',        'General Handyman',   'Faruq Hamdan',      '+971 50 220 9970', 'jobs@handypros.ae',       12000, 'Expired'),
        ('Shield Security Services',  'Security',           'Ahmed Al Marri',    '+971 50 998 1101', 'ops@shieldsec.ae',        58000, 'Active'),
        ('UrbanFix Multi-Service',    'Other',              'Marwan Saber',      '+971 50 443 7720', 'desk@urbanfix.ae',        16000, 'Active')
      ) AS v(nm, cat, contact, phone, email, val, status)
    LOOP
      i := i + 1;
      vendor_id := gen_random_uuid();
      INSERT INTO public.vendors (id, name, service_category, contact_person, contact_phone, contact_email, contract_start, contract_end, contract_value_aed, status, owner_id)
        VALUES (vendor_id, vendors_data.nm, vendors_data.cat, vendors_data.contact, vendors_data.phone, vendors_data.email,
                current_date - 200, current_date + 165, vendors_data.val, vendors_data.status, v_uid);
      -- Link each vendor to 2-3 buildings
      INSERT INTO public.vendor_buildings (vendor_id, building_id, owner_id) VALUES
        (vendor_id, CASE (i % 5) WHEN 0 THEN b_aljil WHEN 1 THEN b_skyline WHEN 2 THEN b_qurm WHEN 3 THEN b_marina ELSE b_boulev END, v_uid),
        (vendor_id, CASE (i % 5) WHEN 0 THEN b_skyline WHEN 1 THEN b_marina WHEN 2 THEN b_boulev WHEN 3 THEN b_qurm ELSE b_aljil END, v_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 7. Invoices (100 total — mix of statuses)
  -- =========================================================================
  -- Build invoices keyed off the residential units we created. 50 paid in
  -- prior months, 30 pending this month, 20 overdue (past due).
  DECLARE
    rec record;
    i int := 0;
    inv_status text;
    inv_due date;
    inv_created date;
    inv_amount numeric;
  BEGIN
    -- Paid (50) — distributed so half land THIS month so the overview's
    -- "Collected (selected period)" KPI isn't a sad AED 0 on a fresh
    -- signup. First 25 in current month; remaining 25 in the previous
    -- month so the "last month" comparison line has substance too.
    FOR rec IN
      SELECT ra.profile_id, ra.unit_id, ra.monthly_payment_aed
      FROM public.resident_assignments ra
      WHERE ra.owner_id = v_uid AND ra.tenure = 'Tenant'
      ORDER BY ra.unit_id
      LIMIT 50
    LOOP
      i := i + 1;
      IF i <= 25 THEN
        -- This month — created in the first half, due near today.
        inv_created := date_trunc('month', current_date)::date + ((i * 1) % 14);
        inv_due     := inv_created + 5;
      ELSE
        -- Last month — created mid-month, due before month-end.
        inv_created := (date_trunc('month', current_date) - interval '1 month')::date + (((i-25) * 1) % 25);
        inv_due     := inv_created + 5;
      END IF;
      inv_amount  := COALESCE(rec.monthly_payment_aed, 9000);
      INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
        VALUES ('RNT-2026-' || lpad((100+i)::text, 5, '0'), rec.unit_id, rec.profile_id,
                'Monthly rent', inv_amount, 'Paid', inv_due, inv_created, v_uid);
    END LOOP;

    -- Pending (30)
    i := 0;
    FOR rec IN
      SELECT ra.profile_id, ra.unit_id, ra.monthly_payment_aed
      FROM public.resident_assignments ra
      WHERE ra.owner_id = v_uid AND ra.tenure = 'Tenant'
      ORDER BY ra.unit_id
      LIMIT 30
    LOOP
      i := i + 1;
      inv_due     := current_date + 15 + (i % 15);
      inv_created := current_date - 5;
      inv_amount  := COALESCE(rec.monthly_payment_aed, 9000);
      INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
        VALUES ('RNT-2026-' || lpad((200+i)::text, 5, '0'), rec.unit_id, rec.profile_id,
                'Monthly rent', inv_amount, 'Pending', inv_due, inv_created, v_uid);
    END LOOP;

    -- Overdue (20)
    i := 0;
    FOR rec IN
      SELECT ra.profile_id, ra.unit_id, ra.monthly_payment_aed
      FROM public.resident_assignments ra
      WHERE ra.owner_id = v_uid AND ra.tenure = 'Tenant'
      ORDER BY ra.unit_id DESC
      LIMIT 20
    LOOP
      i := i + 1;
      inv_due     := current_date - 30 - (i % 30);
      inv_created := inv_due - 10;
      inv_amount  := COALESCE(rec.monthly_payment_aed, 9000);
      INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
        VALUES ('RNT-2026-' || lpad((300+i)::text, 5, '0'), rec.unit_id, rec.profile_id,
                'Monthly rent', inv_amount, 'Overdue', inv_due, inv_created, v_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 8. Visits (15 — today + tomorrow, mixed statuses)
  -- =========================================================================
  DECLARE
    visit_names text[] := ARRAY[
      'Eric Lambert','DHL Express','Talabat','Patricia Romano','AquaFix Plumbing',
      'John Smith','Aramex Delivery','Anna Müller','Spark Electric','Stefan Hartmann',
      'Marco Rossi','Noon Express','Yuki Tanaka','Pierre Dubois','Wei Chen'
    ];
    visit_types text[] := ARRAY['Resident Guest','Delivery','Delivery','Resident Guest','Service Vendor',
                                 'Resident Guest','Delivery','Resident Guest','Service Vendor','Resident Guest',
                                 'Resident Guest','Delivery','Resident Guest','Resident Guest','Resident Guest'];
    visit_status text[] := ARRAY['Pre-Approved','On-Premise','Checked-Out','Pre-Approved','On-Premise',
                                  'Pre-Approved','Checked-Out','Pre-Approved','On-Premise','Pre-Approved',
                                  'Pre-Approved','Pre-Approved','Checked-Out','Pre-Approved','Pre-Approved'];
    pool_size int;
    i int;
  BEGIN
    pool_size := array_length(v_unit_pool, 1);
    FOR i IN 1..15 LOOP
      INSERT INTO public.visits (visitor_name, type, status, visit_date, unit_id, owner_id)
        VALUES (visit_names[i], visit_types[i], visit_status[i],
                CASE WHEN i % 3 = 0 THEN current_date + 1 ELSE current_date END,
                v_unit_pool[1 + ((i * 7) % pool_size)], v_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 9. Service requests (15)
  -- =========================================================================
  DECLARE
    sr_cat   text[] := ARRAY['Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC'];
    sr_desc  text[] := ARRAY[
      'Kitchen tap dripping - needs new washer.',
      'Living room ceiling light flickers at night.',
      'AC unit not cooling - master bedroom.',
      'Front door handle loose.',
      'Bathroom shower head leaking.',
      'Power socket sparking - hallway.',
      'Lobby AC compressor noisy.',
      'Kitchen cabinet door fell off hinge.',
      'Toilet flush handle broken.',
      'Bedroom light fixture loose.',
      'Building AC condensate leaking onto balcony.',
      'Window latch broken in living room.',
      'Drainage slow in master bathroom.',
      'Hallway light intermittently off.',
      'Service lift making grinding noise.'
    ];
    sr_stat  text[] := ARRAY['New','In Progress','In Progress','Acknowledged','New','New','In Progress','Acknowledged','New','In Progress','Done','Acknowledged','New','In Progress','New'];
    sr_prio  text[] := ARRAY['Normal','Normal','High','Low','Normal','High','Normal','Low','Normal','Normal','Normal','Low','Normal','Normal','High'];
    pool_size int;
    i int;
  BEGIN
    pool_size := array_length(v_unit_pool, 1);
    FOR i IN 1..15 LOOP
      INSERT INTO public.service_requests (category, description, status, priority, unit_id, owner_id)
        VALUES (sr_cat[i], sr_desc[i], sr_stat[i], sr_prio[i],
                v_unit_pool[1 + ((i * 11) % pool_size)], v_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 10. Reminder + app_state seed rows (per-user composite PK)
  -- =========================================================================
  INSERT INTO public.reminder_settings (id, email_enabled, email_recipients, owner_id)
  VALUES (1, false, ARRAY[]::text[], v_uid)
  ON CONFLICT (id, owner_id) DO NOTHING;

  INSERT INTO public.app_state (id, data, owner_id)
  VALUES ('main', '{}'::jsonb, v_uid)
  ON CONFLICT (id, owner_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'seed_demo_user_portfolio failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
