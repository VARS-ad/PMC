-- All public-schema tables for VARS-PMC.
-- Created in FK-dependency order: a table only references tables defined above it.

-- ---------------------------------------------------------------------------
-- buildings: physical properties under management
-- ---------------------------------------------------------------------------
CREATE TABLE public.buildings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  address     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- units: individual apartments / flats inside a building
-- ---------------------------------------------------------------------------
CREATE TABLE public.units (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id  uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  floor        integer NOT NULL,
  unit_number  text NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, unit_number)
);

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users account; carries app-level metadata
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        text NOT NULL,
  phone            text,
  role             text NOT NULL CHECK (role = ANY (ARRAY['pmc'::text, 'resident'::text, 'security'::text])),
  date_of_birth    date,
  passport_number  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- resident_assignments: which profile lives in which unit, with lease info
-- ---------------------------------------------------------------------------
CREATE TABLE public.resident_assignments (
  profile_id           uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_id              uuid NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  tenure               text CHECK (tenure = ANY (ARRAY['Owner'::text, 'Tenant'::text])),
  lease_start          date,
  lease_end            date,
  monthly_payment_aed  numeric CHECK (monthly_payment_aed IS NULL OR monthly_payment_aed >= 0),
  ownership_start      date,
  assigned_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- security_assignments: which guard covers which building on which shift
-- ---------------------------------------------------------------------------
CREATE TABLE public.security_assignments (
  profile_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  building_id  uuid NOT NULL REFERENCES public.buildings(id) ON DELETE RESTRICT,
  shift        text NOT NULL CHECK (shift = ANY (ARRAY['Day'::text, 'Night'::text, '24h'::text])),
  assigned_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- visits: replacement for legacy data.visitors / data.entryLog / data.pendingApprovals
-- ---------------------------------------------------------------------------
CREATE TABLE public.visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type = ANY (ARRAY['Pre-Approved'::text, 'Walk-In'::text, 'Delivery'::text, 'Service Vendor'::text, 'Resident Guest'::text, 'Contractor'::text])),
  visitor_name    text NOT NULL,
  visitor_phone   text,
  visitor_id_doc  text,
  vehicle         text,
  purpose         text,
  notes           text,
  visit_date      date NOT NULL,
  visit_time      time,
  status          text NOT NULL DEFAULT 'Pre-Approved' CHECK (status = ANY (ARRAY['Pre-Approved'::text, 'On-Premise'::text, 'Checked-Out'::text, 'Rejected'::text, 'No-Show'::text, 'Cancelled'::text])),
  permit_ref      text,
  qr_code         text,
  created_by      uuid REFERENCES public.profiles(id),
  approved_by     uuid REFERENCES public.profiles(id),
  checked_in_at   timestamptz,
  checked_out_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- unit_attachments: metadata for files in the `unit-attachments` storage bucket
-- ---------------------------------------------------------------------------
CREATE TABLE public.unit_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id       uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind = ANY (ARRAY['photo'::text, 'title_deed'::text, 'layout'::text, 'other'::text])),
  filename      text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_by   uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- amenity_bookings: pool / gym / function-room reservations
-- ---------------------------------------------------------------------------
CREATE TABLE public.amenity_bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id          uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_id              uuid REFERENCES public.units(id) ON DELETE SET NULL,
  resident_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amenity_name         text NOT NULL,
  booking_date         date NOT NULL,
  start_time           time,
  end_time             time,
  guests               integer DEFAULT 0,
  status               text NOT NULL DEFAULT 'Confirmed' CHECK (status = ANY (ARRAY['Confirmed'::text, 'Pending'::text, 'Cancelled'::text, 'Completed'::text])),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- service_requests: maintenance / housekeeping / repair tickets
-- ---------------------------------------------------------------------------
CREATE TABLE public.service_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              uuid REFERENCES public.units(id) ON DELETE SET NULL,
  resident_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category             text NOT NULL,
  description          text NOT NULL,
  priority             text NOT NULL DEFAULT 'Normal' CHECK (priority = ANY (ARRAY['Low'::text, 'Normal'::text, 'High'::text, 'Urgent'::text])),
  status               text NOT NULL DEFAULT 'New' CHECK (status = ANY (ARRAY['New'::text, 'Acknowledged'::text, 'In Progress'::text, 'Done'::text, 'Closed'::text, 'Rejected'::text])),
  preferred_date       date,
  preferred_time       time,
  resolved_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- invoices: service-charge and ad-hoc bills issued to residents
-- ---------------------------------------------------------------------------
CREATE TABLE public.invoices (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id              uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  resident_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invoice_number       text UNIQUE,
  description          text NOT NULL,
  amount_aed           numeric NOT NULL CHECK (amount_aed >= 0),
  due_date             date,
  status               text NOT NULL DEFAULT 'Pending' CHECK (status = ANY (ARRAY['Pending'::text, 'Paid'::text, 'Overdue'::text, 'Cancelled'::text])),
  source_type          text,
  source_id            uuid,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- payments: money received against an invoice
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_aed  numeric NOT NULL CHECK (amount_aed > 0),
  paid_at     timestamptz NOT NULL DEFAULT now(),
  method      text NOT NULL DEFAULT 'manual' CHECK (method = ANY (ARRAY['manual'::text, 'card'::text, 'bank_transfer'::text, 'cash'::text])),
  reference   text,
  notes       text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- resident_documents: metadata for files in the `resident-documents` bucket
-- ---------------------------------------------------------------------------
CREATE TABLE public.resident_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind = ANY (ARRAY['emirates_id'::text, 'passport'::text, 'tenancy_contract'::text, 'owning_contract'::text, 'title_deed'::text, 'other'::text])),
  filename      text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_by   uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- app_state: legacy single-row jsonb store driving the older Resident /
-- Security / PM views. Being phased out slice by slice in favour of the
-- relational tables above. Kept for backward compatibility with the running app.
-- ---------------------------------------------------------------------------
CREATE TABLE public.app_state (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
