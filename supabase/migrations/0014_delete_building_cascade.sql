-- Cascade-delete a building plus every dependent row in one transaction.
-- The FKs from invoices / visits / service_requests / resident_assignments
-- / amenity_bookings / unit_attachments → units don't ON DELETE CASCADE,
-- so a plain "DELETE FROM buildings" fails for any building that has
-- history. Walk the dependency tree here.
--
-- PMC-only: a non-PMC caller would just silently no-op via RLS, but we
-- gate up front so the UI gets a clear error.
CREATE OR REPLACE FUNCTION public.delete_building_cascade(p_building_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role         text;
  v_unit_count   int;
  v_assignment_count int;
  v_invoice_count   int;
  v_visit_count     int;
  v_sr_count        int;
  v_attachment_count int;
  v_booking_count   int;
BEGIN
  v_role := COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '');
  IF v_role <> 'pmc' THEN
    RAISE EXCEPTION 'Only PMC can delete buildings (role=%)', v_role;
  END IF;

  SELECT COUNT(*) INTO v_unit_count FROM public.units WHERE building_id = p_building_id;

  WITH unit_ids AS (SELECT id FROM public.units WHERE building_id = p_building_id),
       del_ra  AS (DELETE FROM public.resident_assignments WHERE unit_id IN (SELECT id FROM unit_ids) RETURNING 1)
  SELECT COUNT(*) INTO v_assignment_count FROM del_ra;

  WITH unit_ids AS (SELECT id FROM public.units WHERE building_id = p_building_id),
       del_i   AS (DELETE FROM public.invoices WHERE unit_id IN (SELECT id FROM unit_ids) RETURNING 1)
  SELECT COUNT(*) INTO v_invoice_count FROM del_i;

  WITH unit_ids AS (SELECT id FROM public.units WHERE building_id = p_building_id),
       del_v   AS (DELETE FROM public.visits WHERE unit_id IN (SELECT id FROM unit_ids) RETURNING 1)
  SELECT COUNT(*) INTO v_visit_count FROM del_v;

  WITH unit_ids AS (SELECT id FROM public.units WHERE building_id = p_building_id),
       del_sr  AS (DELETE FROM public.service_requests WHERE unit_id IN (SELECT id FROM unit_ids) RETURNING 1)
  SELECT COUNT(*) INTO v_sr_count FROM del_sr;

  WITH unit_ids AS (SELECT id FROM public.units WHERE building_id = p_building_id),
       del_ua  AS (DELETE FROM public.unit_attachments WHERE unit_id IN (SELECT id FROM unit_ids) RETURNING 1)
  SELECT COUNT(*) INTO v_attachment_count FROM del_ua;

  -- amenity_bookings has BOTH unit_id and building_id FKs — clear both.
  WITH unit_ids AS (SELECT id FROM public.units WHERE building_id = p_building_id),
       del_ab  AS (
         DELETE FROM public.amenity_bookings
         WHERE unit_id IN (SELECT id FROM unit_ids) OR building_id = p_building_id
         RETURNING 1
       )
  SELECT COUNT(*) INTO v_booking_count FROM del_ab;

  -- Building-level dependents.
  DELETE FROM public.vendor_buildings     WHERE building_id = p_building_id;
  DELETE FROM public.security_assignments WHERE building_id = p_building_id;
  DELETE FROM public.contracts            WHERE building_id = p_building_id;

  -- Now the units, then the building itself.
  DELETE FROM public.units      WHERE building_id = p_building_id;
  DELETE FROM public.buildings  WHERE id = p_building_id;

  RETURN jsonb_build_object(
    'units',       v_unit_count,
    'assignments', v_assignment_count,
    'invoices',    v_invoice_count,
    'visits',      v_visit_count,
    'srs',         v_sr_count,
    'attachments', v_attachment_count,
    'bookings',    v_booking_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_building_cascade(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_building_cascade(uuid) IS
  'Cascade-delete a building and every dependent row (units, invoices, visits, service requests, resident assignments, amenity bookings, vendor links, security assignments, contracts). PMC-only.';
