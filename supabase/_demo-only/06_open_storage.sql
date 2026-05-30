-- =============================================================================
-- DEMO-ONLY · Open Supabase Storage for demo users
-- =============================================================================
-- The working project's storage RLS gates every upload on
-- auth.jwt -> app_metadata.role = 'pmc'. Demo signups never get that role, so
-- the "Generate placeholders" / "Import ZIP" / per-unit photo upload buttons
-- silently fail.
--
-- Replace those role-based policies with owner-aware ones:
--   - SELECT  : any authenticated user can read any storage object (signed
--               URLs are private anyway; data is small and not sensitive).
--   - INSERT  : authenticated users can upload to either bucket. Object
--               metadata.owner gets stamped to auth.uid() by the app.
--   - UPDATE/DELETE : owner of the object (storage.objects.owner) only.
-- =============================================================================

-- Drop existing role-based policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('pmc_storage_all','pmc_resident_storage_all',
                         'resident_storage_read_own','security_storage_read_building',
                         'resident_docs_storage_read_own')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Read: any authenticated user
CREATE POLICY demo_storage_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('unit-attachments', 'resident-documents', 'invoice-attachments', 'maintenance-documents'));

-- Insert: any authenticated user can upload
CREATE POLICY demo_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('unit-attachments', 'resident-documents', 'invoice-attachments', 'maintenance-documents'));

-- Update: only the uploader can update
CREATE POLICY demo_storage_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (owner = auth.uid())
  WITH CHECK (owner = auth.uid());

-- Delete: only the uploader can delete (kept for housekeeping; UI doesn't expose it)
CREATE POLICY demo_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (owner = auth.uid());

-- Make sure invoice-attachments + maintenance-documents buckets exist (they
-- were created by later migrations on the working project but may be missing
-- from a freshly-bootstrapped demo).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('invoice-attachments',   'invoice-attachments',   false),
  ('maintenance-documents', 'maintenance-documents', false)
ON CONFLICT (id) DO NOTHING;
