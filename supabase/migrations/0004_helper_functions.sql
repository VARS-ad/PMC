-- SECURITY DEFINER helper functions in the `private` schema. RLS policies on
-- public.* tables call these to avoid the infinite-recursion trap you hit when
-- a policy on table X subqueries table Y whose policy in turn subqueries X.
-- All of them are STABLE, run with the function owner's permissions, and have
-- search_path locked to '' so an attacker cannot shadow public tables.

-- --- private schema helpers --------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_resident_of_unit(p_profile_id uuid, p_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.resident_assignments
    WHERE profile_id = p_profile_id AND unit_id = p_unit_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_resident_of_building(p_profile_id uuid, p_building_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.resident_assignments ra
    JOIN public.units u ON u.id = ra.unit_id
    WHERE ra.profile_id = p_profile_id AND u.building_id = p_building_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_security_of_building(p_profile_id uuid, p_building_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.security_assignments
    WHERE profile_id = p_profile_id AND building_id = p_building_id
  );
$$;

CREATE OR REPLACE FUNCTION private.security_can_see_resident(p_security_id uuid, p_resident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resident_assignments ra
    JOIN public.units                u  ON u.id = ra.unit_id
    JOIN public.security_assignments sa ON sa.building_id = u.building_id
    WHERE ra.profile_id = p_resident_id AND sa.profile_id = p_security_id
  );
$$;

CREATE OR REPLACE FUNCTION private.unit_building_id(p_unit_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT building_id FROM public.units WHERE id = p_unit_id;
$$;

CREATE OR REPLACE FUNCTION private.user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

-- --- public schema helper ----------------------------------------------------

-- Returns auth.users.email for the given profile IDs, but only when the caller
-- has app_metadata.role = 'pmc'. PostgREST cannot reach auth.users directly, so
-- the PMC admin UI calls this RPC to display resident / guard email addresses.
CREATE OR REPLACE FUNCTION public.get_emails_for_profiles(p_ids uuid[])
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'pmc' THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u WHERE u.id = ANY(p_ids);
END;
$$;
