# Ezzie Package A — Shared Core Seed: Revised Inspection Report (v2)

Inspection only. Nothing was edited, migrated, applied, seeded, deployed, or published. This file is plan-mode output only.

## A. Revised GO / NO-GO

**NO-GO for execution. GO for design.**

The schema, RLS and seed design below is sound and ready. It must not be executed yet, for one reason:

**There is no isolated place to run it.** This Lovable Cloud project has exactly one database, shared by preview and the published app. A Lovable draft stages *schema* changes and applies them on accept — but a draft does **not** get its own database. Reads inside a draft read live rows, and any data write (seed/backfill) executed from a draft reaches the live database. So the Package A seed cannot be rehearsed before it is real. See J.

Secondary (non-blocking) note: the governing documents are still not in this repository. I have now built section C directly against the table list you gave in correction A, and treat that list as the Data Dictionary contract.

## B. Hidden dependencies / conflicts

**`protect_profile_pay_fields` — re-read in full.** It fires `BEFORE UPDATE` on `profiles` and raises only when one of `hourly_rate`, `tax_info_filed`, `dd_on_file`, `skip_qb_export` changes and the caller is not an admin. It compares those four fields explicitly; it does not compare whole rows and has no `NEW <> OLD` catch-all. **`profiles.person_id` is safe**: writing it alone leaves those four columns `NOT DISTINCT FROM` their old values, so the trigger returns `NEW` unchanged. The backfill must still write `person_id` only, never `UPDATE profiles SET ... ` with pay columns re-listed, which would also be safe but is needless exposure.

**`protect_admin_flag`** guards only `is_admin` and `can_manage_projects` — same reasoning, unaffected.

**Other triggers on the three tables:** `update_projects_updated_at` (touches `updated_at` only — note the backfill of `projects.property_id` *will* bump `updated_at` on the four seed projects; acceptable, but call it out so nobody reads it as unexplained edit activity) and `trg_company_qb_connection_change`, which fires only `AFTER UPDATE OF qb_connection_id`, so writing `companies.business_organization_id` will **not** invalidate QuickBooks mappings.

**Functions inserting into these tables:** `handle_new_user()` (explicit column list on `profiles`, `organizations`, `org_members`) and `convert_scope_to_project()` (explicit column list on `projects`). Neither breaks; newly created rows simply carry `NULL` in the new link columns. No function uses `INSERT INTO <table> VALUES (...)` without a column list.

**Composite / row-type returns:** none of the composite-returning functions return `profiles`, `companies` or `projects`. `clock_in`, `clock_out` and `admin_force_clock_out` return `shifts`, untouched by Package A. Table-returning RPCs (`admin_get_profile_pay`, `get_my_profile_pay`, `admin_list_stranded_users`) enumerate their output columns explicitly, so their contracts cannot shift.

**Typed client call sites — verified, not assumed.** The generated types are used structurally: `Database['public']['Tables']['projects']['Row']` in `useProjectList.ts`, `Tables<'profiles'>` in `PayrollSummary.tsx`, and `select('*')` in `useProjectDetail.ts`, `AdminPanel.tsx` and ~25 other files. Because Package A does not regenerate `types.ts`, the TS `Row` type simply omits the new columns while the runtime object carries an extra key — structurally compatible, no compile error, no runtime consumer iterating keys. When types *are* later regenerated, `Row` gains three nullable fields (widening, safe) and `Insert` gains three optional fields (nullable, no default required, safe). No exhaustive object literal anywhere constructs a full `profiles`/`companies`/`projects` row that would newly fail. No break found.

**New tables** are unreachable until GRANTs are issued; RLS is enabled before any grant in the same migration.

**Workspace vs legal entity:** `public.organizations` (the tenant workspace, e.g. "My Organization", "Jennifer Bahr's Org") is **not** a business organization. Package A creates `business_organizations` as a separate concept and establishes **no** FK or implicit mapping between the two. Nothing in the seed reads or writes `organizations`.

No blocking conflict found.

## C. Proposed migration set (text only — nothing created or applied)

Aligned to the governing table list. No structure is dropped or simplified.

