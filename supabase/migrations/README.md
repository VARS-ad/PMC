# Supabase migrations — VARS-PMC

Snapshot of the live Supabase project (`khhguxuxvkxvycndkron`, region `ap-northeast-1`) captured 2026-05-23.

The live project was built up via direct SQL in the Supabase dashboard, not through a migration tool, so its `supabase_migrations.schema_migrations` table is empty. These files reconstruct the schema in the order it would have been applied if migrations had been used from day one.

## Files

| # | File | What it does |
|---|---|---|
| 1 | `0001_schemas_and_extensions.sql` | Creates the `private` schema (for SECURITY DEFINER helpers) and ensures `pgcrypto` is installed for `gen_random_uuid()`. |
| 2 | `0002_tables.sql` | All 13 public-schema tables in FK-dependency order: `buildings`, `units`, `profiles`, `resident_assignments`, `security_assignments`, `visits`, `unit_attachments`, `amenity_bookings`, `service_requests`, `invoices`, `payments`, `resident_documents`, plus the legacy `app_state` jsonb store. |
| 3 | `0003_indexes.sql` | Non-PK indexes — mostly FK lookups, plus a few status / date indexes used by dashboard filters. |
| 4 | `0004_helper_functions.sql` | Six SECURITY DEFINER helpers in the `private` schema (`is_resident_of_unit`, `is_resident_of_building`, `is_security_of_building`, `security_can_see_resident`, `unit_building_id`, `user_id_by_email`) plus the `public.get_emails_for_profiles` RPC the PMC admin UI uses to look up resident / guard emails. |
| 5 | `0005_rls_policies.sql` | Enables RLS on every public table and creates all role-based policies. PMC has full access via `ALL` policies that key off `auth.jwt()->'app_metadata'->>'role'`; residents and security see only their own scoped rows via the private helpers. |
| 6 | `0006_storage.sql` | Two private buckets (`unit-attachments`, `resident-documents`) and the matching `storage.objects` policies. |

## What's NOT in this snapshot

- **The `bulk-onboard` Edge Function source** — still lives only in Supabase Functions. Move it into `supabase/functions/bulk-onboard/index.ts` later when needed.
- **Seed data** — the single `app_state.data` jsonb blob and all rows in the relational tables. The app re-seeds from `src/data/*.js` on first run, so this isn't load-bearing for a fresh setup.
- **Auth users** — managed by Supabase Auth; not reproducible via SQL alone. Use the bulk-onboard Edge Function (or the dashboard) to recreate accounts.

## Critical rules when extending these files

1. **Never inline a cross-table subquery inside an RLS policy** (e.g. `WHERE role = (SELECT role FROM profiles WHERE id = auth.uid())`). It causes infinite recursion if the queried table itself has RLS. Always route through a `private.*` SECURITY DEFINER helper instead — see how the existing policies do it.

2. **Always set `app_metadata.role` when creating an auth user.** RLS policies read role from the JWT (`auth.jwt()->'app_metadata'->>'role'`). A user with NULL role hits every `pmc_*_all` policy as "not pmc" and gets denied silently.

3. **Roles are exactly `pmc`, `resident`, `security`** — no others. The `profiles.role` CHECK constraint enforces this.

## Applying these to a fresh project

```bash
psql "$DATABASE_URL" -f 0001_schemas_and_extensions.sql
psql "$DATABASE_URL" -f 0002_tables.sql
psql "$DATABASE_URL" -f 0003_indexes.sql
psql "$DATABASE_URL" -f 0004_helper_functions.sql
psql "$DATABASE_URL" -f 0005_rls_policies.sql
psql "$DATABASE_URL" -f 0006_storage.sql
```

Or via the Supabase CLI: `supabase db push` once these files are placed under `supabase/migrations/` with the timestamped naming convention.
