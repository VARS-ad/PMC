-- Allow multiple files per invoice attachment slot.
--
-- Migration 0009 added a UNIQUE (invoice_id, kind) constraint so each
-- invoice could hold at most one 'invoice' file and one 'payment_proof'
-- file. The product decision changed: PMC may legitimately attach
-- several files per slot (e.g. multi-page scans, separate cheque images,
-- partial-payment receipts). The vendor side (vendor_documents) already
-- allows this — this migration brings the resident side in line.
--
-- Dropping the constraint is safe: it does not touch existing rows.

ALTER TABLE public.invoice_attachments
  DROP CONSTRAINT IF EXISTS invoice_attachments_invoice_id_kind_key;
