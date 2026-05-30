-- =============================================================================
-- DEMO-ONLY · Fix single-row tables for multi-tenant signup
-- =============================================================================
-- Bug: app_state and reminder_settings each have a single-column primary key
-- (id text / id integer). On the working project that was fine -- one PMC,
-- one row. On the demo project every signed-up user is their own tenant
-- and they all want id='main' / id=1.
--
-- First user to sign up: trigger inserts. Subsequent users: ON CONFLICT (id)
-- DO NOTHING silently swallows the insert -> the new user has no app_state
-- row -> the client tries to upsert -> RLS rejects the UPDATE because
-- owner_id != auth.uid() -> syncStatus flips to "Local only" and the
-- dashboard shows AED 0 everywhere.
--
-- Fix: drop the single-column PK and add a composite (id, owner_id) PK so
-- each owner has their own 'main' / id=1 row.
-- =============================================================================


-- app_state ---------------------------------------------------------------
ALTER TABLE public.app_state
  DROP CONSTRAINT IF EXISTS app_state_pkey;
-- owner_id must be NOT NULL to participate in the PK.
UPDATE public.app_state SET owner_id = (SELECT id FROM auth.users LIMIT 1)
  WHERE owner_id IS NULL;
ALTER TABLE public.app_state
  ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.app_state
  ADD CONSTRAINT app_state_pkey PRIMARY KEY (id, owner_id);


-- reminder_settings -------------------------------------------------------
ALTER TABLE public.reminder_settings
  DROP CONSTRAINT IF EXISTS reminder_settings_pkey;
UPDATE public.reminder_settings SET owner_id = (SELECT id FROM auth.users LIMIT 1)
  WHERE owner_id IS NULL;
ALTER TABLE public.reminder_settings
  ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.reminder_settings
  ADD CONSTRAINT reminder_settings_pkey PRIMARY KEY (id, owner_id);


-- Update the seed trigger to reference the new composite keys ------------
-- Only two lines change; redefining the function in full so the script is
-- self-contained.

