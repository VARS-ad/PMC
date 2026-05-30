-- Migration 0002 defined units.floor as NOT NULL because the original
-- design assumed residential towers with explicit floors. Villas and
-- Commercial Land plots have no floor concept — the bulk-upload writes
-- NULL for those. Relax the constraint.

ALTER TABLE public.units
  ALTER COLUMN floor DROP NOT NULL;
