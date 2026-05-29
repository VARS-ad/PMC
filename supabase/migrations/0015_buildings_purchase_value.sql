-- Landlord-facing additions so yield + capital appreciation can be
-- computed at all. Today the buildings table has no acquisition data
-- so we can't tell whether an asset is performing well — only what's
-- currently being collected.
ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS current_value  numeric,
  ADD COLUMN IF NOT EXISTS acquired_on    date;

COMMENT ON COLUMN public.buildings.purchase_price IS 'Purchase / acquisition price in AED. Used to compute gross + net yield.';
COMMENT ON COLUMN public.buildings.current_value  IS 'Current market value estimate in AED. Used to compute capital appreciation.';
COMMENT ON COLUMN public.buildings.acquired_on    IS 'Date the asset was acquired. Used for hold-period and ROI calculations.';
