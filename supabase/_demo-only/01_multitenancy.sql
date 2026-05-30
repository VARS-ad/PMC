-- =============================================================================
-- DEMO-ONLY · Multitenancy + missing tables
-- =============================================================================
-- Run this ONCE on the demo Supabase project (ref ftcdcyigzownsabzqsoi) AFTER
-- the base schema bootstrap (_demo-bootstrap/00_combined_schema.sql).
--
-- What it does:
--   1. Creates the three tables that exist on the working project but were
--      never captured as migrations (reminder_settings, reminder_dismissals,
--      contracts) so the demo matches what the app expects.
--   2. Adds an `owner_id uuid REFERENCES auth.users(id)` column with a
--      DEFAULT of auth.uid() to every user-data table — every new row is
--      automatically tagged to the signed-in user.
--   3. Drops every existing RLS policy in public.* and replaces them with
--      SELECT / INSERT / UPDATE policies scoped to owner_id = auth.uid().
--      No DELETE policies are created, so RLS rejects every DELETE from a
--      logged-in user. Service-role keys (server-side) can still delete.
--   4. Relaxes get_emails_for_profiles() so demo users can resolve emails
--      for profiles they own (no "must be PMC" gate; on demo, every signed
--      -in user IS effectively their own PMC).
--
-- NOT a no-op: if you re-run this on the working Supabase you would lose
-- the role-based RLS policies. Only run on demo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tables that drifted off the migration set
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reminder_settings (
  id                  integer PRIMARY KEY,
  email_enabled       boolean NOT NULL DEFAULT false,
  email_recipients    text[]  NOT NULL DEFAULT ARRAY[]::text[],
  digest_cadence      text    NOT NULL DEFAULT 'daily',
  digest_days_of_week text[]  NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  digest_time_local   text    NOT NULL DEFAULT '09:00',
  digest_timezone     text    NOT NULL DEFAULT 'Asia/Dubai',
  digest_categories   text[]  NOT NULL DEFAULT ARRAY['payments','leases','srs','contracts','ops'],
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reminder_dismissals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type       text NOT NULL,
  source_id         uuid,
  lead_days         integer NOT NULL,
  dismissal_anchor  date,
  dismissed_at      timestamptz NOT NULL DEFAULT now(),
  dismissed_by      uuid,
  note              text
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  counterparty  text,
  contract_type text,
  end_date      date,
  building_id   uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminder_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_dismissals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts            ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 1b. Loosen the profiles.id FK so seeded residents don't need auth.users
-- -----------------------------------------------------------------------------
-- On the working project profiles.id REFERENCES auth.users(id) because every
-- person who can log in (PMC, resident, security) has an auth account. On
-- demo, the only auth user is the signed-in PMC; the resident / security
-- profiles in their seeded portfolio are display-only and never log in.
-- Drop the FK so the seed trigger can insert them with freshly-generated
-- UUIDs.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;


-- -----------------------------------------------------------------------------
-- 2. Add owner_id everywhere
-- -----------------------------------------------------------------------------
-- One ALTER per table; IF NOT EXISTS so re-running is safe.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'buildings','units','profiles',
    'resident_assignments','security_assignments',
    'visits','unit_attachments','amenity_bookings',
    'service_requests','invoices',
    'vendors','vendor_buildings','vendor_payments','vendor_documents',
    'invoice_attachments',
    'reminder_settings','reminder_dismissals','contracts',
    'app_state'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_owner_id ON public.%I (owner_id)',
      t, t
    );
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 3. Drop every existing policy on public.*
-- -----------------------------------------------------------------------------
-- The working project's policies are role-based via app_metadata.role; demo
-- replaces them with owner_id-based policies. Wipe the slate.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 4. New policies — SELECT / INSERT / UPDATE only, scoped by owner_id
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'buildings','units','profiles',
    'resident_assignments','security_assignments',
    'visits','unit_attachments','amenity_bookings',
    'service_requests','invoices',
    'vendors','vendor_buildings','vendor_payments','vendor_documents',
    'invoice_attachments',
    'reminder_settings','reminder_dismissals','contracts',
    'app_state'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- SELECT
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (owner_id = auth.uid())',
      'demo_own_select_' || t, t
    );
    -- INSERT (default auth.uid() covers new rows; WITH CHECK keeps it honest)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid())',
      'demo_own_insert_' || t, t
    );
    -- UPDATE
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())',
      'demo_own_update_' || t, t
    );
    -- NOTE: no DELETE policy on purpose. RLS rejects every DELETE for
    -- authenticated users in demo.
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 5. Relax the email-resolver helper
-- -----------------------------------------------------------------------------
-- The working version's get_emails_for_profiles() returns nothing unless
-- the caller's JWT has app_metadata.role='pmc'. On demo every signed-in
-- user IS effectively their own PMC, so the check is "this user owns the
-- profile they're asking about".

CREATE OR REPLACE FUNCTION public.get_emails_for_profiles(p_ids uuid[])
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT u.id, u.email::text
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.id = ANY(p_ids)
      AND p.owner_id = auth.uid();
END;
$$;
