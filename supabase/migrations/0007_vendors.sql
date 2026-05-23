-- VARS-PMC: maintenance vendors + contracts + payments + documents
-- Adds the relational tables, a private Storage bucket for contract files,
-- and PMC-only RLS policies. Residents and security have no access.

-- ---------------------------------------------------------------------------
-- vendors: master record per maintenance company
-- ---------------------------------------------------------------------------
CREATE TABLE public.vendors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  service_category    text NOT NULL CHECK (service_category = ANY (ARRAY[
                        'Plumbing','Electrical','HVAC','Cleaning','Security',
                        'Gardening','Pest Control','Lift Maintenance',
                        'General Handyman','Other'
                      ])),
  contact_person      text,
  contact_phone       text,
  contact_email       text,
  address             text,
  contract_start      date,
  contract_end        date,
  contract_value_aed  numeric CHECK (contract_value_aed IS NULL OR contract_value_aed >= 0),
  trade_license       text,
  trn_number          text,
  status              text NOT NULL DEFAULT 'Active' CHECK (status = ANY (ARRAY[
                        'Active','Expiring Soon','Expired','Terminated'
                      ])),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendors_service_category_idx ON public.vendors (service_category);
CREATE INDEX vendors_status_idx           ON public.vendors (status);

-- ---------------------------------------------------------------------------
-- vendor_buildings: M2M — which of your buildings each vendor services
-- ---------------------------------------------------------------------------
CREATE TABLE public.vendor_buildings (
  vendor_id    uuid NOT NULL REFERENCES public.vendors(id)   ON DELETE CASCADE,
  building_id  uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, building_id)
);
CREATE INDEX vendor_buildings_building_idx ON public.vendor_buildings (building_id);

-- ---------------------------------------------------------------------------
-- vendor_payments: invoices issued by the vendor + payments tracked
-- ---------------------------------------------------------------------------
CREATE TABLE public.vendor_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id          uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  invoice_number     text,
  invoice_date       date,
  description        text NOT NULL,
  category           text,
  amount_aed         numeric NOT NULL CHECK (amount_aed >= 0),
  payment_status     text NOT NULL DEFAULT 'Pending' CHECK (payment_status = ANY (ARRAY[
                       'Pending','Paid','Overdue','Cancelled'
                     ])),
  paid_date          date,
  payment_method     text CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY[
                       'Bank Transfer','Cheque','Cash','Credit Card','Other'
                     ])),
  payment_reference  text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_payments_vendor_idx       ON public.vendor_payments (vendor_id);
CREATE INDEX vendor_payments_status_idx       ON public.vendor_payments (payment_status);
CREATE INDEX vendor_payments_invoice_date_idx ON public.vendor_payments (invoice_date);

-- ---------------------------------------------------------------------------
-- vendor_documents: metadata for files in the `maintenance-documents` bucket
-- ---------------------------------------------------------------------------
CREATE TABLE public.vendor_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid NOT NULL REFERENCES public.vendors(id)         ON DELETE CASCADE,
  payment_id    uuid          REFERENCES public.vendor_payments(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind = ANY (ARRAY['contract','payment_receipt','invoice','other'])),
  filename      text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_by   uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendor_documents_vendor_idx ON public.vendor_documents (vendor_id);

-- ---------------------------------------------------------------------------
-- Storage bucket (private, PMC-only)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-documents', 'maintenance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: PMC has full access on all four new tables. Nobody else.
-- Policies key off auth.jwt()->'app_metadata'->>'role' to avoid recursion.
-- ---------------------------------------------------------------------------
ALTER TABLE public.vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_buildings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents  ENABLE ROW LEVEL SECURITY;

CREATE POLICY pmc_vendors_all
  ON public.vendors FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY pmc_vendor_buildings_all
  ON public.vendor_buildings FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY pmc_vendor_payments_all
  ON public.vendor_payments FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

CREATE POLICY pmc_vendor_documents_all
  ON public.vendor_documents FOR ALL TO authenticated
  USING      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc');

-- Storage policy: PMC has full access to the new bucket. No resident/security policy.
CREATE POLICY pmc_maintenance_storage_all
  ON storage.objects FOR ALL TO authenticated
  USING      ((bucket_id = 'maintenance-documents')
              AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'))
  WITH CHECK ((bucket_id = 'maintenance-documents')
              AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'pmc'));
