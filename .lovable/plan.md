# Ezzie Package A — Shared Core Seed: Inspection Report & Plan

Inspection only. No code, SQL, migration, data, RLS, auth, type, or navigation change was made.

## A. GO / NO-GO

**GO WITH CHANGES.** The schema work itself is safe and additive. Two things must be settled before any SQL runs:

1. The five governing documents (Package A PRD, Migration Contract, ADR Register, Shared Data Dictionary, Living Blueprint) are **not present in this repository**. Canonical table/column names below are my proposal and must be reconciled with the Data Dictionary before implementation.
2. There is **one live database serving both preview and the published app**. The only isolated test path available here is a Lovable **draft** (staged schema, applied only on accept). Package A must be built inside a draft, not against the live project. See J.

## B. Hidden dependencies / conflicts

Adding nullable `profiles.person_id`, `companies.business_organization_id`, `projects.property_id`:

- `handle_new_user()` inserts into `profiles` with an explicit column list — unaffected.
- `convert_scope_to_project()` inserts into `projects` with an explicit column list — unaffected; new projects simply get `property_id = NULL`.
- No database function returns a composite `profiles`/`companies`/`projects` row type. Composite-returning functions (`clock_in`, `clock_out`, `admin_force_clock_out`) return `shifts`, which Package A does not touch.
- Triggers on the three tables: `update_projects_updated_at`, `protect_admin_flag`, `trg_protect_profile_pay_fields`, `trg_company_qb_connection_change`. All are column-specific or field-guarding; none enumerate all columns. `protect_profile_pay_fields` must be re-read before adding any profile column, to confirm the new column is not caught by its guard list.
- Client code uses `select('*')` on these tables in ~25 files. Extra nullable columns are additive to the returned object and do not break TypeScript, since generated types are not being regenerated in this package.
- RPC return contracts (`admin_list_stranded_users`, `admin_get_profile_pay`, `convert_scope_to_project`, payroll/QuickBooks functions) are unchanged by added columns.
- Existing tests (`scopeConversion`, `taskPackages`, `taskOperationalStatus`, `bundleMatch`, `checklistMatch`) are pure-logic and unaffected.
- New Package A tables are only reachable if GRANTs are issued; RLS must be enabled in the same migration before any grant.

No blocking conflict found.

## C. Proposed migration files (text only — not created, not applied)

**Migration 1 — canonical entities**

- `public.business_organizations` (id, name unique-normalized, legal_name, created_at, updated_at)
- `public.properties` (id, canonical_address, display_name, city, state, postal_code, status, created_at, updated_at) with a unique index on normalized address
- `public.property_ownership` (id, property_id FK, business_organization_id FK, effective_from date, effective_to date null, source text) with a partial unique index guaranteeing one current owner per property
- `public.people` (id, display_name, is_active boolean not null default true, created_at, updated_at)
- `public.person_identities` (id, person_id FK, system text, external_id text, unique(system, external_id)) — holds the `supabase_auth` identity
- GRANTs for `authenticated` (+`service_role`) per table, then `ENABLE ROW LEVEL SECURITY`, then policies.

**Migration 2 — link columns (all nullable, no defaults, no NOT NULL)**

- `profiles.person_id uuid references public.people(id)`
- `companies.business_organization_id uuid references public.business_organizations(id)`
- `projects.property_id uuid references public.properties(id)`
- Unique indexes on `profiles.person_id`, `companies.business_organization_id` (one-to-one), plain index on `projects.property_id`.

**Migration 3 — seed/backfill** (see E). Idempotent, guarded, raises on conflict.

Constraints: additive only; explicit FKs and check constraints; indexes on every FK and lookup column; RLS enabled before grants; no existing row modified except the three new link columns; existing policies untouched; each migration independently reversible (see I).

## D. Proposed RLS

Helper (SECURITY DEFINER, `search_path = public`): `is_shared_core_reader(_user_id uuid)` returning true when the user is an active member of the BFP org; `is_shared_core_admin(_user_id uuid)` returning `is_admin(_user_id) OR is_org_admin(...)`.

Per new table:
- `SELECT` — `to authenticated using (is_shared_core_reader(auth.uid()))`
- `INSERT / UPDATE / DELETE` — `to authenticated using/with check (is_shared_core_admin(auth.uid()))`
- no `anon` grant on any Package A table

These policies are net-narrowing: the tables do not exist today, so the baseline is zero access. No existing policy on `profiles`, `companies`, `projects`, `tasks`, `shifts`, or QuickBooks tables is altered, and the new columns inherit those tables' existing row-level rules.

## E. Backfill / seed plan

Driven by explicit UUID allowlists, never by name matching.

**People — carry forward (Person + `person_identities` row, system `supabase_auth`, external_id = profile/auth uuid):** the approved active contractor/admin set, plus Judah Bahr (`bc10cc44-…`) created as **Person active = true**. His `profiles.is_active` stays `false` — Package A writes nothing to `profiles` except `person_id`.

**People — inactive historical (Person active = false):** Ally S `bfdba597-…`, Hunter Segers `67bdc199-…`, Tatem Chrismer `a9cc14ac-…`, Trenton Tash `b2a3b86d-…`.

