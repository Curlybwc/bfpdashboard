

## Plan: Replace arrow reordering with drag-and-drop universally

Two places currently use ▲/▼ arrow buttons for reordering instead of drag-and-drop:

1. **Recipe Steps** (`RecipeStepRow` + `RecipeStepsEditor`)
2. **Rehab Library Scope Items** (`AdminRehabLibrary`)

The project already has a well-built drag-and-drop pattern using `@dnd-kit` in `SortableTaskList.tsx`. We'll reuse the same `SortableTaskItem` grip-handle approach in both locations.

### Changes

**1. `RecipeStepRow.tsx`** — Remove `onMoveUp`/`onMoveDown` props and the ▲/▼ buttons. Wrap the card content with `useSortable` hook and add a `GripVertical` drag handle instead.

**2. `RecipeStepsEditor.tsx`** — Replace the plain step list with `DndContext` + `SortableContext` (same pattern as `SortableTaskList`). Replace `handleMoveStep` with a `handleDragEnd` that swaps `sort_order` values and persists to `task_recipe_steps`.

**3. `AdminRehabLibrary.tsx`** — Same treatment for scope items: wrap the item list in `DndContext` + `SortableContext`, replace ▲/▼ buttons with `GripVertical` drag handles via `useSortable`, persist reordered `sort_order` to `rehab_template_items`.

### Technical details

- Reuse `PointerSensor` with `{ distance: 8 }` activation constraint and `KeyboardSensor` (same config as existing `SortableTaskList`).
- Persist order by computing `(index + 1) * 10` for each item's `sort_order` after drag-end, updating in parallel — same pattern as `persistTaskOrder`.
- The `RecipeStepRow` expand/collapse interaction is preserved since the drag handle is a separate element from the clickable content area.
- No new dependencies needed — `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are already installed.

