-- Snapshot of the VARS-PMC Supabase project (ref: khhguxuxvkxvycndkron) as of 2026-05-23.
-- Reproduces the live schema, indexes, RLS policies, helper functions, and storage
-- buckets so the database can be rebuilt from this repo. Apply files in numeric order.

-- ---------------------------------------------------------------------------
-- Extensions and schemas
-- ---------------------------------------------------------------------------

-- Helper schema for SECURITY DEFINER functions used by RLS policies. Keeping
-- them out of `public` so they cannot be called directly from the PostgREST API.
CREATE SCHEMA IF NOT EXISTS private;

-- gen_random_uuid() comes from pgcrypto, which Supabase ships with by default.
-- Listed here for completeness in case the project is rebuilt elsewhere.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
