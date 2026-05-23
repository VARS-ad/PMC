-- Storage buckets + RLS policies on storage.objects.
--
-- Two private buckets:
--   • unit-attachments   — photos, title deeds, floor plans per unit.
--                          Path convention: {unit_id}/{filename}
--   • resident-documents — emirates ID, passport, tenancy contracts, etc.
--                          Path convention: {profile_id}/{filename}
--
-- Both buckets are private; the app uses signed URLs to serve files.

INSERT INTO storage.buckets (id, name, public)
VALUES ('unit-attachments',   'unit-attachments',   false),
       ('resident-documents', 'resident-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects
-- ---------------------------------------------------------------------------
-- PMC has full access to both buckets. Residents read only files under their
-- own folder (first path segment matches their unit_id or profile id).
-- Security reads only files under units in their assigned building(s).

CREATE POLICY pmc_storage_all
  ON storage.objects FOR ALL TO authenticated
  USING ((bucket_id = 'unit-attachments')
         AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'))
  WITH CHECK ((bucket_id = 'unit-attachments')
              AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'));

CREATE POLICY pmc_resident_storage_all
  ON storage.objects FOR ALL TO authenticated
  USING ((bucket_id = 'resident-documents')
         AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'))
  WITH CHECK ((bucket_id = 'resident-documents')
              AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'));

CREATE POLICY resident_storage_read_own
  ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'unit-attachments')
         AND private.is_resident_of_unit(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE POLICY security_storage_read_building
  ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'unit-attachments')
         AND private.is_security_of_building(
               auth.uid(),
               private.unit_building_id(((storage.foldername(name))[1])::uuid)
             ));

CREATE POLICY resident_docs_storage_read_own
  ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'resident-documents')
         AND ((storage.foldername(name))[1])::uuid = auth.uid());
