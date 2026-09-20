# BFP Dashboard — Current-State Capability Inventory (inspection only)

Evidence collection across capture → scope → conversion → tasks → materials → assignment → execution → shifts/payroll → estimate-vs-actual → Today views. No code, data, or settings changed. Nothing here is a proposal; every claim cites the file/function/table it was verified in.

## A. User-visible entry points

| Flow | Route / page | Key components |
|---|---|---|
| Scope list & create | `/scopes` `src/pages/ScopeList.tsx` | "New" dialog (admin / can_manage_projects only) |
| Scope detail & manual items | `/scopes/:id` `src/pages/ScopeDetail.tsx` | `src/hooks/useScopeMutations.ts`, `useScopeDetail.ts`, `useScopeChecklistCoverage.ts`, `FinalPassSheet.tsx`, `DeduplicateSheet.tsx` |
| Scope walkthrough (AI) | `/scopes/:id/walkthrough` `src/pages/ScopeWalkthrough.tsx` | `DictateButton.tsx`, `useSpeechInput.ts`, rehab-template generation UI |
| Scope accuracy | `/scopes/accuracy` `src/pages/ScopeAccuracy.tsx` | variance vs `actual_total_cost` |
| Project detail | `/projects/:id` `src/pages/ProjectDetail.tsx` | task list, packages, mobile action sheet |
| Project walkthrough | `src/pages/ProjectWalkthrough.tsx` | feeds field-mode pipeline |
| Field capture | `FieldModeCapture.tsx` → `FieldModePreview.tsx` | voice/text → parse → review → submit |
| Task detail | `/tasks/:id` `src/pages/TaskDetail.tsx` | lifecycle actions, subtasks, recipe suggestion/create/expand, materials (`TaskMaterialsSheet.tsx`), photos, comments, blocker UI |
| Shifts | `/shifts` `src/pages/Shifts.tsx` | `ShiftForm.tsx`, `ShiftsCalendarView.tsx`, `ShiftDaySheet.tsx`, `ShiftDetailSheet.tsx` |
| Clock in/out | Today + global | `ClockStatusCard.tsx`, `GlobalClockBanner.tsx`, `ActiveShiftsLiveCard.tsx` |
| Payroll | `/payroll` `src/pages/Payroll.tsx` | `PayrollSummary.tsx`, `PaymentHistory.tsx`, `SplitPaymentDialog.tsx` |
| Accounting | `/accounting` `src/pages/Accounting.tsx` | historical payments, ledger |
| Analytics | `/analytics` `src/pages/Analytics.tsx` | `LaborBreakdownSheet.tsx` drill-down |
| Today | `/today` `src/pages/Today.tsx` | `useTodayData.ts`, `NextUpCard`, `WhatNextCard`, `AlertsBanner`, `DailyReminders` |
| Shopping | `/shopping` `src/pages/Shopping.tsx` | `useShopping.ts` global shopping list |
| Product library | `/products` `src/pages/ProductLibrary.tsx` | `ProductFormDialog`, `ProductPicker`, `ProductDetailSheet`, `useProductLibrary.ts` |
| Materials/tools | `MaterialInventory.tsx`, `ToolInventory.tsx`, `ProjectMaterials.tsx` | tool voice-parse bulk add |
| Admin | `/admin/*` | `AdminRehabLibrary.tsx`, `AdminRecipes.tsx`, `AdminMaterialBundles.tsx`, `AdminAssignmentRules.tsx`, `AdminCrewGroups.tsx`, `AdminAliases.tsx`, `AdminStoreSections.tsx`, `CostLibrary.tsx`, invites/tenants/users |

## B. Server / edge / RPC / DB functions

