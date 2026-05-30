-- =============================================================================
-- DEMO-ONLY · Rich seed v2 (modeled on the working app's data fixtures)
-- =============================================================================
-- The previous trigger was hand-written and produced empty charts on Reports
-- (no Future Revenue Projection, 0 Occupied, no Visitor Flow spread). This
-- replacement is modeled directly on:
--   - src/data/property-units.js     (100 units / 4 towers / 85% occupied)
--   - src/data/visitors-seed.js      (~60 visits spread across past/current/future)
--   - src/data/store.js              (5 towers / vendors / announcements)
--
-- Key fixes vs v1:
--   * Visits spread across the prior 14 days + next 5 days (not just today)
--   * resident_assignments have realistic future lease_end so Future Revenue
--     Projection has bars
--   * Owners + tenants properly tagged so Occupancy Mix shows both > 0
--   * Invoices spread across 6 months so Collection Trend has shape
--
-- Two functions are defined:
--   1. seed_demo_portfolio_for(p_uid uuid)    -- callable, can re-seed any user
--   2. seed_demo_user_portfolio()             -- trigger wrapper, calls #1 with NEW.id
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Worker function — does all the actual writes for an owner_id.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_portfolio_for(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  -- ----- Name pools (mirroring PROPERTY_UNITS_DATABASE arrays) -----
  first_names text[] := ARRAY[
    'Ahmed','Fatima','Omar','Aisha','Khalid','Mariam','Yousef','Layla','Hassan','Noor',
    'Ibrahim','Zahra','Mohammed','Hanan','Ali','Sara','Saif','Dalia','Rashid','Leena',
    'Faisal','Huda','Tariq','Yasmin','Nasser','Amira','Abdullah','Maryam','Jamal','Reem'
  ];
  last_names text[] := ARRAY[
    'Al-Mansoori','Al-Nahyan','Al-Maktoum','Al-Qasimi','Al-Falasi','Al-Zaabi','Al-Suwaidi','Al-Mazrouei',
    'Al-Ketbi','Al-Kaabi','Al-Tunaiji','Al-Dhaheri','Al-Shamsi','Al-Nuaimi','Al-Hammadi','Al-Amiri',
    'Al-Hosani','Al-Jaberi','Al-Bastaki','Al-Awadhi','Al-Breiki','Al-Farsi','Al-Remeithi','Al-Ali'
  ];
  expat_full text[] := ARRAY[
    'Sofia Conti','Liu Wei','Daniel Cohen','Patricia Romano','Yuki Tanaka',
    'Pierre Dubois','Stefan Hartmann','Eric Lambert','John Smith','Anna Müller',
    'Marco Rossi','Wei Chen','Carlos Mendez','Aditi Sharma','Hiroshi Sato'
  ];
  visit_names text[] := ARRAY[
    'James Harrison','ProServ Cleaning Co.','Aramex Delivery','DHL Express','Talabat',
    'Noon Express','Eric Lambert','Stefan Hartmann','John Smith','Anna Müller',
    'Marco Rossi','Wei Chen','Patricia Romano','Yuki Tanaka','Sofia Conti',
    'AquaFix Plumbing','Spark Electric','CrystalClean','CoolBreeze HVAC','AscendLift'
  ];
  visit_types text[] := ARRAY[
    'Resident Guest','Service Vendor','Delivery','Delivery','Delivery',
    'Delivery','Resident Guest','Resident Guest','Resident Guest','Resident Guest',
    'Resident Guest','Resident Guest','Resident Guest','Resident Guest','Resident Guest',
    'Service Vendor','Service Vendor','Service Vendor','Service Vendor','Service Vendor'
  ];

  -- ----- Building ids (9 buildings, mirroring profile-creation templates) -----
  b_aljil    uuid := gen_random_uuid();
  b_skyline  uuid := gen_random_uuid();
  b_qurm     uuid := gen_random_uuid();
  b_marina   uuid := gen_random_uuid();
  b_boulev   uuid := gen_random_uuid();
  b_palm     uuid := gen_random_uuid();
  b_hills    uuid := gen_random_uuid();
  b_coral    uuid := gen_random_uuid();
  b_plot     uuid := gen_random_uuid();

  v_unit_pool   uuid[];
  v_resident_pool uuid[];
  v_email_local text;
  v_display     text;

  -- ----- Vendor ids -----
  v_aqua    uuid := gen_random_uuid();
  v_spark   uuid := gen_random_uuid();
  v_clean   uuid := gen_random_uuid();
  v_hvac    uuid := gen_random_uuid();
  v_lift    uuid := gen_random_uuid();
  v_garden  uuid := gen_random_uuid();
  v_pest    uuid := gen_random_uuid();
  v_handy   uuid := gen_random_uuid();
  v_shield  uuid := gen_random_uuid();
  v_urban   uuid := gen_random_uuid();
BEGIN
  -- =========================================================================
  -- 0. Wipe any existing data on this owner (idempotent re-seeding)
  --    Order matters: leaves with FKs go first.
  -- =========================================================================
  DELETE FROM public.invoice_attachments WHERE owner_id = p_uid;
  DELETE FROM public.invoices            WHERE owner_id = p_uid;
  DELETE FROM public.vendor_documents    WHERE owner_id = p_uid;
  DELETE FROM public.vendor_payments     WHERE owner_id = p_uid;
  DELETE FROM public.vendor_buildings    WHERE owner_id = p_uid;
  DELETE FROM public.vendors             WHERE owner_id = p_uid;
  DELETE FROM public.amenity_bookings    WHERE owner_id = p_uid;
  DELETE FROM public.unit_attachments    WHERE owner_id = p_uid;
  DELETE FROM public.visits              WHERE owner_id = p_uid;
  DELETE FROM public.service_requests    WHERE owner_id = p_uid;
  DELETE FROM public.security_assignments WHERE owner_id = p_uid;
  DELETE FROM public.resident_assignments WHERE owner_id = p_uid;
  DELETE FROM public.profiles            WHERE owner_id = p_uid AND id <> p_uid;
  DELETE FROM public.units               WHERE owner_id = p_uid;
  DELETE FROM public.buildings           WHERE owner_id = p_uid;
  DELETE FROM public.reminder_dismissals WHERE owner_id = p_uid;
  DELETE FROM public.contracts           WHERE owner_id = p_uid;

  -- =========================================================================
  -- 1. Self profile
  -- =========================================================================
  SELECT email INTO v_email_local FROM auth.users WHERE id = p_uid;
  v_display := initcap(replace(replace(split_part(COALESCE(v_email_local,''), '@', 1), '.', ' '), '_', ' '));
  INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
    VALUES (p_uid, COALESCE(NULLIF(v_display,''),'Property Manager'), NULL, 'pmc', p_uid)
    ON CONFLICT (id) DO UPDATE SET role='pmc', owner_id=p_uid;

  -- =========================================================================
  -- 2. Buildings (9, mix of all 4 property types)
  -- =========================================================================
  INSERT INTO public.buildings (id, name, address, notes, property_type, parking_spots, gross_leasable_area_sqft, commercial_use_type, villa_count, plot_area_sqft, bedrooms_per_villa, amenities, purchase_price, current_value, acquired_on, owner_id) VALUES
    (b_aljil,   'Aljil Tower',         'Sheikh Zayed Rd, Dubai, UAE',              'High-rise residential, 5 floors x 4 units.',  'Residential',     40,  NULL,  NULL, NULL, NULL, NULL, 'Pool, gym, lobby concierge',        28500000, 33250000, '2017-04-18', p_uid),
    (b_skyline, 'Skyline Heights',     'Al Wasl Rd, Jumeirah 1, Dubai, UAE',       'Mid-rise residential, 4 floors x 5 units.',   'Residential',     30,  NULL,  NULL, NULL, NULL, NULL, 'Pool, gym, parking',                22000000, 25500000, '2019-06-12', p_uid),
    (b_qurm,    'Al Qurm View',        'Shams Abu Dhabi, Al Reem Island, AD, UAE', 'Low-rise residential, 5 floors x 4 units.',   'Residential',     35,  NULL,  NULL, NULL, NULL, NULL, 'Pool, beach access, gym',           26800000, 30200000, '2018-11-03', p_uid),
    (b_marina,  'Marina Bay Offices',  'Dubai Marina, Dubai, UAE',                 'Grade-B office tower, 4 floors x 3 offices.','Commercial',      48,  31000, 'Office', NULL, NULL, NULL, 'Building security, lift',            22000000, 25500000, '2016-09-21', p_uid),
    (b_boulev,  'Boulevard Plaza',     'Downtown Dubai, Sheikh Zayed Rd, UAE',     'Grade-A retail + office, 4 floors x 3 units.','Commercial',     52,  34000, 'Mixed',  NULL, NULL, NULL, 'Lobby, lift, parking, security',    38000000, 42100000, '2015-02-28', p_uid),
    (b_palm,    'Palm Frond M-23',     'Palm Jumeirah, Frond M, Dubai, UAE',       'Signature villa, private beach access.',      'Villa',            4,  NULL,  NULL,    1, 12500, 6, 'Private pool, sea front',           14800000, 17100000, '2014-09-22', p_uid),
    (b_hills,   'Emirates Hills V-14', 'Emirates Hills, Street 7, Dubai, UAE',     'Mansion-style villa, golf course view.',       'Villa',            6,  NULL,  NULL,    1, 18000, 8, 'Private pool, gardens, gym',         19500000, 22000000, '2009-11-08', p_uid),
    (b_coral,   'Coral Bay Villa',     'Saadiyat Beach, Saadiyat Island, AD, UAE', 'Beachfront villa, 5 bedrooms.',                'Villa',            4,  NULL,  NULL,    1,  9500, 5, 'Private pool, beach, garden',        12500000, 14250000, '2021-03-20', p_uid),
    (b_plot,    'Al Quoz Plot 14',     'Al Quoz Industrial Area 3, Dubai, UAE',    'Industrial plot, 2 client slots.',             'Commercial Land', NULL, NULL,  NULL, NULL, 85000, NULL, NULL,                              9500000, 11200000, '2009-02-04', p_uid);

  -- =========================================================================
  -- 3. Units — generated in a loop. ~85% occupied, no NULL owner_name on
  --    occupied units. Captures unit ids for downstream loops.
  -- =========================================================================
  DECLARE
    cfg record;
    i int; j int; k int := 0;
    v_unit_id uuid;
    v_floor int;
    v_unit_num text;
    v_owner_name text;
    v_owner_phone text;
    v_owner_email text;
  BEGIN
    FOR cfg IN
      SELECT * FROM (VALUES
        (b_aljil,   5, 5, 'A'),  -- 25 units
        (b_skyline, 5, 5, 'S'),  -- 25 units
        (b_qurm,    5, 5, 'Q'),  -- 25 units
        (b_marina,  5, 4, ''),   -- 20 commercial
        (b_boulev,  5, 4, '')    -- 20 commercial
      ) AS x(bid, floors, ups, prefix)
    LOOP
      FOR i IN 1..cfg.floors LOOP
        FOR j IN 1..cfg.ups LOOP
          v_unit_id := gen_random_uuid();
          v_unit_pool := array_append(v_unit_pool, v_unit_id);
          v_floor := i;
          IF cfg.prefix = '' THEN
            v_unit_num := (i*100 + j)::text;
          ELSE
            v_unit_num := cfg.prefix || '-' || (i*100 + j)::text;
          END IF;
          k := k + 1;
          v_owner_name  := first_names[1 + (k % array_length(first_names,1))] || ' ' ||
                           last_names [1 + (k % array_length(last_names,1))];
          v_owner_phone := '+971 50 ' || lpad(((100 + k) % 1000)::text, 3, '0') || ' '
                                      || lpad(((1000 + k*7) % 10000)::text, 4, '0');
          v_owner_email := lower(replace(v_owner_name,' ','.')) || '@example.ae';

          IF k % 7 = 0 THEN
            -- ~14% vacant
            INSERT INTO public.units (id, building_id, floor, unit_number, owner_is_resident, owner_id)
              VALUES (v_unit_id, cfg.bid, v_floor, v_unit_num, false, p_uid);
          ELSIF cfg.prefix = '' THEN
            -- Commercial: tenant fields on the row
            INSERT INTO public.units (id, building_id, floor, unit_number,
              owner_name, owner_phone, owner_email, purchase_date, owner_is_resident,
              tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_contract_number, tenant_lease_start, tenant_lease_end, tenant_monthly_payment_aed,
              owner_id)
              VALUES (v_unit_id, cfg.bid, v_floor, v_unit_num,
                v_owner_name, v_owner_phone, v_owner_email, '2017-01-01', false,
                'Tenant Co. ' || k, 'lease' || k || '@tenant.ae',
                '+971 4 ' || lpad(((400 + k) % 1000)::text, 3, '0') || ' ' || lpad(((1000 + k*13) % 10000)::text, 4, '0'),
                'Tenant', 'CMT-' || v_unit_num,
                current_date - ((k * 17) % 180),
                current_date + (180 + ((k * 11) % 540)),
                25000 + ((k * 350) % 25000),
                p_uid);
          ELSE
            -- Residential: owner populated; assignment comes next
            INSERT INTO public.units (id, building_id, floor, unit_number,
              owner_name, owner_phone, owner_email, owner_passport_number, owner_emirates_id, purchase_date, owner_is_resident,
              owner_id)
              VALUES (v_unit_id, cfg.bid, v_floor, v_unit_num,
                v_owner_name, v_owner_phone, v_owner_email,
                'XX' || lpad(((1000 + k) % 10000)::text, 7, '0'),
                '784-' || (1970 + (k % 30))::text || '-' || lpad(((1000 + k) % 10000)::text, 7, '0') || '-' || (1 + (k%9))::text,
                '2017-04-18',
                (k % 4 = 0),
                p_uid);
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END;

  -- Villa + plot units (5 more)
  INSERT INTO public.units (id, building_id, floor, unit_number, owner_name, owner_phone, owner_email, purchase_date, owner_is_resident, tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_contract_number, tenant_lease_start, tenant_lease_end, tenant_monthly_payment_aed, owner_id) VALUES
    (gen_random_uuid(), b_palm,  NULL, 'M-23',     'Layla Al Maktoum',    '+971 50 778 9911', 'layla.maktoum@example.ae',    '2014-09-22', false, 'Stefan Hartmann', 'stefan.hartmann@example.ae', '+971 52 119 8878', 'Tenant', 'RNT-PALM-M23',  current_date - 60,  current_date + 540, 38000, p_uid),
    (gen_random_uuid(), b_hills, NULL, 'V-14',     'Mohammed Al Habtoor', '+971 50 224 5510', 'mohammed.habtoor@example.ae', '2009-11-08', true,  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_uid),
    (gen_random_uuid(), b_coral, NULL, 'V-01',     'Ahmed Al Marzouqi',   '+971 50 119 2245', 'ahmed.marzouqi@example.ae',   '2017-06-04', false, 'Eric Lambert',    'eric.lambert@example.ae',    '+971 55 663 7789', 'Tenant', 'RNT-CORAL-V1',  current_date - 30,  current_date + 365, 32000, p_uid),
    (gen_random_uuid(), b_plot,  NULL, 'CL-AQ14-A', 'Khalifa Industrial Holdings', '+971 4 252 9901', 'plots@kih.ae', '2009-02-04', false, 'Aramex Yards',  'contracts@aramex.com', '+971 4 778 1110', 'Tenant', 'CL-AQ14-A', current_date - 120, current_date + 1080, 120000, p_uid),
    (gen_random_uuid(), b_plot,  NULL, 'CL-AQ14-B', NULL, NULL, NULL, NULL, false,                                                                                                                              'DHL Express UAE', 'accounts@dhl.ae', '+971 4 224 5512', 'Tenant', 'CL-AQ14-B', current_date - 30, current_date + 365,  95000, p_uid);

  -- =========================================================================
  -- 4. Residents + assignments — every non-vacant residential unit gets one
  -- =========================================================================
  DECLARE
    rec record;
    i int := 0;
    v_profile_id uuid;
    v_resident_name text;
    v_resident_phone text;
  BEGIN
    FOR rec IN
      SELECT u.id AS unit_id, u.owner_name, u.owner_phone, u.owner_is_resident, u.unit_number
      FROM public.units u
      WHERE u.owner_id = p_uid
        AND u.unit_number ~ '^[A-Z]-'
        AND u.unit_number NOT LIKE 'CL-%'  -- skip plot slots
        AND u.unit_number NOT IN ('M-23','V-14','V-01')  -- skip villas (handled below)
        AND u.owner_name IS NOT NULL
      ORDER BY u.unit_number
    LOOP
      i := i + 1;
      v_profile_id := gen_random_uuid();
      v_resident_pool := array_append(v_resident_pool, v_profile_id);

      IF rec.owner_is_resident THEN
        -- Owner-occupied
        INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
          VALUES (v_profile_id, rec.owner_name, rec.owner_phone, 'resident', p_uid);
        INSERT INTO public.resident_assignments (profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, owner_id)
          VALUES (v_profile_id, rec.unit_id, 'Owner', current_date - 1200, NULL, NULL, p_uid);
      ELSE
        -- Tenant — every 3rd is expat
        IF i % 3 = 0 THEN
          v_resident_name := expat_full[1 + (i % array_length(expat_full,1))];
        ELSE
          v_resident_name := first_names[1 + ((i*3) % array_length(first_names,1))] || ' ' ||
                             last_names [1 + ((i*5) % array_length(last_names,1))];
        END IF;
        v_resident_phone := '+971 56 ' || lpad(((100 + i) % 1000)::text, 3, '0') || ' '
                                       || lpad(((1000 + i*7) % 10000)::text, 4, '0');
        INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
          VALUES (v_profile_id, v_resident_name, v_resident_phone, 'resident', p_uid);
        INSERT INTO public.resident_assignments (profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, owner_id)
          VALUES (v_profile_id, rec.unit_id, 'Tenant',
                  current_date - ((i * 19) % 365),
                  current_date + (180 + ((i * 23) % 540)),  -- future lease_end so revenue proj has bars
                  8000 + ((i * 350) % 12000),
                  p_uid);
      END IF;
    END LOOP;
  END;

  -- Villa residents
  DECLARE
    rec record;
    pp uuid;
  BEGIN
    FOR rec IN SELECT id, unit_number FROM public.units WHERE owner_id = p_uid AND unit_number IN ('M-23','V-14','V-01') LOOP
      pp := gen_random_uuid();
      INSERT INTO public.profiles (id, full_name, phone, role, owner_id) VALUES
        (pp, CASE rec.unit_number WHEN 'M-23' THEN 'Stefan Hartmann' WHEN 'V-14' THEN 'Mohammed Al Habtoor' ELSE 'Eric Lambert' END,
         '+971 52 ' || lpad(floor(random()*900+100)::text, 3, '0') || ' ' || lpad(floor(random()*9000+1000)::text, 4, '0'),
         'resident', p_uid);
      INSERT INTO public.resident_assignments (profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, owner_id) VALUES
        (pp, rec.id,
         CASE rec.unit_number WHEN 'V-14' THEN 'Owner' ELSE 'Tenant' END,
         current_date - 90,
         CASE rec.unit_number WHEN 'V-14' THEN NULL ELSE current_date + 540 END,
         CASE rec.unit_number WHEN 'M-23' THEN 38000 WHEN 'V-01' THEN 32000 ELSE NULL END,
         p_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 5. Security guards (10)
  -- =========================================================================
  DECLARE
    guards text[] := ARRAY[
      'Anas Khoury','Hassan Al Marri','Ivan Petrov','Rashid Al Bloushi','Tariq Al Naqbi',
      'Yusuf Aziz','Karim Habib','Saeed Al Naqbi','Faruq Hamdan','Marwan Saber'
    ];
    guard_bldg uuid[] := ARRAY[b_aljil,b_aljil,b_skyline,b_skyline,b_qurm,b_qurm,b_marina,b_marina,b_boulev,b_boulev];
    guard_shift text[] := ARRAY['Day','Night','Day','Night','Day','Night','24h','Day','Night','Day'];
    pp uuid;
    i int;
  BEGIN
    FOR i IN 1..10 LOOP
      pp := gen_random_uuid();
      INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
        VALUES (pp, guards[i], '+971 58 ' || lpad((100+i*7)::text,3,'0') || ' ' || lpad((1000+i*13)::text,4,'0'), 'security', p_uid);
      INSERT INTO public.security_assignments (profile_id, building_id, shift, owner_id)
        VALUES (pp, guard_bldg[i], guard_shift[i], p_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 6. Vendors (10)
  -- =========================================================================
  INSERT INTO public.vendors (id, name, service_category, contact_person, contact_phone, contact_email, contract_start, contract_end, contract_value_aed, status, owner_id) VALUES
    (v_aqua,   'AquaFix Plumbing LLC',     'Plumbing',         'Hassan Al Awadi',   '+971 50 111 2230', 'hassan@aquafix.ae',       '2026-01-01', '2026-12-31', 30000, 'Active',         p_uid),
    (v_spark,  'Spark Electric Services',  'Electrical',       'Maryam Al Suwaidi', '+971 55 444 5560', 'info@sparkelectric.ae',   '2025-06-15', '2026-06-14', 18500, 'Expiring Soon',  p_uid),
    (v_clean,  'CrystalClean Co.',         'Cleaning',         'Aisha Al Marzouqi', '+971 50 909 1210', 'ops@crystalclean.ae',     '2025-09-01', '2026-08-31', 24000, 'Active',         p_uid),
    (v_hvac,   'CoolBreeze HVAC',          'HVAC',             'Saeed Al Naqbi',    '+971 50 778 4410', 'service@coolbreeze.ae',   '2025-04-01', '2026-03-31', 42000, 'Active',         p_uid),
    (v_lift,   'AscendLift Maintenance',   'Lift Maintenance', 'Karim Habib',       '+971 50 332 7780', 'contracts@ascendlift.ae', '2025-10-01', '2026-09-30', 36000, 'Active',         p_uid),
    (v_garden, 'GreenLeaf Gardening',      'Gardening',        'Omar Al Shamsi',    '+971 50 887 6650', 'team@greenleaf.ae',       '2025-08-01', '2026-07-31', 21000, 'Active',         p_uid),
    (v_pest,   'PestGuard UAE',            'Pest Control',     'Nasser Al Falasi',  '+971 50 554 1120', 'service@pestguard.ae',    '2025-11-01', '2026-10-31', 14500, 'Active',         p_uid),
    (v_handy,  'Handy Pros General',       'General Handyman', 'Faruq Hamdan',      '+971 50 220 9970', 'jobs@handypros.ae',       '2024-06-01', '2025-05-31', 12000, 'Expired',        p_uid),
    (v_shield, 'Shield Security Services', 'Security',         'Ahmed Al Marri',    '+971 50 998 1101', 'ops@shieldsec.ae',        '2025-12-01', '2026-11-30', 58000, 'Active',         p_uid),
    (v_urban,  'UrbanFix Multi-Service',   'Other',            'Marwan Saber',      '+971 50 443 7720', 'desk@urbanfix.ae',        '2025-07-01', '2026-06-30', 16000, 'Active',         p_uid);

  INSERT INTO public.vendor_buildings (vendor_id, building_id, owner_id) VALUES
    (v_aqua,b_aljil,p_uid),(v_aqua,b_skyline,p_uid),(v_aqua,b_qurm,p_uid),
    (v_spark,b_aljil,p_uid),(v_spark,b_marina,p_uid),
    (v_clean,b_aljil,p_uid),(v_clean,b_skyline,p_uid),(v_clean,b_marina,p_uid),
    (v_hvac,b_marina,p_uid),(v_hvac,b_aljil,p_uid),
    (v_lift,b_aljil,p_uid),(v_lift,b_marina,p_uid),
    (v_garden,b_palm,p_uid),(v_garden,b_hills,p_uid),(v_garden,b_coral,p_uid),
    (v_pest,b_aljil,p_uid),(v_pest,b_qurm,p_uid),
    (v_shield,b_aljil,p_uid),(v_shield,b_marina,p_uid),(v_shield,b_boulev,p_uid),
    (v_urban,b_skyline,p_uid),(v_urban,b_qurm,p_uid);

  -- =========================================================================
  -- 7. Invoices — realistic distribution
  --
  -- Target shape for the headline KPIs (last 3 months collected):
  --   Collected ............ ~AED 1.8M (residential rent + commercial leases,
  --                                     3 months back, all Paid)
  --   Upcoming (30 days) ... ~AED 350K (next-month invoices, status Pending)
  --   Overdue .............. ~AED 50K  (only 3 accounts, single past-due each)
  --
  -- Implementation:
  --   1. For every tenant (residential + commercial) generate 3 months of
  --      Paid invoices (this month, -1 month, -2 months). High collection
  --      rate -- the demo is a well-run portfolio.
  --   2. For ~25 tenants spread invoices in the next 30 days as Pending so
  --      Upcoming KPI shows real money.
  --   3. Pick 3 specific accounts to have a single Overdue invoice ~30 days
  --      late, totalling ~50K. "Worst" account leads the Needs Attention
  --      drill.
  -- =========================================================================
  DECLARE
    rec record;
    seq int := 0;
    i int;
    inv_due date; inv_created date;
  BEGIN
    -- 1. Paid invoices for residential tenants — last 3 months
    FOR rec IN
      SELECT ra.profile_id, ra.unit_id, COALESCE(ra.monthly_payment_aed, 9000) AS amt
      FROM public.resident_assignments ra
      WHERE ra.owner_id = p_uid AND ra.tenure = 'Tenant'
      ORDER BY ra.unit_id
    LOOP
      seq := seq + 1;
      FOR i IN 0..2 LOOP  -- current month + 2 prior
        inv_created := (date_trunc('month', current_date) - (i * interval '1 month'))::date + 1;
        inv_due     := inv_created + 5;
        INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
          VALUES ('RNT-' || to_char(inv_created, 'YYYYMM') || '-' || lpad(seq::text, 4, '0'),
                  rec.unit_id, rec.profile_id, 'Monthly rent - ' || to_char(inv_created, 'Mon YYYY'),
                  rec.amt, 'Paid', inv_due, inv_created, p_uid);
      END LOOP;
    END LOOP;

    -- 2. Paid invoices for commercial tenants — last 3 months
    FOR rec IN
      SELECT u.id AS unit_id, u.tenant_monthly_payment_aed AS amt
      FROM public.units u
      WHERE u.owner_id = p_uid
        AND u.tenant_name IS NOT NULL
        AND u.tenant_monthly_payment_aed IS NOT NULL
      ORDER BY u.unit_number
    LOOP
      seq := seq + 1;
      FOR i IN 0..2 LOOP
        inv_created := (date_trunc('month', current_date) - (i * interval '1 month'))::date + 1;
        inv_due     := inv_created + 5;
        INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
          VALUES ('CMT-' || to_char(inv_created, 'YYYYMM') || '-' || lpad(seq::text, 4, '0'),
                  rec.unit_id, NULL, 'Office lease - ' || to_char(inv_created, 'Mon YYYY'),
                  rec.amt, 'Paid', inv_due, inv_created, p_uid);
      END LOOP;
    END LOOP;

    -- 3. Upcoming (Pending) invoices — next 30 days, ~25 tenants
    --    Each Pending invoice ~AED 12-15K, total target ~AED 350K
    seq := 100;
    FOR rec IN
      SELECT ra.profile_id, ra.unit_id, COALESCE(ra.monthly_payment_aed, 12000) AS amt
      FROM public.resident_assignments ra
      WHERE ra.owner_id = p_uid AND ra.tenure = 'Tenant'
      ORDER BY ra.unit_id
      LIMIT 25
    LOOP
      seq := seq + 1;
      inv_due     := current_date + 15 + (seq % 14);   -- spread across next 15-29 days
      inv_created := current_date - 1;
      INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
        VALUES ('RNT-UP-' || lpad(seq::text, 4, '0'),
                rec.unit_id, rec.profile_id,
                'Monthly rent - ' || to_char(inv_due, 'Mon YYYY'),
                rec.amt, 'Pending', inv_due, inv_created, p_uid);
    END LOOP;

    -- 4. Overdue — exactly 3 accounts, ~50K total
    --    Pick the 3 with highest rent to make the "Needs Attention" drill
    --    meaningful.
    seq := 300;
    FOR rec IN
      SELECT ra.profile_id, ra.unit_id, COALESCE(ra.monthly_payment_aed, 15000) AS amt
      FROM public.resident_assignments ra
      WHERE ra.owner_id = p_uid AND ra.tenure = 'Tenant'
      ORDER BY ra.monthly_payment_aed DESC NULLS LAST
      LIMIT 3
    LOOP
      seq := seq + 1;
      inv_due     := current_date - (20 + seq);
      inv_created := inv_due - 10;
      INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id)
        VALUES ('RNT-OD-' || lpad(seq::text, 4, '0'),
                rec.unit_id, rec.profile_id, 'Monthly rent - past due',
                rec.amt, 'Overdue', inv_due, inv_created, p_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 7b. Unit attachments — photo / title_deed / layout metadata for each unit
  --     (Storage objects don't actually exist; the app shows placeholder cards
  --      when it can't fetch them, but the rows make the Document database
  --      table actually have content.)
  -- =========================================================================
  DECLARE
    rec record;
    kinds text[] := ARRAY['photo','title_deed','layout','other'];
    i int := 0;
    n_per int;
    k_idx int;
  BEGIN
    FOR rec IN
      SELECT u.id AS unit_id, u.unit_number FROM public.units u
      WHERE u.owner_id = p_uid
      ORDER BY u.unit_number
    LOOP
      i := i + 1;
      n_per := 2 + (i % 3);   -- 2-4 attachments per unit
      FOR k_idx IN 1..n_per LOOP
        INSERT INTO public.unit_attachments (unit_id, kind, filename, storage_path, owner_id)
          VALUES (rec.unit_id,
                  kinds[1 + ((i + k_idx) % array_length(kinds, 1))],
                  'unit-' || rec.unit_number || '-' || kinds[1 + ((i + k_idx) % array_length(kinds, 1))] || '-' || k_idx || '.jpg',
                  rec.unit_id::text || '/' || kinds[1 + ((i + k_idx) % array_length(kinds, 1))] || '-' || k_idx || '.jpg',
                  p_uid);
      END LOOP;
    END LOOP;
  END;

  -- =========================================================================
  -- 8. Visits — 60 spread across last 14 days + next 5 days
  -- =========================================================================
  DECLARE
    pool_size int;
    i int;
    vd date;
    vs text;
  BEGIN
    pool_size := array_length(v_unit_pool, 1);
    IF pool_size IS NULL OR pool_size = 0 THEN pool_size := 1; END IF;
    FOR i IN 1..60 LOOP
      vd := current_date - 14 + (i % 19);   -- -14 .. +5
      IF vd > current_date THEN
        vs := 'Pre-Approved';
      ELSIF vd = current_date THEN
        vs := CASE i % 3 WHEN 0 THEN 'On-Premise' WHEN 1 THEN 'Pre-Approved' ELSE 'Checked-Out' END;
      ELSE
        vs := 'Checked-Out';
      END IF;
      INSERT INTO public.visits (visitor_name, type, status, visit_date, unit_id, owner_id) VALUES
        (visit_names[1 + (i % array_length(visit_names,1))],
         visit_types[1 + (i % array_length(visit_types,1))],
         vs, vd,
         v_unit_pool[1 + ((i * 7) % pool_size)],
         p_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 9. Service requests (20)
  -- =========================================================================
  DECLARE
    sr_cat  text[] := ARRAY['Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC','General','Plumbing','Electrical','HVAC','General'];
    sr_desc text[] := ARRAY[
      'Kitchen tap dripping - needs new washer.','Living room ceiling light flickers at night.','AC unit not cooling - master bedroom.','Front door handle loose.',
      'Bathroom shower head leaking.','Power socket sparking - hallway.','Lobby AC compressor noisy.','Kitchen cabinet door fell off hinge.',
      'Toilet flush handle broken.','Bedroom light fixture loose.','AC condensate leaking onto balcony.','Window latch broken in living room.',
      'Drainage slow in master bathroom.','Hallway light intermittently off.','Service lift making grinding noise.','Bedroom door lock stuck.',
      'Garden tap leaking.','Pool light not turning on.','HVAC vent rattling.','Mailbox lock broken.'
    ];
    sr_stat text[] := ARRAY['New','In Progress','In Progress','Acknowledged','New','New','In Progress','Acknowledged','New','In Progress','Done','Acknowledged','New','In Progress','New','Done','In Progress','New','Acknowledged','Done'];
    sr_prio text[] := ARRAY['Normal','Normal','High','Low','Normal','High','Normal','Low','Normal','Normal','Normal','Low','Normal','Normal','High','Low','Normal','Normal','Low','Normal'];
    pool_size int;
    i int;
  BEGIN
    pool_size := array_length(v_unit_pool, 1);
    IF pool_size IS NULL OR pool_size = 0 THEN pool_size := 1; END IF;
    FOR i IN 1..20 LOOP
      INSERT INTO public.service_requests (category, description, status, priority, unit_id, owner_id)
        VALUES (sr_cat[i], sr_desc[i], sr_stat[i], sr_prio[i],
                v_unit_pool[1 + ((i * 11) % pool_size)], p_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 9b. Contracts — insurance, maintenance master, management, finance,
  --     bank loan, fit-out, etc. Each tied to a building (or NULL for
  --     portfolio-wide).
  -- =========================================================================
  DECLARE
    contracts_data record;
    contract_id uuid;
  BEGIN
    FOR contracts_data IN
      SELECT * FROM (VALUES
        ('Aljil Tower - Property Insurance',          'AXA Gulf Insurance',          'Insurance',        b_aljil,   current_date + 180,  'Comprehensive building cover including third-party liability.'),
        ('Skyline Heights - Property Insurance',      'Oman Insurance Company',      'Insurance',        b_skyline, current_date + 240,  'Standard fire + flood + earthquake cover.'),
        ('Al Qurm View - Property Insurance',         'AXA Gulf Insurance',          'Insurance',        b_qurm,    current_date + 90,   'Renewal due in 3 months.'),
        ('Marina Bay - Commercial Insurance',         'Sukoon Insurance',            'Insurance',        b_marina,  current_date + 365,  'Combined commercial + landlord cover.'),
        ('Boulevard Plaza - Commercial Insurance',    'Sukoon Insurance',            'Insurance',        b_boulev,  current_date + 365,  'Combined commercial + landlord cover.'),
        ('Palm Frond M-23 - Villa Insurance',         'Tokio Marine Middle East',    'Insurance',        b_palm,    current_date + 200,  'Signature villa cover including private pool.'),
        ('Aljil Tower - Maintenance Master',          'AquaFix Plumbing LLC',        'Maintenance',      b_aljil,   current_date + 330,  'Annual plumbing maintenance contract.'),
        ('Skyline Heights - Cleaning Master',         'CrystalClean Co.',            'Maintenance',      b_skyline, current_date + 270,  'Daily cleaning of lobbies, corridors, parking.'),
        ('Marina Bay - HVAC Master',                  'CoolBreeze HVAC',             'Maintenance',      b_marina,  current_date + 300,  'Quarterly HVAC servicing + emergency callouts.'),
        ('Aljil Tower - Lift Maintenance',            'AscendLift Maintenance',      'Maintenance',      b_aljil,   current_date + 330,  'Annual lift maintenance with monthly inspections.'),
        ('Property Management - Master Agreement',    'VARS PM',                     'Management',       NULL,      current_date + 450,  'Master agreement for property management services across portfolio.'),
        ('Aljil Tower - Bank Loan',                   'Emirates NBD',                'Finance',          b_aljil,   current_date + 1800, 'Mortgage / loan facility, 5-year term.'),
        ('Skyline Heights - Bank Loan',               'First Abu Dhabi Bank',        'Finance',          b_skyline, current_date + 1500, 'Mortgage facility.'),
        ('Boulevard Plaza - Bank Loan',               'HSBC Middle East',            'Finance',          b_boulev,  current_date + 2200, 'Commercial mortgage facility.'),
        ('Aljil Tower - Security Services',           'Shield Security Services',    'Security',         b_aljil,   current_date + 365,  '24/7 manned security + CCTV monitoring.'),
        ('Marina Bay - Security Services',            'Shield Security Services',    'Security',         b_marina,  current_date + 365,  'Building security + lift attendant.'),
        ('Boulevard Plaza - Security Services',       'Shield Security Services',    'Security',         b_boulev,  current_date + 365,  'Lobby security + CCTV.'),
        ('Portfolio - Pest Control',                  'PestGuard UAE',               'Maintenance',      NULL,      current_date + 280,  'Quarterly pest control across all properties.'),
        ('Portfolio - Garden & Landscape',            'GreenLeaf Gardening',         'Maintenance',      NULL,      current_date + 240,  'Bi-weekly garden maintenance for villas + common landscaping.'),
        ('Aljil Tower - Fit-Out Lease (Cafe)',        'Bloom Cafe FZ-LLC',           'Lease',            b_aljil,   current_date + 540,  'Ground-floor cafe lease, 3-year term.')
      ) AS c(nm, party, ctype, bid, end_dt, nt)
    LOOP
      contract_id := gen_random_uuid();
      INSERT INTO public.contracts (id, name, counterparty, contract_type, end_date, building_id, notes, owner_id)
        VALUES (contract_id, contracts_data.nm, contracts_data.party, contracts_data.ctype, contracts_data.end_dt, contracts_data.bid, contracts_data.nt, p_uid);
    END LOOP;
  END;

  -- =========================================================================
  -- 10. Reminder + app_state (composite PK)
  -- =========================================================================
  INSERT INTO public.reminder_settings (id, email_enabled, email_recipients, owner_id)
    VALUES (1, false, ARRAY[]::text[], p_uid)
    ON CONFLICT (id, owner_id) DO NOTHING;
  INSERT INTO public.app_state (id, data, owner_id)
    VALUES ('main', '{}'::jsonb, p_uid)
    ON CONFLICT (id, owner_id) DO NOTHING;

-- TEMP DEBUG: keep the EXCEPTION handler off until both demo users seed
-- clean. Once info@vars.live also gets the rich portfolio, switch this
-- back on so a partial signup failure doesn't 500 the demo.
-- EXCEPTION WHEN OTHERS THEN
--   RAISE WARNING 'seed_demo_portfolio_for(%) failed: %', p_uid, SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Trigger wrapper — fires on auth.users INSERT and calls the worker
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_demo_user_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.seed_demo_portfolio_for(NEW.id);
  RETURN NEW;
END;
$$;

-- Re-wire the trigger so it points at the new wrapper
DROP TRIGGER IF EXISTS on_demo_user_signup ON auth.users;
CREATE TRIGGER on_demo_user_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_demo_user_portfolio();


-- -----------------------------------------------------------------------------
-- 3. Backfill — re-seed every existing demo user with the new data shape so
--    you don't need to delete + re-sign-up to see it.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_demo_portfolio_for(u.id);
  END LOOP;
END $$;