**Migration 1 — People domain**
- `people` (id, legal_first_name, legal_last_name, legal_full_name, preferred_name, display_name, is_active bool not null default true, notes, created_at, updated_at)
- `person_contact_methods` (id, person_id FK cascade, kind check in (email, phone, address), value, label, is_primary bool, verified_at, created_at) + index on (person_id, kind), partial unique on (person_id, kind) where is_primary
- `person_auth_identities` (id, person_id FK cascade, provider check in (supabase_auth), subject_id text, is_active bool, created_at) + unique (provider, subject_id)
- `person_external_ids` (id, person_id FK cascade, system text, external_id text, created_at) + unique (system, external_id)

**Migration 2 — Organization domain**
- `business_organizations` (id, legal_name, display_name, entity_type, jurisdiction, status, normalized_name_key text generated as a search aid — **no unique constraint**, created_at, updated_at)
- `organization_relationships` (id, parent_organization_id FK, child_organization_id FK, relationship_type, effective_from, effective_to, check parent <> child) + unique (parent, child, relationship_type, effective_from)
- `organization_person_roles` (id, business_organization_id FK, person_id FK, role_type, effective_from, effective_to) + index per org and per person
- `organization_external_ids` (id, business_organization_id FK cascade, system, external_id) + unique (system, external_id)

**Migration 3 — Property domain**
- `properties` (id, display_name, address_line_1, address_line_2, city, state, postal_code, country, normalized_address_key text — **indexed, NOT unique**, status text not null default 'active' check in (active, inactive, archived), created_at, updated_at)
- `units` (id, property_id FK cascade, unit_label, status, created_at, updated_at) + unique (property_id, unit_label), index on property_id — **created, not seeded**
- `property_organization_relationships` (id, property_id FK, business_organization_id FK, relationship_type check in (owner, manager, lender, other), effective_from date not null, effective_to date, source text, created_at) + partial unique (property_id, relationship_type) where effective_to is null — one current owner per property
- `property_external_ids` (id, property_id FK cascade, system, external_id) + unique (system, external_id)

**Migration 4 — Link columns** (nullable, no default, never NOT NULL)
- `profiles.person_id uuid references people(id)` + unique index
- `companies.business_organization_id uuid references business_organizations(id)` + unique index
- `projects.property_id uuid references properties(id)` + plain index

**Migration 5 — Seed / backfill** (section E; guarded, idempotent, raises on conflict)

Every migration: additive; explicit FK, check and partial-unique constraints; index on every FK and lookup key; `ENABLE ROW LEVEL SECURITY` and policies *before* GRANTs; no existing column value rewritten other than the three new link columns; existing policies untouched; single transaction each.

On corrections C and D: `normalized_address_key` and `normalized_name_key` exist as duplicate-detection and search aids with plain indexes only. Duplicate prevention comes from the guarded seed (keyed on source `projects.id` / `companies.id` via the external-ID tables) plus explicit conflict checks — not from a global uniqueness rule that would misfire on legitimately similar addresses or renamed entities.

## D. RLS and helper functions — conservative, scoped

Helpers, all `SECURITY DEFINER`, `STABLE`, `SET search_path = public`:

- `is_shared_core_admin(_user_id uuid)` → `is_admin(_user_id) OR is_org_admin(_user_id, get_user_org_id(_user_id))`
- `can_see_property(_user_id uuid, _property_id uuid)` → admin, **or** `EXISTS (select 1 from projects p where p.property_id = _property_id and is_project_member(_user_id, p.id))`
- `can_see_person(_user_id uuid, _person_id uuid)` → admin, **or** the person is the caller's own linked Person, **or** the person shares at least one project with the caller (`project_members` on both sides via `profiles.person_id`)

