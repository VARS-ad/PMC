-- Non-PK indexes for the public-schema tables.
-- Most exist to make foreign-key joins cheap; a handful index status / date
-- columns used by the dashboard filters.

CREATE INDEX amenity_bookings_building_idx  ON public.amenity_bookings (building_id);
CREATE INDEX amenity_bookings_date_idx      ON public.amenity_bookings (booking_date);
CREATE INDEX amenity_bookings_resident_idx  ON public.amenity_bookings (resident_profile_id);

CREATE INDEX invoices_resident_idx          ON public.invoices (resident_profile_id);
CREATE INDEX invoices_status_idx            ON public.invoices (status);
CREATE INDEX invoices_unit_idx              ON public.invoices (unit_id);

CREATE INDEX payments_invoice_idx           ON public.payments (invoice_id);

CREATE INDEX resident_assignments_unit_id_idx ON public.resident_assignments (unit_id);

CREATE INDEX resident_documents_profile_idx ON public.resident_documents (profile_id);

CREATE INDEX security_assignments_building_id_idx ON public.security_assignments (building_id);

CREATE INDEX service_requests_resident_idx ON public.service_requests (resident_profile_id);
CREATE INDEX service_requests_status_idx   ON public.service_requests (status);
CREATE INDEX service_requests_unit_idx     ON public.service_requests (unit_id);

CREATE INDEX unit_attachments_unit_id_idx  ON public.unit_attachments (unit_id);

CREATE INDEX units_building_id_idx         ON public.units (building_id);

CREATE INDEX visits_status_idx             ON public.visits (status);
CREATE INDEX visits_unit_id_idx            ON public.visits (unit_id);
CREATE INDEX visits_visit_date_idx         ON public.visits (visit_date);
