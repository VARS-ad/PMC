-- =============================================================================
-- DEMO-ONLY · Scope global UNIQUE constraints to per-owner
-- =============================================================================
-- The working project assumes a single PMC: one Aljil Tower, one invoice
-- number RNT-2026-00101, etc. So buildings.name and invoices.invoice_number
-- have global UNIQUE constraints.
--
-- On the demo project every signed-up user has their own portfolio; we want
-- every demo user to be able to have their own "Aljil Tower" and their own
-- "RNT-2026-00101" without collisions. Drop the global UNIQUE and replace
-- with a composite UNIQUE that pairs the field with owner_id.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- buildings.name
ALTER TABLE public.buildings DROP CONSTRAINT IF EXISTS buildings_name_key;
ALTER TABLE public.buildings DROP CONSTRAINT IF EXISTS buildings_name_owner_id_key;
ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_name_owner_id_key UNIQUE (name, owner_id);

-- invoices.invoice_number
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_owner_id_key;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_number_owner_id_key UNIQUE (invoice_number, owner_id);
