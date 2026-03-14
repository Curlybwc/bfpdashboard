

# Recipe Variants — Final Corrected Plan

## Clarifications from repo verification

### 1. Push RPCs — confirmed safe, no changes needed

**Verified from source.** Both `push_recipe_to_tasks` (line 33) and `push_recipe_step_to_tasks` (line 33) match active tasks exclusively via `WHERE source_recipe_step_id = v_step.id AND stage != 'Done'`. They do not rebuild by recipe-wide ordering or sort_order. No changes needed — confirmed after verification.

### 2. Deleted variant — behavior defined

When a variant referenced by `tasks.expanded_recipe_variant_id` is deleted:
- **Store a `variant_name_snapshot text` column on `tasks`** alongside `expanded_recipe_variant_id`. Set at expansion time. This is cheap, reliable, and avoids FK cascade issues.
- On the `recipe_variants` table: `ON DELETE SET NULL` is NOT used because we have no FK from `tasks` to `recipe_variants` (by design — the column is historical metadata).
- Variant deletion is always allowed (no blocking). Steps tagged to that variant get `variant_id = NULL` via `ON DELETE SET NULL` on `task_recipe_steps.variant_id`, making them shared.
- UI: If `expanded_recipe_variant_id` is set but the variant no longer exists, show badge: **"Variant: [variant_name_snapshot] (removed)"**.

### 3. Default variant policy — first variant auto-becomes default

- The first variant created on a recipe is automatically set as default (`is_default = true`).
- When the current default variant is deleted: the variant with the lowest `sort_order` among remaining variants becomes the new default. If no variants remain, the recipe reverts to a no-variant recipe (all steps are shared).
- A recipe with variants but no default should not be possible due to these rules, but as a safety net: `expand_recipe` will error with `'Recipe has variants but no default — set a default variant'` if this state somehow occurs.
- The `enforce_single_default_variant` trigger handles the "only one default" invariant on INSERT/UPDATE. A separate trigger on DELETE handles reassignment.

### 4. UI language — shared system, context-appropriate wrappers

The plan uses the same shared variant-management **system and components** across recipe and project contexts. The visual wrapper may differ (e.g., recipe builder renders `VariantManager` inline in the step list area; TaskDetail renders it in a collapsible section before the expand button). The controls, labels, terminology, and behavior are identical.

---

## Corrected Data Model

### New table: `recipe_variants`
```sql
CREATE TABLE public.recipe_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid NOT NULL REFERENCES public.task_recipes(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, name)
);
CREATE INDEX idx_recipe_variants_recipe ON recipe_variants(recipe_id);
```

### New column on `task_recipe_steps`
```sql
ALTER TABLE public.task_recipe_steps
  ADD COLUMN variant_id uuid NULL REFERENCES public.recipe_variants(id) ON DELETE SET NULL;
CREATE INDEX idx_task_recipe_steps_variant ON task_recipe_steps(variant_id);
```
NULL = shared across all variants. Materials inherit variant membership from their parent step (no `variant_id` on materials).

### New columns on `tasks`
```sql
ALTER TABLE public.tasks
  ADD COLUMN expanded_recipe_variant_id uuid NULL,
  ADD COLUMN variant_name_snapshot text NULL;
```
No FK — historical metadata. `variant_name_snapshot` preserves the name even after variant deletion.

### Triggers

**Single default enforcement (INSERT/UPDATE):**
```sql
CREATE OR REPLACE FUNCTION public.enforce_single_default_variant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE recipe_variants SET is_default = false
    WHERE recipe_id = NEW.recipe_id AND id != NEW.id AND is_default;
  END IF;
  RETURN NEW;
END;
$$;
```

**Default reassignment on DELETE:**
```sql
CREATE OR REPLACE FUNCTION public.reassign_default_variant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_default THEN
    UPDATE recipe_variants SET is_default = true
    WHERE recipe_id = OLD.recipe_id AND id != OLD.id
    ORDER BY sort_order LIMIT 1;
  END IF;
  RETURN OLD;
END;
$$;
```

**Auto-default first variant (INSERT):**
Handled in the INSERT trigger: if no other variant exists for the recipe, set `is_default = true`.

### RLS on `recipe_variants`
Matches existing `task_recipe_steps` pattern:
- SELECT: any authenticated user
- INSERT/UPDATE/DELETE: `is_admin(auth.uid()) OR can_manage_projects(auth.uid())`

---

## RPC Changes

### `expand_recipe` — add `p_variant_id uuid DEFAULT NULL`

Current signature: `(p_parent_task_id uuid, p_recipe_id uuid, p_user_id uuid)` — new optional 4th param.

