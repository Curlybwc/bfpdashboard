# Scope Workflow — Current Production Behavior (inspection only)

No code, data, or settings were changed.

## 1. Creating a Scope
`src/pages/ScopeList.tsx` — "New" dialog, admins or users with manage-projects rights only. Inserts into `scopes` (`name` optional, `address` required, `created_by`, `org_id`), then adds the creator to `scope_members` as `manager`. Status defaults to `active`. That is the only scope-creation path.

## 2. Freeform walkthrough parser — YES
- UI: `src/pages/ScopeWalkthrough.tsx` (typed or dictated raw text, `DictateButton`/`useSpeechInput`).
- Parse: edge function `supabase/functions/scope_walkthrough_parse/index.ts` (LLM). It loads the scope's existing items, the org cost library (`cost_items`), and the active `checklist_template_id` → `checklist_items`, then returns:
  - `matched_updates` — updates to existing scope items (status, notes, qty/unit),
  - `new_items` — proposed new scope items (description, status, qty, unit, unit cost, total, price evidence/confidence, `phase_key`),
  - `not_addressed_checklist_items`.
  Checklist assignment is deterministic in server code (cost-item id → exact normalized label → fuzzy), overriding the LLM's guess.
- Review/apply: the page shows every proposed item for edit/selection. On save it
  - optionally writes new `cost_items` (library growth),
  - dedupes against existing scope items (`matchExistingScopeItem`, `strongerStatus`) and merges non-destructively rather than duplicating,
  - inserts the rest into `scope_items`,
  - upserts `scope_checklist_reviews`.
- `supabase/functions/scope_walkthrough_apply/index.ts` is a narrower path that only applies approved status/notes/pricing_status updates to existing scope items.

## 3. `scope_items` fields and manual editing
Columns: `id`, `scope_id`, `phase_key`, `description`, `cost_item_id`, `qty`, `unit`, `unit_cost_override`, `computed_total`, `pricing_status` (`Priced`/`Needs Pricing`), `status` (text: `Not Checked`/`OK`/`Repair`/`Replace`/`Get Bid`), `notes`, `recipe_hint_id`, `estimated_hours`, `estimated_labor_cost`, `estimated_material_cost`, `added_after_conversion`, timestamps.

Manual create/edit/delete: `src/pages/ScopeDetail.tsx` with `src/hooks/useScopeMutations.ts` (`useAddScopeItem`, `useUpdateScopeItem`, `useDeleteScopeItem`, `useResetToLibraryPrice`, `useUpdateLibraryPrice`). Additional creation paths: `FinalPassSheet.tsx` (checklist-driven, resolves a `cost_item_id` by label) and the rehab-template generator (below).

