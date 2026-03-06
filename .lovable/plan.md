

## Plan: Rewrite `capture_recipe_from_task` RPC — Sync Instead of Delete/Recreate

### Database Migration (single migration)

Drop and recreate the `capture_recipe_from_task` function with the following sync algorithm:

**Security** (unchanged): `SECURITY DEFINER SET search_path = 'public'`, validates `auth.uid()`, parent task exists, recipe exists, caller is `is_admin` or project `manager`. No-children guard returns `{steps_written:0, materials_written:0}` without modifying anything.

**Sync algorithm replacing the current delete-all approach:**

1. **Number child tasks**: Query children of `p_parent_task_id` ordered by `sort_order NULLS LAST, created_at`. Assign each a position (1-based).

2. **For each child** (position `i`):
   - Look for existing `task_recipe_steps` row where `recipe_id = p_recipe_id` and `sort_order = i * 10`.
   - **Found** → `UPDATE` its `title`, `trade` to match child task. Capture `step_id`.
   - **Not found** → `INSERT` new step with `recipe_id`, `title = child.task`, `sort_order = i * 10`, `trade = child.trade`. Capture `step_id`.

3. **Sync materials for each step**:
   - Source: `task_materials WHERE task_id = child.id AND is_active = true`
   - Target: `task_recipe_step_materials WHERE recipe_step_id = step_id`
   - Match by `(recipe_step_id, material_name)`:
     - **Exists** → `UPDATE qty, unit, sku, vendor_url, store_section, provided_by`
     - **Missing** → `INSERT`
   - **Delete** recipe step materials where `recipe_step_id = step_id` and `material_name NOT IN` source material names.

4. **Prune excess steps**: Delete `task_recipe_steps` (and cascade their materials) where `recipe_id = p_recipe_id AND sort_order > child_count * 10`. Also delete any orphan steps that didn't match a position.

5. **Return** `jsonb { steps_written, materials_written }`.

**Grants** (unchanged):
```sql
REVOKE ALL ON FUNCTION public.capture_recipe_from_task(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_recipe_from_task(uuid, uuid) TO authenticated;
```

### Files Changed

| File | Change |
|---|---|
| Migration SQL | Replace `capture_recipe_from_task` function body |

No frontend changes — the RPC signature and return shape are identical.

