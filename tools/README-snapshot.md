# Snapshot the working profile into the demo seed

This pipeline freezes a copy of your `pmc.vars.ae` portfolio (buildings,
units, residents, invoices, vendor payments, attachments, etc.) into the
demo signup seed, with personal data anonymised. After running it, every
new account that signs up at `demo.vars.live` starts with the same data
you have in your real PMC profile.

When to re-run it: any time you add a lot of new content in the working
profile and want the demo to catch up.

---

## Step 1 — get the working project's service_role key

This key has full read access to the working DB. Treat it like a password.

1. Open <https://supabase.com/dashboard>.
2. Pick the project **VARS - PMC (working)**.
3. Left sidebar → **Settings** → **API**.
4. Find the section **Project API keys**. Copy the value labelled
   **`service_role`** (NOT `anon` / `publishable`).

## Step 2 — run the snapshot from your laptop

Open Terminal in the repo folder and run:

```bash
WORKING_SERVICE_KEY=eyJhbG.....paste-the-key-here..... npm run snapshot
```

The script:

- Connects to the working Supabase (read-only).
- Pulls every row from buildings, units, profiles, resident_assignments,
  invoices, invoice_attachments, vendors, vendor_payments, vendor_documents,
  visits, service_requests, amenity_bookings, security_assignments,
  unit_attachments, resident_documents (and best-effort contracts).
- Swaps personal data for fakes: names, phones, emails, owner contact
  info, tenant contact info, emirates IDs, passport numbers, contract
  numbers, emergency contacts. Same person stays consistent across tables.
- Keeps building names, addresses, vendor business names, invoice
  numbers, amounts, dates, descriptions as-is.
- Rewrites `supabase/_demo-only/05_seed_v2_from_data_files.sql` with a
  `seed_demo_portfolio_for(p_uid)` function that plants this exact
  snapshot for every demo signup.

Console output shows row counts per table and the size of the output file.

## Step 3 — apply the new seed to the demo Supabase

The file `supabase/_demo-only/05_seed_v2_from_data_files.sql` now contains
the rewritten function.

1. Push the changes (so Vercel / GitHub stay in sync):

   ```bash
   git add supabase/_demo-only/05_seed_v2_from_data_files.sql
   git commit -m "demo seed: refresh snapshot from working"
   git push
   ```

2. Open <https://supabase.com/dashboard>, project **VARS - PMC Demo**.
3. Left sidebar → **SQL Editor** → **New query**.
4. From your repo, open the same `05_seed_v2_from_data_files.sql` in any
   text editor → select all → copy → paste into the SQL editor → click
   **Run**.

That replaces the seed function. From now on, **new** signups at
`demo.vars.live` land on your latest curated portfolio.

## Step 4 (optional) — re-seed your existing demo account

The new seed only fires on NEW signups. If you want your existing demo
account refreshed with the new dataset, run this in the same SQL editor
(replace the email):

```sql
SELECT public.seed_demo_portfolio_for(
  (SELECT id FROM auth.users WHERE email = 'you@example.com')
);
```

That nukes your previous demo data and replants the snapshot.

## What it does NOT do (yet)

- **Storage files** are NOT copied. The snapshot keeps the `storage_path`
  references, but the actual PDFs / photos live in the working bucket.
  When the demo UI tries to open a file it falls back to a stock
  thumbnail (already wired up). The dashboard counts, totals, file
  names, and metadata are all real; the file you'd download is a
  placeholder. Copying real files is a separate task.

- **app_state / reminder_settings** rows are not snapshotted. They're
  per-user single-row tables and the existing seed handles them.

- **Real auth users** (residents on the working side) are NOT cloned —
  only their profile rows are. Residents in the demo can't log in;
  they're display-only.