- Conversion: `convert_scope_to_project(p_scope_id)` — auth (admin or can_manage_projects), active-scope check, estimate snapshot, project + manager membership insert, 1:1 task inserts, `apply_assignment_rules` per task.
- Scope parsing: edge `scope_walkthrough_parse` (LLM + deterministic checklist mapping), `scope_walkthrough_apply` (approved status/notes updates only).
- Field capture: edge `field_mode_parse`, `field_mode_submit` (task inserts stage `Not Ready`, materials, bundle application, assignment rules).
- Tools: edge `tool_inventory_parse`.
- Recipes: `expand_recipe` (room-sqft math: `perimeter_ft = round(sqrt(sqft)*4,2)`), `capture_recipe_from_task`, `push_recipe_to_tasks`, `push_recipe_step_to_tasks`, trigger `reassign_default_variant`.
- Recurring: `complete_recurring_task`, trigger `validate_recurrence`.
- Tasks: trigger `sync_task_is_blocked`, trigger `log_task_activity`, trigger `protect_actual_cost`.
- Assignment: `apply_assignment_rules`, `get_project_role`, `is_project_member`.
- Shifts: `clock_in`, `clock_out`, `upsert_shift_with_allocations`, `admin_force_clock_out`, `business_today()` (America/Chicago), triggers `validate_shift`, `validate_shift_allocation`.
- Payroll: `admin_mark_visible_shifts_paid`, `split_payable_batch`, `save_local_historical_payment`, `save_linked_historical_payments`, `mark_batch_qb_matched`, triggers `protect_profile_pay_fields`, `protect_admin_flag`; helpers `get_my_profile_pay`, `admin_get_profile_pay`.
- QuickBooks edges: `quickbooks_connect_begin/callback/status`, `quickbooks_validate_settings`, `quickbooks_export_payables`, `quickbooks_list_accounts/classes/vendors`, `quickbooks_vendor_search/pull/push`, `quickbooks_record_expense`, `quickbooks_create_reimbursement_bill`, `quickbooks_search_transactions`; trigger `on_company_qb_connection_change`, `invalidate_company_qb_mappings`.
- Stripe: `stripe_connect_account_link`, `stripe_sync_payout_profile`, `stripe_create_payout_run`, `stripe_submit_payout_run`.
- Org/admin: `handle_new_user` trigger, `on_org_created`, `clone_seed_libraries_to_org`, `revoke_org_invite`, `merge_projects`, `admin_move_user_to_my_org`, `admin_list_stranded_users`, `admin_delete_user` edge, `admin_impersonate` edge.
- Reimbursements: `admin_mark_reimbursement_paid`, `reimbursement_signed_url`, trigger `validate_reimbursement_amounts`.
- Ezzie core helpers: `is_shared_core_admin`, `can_view_person`, `can_view_property`, `can_view_business_organization`.

## C. Tables / key columns / relationships

- `scopes` (name, address, status, `converted_project_id`, `converted_at`, `baseline_locked_at`, `estimated_total_snapshot`, `checklist_template_id`, `org_id`) → `scope_items` → `scope_members`, `scope_checklist_reviews`.
- `scope_items` (description, status text, qty, unit, `unit_cost_override`, `computed_total`, `pricing_status`, `cost_item_id`→cost_items, `recipe_hint_id`→task_recipes, `phase_key`, `estimated_hours/labor_cost/material_cost`, `added_after_conversion`, notes).
- Libraries: `cost_items`; `rehab_library` + `rehab_library_items` (`recipe_hint_id`); `checklist_templates` + `checklist_items` (`default_cost_item_id`, `normalized_label`).
- `projects` (name, address, `scope_id`, `company_id`, `property_id`, `has_missing_estimates`, status, project_type, org_id) → `project_members`.
- `tasks` (39 cols: `parent_task_id`, `is_package`, `sort_order`, stage, priority, `assigned_to_user_id`, `claimed_by_user_id/claimed_at`, `started_at/started_by_user_id`, `completed_at`, `needs_manager_review`, `is_blocked`, `assignment_mode`, `lead_user_id`, `is_outside_vendor`, `source_scope_item_id`, `recipe_hint_id`, `expanded_recipe_id`, `source_recipe_id/source_recipe_step_id`, `field_capture_id`, `bundles_applied`, `actual_total_cost`, trade, room_area, recurrence fields) → `task_materials` (sku, vendor_url, store_section, `provided_by`, `item_type`, `unit_cost`, `is_active`, `confirmed_on_site`, `product_library_id`), `task_candidates`, `task_workers`, `task_blockers`, `task_comments`, `task_photos`.
- Recipes: `task_recipes` → `task_recipe_steps` → `task_recipe_step_materials`; `recipe_variants`.
- Materials ecosystem: `material_library`, `product_price_history`, `task_material_bundles` + `task_material_bundle_items` (keywords, priority), `store_sections`, `material_inventory`, `tool_types`, `tool_stock`.
- Assignment: `assignment_rules`, `crew_groups` + `crew_group_members`, `profile_aliases`.
- Field: `field_captures` (raw_text, ai_output jsonb, parse_status).
- Time/pay: `shifts` (clock_in_at/out_at, `hourly_rate_snapshot`, `is_flat_rate/flat_rate_amount`, date window) → `shift_task_allocations`; `worker_payments` → `worker_payment_shifts`; `worker_payable_batches` → `worker_payable_batch_shifts`; `payout_runs`; `worker_payout_profiles`; `worker_tax_profiles`; `worker_availability`.
- Money/other: `reimbursement_requests`, `vendors`, `cost_items`, `quickbooks_connections/settings/vendor_mappings/class_mappings`, `companies` (`qb_connection_id`, `business_organization_id`), `tenants`.
- Org: `organizations`, `org_members`, `org_invites`, `profiles` (org_id, is_admin, can_manage_projects, pay fields, `skip_qb_export`, `person_id`), `activity_log`.
- Ezzie core (Package A, live): `people`, `person_contact_methods`, `person_auth_identities`, `person_external_ids`, `business_organizations`, `organization_relationships`, `organization_person_roles`, `organization_external_ids`, `properties`, `units`, `property_organization_relationships`, `property_external_ids`; links `profiles.person_id`, `companies.business_organization_id`, `projects.property_id`.

