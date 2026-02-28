

## Final Stabilization — Task Hierarchy + Scope Conversion

This plan implements the full task hierarchy system and scope conversion refinements, incorporating all corrections from the stabilization prompt.

---

### 1. Database Migration

Single migration with all schema changes:

```sql
-- Task hierarchy
ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;

-- Scope item rehab status
ALTER TABLE scope_items ADD COLUMN status text NOT NULL DEFAULT 'Not Checked';
ALTER TABLE scope_items ADD CONSTRAINT scope_items_status_check
  CHECK (status IN ('Not Checked','OK','Repair','Replace','Needs Review'));

-- Scope snapshot fields
ALTER TABLE scopes ADD COLUMN estimated_total_snapshot numeric(12,2);
ALTER TABLE scopes ADD COLUMN converted_at timestamptz;

-- Project missing estimates flag
ALTER TABLE projects ADD COLUMN has_missing_estimates boolean NOT NULL DEFAULT false;
```

---

### 2. TypeScript Types — `src/lib/supabase-types.ts`

Add:
```ts
export type ScopeItemStatus = 'Not Checked' | 'OK' | 'Repair' | 'Replace' | 'Needs Review';
export const SCOPE_ITEM_STATUSES: ScopeItemStatus[] = ['Not Checked', 'OK', 'Repair', 'Replace', 'Needs Review'];
```

---

### 3. TaskCard — `src/components/TaskCard.tsx`

Add props: `isChild?: boolean`, `parentTitle?: string`, `childCount?: number`, `expanded?: boolean`, `onToggle?: () => void`, `allChildrenDone?: boolean`.

- If `isChild`: render with `ml-6` indent, slightly smaller text.
- If `parentTitle`: show "Parent Title →" prefix above task name.
- If `childCount > 0`: render chevron toggle button before task name.
- Completion guard: if `childCount > 0` and `!allChildrenDone`, disable Complete button with tooltip "All subtasks must be completed first."
- On completing a child task: after successful update, query siblings. If all Done, auto-update parent to Done. If moving child FROM Done to another stage and parent is Done, auto-update parent to In Progress. (This sync logic lives in `handleComplete` and will also be added to `TaskDetail.tsx`.)

---

### 4. ProjectDetail — `src/pages/ProjectDetail.tsx`

Tree rendering:
- After fetching tasks, separate into `rootTasks` (where `parent_task_id` is null) and `childrenMap` (keyed by `parent_task_id`).
- Local state: `expandedIds: Set<string>`, default empty (collapsed).
- Render root tasks, each with chevron if it has children. When expanded, render children indented below.
- Actual cost rollup (display only, client-side):
  - For roots with children: `SUM(COALESCE(child.actual_total_cost, 0))`
  - For roots without children: `COALESCE(task.actual_total_cost, 0)`
  - Project total = sum of all root actuals, displayed in header area.

---

### 5. TaskDetail — `src/pages/TaskDetail.tsx`

- Fetch children (`tasks WHERE parent_task_id = taskId`) on load.
- Completion guard: if has children and not all Done, disable Complete button.
- Stage sync on save: if changing stage FROM Done and task has parent, check if parent is Done → update parent to In Progress.
- Assignment cascade: if task has children and user changes `assigned_to_user_id`, show checkbox "Also assign subtasks to this user". If unassigning, show "Also unassign subtasks". On save, batch update children if checked.

---

### 6. Today View — `src/pages/Today.tsx`

- Keep showing ALL tasks assigned to user (including children with `parent_task_id`).
- After fetching tasks, collect unique non-null `parent_task_id` values.
- Fetch all parent tasks in ONE query: `supabase.from('tasks').select('id, task').in('id', parentIds)`.
- Build map `{ parentId: parentTitle }`.
- Pass `parentTitle` prop to TaskCard for child tasks so they render as "Parent Title → Task Title".

---

### 7. Scope Conversion — `src/pages/ScopeDetail.tsx`

Update `handleConvert`:
- Add `status` field to Add Item form (Select with `SCOPE_ITEM_STATUSES`). Display status on each item card.
- Filter: only convert items where `status IN ('Repair','Replace')` OR `qty > 0` OR `COALESCE(computed_total, 0) > 0`.
- Snapshot: `estimated_total_snapshot = SUM(COALESCE(computed_total, 0))` across ALL scope items.
- Set `scopes.converted_at = now()`.
- If any converted item has `computed_total` null or 0: set `projects.has_missing_estimates = true`.
- Update confirmation dialog to show count of items being converted.

---

### Files Modified
- `src/lib/supabase-types.ts` — add ScopeItemStatus
- `src/components/TaskCard.tsx` — hierarchy props, completion guard, parent sync
- `src/pages/ProjectDetail.tsx` — tree rendering, expand/collapse, cost rollup
- `src/pages/TaskDetail.tsx` — children fetch, cascade assignment, stage sync
- `src/pages/Today.tsx` — batch parent title fetch, context display
- `src/pages/ScopeDetail.tsx` — status field, filtered conversion, snapshot

### Files Created
- Database migration (via migration tool)

