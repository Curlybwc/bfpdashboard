

# Recipe System — Final Implementation Plan

## 1. Database Schema

### New Tables

**`task_recipes`**

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid PK | No | gen_random_uuid() |
| name | text | No | — |
| trade | text | Yes | NULL |
| keywords | text[] | No | '{}' |
| is_repeatable | boolean | No | false |
| estimated_cost | numeric | Yes | NULL |
| last_actual_avg | numeric | Yes | NULL |
| last_actual_count | integer | No | 0 |
| active | boolean | No | true |
| created_by | uuid | No | — |
| created_at | timestamptz | No | now() |
| updated_at | timestamptz | No | now() |

RLS: SELECT for authenticated; INSERT/UPDATE/DELETE for `is_admin(auth.uid()) OR can_manage_projects(auth.uid())`.

**`task_recipe_steps`**

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid PK | No | gen_random_uuid() |
| recipe_id | uuid FK | No | — |
| title | text | No | — |
| sort_order | integer | No | — |
| trade | text | Yes | NULL |
| notes | text | Yes | NULL |
| is_optional | boolean | No | false |
| created_at | timestamptz | No | now() |

FK: `recipe_id REFERENCES task_recipes(id) ON DELETE CASCADE`

Index: `CREATE INDEX idx_recipe_steps_order ON task_recipe_steps(recipe_id, sort_order)`

### Columns Added to `scope_items`

- `recipe_hint_id uuid REFERENCES task_recipes(id) ON DELETE SET NULL`

### Columns Added to `tasks`

- `sort_order integer` (nullable, no default)
- `recipe_hint_id uuid REFERENCES task_recipes(id) ON DELETE SET NULL`
- `source_recipe_id uuid REFERENCES task_recipes(id) ON DELETE SET NULL`
- `source_recipe_step_id uuid REFERENCES task_recipe_steps(id) ON DELETE SET NULL`
- `expanded_recipe_id uuid REFERENCES task_recipes(id) ON DELETE SET NULL`

All nullable with `ON DELETE SET NULL`.

### Single Migration

One migration creates both tables, all columns, all indexes, and all RLS policies.

---

## 2. Recipe Expansion Logic

**Guard condition**: expansion is blocked ONLY when the task already has children. No restriction based on `source_recipe_id` — tasks created by recipes can expand other recipes (multi-level).

**Expansion steps**:
1. Fetch `task_recipe_steps` for the recipe, ordered by `sort_order`
2. Insert child tasks with: `project_id`, `parent_task_id`, `task` (from step title), `sort_order` (step sort_order × 10 for gaps), `source_recipe_id`, `source_recipe_step_id`, `trade` (step trade or parent trade), `priority` (inherit parent), `room_area` (inherit parent), `stage: 'Not Ready'`, `created_by`
3. Update parent task: set `expanded_recipe_id = recipe.id`
4. Refresh task list, auto-expand parent

All done client-side with standard Supabase inserts. No edge function needed. Expanded tasks are fully editable — users can add, delete, reorder, reassign.

---

## 3. Recipe Matching / Suggestion Logic

**New file**: `src/lib/recipeMatch.ts`

Function `suggestRecipes(description, recipes)`:
- Normalize description (reuse `normalizeForChecklistMatch` patterns)
- For each recipe, check each keyword via substring match + adaptive Jaccard
- Return sorted matches

**In `scope_walkthrough_parse` edge function**: After LLM parsing, run deterministic recipe matching on items with status `Repair` or `Replace` only. Attach `recipe_hint_id` to response. Same algorithm duplicated server-side (inline in the edge function).

**In `ScopeWalkthrough.tsx`**: On commit, write `recipe_hint_id` to scope items.

**In `ScopeDetail.tsx` `handleConvert`** (line 240-248): Add `recipe_hint_id: item.recipe_hint_id || null` to task inserts.

**In `TaskDetail.tsx`**: If task has no children:
- If `recipe_hint_id` exists, fetch that recipe and show banner
- Else run `suggestRecipes` as fallback
- Show: "Recipe available: {name} — [Expand]"

---

## 4. Task Ordering

Add `sort_order integer` (nullable) to tasks. Update all task queries:

| Location | New ordering |
|---|---|
| `ProjectDetail.tsx` line 63 | `.order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })` |
| `TaskDetail.tsx` fetchChildren | `.order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })` |
| `Today.tsx` | Same pattern where children are fetched |

Existing tasks remain `sort_order = NULL` and sort by `created_at` (NULLS LAST behavior).

---

## 5. Recipe Editor UI

**New file**: `src/pages/AdminRecipes.tsx`

- List all recipes (name, trade, estimated_cost, step count)
- Click to edit: inline step list with add/delete/reorder/edit title
- Create new recipe with name, trade, keywords, estimated_cost
- Recipe edits only affect future expansions

**Integration**: Add "Recipes" tab to `AdminPanel.tsx` TabsList. Add route `/admin/recipes` in `App.tsx`.

---

## 6. Create Recipe From Tasks

In `TaskDetail.tsx`, when a parent task has children, show a "Save as Recipe" button (admin/manager only).

Behavior:
1. Prompt for recipe name and trade
2. Read children tasks ordered by `sort_order NULLS LAST, created_at`
3. Insert `task_recipes` row with name, trade, `created_by`
4. Insert `task_recipe_steps` with titles from child task descriptions, `sort_order` from position index × 10
5. Toast confirmation

---

## 7. Cost Learning Mechanism

When a parent task with `expanded_recipe_id` is marked Done (existing stage-sync logic already detects this):
1. Sum `actual_total_cost` of all children
2. Fetch the recipe's current `last_actual_avg` and `last_actual_count`
3. Compute incremental average: `new_avg = old_avg + (actual - old_avg) / (old_count + 1)`
4. Update recipe with new avg and count

This is a future enhancement — the schema supports it now but the trigger logic will be added later. Does not affect existing cost rollup behavior.

---

## 8. Files to Modify

| File | Change |
|---|---|
| **Migration SQL** | Create tables, columns, indexes, RLS |
| `src/lib/recipeMatch.ts` (new) | Suggestion matching utility |
| `src/lib/supabase-types.ts` | Add `AssignmentMode` already exists; no recipe types needed beyond DB types |
| `src/pages/AdminRecipes.tsx` (new) | Recipe CRUD page |
| `src/pages/AdminPanel.tsx` | Add Recipes tab |
| `src/App.tsx` | Add `/admin/recipes` route |
| `src/pages/TaskDetail.tsx` | Recipe suggestion banner, expand action, "Save as Recipe" button |
| `src/pages/ProjectDetail.tsx` | Update query ordering |
| `src/pages/ScopeDetail.tsx` | Add `recipe_hint_id` to task inserts during conversion (line 240-248) |
| `src/pages/ScopeWalkthrough.tsx` | Pass `recipe_hint_id` on commit |
| `supabase/functions/scope_walkthrough_parse/index.ts` | Post-LLM recipe matching for Repair/Replace items |