## D. Scope item granularity and conversion behavior

One scope item = one line of work (e.g. "Replace kitchen counters"). Status set: `Not Checked / OK / Repair / Replace / Get Bid`. Conversion filter: status in (Repair, Replace, Get Bid) OR computed_total > 0 (`convert_scope_to_project`, mirrored in `src/lib/scopeConversion.ts`). Conversion is strictly 1:1 item→task; task gets only description, `source_scope_item_id`, `recipe_hint_id`, stage `Ready`, priority `2 – This Week`, materials `No`. All cost/estimate detail stays on the scope item.

## E. Raw input / provenance

- Retained: `field_captures.raw_text` + `ai_output` jsonb, linked via `tasks.field_capture_id`; `tasks.source_scope_item_id` links converted tasks back to scope items; `source_recipe_id`/`source_recipe_step_id` link expanded children back to recipe steps; `estimated_total_snapshot` + `has_missing_estimates` frozen at conversion; `hourly_rate_snapshot` on shifts; `activity_log` via `log_task_activity` trigger.
- Lost at conversion: qty, unit, unit cost, computed_total, estimated hours/labor/material, notes, phase_key, cost_item_id, checklist linkage — none reach the task.
- Lost in walkthrough: raw walkthrough text is NOT persisted for scopes (no `field_captures` equivalent; only resulting items survive). `price_evidence`/`price_confidence` from the parser are computed but not stored on `scope_items`.

## F. AI vs deterministic behavior

- `scope_walkthrough_parse`: LLM proposes matched updates/new items; deterministic server code overrides checklist assignment (cost-item id → exact normalized label → fuzzy Jaccard), computes `not_addressed_checklist_items` deterministically.
- `field_mode_parse`: AI extraction of tasks/materials; `field_mode_submit`: fully deterministic inserts + deterministic bundle matching (priority, then score).
- `tool_inventory_parse`: AI parse of spoken tool lists.
- Client-side deterministic matchers: `checklistMatch.ts` (normalizer + synonyms + adaptive Jaccard), `rehabMatch.ts`, `recipeMatch.ts`, `bundleMatch.ts` — all keyword/normalized/Jaccard scoring, no AI.
- Dedupe on apply (`ScopeWalkthrough.tsx` `matchExistingScopeItem`): cost-item match → exact normalized → substring → fuzzy; ties return null (no wrong merge).

## G. Checklist behavior

`checklist_templates` → `checklist_items` (normalized labels, `default_cost_item_id`); per-scope state in `scope_checklist_reviews` (state mirrors item statuses). Coverage = checklist items not addressed, computed in the parser; `useScopeChecklistCoverage` shows coverage on ScopeDetail; `FinalPassSheet.tsx` is the checklist-driven final review that inserts/updates scope items and upserts reviews. Checklists are QA coverage only — they never generate tasks.

## H. Cost Library vs Rehab Library

