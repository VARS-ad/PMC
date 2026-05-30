-- Columns on public.buildings that the app uses but were never captured
-- as a migration — they were added by hand in the dashboard on the
-- original working project. Spinning up a fresh project (the demo
-- Supabase) fails without them because later migrations (0011) and
-- the app's SELECT lists both reference them.
--
-- All ADDs use IF NOT EXISTS so re-running this on the working project
-- is a no-op.

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS property_type                 text,
  ADD COLUMN IF NOT EXISTS commercial_use_type           text,
  ADD COLUMN IF NOT EXISTS gross_leasable_area_sqft      numeric,
  ADD COLUMN IF NOT EXISTS parking_spots                 integer,
  ADD COLUMN IF NOT EXISTS service_charge_rate_aed_per_sqft numeric,
  ADD COLUMN IF NOT EXISTS villa_count                   integer,
  ADD COLUMN IF NOT EXISTS plot_area_sqft                numeric,
  ADD COLUMN IF NOT EXISTS bedrooms_per_villa            integer,
  ADD COLUMN IF NOT EXISTS amenities                     text;

-- Default property_type when null so the 0011 CHECK constraint can be
-- safely added without rejecting existing rows.
UPDATE public.buildings SET property_type = 'Residential' WHERE property_type IS NULL;

COMMENT ON COLUMN public.buildings.property_type    IS 'Residential | Commercial | Villa | Commercial Land — the four supported asset categories.';
COMMENT ON COLUMN public.buildings.commercial_use_type IS 'Office | Retail | Mixed (only meaningful when property_type = Commercial).';
COMMENT ON COLUMN public.buildings.gross_leasable_area_sqft IS 'Total leasable area in sqft (Commercial buildings).';
COMMENT ON COLUMN public.buildings.parking_spots    IS 'Number of parking spots in the building.';
COMMENT ON COLUMN public.buildings.service_charge_rate_aed_per_sqft IS 'Service charge rate in AED per sqft per year (used to compute per-unit invoices).';
COMMENT ON COLUMN public.buildings.villa_count      IS 'Number of villas in a Villa-type building / compound.';
COMMENT ON COLUMN public.buildings.plot_area_sqft   IS 'Plot area in sqft for Villa / Commercial Land assets.';
COMMENT ON COLUMN public.buildings.bedrooms_per_villa IS 'Bedrooms per villa (Villa-type assets).';
COMMENT ON COLUMN public.buildings.amenities        IS 'Free-form comma-separated amenity list (pool, gym, parking, etc.).';
