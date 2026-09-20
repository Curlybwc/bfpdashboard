# B1 Foundation — Feasibility / Integration Risk Review (inspection only)

Critique of the proposed additive B1 foundations against the current production schema, verified by direct queries this turn (pg_policies, pg_constraint, pg_indexes, pg_trigger) plus the A–V inventory. Nothing changed; nothing implemented.

## A. Verdict: GO WITH CHANGES

The B1 direction is technically feasible on this schema with no destructive changes. All proposed table names are unused (verified against the full table list — 78 tables, none named scope_concepts*, scope_captures, scope_interpretations, scope_change_*, work_information_gaps). Changes required before build:

1. **scope_captures must NOT clone field_captures** — see C.
2. **Defer scope_concept_recipe_links / _cost_links / _checklist_links to B2** — see C.
3. **Every new top-level table needs org_id** — org scoping is the codebase's core isolation rule (`is_org_member`/`get_user_org_id` pattern in every existing policy).
4. scope_interpretations needs an explicit immutability mechanism (revoke UPDATE or a guard trigger), not convention.

## B. Exact conflicts with existing structures

- **Name collisions: none.** No existing table, column, or function shares the proposed names.
- **field_captures role overlap (the only real conflict):** `field_captures` already stores `raw_text, ai_output, parse_status, include_materials, error, created_by, created_at` with FK → projects ON DELETE CASCADE and project-scoped RLS (`is_project_member` SELECT; contractor/manager INSERT/UPDATE; admin delete — verified in pg_policies). A second raw-capture table duplicates its semantics. It cannot be generalized instead: `project_id` is NOT NULL there, and pre-construction scopes have no project, so a separate `scope_captures` is correct — but it must reuse field_captures' column vocabulary (status/error/metadata), not invent a third dialect.
- **`convert_scope_to_project` (SECURITY DEFINER):** inserts tasks without referencing any new column. SECURITY DEFINER bypasses RLS, so additive nullable columns on scope_items are invisible to it — no conflict, but it also means concepts will not propagate to tasks until the conversion engine is rebuilt (expected in B1 scope).
- **Dual writers on scope_items:** `ScopeWalkthrough.tsx` client-side apply + `scope_walkthrough_apply` edge + `ScopeDetail`/`FinalPassSheet`/`DeduplicateSheet` all UPDATE scope_items directly (status/notes/price). B1 adds no second writer (change-ops tables stay unwritten until B2), so no conflict today — but B2 must route through change-ops or these become competing writers.
- **Triggers:** scopes and scope_items carry only `update_*_updated_at` triggers (verified in pg_trigger). No validation trigger will fight new columns.
- **RLS shape to mirror (verified):** scope child tables today use SELECT `is_admin OR is_scope_member(scope_id)`; INSERT/UPDATE/DELETE `is_admin OR get_scope_role ∈ (editor, manager)`. scopes themselves add the org-admin branch (`is_org_admin OR is_scope_member`). New child tables must replicate both branches or org admins silently lose access to rows they can see today.
- **Index debt context:** `scope_items` currently has ONLY its PK index (verified in pg_indexes) — no index on scope_id, cost_item_id, or recipe_hint_id. Any new FK columns must be indexed, and this is the moment to add `scope_items(scope_id)` without behavior change.

## C. Merge / simplify / defer recommendations (with evidence)

1. **Merge: scope_captures ↔ field_captures vocabulary.** Keep them as two tables (field_captures.project_id NOT NULL blocks reuse for scopes) but copy its field semantics (status, error, metadata) so one parser pipeline can later read both. Evidence: field_captures DDL above.
2. **Defer: scope_concept_recipe_links / _cost_links / _checklist_links.** B1 wires nothing to concepts (`scope_walkthrough_parse` untouched per item 6), so these would be dead tables from day one — the codebase already carries half-built dead capabilities (A–V §S). The per-item single links already exist as columns: `scope_items.recipe_hint_id` (FK verified) and `scope_items.cost_item_id` (FK verified). Create the concept link tables in B2 when semantic matching actually needs them.
3. **Simplify: checklist concept links.** Checklist coverage already has `checklist_items.normalized_label` + `default_cost_item_id` and the deterministic matcher in `scope_walkthrough_parse` — a concept→checklist link table would compete with the working matcher. Fold into the concept aliases instead.
4. **Keep separate: scope_interpretations and scope_change_sets/operations.** No existing structure holds versioned AI output for scopes (field_captures.ai_output is a single mutable jsonb on a project row — provenance is lost on re-run). These fill a genuine gap.
5. **Keep: work_information_gaps.** Nothing similar exists (`task_blockers` is orthogonal — resolved-state, not missing-info Q&A).

## D. Recommended B1 structure (design text only — not applied)