- Cost Library (`cost_items`, `CostLibrary.tsx`): name, unit_type, piece_length_ft, `default_total_cost`, active. Feeds walkthrough matching/creation, `useResetToLibraryPrice`, `useUpdateLibraryPrice`. Pricing only, org-scoped, no task linkage.
- Rehab Library (`rehab_library` + `rehab_library_items`, `AdminRehabLibrary.tsx`, `rehabMatch.ts`): trade-scoped templates of typical scope items with `default_status` and `recipe_hint_id`. Walkthrough text keyword-detection suggests templates; manual "Generate" inserts all template items as scope_items (carrying `recipe_hint_id`) — the ONLY writer of `scope_items.recipe_hint_id`.
- Overlap: both can create scope items (rehab directly, cost indirectly via pricing); differ in that rehab = work-content templates, cost = price book.

## I. Recipes

`task_recipes` (keywords, trade, active) → steps (title, sort_order, trade, notes, assignment_mode, `default_candidate_user_ids`) → step materials (name, qty, unit, sku, vendor_url, store_section, provided_by, item_type, unit_cost). `recipe_variants` + `reassign_default_variant` trigger manage alternate paths.
- Hint: `tasks.recipe_hint_id` (from scope conversion or set manually) → suggestion in `useTaskDetailData`/`TaskDetail`; keyword fallback via `recipeMatch.suggestRecipes`.
- Expand: `expand_recipe` RPC — refuses if task already has children or `expanded_recipe_id`; room-area math scales quantities; children get `source_recipe_id/step_id`, crew lead = first default candidate.
- Capture: `capture_recipe_from_task` writes existing children back into a recipe (upsert by sort_order, prune extras).
- Sync: `push_recipe_to_tasks` / `push_recipe_step_to_tasks` propagate library edits to active spawned tasks; `SubtaskRow.tsx` syncs hint metadata back to the recipe.
- Parent/child: `is_package`, `sort_order`; `tryAutoCompleteParent` (taskLifecycle.ts) auto-completes parent when all children are Done (client-side).

## J. Materials / bundles / procurement

`task_materials` is the operational list per task: purchased/delivered flags, `confirmed_on_site`, soft-remove `is_active`, `provided_by`, `item_type` (material/tool/labor), product link. Bundles (`task_material_bundles` + items, keywords + priority) auto-attach by matching (`applyBundles.ts`, `bundleMatch.ts`) on field-capture submit and task flows; `tasks.bundles_applied` marks completion with name/sku/unit dedupe. `material_library` + `push_material_library_to_all` = global product catalog with normalized-name matching; `product_price_history` records purchases (`record_product_price`); `material_inventory`, `tool_types`/`tool_stock`, `store_sections` handle stock/locations/aisles. Shopping (`useShopping.ts`, Shopping.tsx) aggregates active materials on non-Done tasks with status tabs and bulk vendor links. `tasks.materials_on_site` (Yes/Partial/No) is a manual rollup flag.

## K. Assignment / aliases / crew / membership

- `assignment_rules` + `apply_assignment_rules` RPC: server-side routing on task creation (project + scope conversion + field capture), including `is_outside_vendor` (clears assignee).
- Solo: `assigned_to_user_id`; claim sets `claimed_by_user_id`/`claimed_at`.
- Crew: `assignment_mode='crew'`, candidate pool in `task_candidates`, workers in `task_workers`, `lead_user_id`; `crew_groups` presets; recipe `default_candidate_user_ids` propagate on expansion and library sync.
- Aliases: `profile_aliases` + `AdminAliases.tsx` map alternate names for AI/assignment matching.
- Auto-membership: task assignment auto-creates `project_members` rows for non-members (assignment onboarding); conversion adds caller as project `manager`; scope creation adds creator as scope `manager`.

## L. Repeated walkthrough / dedupe / reconciliation

Re-running a walkthrough on the same scope is a merge, not a duplication: parser sees existing items and proposes `matched_updates`; client applies `matchExistingScopeItem` (cost id → exact → substring → fuzzy, ties abstain), `strongerStatus` keeps the more severe status, notes append without duplication, missing price/qty filled only when absent. `DeduplicateSheet.tsx` offers a separate 3-pass manual dedupe (cost id, exact desc, Jaccard). Checklist reviews upsert on `(scope_id, checklist_item_id)`.

## M. Scope → Project conversion

