-- Add 'Commercial Land' as a fourth allowed property_type.
--
-- The original check (migration 0007) restricted property_type to
-- Residential / Commercial / Villa. Commercial Land is for raw plots
-- that are leased / managed but have no building structure on them
-- yet (no floors, no units, just the land record).
--
-- Drop the old constraint and recreate with the new enum.

ALTER TABLE public.buildings
  DROP CONSTRAINT IF EXISTS buildings_property_type_check;

ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_property_type_check
  CHECK (property_type = ANY (ARRAY[
    'Residential'::text,
    'Commercial'::text,
    'Villa'::text,
    'Commercial Land'::text
  ]));
