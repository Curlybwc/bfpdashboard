

# Vendor Management + QuickBooks Sync — Revised Plan

## Adjustments from feedback

1. **`company_id` NOT NULL** — Every vendor belongs to a company. No cross-company use case exists.
2. **`updated_at` trigger** — Use the repo's standard `update_updated_at_column()` trigger.
3. **RLS scoped to admin-only** — No global authenticated read. Matches `quickbooks_vendor_mappings` and `quickbooks_settings` patterns (admin-managed, company-scoped data). If read access for non-admins is needed later, a company-scoped policy can be added.
4. **`quickbooks_vendor_push` guards** — Refuse push when `quickbooks_vendor_id` is already set (return error). On QB API failure, persist `quickbooks_sync_status = 'error'` and `quickbooks_last_error` before returning.
5. **`quickbooks_vendor_search` input escaping** — Escape single quotes and special chars in search term before interpolating into QB query string.
6. **Type regeneration** — After migration, Supabase TS types will auto-regenerate. Also update `docs/database-schema.md`.

---

## Step 1 — Migration

```sql
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US',
  quickbooks_vendor_id text,
  quickbooks_display_name text,
  quickbooks_sync_status text NOT NULL DEFAULT 'not_synced',
  quickbooks_last_synced_at timestamptz,
  quickbooks_last_error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_vendor_qb_id_company
  ON public.vendors (company_id, quickbooks_vendor_id)
  WHERE quickbooks_vendor_id IS NOT NULL;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on vendors"
  ON public.vendors FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**File**: new migration in `supabase/migrations/`

## Step 2 — Edge function: `quickbooks_vendor_search`

- Accepts `{ company_id, search_term }`.
- Auth: `requireAdminAuth`.
- **Escapes `search_term`**: replaces `'` → `\'`, strips control chars, limits length to 100 chars before interpolating into QB query: `SELECT * FROM Vendor WHERE DisplayName LIKE '%escaped_term%'`.
- Returns `{ vendors: [{ id, display_name, email, phone, city, state }] }`.

**File**: `supabase/functions/quickbooks_vendor_search/index.ts`

## Step 3 — Edge function: `quickbooks_vendor_pull`

- Accepts `{ vendor_id }`.
- Auth: `requireAdminAuth`.
- Reads local vendor, fetches QB vendor by ID, updates local contact fields + sets `sync_status = 'synced'`, `last_synced_at = now()`.
- On failure: sets `sync_status = 'error'`, `last_error = message`.

**File**: `supabase/functions/quickbooks_vendor_pull/index.ts`

## Step 4 — Edge function: `quickbooks_vendor_push`

- Accepts `{ vendor_id }`.
- Auth: `requireAdminAuth`.
- **Guard**: if `quickbooks_vendor_id` is already set, return `400` with `"Vendor already mapped to QuickBooks"` — do not push.
- Creates vendor in QB via POST, saves returned ID back to local record, sets `sync_status = 'synced'`.
- **On QB API failure**: updates local vendor with `sync_status = 'error'`, `last_error = <QB error message>`, then returns the error to the caller.

**File**: `supabase/functions/quickbooks_vendor_push/index.ts`

## Step 5 — Config

Add `verify_jwt = false` for the 3 new functions in `supabase/config.toml`.

## Step 6 — Hook: `src/hooks/useVendors.ts`

React Query CRUD on `vendors` table + edge function invocations for search/pull/push. Scoped by selected `company_id`.

## Step 7 — Page: `src/pages/AdminVendors.tsx`

Admin page at `/admin/vendors` with:
- Company selector
- Vendor list with search, sync status badges
- Add/edit dialog (name, email, phone, address only)
- Per-vendor actions: Link to QB, Pull from QB, Push to QB
- Error display from `quickbooks_last_error`

## Step 8 — Wiring

- `src/App.tsx`: add `/admin/vendors` route with `AdminGuard`
- `src/pages/AdminPanel.tsx`: add "Vendors" hub entry

## Step 9 — Docs + Types

- Update `docs/database-schema.md` with vendors table
- Supabase TS types auto-regenerate after migration

## Files changed

| File | Action |
|---|---|
| `supabase/migrations/[new].sql` | Create vendors table, RLS, trigger, index |
| `supabase/functions/quickbooks_vendor_search/index.ts` | New |
| `supabase/functions/quickbooks_vendor_pull/index.ts` | New |
| `supabase/functions/quickbooks_vendor_push/index.ts` | New |
| `supabase/config.toml` | Add 3 function blocks |
| `src/hooks/useVendors.ts` | New |
| `src/pages/AdminVendors.tsx` | New |
| `src/App.tsx` | Add route |
| `src/pages/AdminPanel.tsx` | Add hub entry |
| `docs/database-schema.md` | Add vendors table |

## Not changed

Scope, project, task, material, cost library, existing QB vendor mappings (payroll), `vendor_url` fields — all untouched.