Carried: project name/address/org from scope; per item: description→task, `source_scope_item_id`, `recipe_hint_id`. Snapshot: `estimated_total_snapshot` on scope, `has_missing_estimates` on project. Lost: all per-item money/qty/notes (see E). NOT written despite existing: `scopes.converted_project_id`, `converted_at`, `baseline_locked_at`, status→`Converted`. Duplicate protection: NONE — an active scope can be converted repeatedly, creating duplicate projects. Ownership: new project gets NO `company_id` and NO `property_id` (Package A link columns exist but conversion doesn't set them).

## N. Project walkthrough / Field Mode vs Scope Walkthrough

Field mode (`FieldModeCapture` → `field_mode_parse` → `FieldModePreview` → `field_mode_submit`) operates on an EXISTING project: creates tasks directly (stage `Not Ready`, `needs_manager_review=true`, priority mapped from high/normal/low), materials, bundle application, assignment rules, and persists `field_captures` raw provenance. Scope walkthrough operates pre-project: creates/edits `scope_items` with pricing, checklist coverage, library growth — no tasks until conversion. `ProjectWalkthrough.tsx` is the room-by-room capture UI feeding field mode. Key asymmetries: field capture retains raw text (scopes don't); field-capture tasks get bundles+assignment rules immediately (converted tasks get assignment rules only).

## O. Task hierarchy, dependencies, stages

Hierarchy: `parent_task_id` + `is_package` + `sort_order` (`taskPackages.ts`, `SubtaskRow.tsx`); packages come from recipe expansion. Stages: Ready / In Progress / Not Ready / Hold / Done; claim/start/complete metadata columns; `taskLifecycle.ts` drives transitions client-side; parent auto-completes when children done. Blockers: `task_blockers` (reason enum, resolved_at) orthogonal to stage; `sync_task_is_blocked` trigger maintains `tasks.is_blocked`. `needs_manager_review` gates field-created tasks. `taskOperationalStatus.ts` derives display status (ready/blocked/review/done). No true dependency graph (no depends_on) — blockers are the only dependency mechanism.

## P. Time / shift / payroll / job-cost dependencies

Shifts hang off `project_id` and allocate hours to `task_id` via `shift_task_allocations` (validated by triggers; flat-rate bypasses hours rules). `hourly_rate_snapshot` freezes pay at shift time; `worker_payment_shifts` links payments to shifts for historical rates. Payable batches (`worker_payable_batches` + `_shifts`) are the QuickBooks bill unit, scoped by `company_id` — which comes from `projects.company_id`, so payroll→QB correctness depends on project→company assignment. Job-cost: `tasks.actual_total_cost` (protected by trigger) rolls up client-side (`projectSummary.ts`); `ScopeAccuracy.tsx` compares scope `computed_total` vs actual across projects. Shift edit window: contractors today−7…today via `business_today()` (America/Chicago) in RLS + `upsert_shift_with_allocations` + `shiftWindow.ts`; admins unrestricted.

## Q. Views depending on this chain

Today (`useTodayData.ts` 5-phase hydration: memberships → tasks → crew → blocked/review → enrichment): Working Now / Up Next / Available / Needs Review / Blocked partitions. `alerts.ts` derives blocked/overdue/photo reminders. `DailyReminders` prompts shift logging. `NextUpCard`/`WhatNextCard`. Clock UI (`ClockStatusCard`, `GlobalClockBanner`, `ActiveShiftsLiveCard`) reads `shifts`. Shifts calendar (`ShiftsCalendarView`, paid=green/unpaid=amber chips, multi-contractor filter) + `ShiftDaySheet`/`ShiftDetailSheet` (per-task allocations). Payroll `PayrollSummary` (bi-weekly periods anchored 2026-01-05, "Total Ready to Bill"), `PaymentHistory`, `SplitPaymentDialog`. Analytics labor-by-project with contractor/day/task drill (`LaborBreakdownSheet`). `ScopeAccuracy`. All depend on stage, assignment, blocker, review, allocation, and payment fields created by the flows above.

## R. Tests protecting behavior

`src/test/`: `scopeConversion.test.ts` (convertible filter, total, missing estimates), `checklistMatch.test.ts` (normalizer/Jaccard/status merge/dedupe matcher), `bundleMatch.test.ts` (bundle scoring), `taskPackages.test.ts` (grouping), `taskOperationalStatus.test.ts` (status derivation), `example.test.ts`. No tests cover: conversion RPC, walkthrough parse/apply, shifts, payroll, recipes, assignment rules.

## S. Half-built / dead / unused capabilities

- `scopes.converted_project_id`, `converted_at`, `baseline_locked_at`, status `Converted`/`Draft` in enum — never written.
- `scope_items.added_after_conversion` — never set by conversion.
- `scope_items.recipe_hint_id` — only rehab templates set it; walkthrough items never get one.
- `scope_walkthrough_apply` — narrow function; main apply path is client-side in the page.
- Parser outputs `price_evidence`/`price_confidence`/`suggested_qty` — displayed but not persisted.
- `recipe_variants` exist with default-variant trigger, but expansion uses steps, not variants.
- Ezzie core tables (people, properties, business_organizations, etc.) are seeded and linked, but no app UI reads them yet.
- Push-notification scaffolding absent (postponed by design).
- `scopes.status` enum contains both `Draft/Converted/Archived` and `active/archived` — mixed case conventions.

## T. Architectural inconsistencies / tech debt (do not blindly copy)

1. Business logic split arbitrarily: conversion + assignment server-side; lifecycle transitions, cost rollups, parent auto-complete, bundle matching client-side — dual sources of truth (e.g. `scopeConversion.ts` mirrors the RPC filter and can drift).
2. Dual normalizer/matcher implementations in edge functions vs `src/lib/checklistMatch.ts` (walkthrough parser re-implements normalization).
3. Scope status enum mixes two vocabularies (`Draft/Converted/Archived` vs `active/archived`).
4. No duplicate-conversion guard; converted scope stays `active`.
5. Estimate detail severed at conversion — estimate-vs-actual requires joining back through `source_scope_item_id`.
6. Client-side cost rollups (`projectSummary.ts`) won't scale with task count.
7. Shift date-window logic exists in three places (RLS, RPC, `shiftWindow.ts`).
8. Workspace `organizations` ≠ legal `business_organizations`; `companies` bridges them — three org concepts coexist.
9. Field capture retains raw provenance; scope walkthrough doesn't — inconsistent evidence retention.
10. `useRecipeVariants` bypasses generated types (`as any` cast) — type drift risk.

## U. DO NOT REGRESS — capabilities worth preserving

1. AI walkthrough parsing with human review/selection before any write.
2. Merge-not-duplicate re-walkthrough reconciliation with tie-abstention.
3. Checklist coverage semantics (what's not addressed) and final pass.
4. Cost library auto-growth from walkthroughs + reset-to-library pricing.
5. Rehab template detection/generation, including `recipe_hint_id` seeding.
6. 1:1 conversion provenance (`source_scope_item_id`) and estimate snapshot.
7. Recipe suggest/hint → expand with room-area quantity math; capture-from-task; push-to-active-tasks sync; crew candidate propagation.
8. Material bundles with keyword/priority matching and dedupe; soft-remove materials; provided_by/item_type; shopping aggregation.
9. Assignment rules + outside-vendor routing + auto project membership + aliases.
10. Blockers as orthogonal state with manager resolution; needs_manager_review gate for field-created tasks.
11. Field capture raw-text provenance (`field_captures`).
12. Clock in/out, 12h warnings, admin force-out, split shifts, 7-day contractor window, shift→task allocations, flat-rate support.
13. Payroll: rate snapshots, bi-weekly periods, batch split, payment-shift linking, skip_qb_export, QB realm-scoped export.
14. Today view partitions and operational alerts.
15. Dedupe sheet (3-pass) and ScopeAccuracy variance view.
16. RLS role model (org/project/scope roles) and security-definer helper pattern.

## V. CURRENT LIMITATIONS (not capabilities)

1. No duplicate-conversion protection; scope stays active and reusable as a conversion source.
2. Conversion drops all per-item cost/qty/notes — tasks start bare.
3. No automatic recipes/materials/bundles at conversion (assignment rules only).
4. Scope walkthrough raw text is discarded after parsing.
5. New projects have no company/property — QB routing requires manual fix-up.
6. One scope item can only ever become one task; multi-step work requires manual recipe expansion later.
7. `recipe_hint_id` coverage is sparse (rehab-generated items only).
8. Estimate-vs-actual is cross-project averages, not per-item (per-item estimate never reaches the task).
9. No dependency graph between tasks (blockers only).
10. No notifications (PWA push postponed).
11. Conversion RPC and client mirror can drift; no test locks the RPC behavior.
12. Mixed legacy/Ezzie identity: `profiles` remains the operational user record; `people` is not yet read by the app.