## 4. Scope → Project conversion
Triggered in `ScopeDetail` → `useConvertScope` → RPC `convert_scope_to_project(p_scope_id)` (SECURITY DEFINER). It:
1. requires `is_admin` or `can_manage_projects`, and scope status `active`;
2. sums `computed_total` over ALL items → `estimated_total`; flags `has_missing_estimates` if any convertible item has null/zero total;
3. inserts one `projects` row (name, address, `scope_id`, `has_missing_estimates`, caller's `org_id`);
4. adds the caller to `project_members` as `manager`;
5. writes `scopes.estimated_total_snapshot`;
6. inserts tasks (below) and runs `apply_assignment_rules` per task;
7. returns `{project_id, task_count, estimated_total, has_missing_estimates}`; the UI navigates to the new project.

Note: the RPC does not set `scopes.converted_project_id`, `converted_at`, or move status to `Converted`, even though those columns exist. No `company_id`/`property_id` is set on the new project.

## 5. Which scope items become tasks, and which fields carry
Filter: `status IN ('Repair','Replace','Get Bid')` OR `computed_total > 0` (mirrored client-side in `src/lib/scopeConversion.ts`).

Carried to `tasks`: `task = description`, `source_scope_item_id`, `recipe_hint_id`. Set constant: `stage='Ready'`, `priority='2 – This Week'`, `materials_on_site='No'`, `created_by`. NOT carried: qty, unit, unit cost, computed_total, estimated hours/labor/material, notes, phase_key, cost_item_id, checklist linkage. Cost/estimate data stays on the scope side.

## 6. Libraries today
- **Cost Library** (`cost_items`, `src/components/CostLibrary.tsx`): unit pricing for scope items; the walkthrough matches and can auto-create entries; `Reset to library price` re-pulls `default_total_cost`.
- **Rehab Library** (`rehab_library`, `rehab_library_items`, `src/pages/AdminRehabLibrary.tsx`, `src/lib/rehabMatch.ts`): keyword detection against the walkthrough text suggests templates; a manual "Generate" button inserts a template's items as `scope_items`, carrying `recipe_hint_id` — this is the only place `scope_items.recipe_hint_id` is populated.
- **Checklist templates** (`checklist_templates`, `checklist_items`, `scope_checklist_reviews`, `FinalPassSheet.tsx`): coverage/QA over the scope, not task generation.
- **Recipes** (`task_recipes`, `task_recipe_steps`, `task_recipe_step_materials`, RPC `expand_recipe`): task-side only. After conversion, on a task, `recipe_hint_id` (or keyword matching via `src/lib/recipeMatch.ts`) merely *suggests* a recipe; a human clicks to expand it into child tasks + step materials.
- **Material bundles** (`task_material_bundles`, `src/lib/applyBundles.ts`, `field_mode_submit`): applied on the field-capture path and task-side, not in scope conversion.

So: the only scope→recipe link is the passive `recipe_hint_id` pointer; nothing maps a scope item to a bundle or material set automatically.

## 7. One scope item → one task
Strictly 1:1 at conversion. Multiplicity only appears later and manually, when someone expands a recipe on the created task into child tasks.

## 8. Materials at conversion
None. Conversion creates bare tasks with `materials_on_site='No'` and no `task_materials`. Materials arrive only afterward via manual entry, recipe expansion, bundle application, or the field-capture flow.

## 9. Key files, functions, tables
Files: `src/pages/ScopeList.tsx`, `src/pages/ScopeDetail.tsx`, `src/pages/ScopeWalkthrough.tsx`, `src/hooks/useScopeDetail.ts`, `useScopeMutations.ts`, `useScopeChecklistCoverage.ts`, `src/lib/scopeConversion.ts`, `checklistMatch.ts`, `rehabMatch.ts`, `recipeMatch.ts`, `applyBundles.ts`, `src/components/FinalPassSheet.tsx`, `DeduplicateSheet.tsx`, `CostLibrary.tsx`, `src/pages/AdminRehabLibrary.tsx`, `AdminRecipes.tsx`, `src/pages/TaskDetail.tsx`, edge functions `scope_walkthrough_parse`, `scope_walkthrough_apply`.
DB: `scopes`, `scope_items`, `scope_members`, `scope_checklist_reviews`, `checklist_templates/_items`, `cost_items`, `rehab_library/_items`, `task_recipes/_steps/_step_materials`, `task_material_bundles/_items`, `projects`, `project_members`, `tasks`, `task_materials`. Functions: `convert_scope_to_project`, `apply_assignment_rules`, `expand_recipe`, `capture_recipe_from_task`, `push_recipe_to_tasks`, `get_scope_role`, `is_scope_member`.

## 10. Current vs. blueprint
Implemented now: scope creation, AI walkthrough parsing with dedupe/checklist coverage, cost-library pricing, rehab-template generation, final pass, 1:1 conversion to bare tasks, post-conversion manual recipe/material attachment.

Not implemented (structure exists, behavior does not):
- `scopes.converted_project_id`, `converted_at`, `baseline_locked_at`, status `Converted` are never written by the conversion RPC.
- `scope_items.estimated_hours / estimated_labor_cost / estimated_material_cost`, `qty`, `unit`, `phase_key`, `cost_item_id`, notes do not reach the task.
- No automatic recipe expansion, material bundle application, or multi-task explosion at conversion.
- `added_after_conversion` is never set by the conversion path.
- New project gets no `company_id`, so ownership/QuickBooks routing must be set by hand afterward.

## Gaps worth flagging
1. Scope estimate vs. actual comparison relies on `source_scope_item_id` only — per-item estimated cost is not on the task, so drill-downs must join back to the scope.
2. `recipe_hint_id` only ever comes from rehab templates; walkthrough-created items never get one, so most converted tasks have no recipe hint.
3. Conversion can be run repeatedly on the same active scope, creating duplicate projects.