**Not migrated (legacy rows preserved, untouched, no Person, no `person_id`):** Aamir Taqvi `07e8272e-…`, adam `9bb46d6c-…`, Blake Whiting `f8904248-…`, DeWayne L Stiers `e705d147-…`, Eric Szymanski `8b6a79c4-…`, Giovanni Corbett `87f8c262-…`, Ryan Richardet `1f0d07d8-…`.

**Business organizations (from `companies`, 1:1):** Bahr Family Homes LLC `30b15ebf-…`, Bahr Family Properties LLC `05b1f8c5-…`, FOBAR Holdings, LLC `0f5f6b14-…`.

**Properties (exactly four, from confirmed project rows):**

| Property | Project id | Company today | Owner org seeded |
|---|---|---|---|
| 1428 Ramona | `ea153701-…` | BFH | Bahr Family Homes LLC |
| 4150 Taft Avenue | `d9793b78-…` | BFP | Bahr Family Properties LLC |
| 4441 Nebraska Ave | `a5154a05-…` | BFP | Bahr Family Properties LLC |
| 137 Forestwood Drive | `043dcc77-…` | BFP | Bahr Family Properties LLC |

Ownership is taken **only** from `projects.company_id` — never from payment source, QuickBooks class/realm, management arrangement, or `project_type`. A query confirmed 4441 Nebraska has exactly one project row (rental, active), so one Property is created and no rental/construction duplicate arises. 105 Walnut Hill and 1150 Wedgewood are excluded. No `units` are seeded.

## F. Duplicate / conflict safety

- Every seed insert is keyed by the source uuid and guarded with `WHERE NOT EXISTS`, so reruns are no-ops.
- Unique indexes on normalized property address, normalized organization name, `(system, external_id)`, `profiles.person_id`, and `companies.business_organization_id` make double-linking impossible at the database level.
- If a `profiles`/`companies`/`projects` row already carries a link pointing at a *different* canonical record than the seed expects, the migration **raises an exception and aborts the whole transaction** rather than overwriting. Same for two properties resolving to the same normalized address.
- A partially completed run leaves no half state: each migration is a single transaction.

## G. Current-behavior regression test plan

Manual pass, signed in as admin and as a contractor: login/session/profile load; admin, org and project role gating; project list and project detail; task create/edit/status/blockers/materials; scope → project conversion; clock in/out, shift create/edit/delete inside the 7-day window, payroll summary and Ready-to-Bill totals; vendor list/search/pull/push; QuickBooks connection status, validate settings, payroll bill export, reimbursement bill; Today page and navigation on mobile and desktop; contractor visibility limited to own projects/shifts. Plus `bunx vitest run` and a type-check.

## H. Security test plan

Exercised as at least four identities — admin, org member/manager, plain contractor, and a signed-out client — not service role:

- contractor: can read Package A tables, cannot insert/update/delete
- signed-out: zero rows from every Package A table
- a user outside the BFP org: zero rows
- existing cross-org isolation on `projects`, `profiles`, `shifts` unchanged after the link columns are added
- confirm no `anon` grant exists on any Package A table

## I. Rollback plan

Reverse order: drop Package A policies and helper functions → drop link columns `projects.property_id`, `companies.business_organization_id`, `profiles.person_id` (with their indexes) → drop `person_identities`, `people`, `property_ownership`, `properties`, `business_organizations`.

Lossless for all pre-existing data: no existing row's existing columns are written. **Not lossless:** dropping the link columns and the canonical tables destroys the Package A mapping itself — it would have to be re-seeded. Because column drops are destructive, rollback is a deliberate, confirmed operation, not an automatic one.

## J. Staging / isolation plan

One Lovable Cloud instance backs both preview and the published app, so applying Package A directly is applying it to production. The safe path is a **Lovable draft**: schema changes are staged and only applied to the live project when the draft is accepted. Implementation should therefore be: create a draft → run migrations 1–3 there → complete the G and H test passes inside the draft → accept only after sign-off. If you prefer a fully separate Supabase project instead, that project must be created and the schema restored into it before Package A begins — say the word and this plan switches to that path.

## K. Questions for Jen

1. Can you share the five governing documents (or their table/column definitions)? Canonical names above are proposals and should match the Shared Data Dictionary exactly.
2. Confirm the **active** carry-forward People list. Excluded and inactive-historical sets are settled; the active set is not explicitly enumerated in your brief, and several current profiles (e.g. Andrew Shelton, James King, Jamiel A, Jeff Coffman, Justin Grimes, Kait and Kaleb McClaskey, Kurt Bahr, "Kurt micah bahr", Lydia Bahr, Marcus Freeman, Michele Wilkes, Josiah Bahr, Jennifer Bahr) would otherwise be judged by me.
3. "Kurt Bahr" and "Kurt micah bahr" are two separate logins. Same person or two people? I will not merge on names.
4. FOBAR Holdings owns no property in this first seed. Should it still be created as a canonical business organization now?
5. 4441 Nebraska is a rental with active work — should its Property status be seeded as `active` rental, or does the Shared Core use a different lifecycle value here?