Logic change in the step loop (`FOR v_step IN SELECT ... FROM task_recipe_steps WHERE recipe_id = p_recipe_id`):
1. Count variants: `SELECT count(*) FROM recipe_variants WHERE recipe_id = p_recipe_id`
2. If zero variants → current behavior (all steps, no filter)
3. If variants exist and `p_variant_id IS NULL` → find default: `SELECT id, name FROM recipe_variants WHERE recipe_id = p_recipe_id AND is_default LIMIT 1`. If not found, `RAISE EXCEPTION`.
4. Add filter to step query: `AND (variant_id IS NULL OR variant_id = v_resolved_variant_id)`
5. After expansion: `UPDATE tasks SET expanded_recipe_variant_id = v_resolved_variant_id, variant_name_snapshot = v_variant_name WHERE id = p_parent_task_id`

### `capture_recipe_from_task` — variant-safe capture

**Current problem confirmed:** Lines 54-57 match steps by `sort_order = v_pos * 10`. Lines 102-108 prune steps with `sort_order > v_child_count * 10`. Both would corrupt other variants' steps.

**Fix:**
1. Check if parent task has `expanded_recipe_variant_id`. If so, use variant-aware path:
   - Match child tasks to recipe steps via `source_recipe_step_id` on the child task (already populated by `expand_recipe`)
   - For matched pairs: update the recipe step's title, trade, assignment_mode, candidates, materials
   - For unmatched child tasks (manually added after expansion): create new recipe steps tagged with the variant_id
   - Do NOT prune steps belonging to other variants or shared steps not represented in the current expansion
   - Only prune materials within matched steps (current behavior within a step is fine)
2. If no variant context → keep current sort_order-based behavior (backwards compatible)

### `push_recipe_to_tasks` / `push_recipe_step_to_tasks` — no changes

Confirmed: both match strictly by `source_recipe_step_id`. Variant-specific steps have unique IDs, so they only push to tasks expanded from that specific step. Safe as-is.

---

## Frontend Changes

### New shared components

1. **`src/components/recipe/VariantManager.tsx`**
   - Props: `recipeId`, `variants[]`, `onChanged()`
   - CRUD: create variant, rename, delete, toggle default (radio-style)
   - Shared between recipe builder and task detail pre-expansion

2. **`src/components/recipe/VariantBadge.tsx`**
   - Inline dropdown on step rows: shows "Shared" or variant name
   - Props: `currentVariantId | null`, `variants[]`, `onChange(newId | null)`
   - Used on `RecipeStepRow` in both contexts

### Modified files

3. **`src/components/recipe/RecipeBuilderSheet.tsx`**
   - Fetch variants for recipe
   - Render `VariantManager` below metadata
   - Pass variants to `RecipeStepsEditor`

4. **`src/components/recipe/RecipeStepsEditor.tsx`**
   - Accept `variants` prop, pass to each `RecipeStepRow`
   - Optional filter: "Show: All / Shared + [variant]"

5. **`src/components/recipe/RecipeStepRow.tsx`**
   - Show `VariantBadge` inline

6. **`src/pages/TaskDetail.tsx`**
   - **Pre-expansion:** If linked recipe has variants, show `VariantManager` (read-only for non-admin) + variant picker (radio group) before expand button. Pre-select default.
   - **Post-expansion:** Read-only badge showing `variant_name_snapshot`. If variant was deleted, append "(removed)".

7. **`src/lib/supabase-types.ts`** — no new types needed (variant names are free-text, not enum)

### Files NOT changed
- `SubtaskRow.tsx` — subtasks are concrete tasks post-expansion
- `StepMaterialsEditor.tsx` — materials inherit from step, no variant column
- `src/integrations/supabase/client.ts`, `types.ts` — auto-generated
- Scope/cost library files — no execution detail leakage

---

## Migration / backfill

- Existing recipes get zero variants → all steps have `variant_id = NULL` (shared) → expansion works exactly as before
- No data migration needed
- Existing expanded tasks have `expanded_recipe_variant_id = NULL` and `variant_name_snapshot = NULL` → treated as "no variant" (pre-variant-era task)

---

## Key edge cases

| Scenario | Behavior |
|---|---|
| Recipe with 0 variants | Expand all steps (current behavior, unchanged) |
| Recipe with variants, user passes no variant_id | Use default variant; error if no default exists |
| Variant deleted while tasks reference it | `variant_name_snapshot` preserved on task; steps become shared (ON DELETE SET NULL); badge shows "(removed)" |
| Capture from variant-expanded task | Match by `source_recipe_step_id`; tag new steps with variant_id; skip pruning other variants |
| Push step to tasks | Unchanged — matches by `source_recipe_step_id` regardless of variant |

