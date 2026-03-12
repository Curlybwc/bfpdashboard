

## Plan: Unified Materials/Tools UI + Organic Library Sync

This is a significant feature spanning the recipe builder, task detail, and the `expand_recipe` RPC. The core idea: recipe steps should use the same rich materials/tools interface as project tasks, and edits in projects should offer to sync back to the recipe library.

### 1. Database: Add `item_type` and `unit_cost` to `task_recipe_step_materials`

```sql
ALTER TABLE public.task_recipe_step_materials
  ADD COLUMN item_type text NOT NULL DEFAULT 'material',
  ADD COLUMN unit_cost numeric;
```

### 2. Update `expand_recipe` RPC

Currently hardcodes `item_type: 'material'` when inserting into `task_materials`. Change to pass through `v_mat.item_type` and `v_mat.unit_cost` from the recipe step material row.

### 3. Rebuild `StepMaterialsEditor` to match `TaskMaterialsSheet` UI

Replace the current minimal grid form with the same add-form pattern from `TaskMaterialsSheet`:
- **Material/Tool type selector** (material vs tool)
- **MaterialAutocomplete** for name (with "Add to library" support)
- **Provided by** selector (for tools: company/contractor/either)
- **Qty, Unit, Unit Cost, SKU, Vendor URL, Store Section** fields
- **Qty Formula** field (recipe-specific, kept from current UI)
- **Edit dialog** for existing items (matching `TaskMaterialsSheet` edit dialog)
- **Item cards** with edit/delete buttons instead of compact inline rows
- Separate "Materials" and "Tools" sections like `TaskMaterialsSheet`

### 4. Update `RecipeStepRow` label

Change "Materials (applied to task on expand)" to "Materials & Tools (applied on expand)".

### 5. "Update Recipe in Library" prompt on project task save

When a user edits subtasks on a task that was expanded from a recipe (`expanded_recipe_id` is set), and they click "Save Changes" or modify subtask materials:
- Show a confirmation dialog: **"This task was created from recipe '{name}'. Update the recipe in the library with these changes?"**
- If confirmed, call the existing `capture_recipe_from_task` RPC which already syncs steps + materials back to the recipe.
- This uses the existing RPC — no new backend logic needed.

### 6. "Save to Library" prompt for materials

When adding a material/tool in the recipe `StepMaterialsEditor`, the `MaterialAutocomplete` component already supports "Add to library" via `onAddToLibrary`. Wire this up the same way `TaskMaterialsSheet` does — calling `material_library.insert` for materials and `tool_types.insert` for tools.

### Files affected

| File | Change |
|------|--------|
| DB migration | Add `item_type`, `unit_cost` columns |
| `expand_recipe` RPC | Pass `item_type` and `unit_cost` through |
| `capture_recipe_from_task` RPC | Pass `item_type` and `unit_cost` back |
| `StepMaterialsEditor.tsx` | Major rewrite to match TaskMaterialsSheet UI |
| `RecipeStepRow.tsx` | Minor label update |
| `TaskDetail.tsx` | Add "Update recipe?" confirmation dialog after subtask/material edits |

### Technical details

- `StepMaterialsEditor` will import and use `MaterialAutocomplete` for name input, plus `inferStoreSection` for auto-section detection.
- The edit dialog within `StepMaterialsEditor` will be a `Dialog` component (same as `TaskMaterialsSheet` edit dialog) with all fields including type, provided_by, name (autocomplete), qty, unit, unit_cost, SKU, vendor URL, store section, and qty_formula.
- The "Update recipe?" prompt in `TaskDetail` will appear as an `AlertDialog` triggered after the user saves a task that has `expanded_recipe_id`. It calls `capture_recipe_from_task(task_id, expanded_recipe_id)`.
- The `capture_recipe_from_task` RPC needs a small update to also sync `item_type` and `unit_cost` fields.

