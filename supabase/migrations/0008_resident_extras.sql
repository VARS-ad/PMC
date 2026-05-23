-- Add extra tenant-facing fields to public.profiles for the one-page
-- Resident Statement view + bulk-upload template additions.
--
-- All fields are nullable so existing rows continue to work. PII access
-- is governed by the existing profiles RLS policies (PMC sees all,
-- residents see their own row, security sees residents in their building).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emirates_id              text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name   text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone  text,
  ADD COLUMN IF NOT EXISTS employer                 text,
  ADD COLUMN IF NOT EXISTS occupation               text;

COMMENT ON COLUMN public.profiles.emirates_id IS 'UAE Emirates ID number, e.g. 784-1985-1234567-8.';
COMMENT ON COLUMN public.profiles.emergency_contact_name  IS 'Name of next-of-kin / emergency contact.';
COMMENT ON COLUMN public.profiles.emergency_contact_phone IS 'Phone for the emergency contact.';
COMMENT ON COLUMN public.profiles.employer    IS 'Employer name (optional, used for tenancy compliance).';
COMMENT ON COLUMN public.profiles.occupation  IS 'Job title / occupation (optional).';
