-- Each unit now carries its own Owner record (the property owner) alongside
-- the resident assignment. The owner is conceptually permanent and survives
-- tenant turnover; the resident assignment can change over time.
--
-- owner_is_resident flags units where the resident IS the owner — used by
-- the UI to render a 'Same as resident' chip rather than duplicating the
-- fields on screen.

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS owner_name             text,
  ADD COLUMN IF NOT EXISTS owner_phone            text,
  ADD COLUMN IF NOT EXISTS owner_email            text,
  ADD COLUMN IF NOT EXISTS owner_passport_number  text,
  ADD COLUMN IF NOT EXISTS owner_emirates_id      text,
  ADD COLUMN IF NOT EXISTS purchase_date          date,
  ADD COLUMN IF NOT EXISTS owner_is_resident      boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.units.owner_name        IS 'Full legal name of the unit owner.';
COMMENT ON COLUMN public.units.owner_phone       IS 'Primary phone for the owner (for invoicing / disputes).';
COMMENT ON COLUMN public.units.owner_email       IS 'Email for the owner.';
COMMENT ON COLUMN public.units.owner_passport_number IS 'Passport number of the owner.';
COMMENT ON COLUMN public.units.owner_emirates_id IS 'UAE Emirates ID of the owner.';
COMMENT ON COLUMN public.units.purchase_date     IS 'Date the owner acquired the unit.';
COMMENT ON COLUMN public.units.owner_is_resident IS 'true when the resident assignment IS the owner — the UI then shows a same-as chip instead of duplicating the fields.';