```text
scope_concepts:          id, org_id NOT NULL→organizations, canonical_name NOT NULL,
                         status NOT NULL DEFAULT 'active' (active/inactive),
                         notes, created_by→auth.users, created_at, updated_at
                         -- NO unique on canonical_name (per principle); matching done in code
scope_concept_aliases:   id, org_id, concept_id NOT NULL→scope_concepts ON DELETE CASCADE,
                         alias NOT NULL, source_system DEFAULT 'bfp_dashboard', created_by, created_at
                         -- unique (concept_id, lower(alias)) ONLY (per-concept idempotency, not global)
scope_items.scope_concept_id  uuid NULL →scope_concepts ON DELETE SET NULL  + INDEX
scope_items(scope_id)         INDEX  (pre-existing debt, additive)

scope_captures:          id, org_id, scope_id NOT NULL→scopes ON DELETE CASCADE,
                         property_id NULL→properties, created_by, source_type NOT NULL,
                         source_system DEFAULT 'bfp_dashboard', external_source_id,
                         raw_text NOT NULL, status DEFAULT 'raw',
                         metadata jsonb, captured_at NOT NULL DEFAULT now()
                         INDEX (scope_id, captured_at DESC)
scope_capture_assets:    id, capture_id NOT NULL→scope_captures ON DELETE CASCADE,
                         kind, storage_path, byte_size, created_at
scope_interpretations:   id, org_id, capture_id NOT NULL→scope_captures ON DELETE CASCADE,
                         scope_id NOT NULL (denormalized for RLS), model, prompt_version,
                         interpretation_json NOT NULL, supersedes_id NULL self-FK,
                         created_by, created_at  -- INSERT/SELECT only; UPDATE revoked or guard-triggered
scope_item_evidence_links: id, org_id, scope_id NOT NULL (denorm), scope_item_id NOT NULL→scope_items
                         ON DELETE CASCADE, interpretation_id NULL, capture_id NULL,
                         relationship_type NOT NULL CHECK IN (supports,adds,changes,
                         contradicts,supersedes,clarifies), created_by, created_at
                         INDEX (scope_item_id), INDEX (interpretation_id)

scope_change_sets:       id, org_id, scope_id NOT NULL→scopes ON DELETE CASCADE,
                         interpretation_id NULL, source NOT NULL (ai/manual),
                         status NOT NULL DEFAULT 'proposed' (proposed/approved/applied/
                         rejected/superseded), created_by, created_at, applied_at, applied_by
scope_change_operations: id, org_id, change_set_id NOT NULL→scope_change_sets ON DELETE CASCADE,
                         scope_id NOT NULL (denorm), operation_type NOT NULL,
                         target_table NOT NULL, target_id uuid NULL,
                         proposed_values jsonb NOT NULL, confidence numeric,
                         requires_human_review NOT NULL DEFAULT true,
                         result_status NULL, applied_at NULL, applied_by NULL, error NULL

work_information_gaps:   id, org_id NOT NULL, property_id NULL→properties,
                         scope_id NULL→scopes, scope_item_id NULL→scope_items,
                         project_id NULL→projects, task_id NULL→tasks,
                         task_material_id NULL→task_materials,
                         question NOT NULL, status NOT NULL DEFAULT 'open'
                         (open/answered/no_longer_needed/superseded),
                         urgency NOT NULL DEFAULT 'nice_to_need' → use the six proposed values,
                         responsible_user_id NULL, responsible_role NULL,
                         due_at, required_before_event NULL,
                         answer NULL, answered_by NULL, answered_at NULL, evidence jsonb,
                         created_by, created_at, updated_at
                         CHECK (at least one target non-null); INDEX per target column
```

All tables: standard GRANT block (authenticated CRUD where policies allow, service_role full, no anon), RLS enabled, `updated_at` triggers where the column exists. Denormalized `scope_id`/`org_id` columns exist solely so RLS predicates stay single-table — this matches how `task_blockers` and `field_captures` already carry their authorization anchor.

## E. RLS strategy — reuse existing helpers, no new functions

No new SECURITY DEFINER helpers needed; `is_admin`, `is_org_member`, `is_scope_member`, `get_scope_role` are live and EXECUTE-hardened. Mirror existing policies exactly:

- Concept tables (org-scoped): SELECT `is_org_member(auth.uid(), org_id)`; write `is_admin OR is_org_admin(org_id)`.
- Capture/interpretation/evidence/change tables (scope-scoped): SELECT `is_admin OR is_scope_member(scope_id)`; write `is_admin OR get_scope_role(scope_id) ∈ (editor, manager)` — byte-for-byte the scope_items policy shape (verified above), so org admins keep access via their existing admin branch and contractors get no new reach.
- scope_interpretations: additionally REVOKE UPDATE (immutability by grant, not convention).
- work_information_gaps: SELECT org members; INSERT by scope/project editors+managers or admin; UPDATE (answer/close) by admin, responsible_user_id, or the creating user — no contractor broadening beyond org membership, which is the existing floor.