CREATE OR REPLACE FUNCTION public.seed_demo_user_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := NEW.id;
  b_skyline uuid := gen_random_uuid();
  b_villa   uuid := gen_random_uuid();
  u_101 uuid := gen_random_uuid();
  u_102 uuid := gen_random_uuid();
  u_103 uuid := gen_random_uuid();
  u_201 uuid := gen_random_uuid();
  u_202 uuid := gen_random_uuid();
  u_203 uuid := gen_random_uuid();
  u_villa uuid := gen_random_uuid();
  p_self    uuid := v_uid;
  p_res1    uuid := gen_random_uuid();
  p_res2    uuid := gen_random_uuid();
  p_res3    uuid := gen_random_uuid();
  p_res4    uuid := gen_random_uuid();
  p_guard1  uuid := gen_random_uuid();
  v_aquafix uuid := gen_random_uuid();
  v_spark   uuid := gen_random_uuid();
  v_display text := initcap(replace(replace(split_part(NEW.email, '@', 1), '.', ' '), '_', ' '));
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, owner_id)
  VALUES (p_self, COALESCE(NULLIF(v_display, ''), 'Property Manager'), NULL, 'pmc', v_uid)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.buildings (id, name, address, notes, property_type, parking_spots, amenities, purchase_price, current_value, acquired_on, owner_id) VALUES
    (b_skyline, 'Skyline Heights',  'Sheikh Zayed Rd, Dubai, UAE',           'Demo residential tower - 3 floors, 3 units per floor.', 'Residential', 18, 'Pool, gym, lobby concierge', 18000000, 21500000, '2019-06-12', v_uid),
    (b_villa,   'Coral Bay Villa',  'Palm Jumeirah, Frond M, Dubai, UAE',    'Demo signature villa with private beach access.',       'Villa',        4, 'Private pool, garden, 5 bedrooms', 12500000, 14250000, '2021-03-20', v_uid);

  INSERT INTO public.units (id, building_id, floor, unit_number,
                            owner_name, owner_phone, owner_email, owner_passport_number, owner_emirates_id, purchase_date, owner_is_resident,
                            tenant_name, tenant_email, tenant_phone, tenant_tenure, tenant_contract_number, tenant_lease_start, tenant_lease_end, tenant_monthly_payment_aed,
                            owner_id) VALUES
    (u_101, b_skyline, 1, 'A-101', 'Khalid Al Mansoori', '+971 50 111 2233', 'khalid.almansoori@example.ae', 'AB1234567', '784-1980-1234567-1', '2018-03-12', true,  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (u_102, b_skyline, 1, 'A-102', 'Mohammed Al Hammadi','+971 55 234 1187', 'mohammed.alhammadi@example.ae','CD7654321', '784-1990-7654321-2', '2019-09-01', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (u_103, b_skyline, 1, 'A-103', 'Mohammed Al Hammadi','+971 55 234 1187', 'mohammed.alhammadi@example.ae','CD7654321', '784-1990-7654321-2', '2019-09-01', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (u_201, b_skyline, 2, 'A-201', 'Layla Al Maktoum',   '+971 50 778 9900', 'layla.maktoum@example.ae',     'MM1122334', '784-1981-1122334-1', '2014-09-22', false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (u_202, b_skyline, 2, 'A-202', 'Hassan Al Awadi',    '+971 50 808 4040', 'hassan.awadi@example.ae',      'GH5566778', '784-1975-5566778-9', '2015-06-20', true,  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (u_203, b_skyline, 2, 'A-203', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_uid),
    (u_villa, b_villa, NULL, 'V-01', 'Mohammed Al Habtoor', '+971 50 224 5500', 'mohammed.habtoor@example.ae', 'HB7788990', '784-1972-7788990-5', '2009-11-08', false,
     'Stefan Hartmann', 'stefan.hartmann@example.ae', '+971 52 119 8877', 'Tenant', 'RNT-PALM-M23', '2026-01-01', '2027-12-31', 38000, v_uid);

  INSERT INTO public.profiles (id, full_name, phone, role, owner_id) VALUES
    (p_res1, 'Reem Al Suwaidi',    '+971 56 887 3300', 'resident', v_uid),
    (p_res2, 'Khalid Al Mansoori', '+971 50 111 2233', 'resident', v_uid),
    (p_res3, 'Hassan Al Awadi',    '+971 50 808 4040', 'resident', v_uid),
    (p_res4, 'Maryam Al Nuaimi',   '+971 55 442 1010', 'resident', v_uid);

  INSERT INTO public.resident_assignments (profile_id, unit_id, tenure, lease_start, lease_end, monthly_payment_aed, owner_id) VALUES
    (p_res2, u_101, 'Owner',  '2018-03-12', NULL,         NULL,  v_uid),
    (p_res1, u_102, 'Tenant', '2026-01-01', '2026-12-31', 12000, v_uid),
    (p_res3, u_202, 'Owner',  '2015-06-20', NULL,         NULL,  v_uid),
    (p_res4, u_201, 'Tenant', '2025-11-01', '2026-10-31', 11500, v_uid);

  INSERT INTO public.profiles (id, full_name, phone, role, owner_id) VALUES
    (p_guard1, 'Anas Khoury', '+971 58 893 0103', 'security', v_uid);
  INSERT INTO public.security_assignments (profile_id, building_id, shift, owner_id) VALUES
    (p_guard1, b_skyline, 'Day', v_uid);

  INSERT INTO public.vendors (id, name, service_category, contact_person, contact_phone, contact_email, contract_start, contract_end, contract_value_aed, status, owner_id) VALUES
    (v_aquafix, 'AquaFix Plumbing LLC',  'Plumbing',   'Hassan Al Awadi',  '+971 50 111 2233', 'hassan@aquafix.ae',    '2026-01-01', '2026-12-31', 30000, 'Active', v_uid),
    (v_spark,   'Spark Electric Services','Electrical','Maryam Al Suwaidi','+971 55 444 5566', 'info@sparkelectric.ae','2025-06-15', '2026-06-14', 18500, 'Active', v_uid);
  INSERT INTO public.vendor_buildings (vendor_id, building_id, owner_id) VALUES
    (v_aquafix, b_skyline, v_uid),
    (v_spark,   b_skyline, v_uid);

  INSERT INTO public.invoices (invoice_number, unit_id, resident_profile_id, description, amount_aed, status, due_date, created_at, owner_id) VALUES
    ('RNT-2026-00101', u_102, p_res1, 'Monthly rent - Jan 2026',          12000, 'Paid',     '2026-01-05', '2025-12-30', v_uid),
    ('SCG-2026-00101', u_101, p_res2, 'Service charge - Q1 2026',         3200,  'Paid',     '2026-01-15', '2026-01-02', v_uid),
    ('RNT-2026-00102', u_102, p_res1, 'Monthly rent - Feb 2026',          12000, 'Pending',  '2026-06-15', '2026-06-01', v_uid),
    ('RNT-2026-00103', u_201, p_res4, 'Monthly rent - Mar 2026',          11500, 'Overdue',  '2026-05-20', '2026-05-01', v_uid),
    ('SCG-2026-00102', u_villa, NULL, 'Service charge - Q2 2026 (villa)', 5800,  'Pending',  '2026-07-10', '2026-06-01', v_uid);

  INSERT INTO public.visits (visitor_name, type, status, visit_date, unit_id, owner_id) VALUES
    ('Eric Lambert',   'Resident Guest', 'Pre-Approved', current_date,        u_201, v_uid),
    ('DHL Express',    'Delivery',       'On-Premise',   current_date,        u_102, v_uid),
    ('John Smith',     'Resident Guest', 'Pre-Approved', current_date + 1,    u_villa, v_uid);

  INSERT INTO public.service_requests (category, description, status, priority, unit_id, owner_id) VALUES
    ('Plumbing',    'Kitchen tap dripping - needs new washer.',     'New',         'Normal', u_102, v_uid),
    ('Electrical',  'Living room ceiling light flickers at night.', 'In Progress', 'Normal', u_201, v_uid),
    ('General',     'Front door handle loose.',                     'Acknowledged','Low',    u_101, v_uid);

  -- Updated for composite PK -- conflicts now respect per-owner uniqueness.
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
