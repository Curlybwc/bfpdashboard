

## Phase 2C — Task Materials Implementation Plan

### 1. Database Migration

Create `task_materials` table with RLS policies:

```sql
CREATE TABLE public.task_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  purchased boolean NOT NULL DEFAULT false,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_materials ENABLE ROW LEVEL SECURITY;

-- SELECT for project members
CREATE POLICY "View task materials" ON public.task_materials FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_materials.task_id
  AND (is_admin(auth.uid()) OR is_project_member(auth.uid(), t.project_id))
));

-- INSERT/UPDATE/DELETE for managers and contractors
CREATE POLICY "Modify task materials" ON public.task_materials FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_materials.task_id
  AND (is_admin(auth.uid()) OR get_project_role(auth.uid(), t.project_id) IN ('manager','contractor'))
));
```

### 2. Create `src/components/TaskMaterialsSheet.tsx`

New component using `Drawer` from vaul.

- **Props**: `taskId`, `open`, `onOpenChange`, `onMaterialsChange`
- **Fetches** `task_materials` for the given taskId on open
- **List**: each row shows name, qty+unit, Purchased Switch, Delivered Switch (visually subordinate)
- **Add form**: inline at bottom with name (required), quantity, unit, Add button

**Toggle handlers implement invariants directly:**

- **Purchased ON**: update `purchased = true` only
- **Purchased OFF**: update `purchased = false, delivered = false`, then run derivation
- **Delivered ON**: update `delivered = true, purchased = true`, then run derivation
- **Delivered OFF**: update `delivered = false`, then run derivation

**Derivation function** (called only from delivered toggle changes):
1. Fetch all materials for the task
2. If count = 0 → set `tasks.materials_on_site = 'No'`
3. If ALL `delivered = true` → set `tasks.materials_on_site = 'Yes'`
4. Otherwise → set `tasks.materials_on_site = 'No'`
5. Call `onMaterialsChange()`

### 3. Modify `src/components/TaskCard.tsx`

- Add `Package` icon button (📦) with `e.stopPropagation()` + `e.preventDefault()`
- Add state for sheet open
- Render `TaskMaterialsSheet` with `onMaterialsChange` calling `onUpdate`
- Button visible on all tasks, placed in the badge row area

### 4. Modify `src/pages/TaskDetail.tsx`

- Add 📦 Materials button in the lifecycle buttons area
- Add state for sheet open
- Render `TaskMaterialsSheet` with `onMaterialsChange` calling `fetchTask`
- Remove the manual `materials_on_site` Select dropdown (field is now derived, not manually editable)

### 5. Update `.lovable/plan.md`

Replace Phase 2C plan content with this authoritative spec.

### Files Summary
- **Created**: migration SQL, `src/components/TaskMaterialsSheet.tsx`
- **Modified**: `src/components/TaskCard.tsx`, `src/pages/TaskDetail.tsx`, `.lovable/plan.md`