## F. Migration ordering

1. One additive migration: enums/checks inline → tables (concepts first, then scope_items link column + indexes, then captures → assets → interpretations → evidence → change sets → operations → gaps) → GRANTs → RLS enable → policies → immutability revoke on interpretations.
2. Run `supabase--get_types` only after the migration reports success.
3. No backfill exists (all new columns/tables start empty); any concept seeding is a data operation, not schema.
4. Staging first (ref `iuaqsqdxflakhphnwyec`), per standing practice.

## G. Compatibility risks to current flows

- **ScopeWalkthrough / FinalPass / Deduplicate / ScopeDetail:** all keep writing scope_items exactly as today. `useScopeDetail` uses `select('*')` — the new nullable `scope_concept_id` simply rides along; verify no component does exhaustive column mapping or strict object-shape assertions on scope_items (A–V §T notes `as any` casts already exist in recipe hooks — same class of drift, low risk).
- **DeduplicateSheet merge semantics undefined for concepts:** when two items merge, which `scope_concept_id` survives must be decided before B2 (technical, not business — recommend keep the earliest created item's value).
- **convert_scope_to_project:** unaffected, but its rebuilt successor must be taught to carry `scope_concept_id` and capture/interpretation lineage forward — flag now so B2/B3 don't inherit silent provenance loss (the exact failure A–V §E documents for estimates).
- **FieldModeCapture / ProjectWalkthrough:** project-level; zero interaction with scope-scoped tables.
- **Payroll/shifts/QB/Today/assignment rules:** no shared surface; untouched.

## H. Generated-types / build risks

`src/integrations/supabase/types.ts` (≈127KB) is regenerated by the platform after the migration — same procedure as Package A, proven. Risks are minor: (a) any code doing exhaustive switch on scope_items keys would see the new column (none found); (b) new tables are invisible to the client until types refresh, so no client code should reference them in the same change set as the migration; (c) typecheck/build must run after types regenerate, as in Package A.

## I. Rollback ordering

Reverse dependency order: drop policies → revoke immutability (if trigger used, drop trigger first) → drop evidence links → interpretations → capture assets → scope_captures → change operations → change sets → work_information_gaps → concept aliases → `ALTER TABLE scope_items DROP COLUMN scope_concept_id` → scope_concepts → drop the additive `scope_items(scope_id)` index last (harmless to keep). No trigger or function on existing tables is added, so nothing pre-existing is restored. Same caveat as Package A: `scope_items.updated_at` will advance on any row touched; nothing else changes.

## J. B1 staging test matrix

1. Preflight: 0 tables with B1 names exist on staging.
2. Apply migration; GRANT/RLS present; `supabase--get_types`; typecheck + build.
3. RLS impersonation with seeded staging users: global admin; org owner/admin; scope manager; scope editor; scope viewer; contractor in org but NOT a scope member; a second-org user. Assert per table: non-members see 0 scope rows; viewer read-only; editor/manager write; admin full; interpretations reject UPDATE for everyone but service_role; cross-org user sees 0 concepts.
4. Regression on live flows in staging: create scope → walkthrough parse/apply → manual item edit → FinalPass → dedupe → convert to project → task appears; confirm identical behavior to pre-migration (this is the "keep current functionality" guarantee).
5. Immutability: attempt UPDATE on scope_interpretations as admin — expect denial.
6. FK behaviors: delete scope → captures/interpretations/evidence/change sets cascade; delete concept → scope_items.scope_concept_id NULLed, aliases cascade; delete gap target rows → behavior per FK choice (SET NULL for gaps).
7. Confirm production untouched until an explicitly authorized production migration.

## K. Business questions genuinely unresolved

1. Who curates the canonical concept vocabulary — Jen only, or also office/manager staff? (Determines the write policy on scope_concepts.)
2. Should a worker's dictated raw capture text be visible to all scope members, or restricted to managers? (Determines scope_captures SELECT policy.)
3. When a work-information gap is raised, who is accountable for answering — a named person, a role (e.g. "manager"), or Jen by default? (Determines responsible_role defaults and whether gap answering needs a notification path later.)

## L. Behavior confirmation

Yes — B1 as revised is buildable with **zero user-visible change**: it creates new tables, one nullable FK column on scope_items, indexes, and policies; modifies no existing table column, function, trigger, or policy; and no UI references the new structures. Every current flow (ScopeDetail, walkthrough, FinalPass, dedupe, conversion, Field Mode, shifts/payroll, QB, Today) retains byte-identical behavior.
