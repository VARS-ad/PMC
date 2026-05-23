-- Row-Level Security for every public table.
--
-- Naming convention: <role>_<table>_<action>. The PMC role gets full access
-- via a single ALL policy; residents and security see only their own rows
-- (or rows scoped to their assigned unit / building) via the SECURITY DEFINER
-- helpers in the `private` schema.
--
-- Policies key off auth.jwt()->'app_metadata'->>'role' (NOT a subquery against
-- public.profiles) to avoid infinite recursion. When creating an auth.users row,
-- ALWAYS set app_metadata.role — a NULL role hits every PMC policy as 'not pmc'.

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
ALTER TABLE public.app_state             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenity_bookings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_documents    ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- app_state — single 'main' row, open to anon + authenticated (legacy)
-- ---------------------------------------------------------------------------
CREATE POLICY "Allow read of main row"
  ON public.app_state FOR SELECT TO anon, authenticated
  USING (id = 'main');

CREATE POLICY "Allow insert of main row"
  ON public.app_state FOR INSERT TO anon, authenticated
  WITH CHECK (id = 'main');

CREATE POLICY "Allow update of main row"
  ON public.app_state FOR UPDATE TO anon, authenticated
  USING (id = 'main') WITH CHECK (id = 'main');

-- ---------------------------------------------------------------------------
-- buildings
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_buildings_all
  ON public.buildings FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_buildings_read_own
  ON public.buildings FOR SELECT TO authenticated
  USING (private.is_resident_of_building(auth.uid(), id));

CREATE POLICY security_buildings_read_assigned
  ON public.buildings FOR SELECT TO authenticated
  USING (private.is_security_of_building(auth.uid(), id));

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_units_all
  ON public.units FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_units_read_own
  ON public.units FOR SELECT TO authenticated
  USING (private.is_resident_of_unit(auth.uid(), id));

CREATE POLICY security_units_read_assigned_building
  ON public.units FOR SELECT TO authenticated
  USING (private.is_security_of_building(auth.uid(), building_id));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_profiles_all
  ON public.profiles FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY any_user_read_own_profile
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY any_user_update_own_profile
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY security_read_residents_in_building
  ON public.profiles FOR SELECT TO authenticated
  USING (private.security_can_see_resident(auth.uid(), id));

-- ---------------------------------------------------------------------------
-- resident_assignments
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_resident_assignments_all
  ON public.resident_assignments FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_read_own_assignment
  ON public.resident_assignments FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY security_read_assignments_in_building
  ON public.resident_assignments FOR SELECT TO authenticated
  USING (private.is_security_of_building(auth.uid(), private.unit_building_id(unit_id)));

-- ---------------------------------------------------------------------------
-- security_assignments
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_security_assignments_all
  ON public.security_assignments FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY security_read_own_assignment
  ON public.security_assignments FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- visits
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_visits_all
  ON public.visits FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_visits_read_own
  ON public.visits FOR SELECT TO authenticated
  USING (private.is_resident_of_unit(auth.uid(), unit_id));

CREATE POLICY resident_visits_insert_own
  ON public.visits FOR INSERT TO authenticated
  WITH CHECK (private.is_resident_of_unit(auth.uid(), unit_id));

CREATE POLICY resident_visits_update_own
  ON public.visits FOR UPDATE TO authenticated
  USING      (private.is_resident_of_unit(auth.uid(), unit_id))
  WITH CHECK (private.is_resident_of_unit(auth.uid(), unit_id));

CREATE POLICY security_visits_read_building
  ON public.visits FOR SELECT TO authenticated
  USING (private.is_security_of_building(auth.uid(), private.unit_building_id(unit_id)));

CREATE POLICY security_visits_update_building
  ON public.visits FOR UPDATE TO authenticated
  USING      (private.is_security_of_building(auth.uid(), private.unit_building_id(unit_id)))
  WITH CHECK (private.is_security_of_building(auth.uid(), private.unit_building_id(unit_id)));

-- ---------------------------------------------------------------------------
-- unit_attachments
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_attachments_all
  ON public.unit_attachments FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_attachments_read_own
  ON public.unit_attachments FOR SELECT TO authenticated
  USING (private.is_resident_of_unit(auth.uid(), unit_id));

CREATE POLICY security_attachments_read_building
  ON public.unit_attachments FOR SELECT TO authenticated
  USING (private.is_security_of_building(auth.uid(), private.unit_building_id(unit_id)));

-- ---------------------------------------------------------------------------
-- amenity_bookings
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_amenity_all
  ON public.amenity_bookings FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_amenity_read_building
  ON public.amenity_bookings FOR SELECT TO authenticated
  USING (private.is_resident_of_building(auth.uid(), building_id));

CREATE POLICY resident_amenity_insert_own
  ON public.amenity_bookings FOR INSERT TO authenticated
  WITH CHECK (resident_profile_id = auth.uid());

CREATE POLICY resident_amenity_update_own
  ON public.amenity_bookings FOR UPDATE TO authenticated
  USING      (resident_profile_id = auth.uid())
  WITH CHECK (resident_profile_id = auth.uid());

CREATE POLICY security_amenity_read_building
  ON public.amenity_bookings FOR SELECT TO authenticated
  USING (private.is_security_of_building(auth.uid(), building_id));

-- ---------------------------------------------------------------------------
-- service_requests
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_sr_all
  ON public.service_requests FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_sr_read_own
  ON public.service_requests FOR SELECT TO authenticated
  USING (resident_profile_id = auth.uid());

CREATE POLICY resident_sr_insert_own
  ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (resident_profile_id = auth.uid());

CREATE POLICY resident_sr_update_own_pending
  ON public.service_requests FOR UPDATE TO authenticated
  USING      ((resident_profile_id = auth.uid()) AND (status = ANY (ARRAY['New'::text, 'Acknowledged'::text])))
  WITH CHECK (resident_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_invoices_all
  ON public.invoices FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_invoices_read_own
  ON public.invoices FOR SELECT TO authenticated
  USING (resident_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_payments_all
  ON public.payments FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_payments_read_own
  ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = payments.invoice_id AND i.resident_profile_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- resident_documents
-- ---------------------------------------------------------------------------
CREATE POLICY pmc_resident_docs_all
  ON public.resident_documents FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_docs_read_own
  ON public.resident_documents FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
