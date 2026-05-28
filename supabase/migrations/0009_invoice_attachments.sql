-- Invoice attachments — one row per file attached to an invoice.
--
-- Each invoice can carry up to TWO attachments:
--   • kind = 'invoice'        → the issued invoice PDF / image
--   • kind = 'payment_proof'  → bank receipt / cheque image / proof of payment
-- The (invoice_id, kind) UNIQUE constraint enforces "max one of each kind".
--
-- Files live in the private Storage bucket `invoice-attachments` under the
-- path convention `{invoice_id}/{kind}/{filename}`. We store the storage_path
-- on the row so the frontend can issue signed URLs without round-tripping
-- the bucket index.
--
-- RLS:
--   • PMC has full access.
--   • Residents can SELECT only attachments tied to invoices billed to them.
--   • Security cannot see invoice attachments at all (financial PII).
--
-- The resident check goes through a SECURITY DEFINER helper in `private`
-- to keep the RLS policy free of cross-table subqueries (avoids the
-- recursion trap that bit us before — see memory).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind = ANY (ARRAY['invoice'::text, 'payment_proof'::text])),
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, kind)
);

CREATE INDEX IF NOT EXISTS invoice_attachments_invoice_id_idx
  ON public.invoice_attachments(invoice_id);

COMMENT ON TABLE  public.invoice_attachments         IS 'Files attached to invoices: the issued invoice PDF and the payment proof.';
COMMENT ON COLUMN public.invoice_attachments.kind          IS 'Which slot this file fills: ''invoice'' or ''payment_proof''.';
COMMENT ON COLUMN public.invoice_attachments.storage_path  IS 'Object key in the `invoice-attachments` bucket. Convention: {invoice_id}/{kind}/{filename}.';
COMMENT ON COLUMN public.invoice_attachments.uploaded_by   IS 'Profile id of whoever uploaded the file (PMC user).';

-- ---------------------------------------------------------------------------
-- 2. Private helper — resident-of-invoice check
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so RLS on public.invoices is bypassed when checking
-- ownership from the invoice_attachments / storage policies. Pure read,
-- STABLE so the planner can cache results within a statement.
CREATE OR REPLACE FUNCTION private.is_resident_of_invoice(_user uuid, _invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE id = _invoice_id
      AND resident_profile_id = _user
  );
$$;

REVOKE ALL ON FUNCTION private.is_resident_of_invoice(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION private.is_resident_of_invoice(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION private.is_resident_of_invoice(uuid, uuid)
  IS 'True if the given user is the resident billed on the given invoice. Used by RLS to avoid inlining a cross-table subquery into invoice_attachments / storage policies.';

-- ---------------------------------------------------------------------------
-- 3. Enable RLS + policies on public.invoice_attachments
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmc_invoice_attachments_all      ON public.invoice_attachments;
DROP POLICY IF EXISTS resident_invoice_attachments_ro  ON public.invoice_attachments;

CREATE POLICY pmc_invoice_attachments_all
  ON public.invoice_attachments FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY resident_invoice_attachments_ro
  ON public.invoice_attachments FOR SELECT TO authenticated
  USING (private.is_resident_of_invoice(auth.uid(), invoice_id));

-- ---------------------------------------------------------------------------
-- 4. Storage bucket + storage.objects policies
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-attachments', 'invoice-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS pmc_invoice_attach_storage_all       ON storage.objects;
DROP POLICY IF EXISTS resident_invoice_attach_storage_ro   ON storage.objects;

CREATE POLICY pmc_invoice_attach_storage_all
  ON storage.objects FOR ALL TO authenticated
  USING ((bucket_id = 'invoice-attachments')
         AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'))
  WITH CHECK ((bucket_id = 'invoice-attachments')
              AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'));

-- First path segment is the invoice_id (see storage_path convention above).
CREATE POLICY resident_invoice_attach_storage_ro
  ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'invoice-attachments')
         AND private.is_resident_of_invoice(
               auth.uid(),
               ((storage.foldername(name))[1])::uuid
             ));