Policies (`to authenticated` only; **no `anon` grant on any Package A table**):

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `people` | `can_see_person(auth.uid(), id)` | admin |
| `person_contact_methods` | `can_see_person(auth.uid(), person_id)` | admin, or self for own rows |
| `person_auth_identities` | self only (`person_id` = caller's linked Person) or admin | admin |
| `person_external_ids` | admin | admin |
| `business_organizations` | admin, or the org is linked to a `companies` row the caller can already see via `user_can_see_company` | admin |
| `organization_relationships` | admin | admin |
| `organization_person_roles` | admin, or `person_id` = caller's own Person | admin |
| `organization_external_ids` | admin | admin |
| `properties` | `can_see_property(auth.uid(), id)` | admin |
| `units` | `can_see_property(auth.uid(), property_id)` | admin |
| `property_organization_relationships` | **admin only** | admin |
| `property_external_ids` | admin | admin |

Why this preserves rather than broadens access: baseline for every one of these tables is zero rows (they do not exist). Property and Unit visibility is derived strictly from `is_project_member`, which is exactly the gate that already controls project visibility today — a contractor sees a Property only if they already see a Project on it. Person visibility is self, shared-project, or admin — narrower than the current `profiles` policies, which already permit same-org profile reads. Ownership, external IDs and org structure stay admin-only, so no contractor gains any view of entity or ownership data they lack today. No existing policy on `profiles`, `companies`, `projects`, `tasks`, `shifts`, vendors or QuickBooks tables is modified.

## E. Backfill / seed rules (final decisions applied)

Driven by explicit source UUIDs, never by name matching. Every Person, Organization and Property records its source row in the matching `*_external_ids` table (`system = 'bfp_dashboard'`, `external_id` = the source uuid) — that mapping, not a name or address, is the idempotency key.

**People — ACTIVE (`people.is_active = true`), one Person per profile, `person_auth_identities` row with provider `supabase_auth` and `subject_id` = the auth uuid, plus `person_contact_methods` email from `auth.users.email`:**
Andrew Shelton, James King, Jamiel A, Jeff Coffman, Jennifer Bahr, Josiah Bahr, Justin L Grimes, Kait McClaskey, Kaleb Mcclaskey, Kurt Bahr, Kurt Micah Bahr, Lydia Bahr, Marcus Freeman, Michele Wilkes, Rebecca Shelton, Samantha Hubbard — **plus Judah Bahr** (`bc10cc44-…`), `is_active = true` in the Person model while his `profiles.is_active` stays `false`; the backfill writes **only** `profiles.person_id` and never touches `is_active`, so his live login is not reactivated.

Kurt Bahr (`e3794c43-…`) and Kurt Micah Bahr (`193dbb75-…`) are seeded as **two distinct People**, each with its own auth identity. Micah's row keeps his legal name in `legal_full_name` and carries `preferred_name = 'Micah'`, `display_name = 'Micah Bahr'`.

**People — INACTIVE historical (`is_active = false`, Person + external ID + auth identity marked inactive):** Ally S `bfdba597-…`, Hunter Segers `67bdc199-…`, Tatem Chrismer `a9cc14ac-…`, Trenton Tash `b2a3b86d-…`.

**Excluded — no Person, no `person_id`, legacy rows untouched:** Aamir Taqvi `07e8272e-…`, adam `9bb46d6c-…`, Blake Whiting `f8904248-…`, DeWayne L Stiers `e705d147-…`, Eric Szymanski `8b6a79c4-…`, Giovanni Corbett `87f8c262-…`, Ryan Richardet `1f0d07d8-…`.

**Business organizations — all three:** Bahr Family Homes LLC (`companies.id 30b15ebf-…`), Bahr Family Properties LLC (`05b1f8c5-…`), FOBAR Holdings, LLC (`0f5f6b14-…`). Each gets `organization_external_ids` and a `companies.business_organization_id` link. FOBAR is created despite owning none of the four seed properties.

**Properties — exactly four, `status = 'active'`, no lifecycle value encodes rental/construction:**

| Property | Source project | Owner seeded in `property_organization_relationships` |
|---|---|---|
| 1428 Ramona | `ea153701-…` | Bahr Family Homes LLC |
| 4150 Taft Avenue | `d9793b78-…` | Bahr Family Properties LLC |
| 4441 Nebraska Avenue | `a5154a05-…` | Bahr Family Properties LLC |
| 137 Forestwood Drive | `043dcc77-…` | Bahr Family Properties LLC |

Ownership comes solely from `projects.company_id` on those four rows, recorded with `relationship_type = 'owner'`, `effective_from = CURRENT_DATE`, `source = 'bfp_company_assignment'`. It is never inferred from payment account, QuickBooks class or realm, `project_type`, or management arrangement. 105 Walnut Hill and 1150 Wedgewood are excluded. A query confirmed 4441 Nebraska has exactly one project row, so it becomes one canonical Property with active work represented at the Project layer, not on the Property. **No `units` rows are seeded.**

## F. Conflict and idempotency handling

- Each insert is keyed on the source uuid through `person_external_ids` / `organization_external_ids` / `property_external_ids` and guarded by `WHERE NOT EXISTS`. A clean rerun is a no-op.
- Unique constraints do the structural work: `(system, external_id)` on all three mapping tables, `(provider, subject_id)` on auth identities, unique `profiles.person_id` and `companies.business_organization_id`, one-current-owner partial unique on `property_organization_relationships`.
- **Stop, don't guess.** If a `profiles`, `companies` or `projects` row already carries a link pointing at a *different* canonical record than the seed expects, the migration raises and the whole transaction aborts. Same for a source uuid already mapped to a different canonical row, an existing current owner disagreeing with the seeded owner, or two seed properties resolving to the same `normalized_address_key` (which raises for human review rather than silently merging, since the key is not unique).
- Each migration is one transaction, so a partial run leaves no half state.

## G. Regression test plan

Signed in as admin and separately as a plain contractor: login, session, profile load; admin / `can_manage_projects` / org / project role gating; project list and project detail; task create, edit, stage change, blockers, materials, photos; scope → project conversion (`convert_scope_to_project` must still produce a project with `property_id` null and correct members/tasks); clock in and out, shift create/edit/delete inside the 7-day contractor window, allocations, payroll summary and Ready-to-Bill totals, payment history; vendor list, search, pull, push; QuickBooks connection status, validate settings, payroll bill export, reimbursement bill — confirming no mapping was invalidated; Today page, alerts, mobile bottom nav and desktop sidebar; contractor sees only their own projects and shifts. Plus `bunx vitest run` and a type-check with types **not** regenerated, then a second type-check after regeneration to confirm widening is safe.

## H. Security test plan

Run as four real identities, never service role: admin; org member/manager; plain contractor; signed-out client.

- contractor sees a Property only for a project they are a member of; zero rows for other properties
- contractor sees Units only through a visible Property
- contractor sees People limited to self and shared-project colleagues
- contractor gets zero rows from `property_organization_relationships`, all `*_external_ids` tables, `organization_relationships`, and other people's `person_auth_identities`
- signed-out client gets zero rows from every Package A table, and `anon` holds no grant on any of them
- a user in a different workspace org gets zero rows
- contractor write attempts on every Package A table are rejected
- existing cross-org isolation on `projects`, `profiles`, `shifts` re-verified after the link columns exist

## I. Rollback plan

Reverse order: drop policies and helper functions → drop link columns `projects.property_id`, `companies.business_organization_id`, `profiles.person_id` with their indexes → drop `property_external_ids`, `property_organization_relationships`, `units`, `properties` → `organization_external_ids`, `organization_person_roles`, `organization_relationships`, `business_organizations` → `person_external_ids`, `person_auth_identities`, `person_contact_methods`, `people`.

Lossless for all pre-existing data: no existing column value is overwritten. **Not lossless:** (1) dropping the link columns and canonical tables destroys the Package A mapping, which would have to be re-seeded; (2) the four seed projects' `updated_at` bump is not restored. Because column and table drops are destructive, rollback is a deliberate, explicitly confirmed operation.

## J. Staging / isolation — verified conclusion

**Not isolated. STOP.**

**Environment evidence inspected today (no changes made):** backend project info reports Backend = Lovable Cloud (managed by Lovable); **Live (prod) instance: ref `fuwjacbhgkgibdvjwryr`**; **session tools bound to: Live (`fuwjacbhgkgibdvjwryr`)**; client `.env` points at the **same** ref and URL `https://fuwjacbhgkgibdvjwryr.supabase.co`; instance size Tiny; paused = false. **No Test instance ref is reported for this project** — the metadata lists a Live instance only. A backend health check returned auth and database reachable on that single instance. The Cloud project record in this session likewise names one instance serving both preview and the published app.

**Answers.** (1) No — this project does **not** currently have separate Test and Live database environments. (2) Not applicable. (3) Confirmed: there is exactly one current database, ref `fuwjacbhgkgibdvjwryr`, and it holds the live BFP data inspected in this report — the same database the published app and every query in this session used. (4) Evidence is listed above and is limited to backend project/environment metadata, backend health, and the client env refs; nothing was inferred from app behaviour. (5) No environment change was made.

A Lovable draft is therefore not a rehearsal environment: it is a code/schema branch over this same database. Reads inside a draft read live rows, and any data-level statement issued from it lands on live data. Migrations 1–4 are structurally safe to stage in a draft; **migration 5 (the seed) has no safe rehearsal here.**

Required before implementation: a genuinely separate Supabase/Lovable Cloud project holding a restored copy of this schema and a representative data copy, where migrations 1–5 and the full G and H test passes run end-to-end. Once that passes, apply to production through a draft with an immediate post-apply verification pass. Until that staging target exists, Package A stays **NO-GO for execution**.


## K. Remaining questions

None requiring your business judgment — every People, Organization and Property decision is now settled. One operational decision is yours: approve the staging procedure in section L, or hold Package A until a staging project exists.

## L. Staging-copy capability findings and procedure (inspection only)

### 1–2. What a remix does and does not carry over

**The official documentation is inconsistent on the single most important point.** Queried today, it states in one place that a remix of a Cloud project *stays connected to the original project's Cloud backend* (so data, auth users, secrets and storage are not copied and the remix would be writing to production), and in another place that a remix *gets its own separate backend with an empty database*. These cannot both be true, and I will not guess which applies to this project.

What is not in dispute across both readings:

| Item | Copied to a remix? |
|---|---|
| Application code / repo | Yes — full copy |
| New independent project entry | Yes |
| New independent backend + database | **Unverified — must be confirmed on the remix itself before any write** |
| Schema (tables, functions, policies) | Recreated from migrations if the remix gets its own backend; shared if it does not |
| Row data | **Never copied** |
| Auth users | **Never copied** |
| Secrets and integration credentials (QuickBooks, Stripe, Twilio, AI keys) | **Never copied** — must be re-added |
| Storage files (receipts, task photos) | **Never copied** |
| Custom domains | **Never copied** — `bfpdashboard.lovable.app` stays with production |

What would remain pointed at production if nothing is changed: the QuickBooks OAuth redirect URI and `APP_BASE_URL`, any Twilio/Stripe/AI credentials if re-added from production values, and — in the worst case — the database itself, if the remix shares the original backend.

### 3. Safest procedure (do not execute yet)

1. Create the staging project in the same workspace.
2. **Hard gate before anything else:** read the staging project's backend project info and compare its instance ref to `fuwjacbhgkgibdvjwryr`. If it is the same ref, the staging project is production — stop immediately, make no writes, and fall back to step 3 below. Only a different ref proves isolation.
3. If the ref is the same (shared backend), abandon the remix path and instead create a **fresh project**, paste in the code, and let Lovable Cloud provision a new backend for it. A fresh project cannot inherit the production ref.
4. On the confirmed-isolated staging backend, apply the existing migration history to recreate schema, functions and RLS.
5. Add **no** production secrets. Leave QuickBooks, Stripe and Twilio secrets unset, or set them to sandbox values. Unset credentials make those edge functions fail closed — which is the desired staging behaviour — so no QuickBooks write can reach a real company, no payment action can run, and no message can reach a real person.
6. Point `APP_BASE_URL` and the QuickBooks redirect URI at the staging URL, never the production domain. Do not attach a custom domain.
7. Seed **synthetic** auth users, not real ones: one global admin, one org owner/admin, one project manager, one plain contractor who is a member of exactly one project, and one user in a separate workspace org. Give them fake emails on a domain you control or a disposable domain, so no real inbox can be hit.
8. Seed a representative but synthetic data set: two or three companies, four or five projects with realistic `company_id` assignments, project memberships, a handful of tasks and shifts. Do not copy real contractor names, rates, receipts or QuickBooks IDs — RLS behaviour does not depend on real values, and real payroll data in a second database is a needless exposure.
9. Run migrations 1–5 and the full G and H passes there.
10. Only then apply to production, and run the verification pass immediately after.

### 4. Does creating the copy change production?

Creating a remix or a new project does not itself alter this project's code, schema, data or settings. The risk is not creation — it is the possibility that the copy shares this backend, which is why step 2 is a hard gate before any write.

### 5. Recommendation

**Create a fresh project and bring the code and migrations across, rather than remixing.** A remix's backend behaviour is exactly the point the documentation contradicts itself on, and the failure mode — believing you are rehearsing while writing to live payroll data — is the worst outcome available. A fresh project has no ambiguity: it provisions its own backend. If you prefer the remix for convenience, it is acceptable only with the step 2 ref check enforced before a single write.

### 6. Steps requiring you in the Lovable UI or an external provider

- Creating the remix or new project (dashboard or project menu).
- Enabling Lovable Cloud on the staging project if it is not provisioned automatically.
- Adding any sandbox secrets in the staging project's Settings → Secrets.
- Creating the Intuit **sandbox** company and sandbox app credentials, if you want to exercise QuickBooks rather than let it fail closed.
- Confirming no custom domain is attached to staging.
- Confirming sign-ups or invites in the staging project if email confirmation is on.

