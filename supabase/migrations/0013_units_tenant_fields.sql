-- Non-residential property types (Commercial, Villa, Commercial Land) do NOT
-- create Supabase Auth users for their tenants / clients / villa residents.
-- We still need a place to record the contact info that comes in via the
-- bulk-upload spreadsheet, so add denormalised tenant/* columns to units.
--
-- Residential keeps using profiles + resident_assignments + auth.users.
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS tenant_name          text,
  ADD COLUMN IF NOT EXISTS tenant_email         text,
  ADD COLUMN IF NOT EXISTS tenant_phone         text,
  ADD COLUMN IF NOT EXISTS tenant_tenure        text,
  ADD COLUMN IF NOT EXISTS tenant_contract_number text,
  ADD COLUMN IF NOT EXISTS tenant_lease_start   date,
  ADD COLUMN IF NOT EXISTS tenant_lease_end     date,
  ADD COLUMN IF NOT EXISTS tenant_monthly_payment_aed numeric;

COMMENT ON COLUMN public.units.tenant_name          IS 'Non-residential tenant/client/villa-resident display name (denormalised on the unit; no Auth account).';
COMMENT ON COLUMN public.units.tenant_email         IS 'Non-residential tenant/client/villa-resident contact email.';
COMMENT ON COLUMN public.units.tenant_phone         IS 'Non-residential tenant/client/villa-resident contact phone.';
COMMENT ON COLUMN public.units.tenant_tenure        IS 'Owner | Tenant (mirrors resident_assignments.tenure semantics for non-residential).';
COMMENT ON COLUMN public.units.tenant_contract_number IS 'Contract / lease number for non-residential tenants.';
COMMENT ON COLUMN public.units.tenant_lease_start   IS 'Lease start date for non-residential tenants.';
COMMENT ON COLUMN public.units.tenant_lease_end     IS 'Lease end date for non-residential tenants.';
COMMENT ON COLUMN public.units.tenant_monthly_payment_aed IS 'Monthly rent (AED) for non-residential tenants.';
