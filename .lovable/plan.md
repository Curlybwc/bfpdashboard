

## Blocked / Need Something — Implementation Plan

### 1. Database Migration

**New enum:**
```sql
CREATE TYPE public.blocker_reason AS ENUM (
  'missing_materials', 'access_issue', 'waiting_on_approval',
  'hidden_damage', 'tool_equipment', 'waiting_on_trade', 'other'
);
```

**New table: `task_blockers`**
```sql
CREATE TABLE public.task_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reason blocker_reason NOT NULL,
  note text,
  needs_from_manager text,          -- "what is needed" field
  blocked_by_user_id uuid NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_blockers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_task_blockers_task_id ON public.task_blockers(task_id);
```

**Denormalized column on `tasks`:**
```sql
ALTER TABLE public.tasks ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;
```

### 2. RLS Policies on `task_blockers`

All policies follow the existing pattern of `is_admin()`, `is_project_member()`, `get_project_role()`.

**SELECT** — admin or project member (via task):
```sql
CREATE POLICY "View task blockers" ON public.task_blockers FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.id = task_blockers.task_id
    AND (is_admin(auth.uid()) OR is_project_member(auth.uid(), t.project_id))
));
```

**INSERT** — must be the `blocked_by_user_id`, must be admin or contractor/manager on the project:
```sql
CREATE POLICY "Insert task blockers" ON public.task_blockers FOR INSERT
WITH CHECK (
  blocked_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_blockers.task_id
      AND (is_admin(auth.uid())
           OR get_project_role(auth.uid(), t.project_id) IN ('manager','contractor'))
  )
);
```

**UPDATE** — admin or manager (for resolving):
```sql
CREATE POLICY "Update task blockers" ON public.task_blockers FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.id = task_blockers.task_id
    AND (is_admin(auth.uid())
         OR get_project_role(auth.uid(), t.project_id) = 'manager')
));
```

**DELETE** — admin only:
```sql
CREATE POLICY "Delete task blockers" ON public.task_blockers FOR DELETE
USING (is_admin(auth.uid()));
```

**Note on INSERT scope tightening:** The RLS INSERT policy allows any contractor/manager on the project to insert. The stricter "only if assigned or active worker" check is enforced in the UI (see section 5). Enforcing it in RLS would require a complex subquery joining `tasks.assigned_to_user_id` and `task_workers`, which is possible but fragile. The UI-level gate is the narrowest safe version given the current schema; the RLS ensures only project participants can insert, which is consistent with how task updates work (same UPDATE policy allows any contractor/manager).

### 3. Types (`src/lib/supabase-types.ts`)

Add:
```typescript
export type BlockerReason =
  | 'missing_materials' | 'access_issue' | 'waiting_on_approval'
  | 'hidden_damage' | 'tool_equipment' | 'waiting_on_trade' | 'other';

export const BLOCKER_REASONS: { value: BlockerReason; label: string }[] = [
  { value: 'missing_materials', label: 'Missing Materials' },
  { value: 'access_issue', label: 'Access Issue' },
  { value: 'waiting_on_approval', label: 'Waiting on Approval' },
  { value: 'hidden_damage', label: 'Hidden Damage / Unexpected' },
  { value: 'tool_equipment', label: 'Tool / Equipment Issue' },
  { value: 'waiting_on_trade', label: 'Waiting on Another Trade' },
  { value: 'other', label: 'Other' },
];
```

### 4. Permissions (`src/lib/permissions.ts`)

Add two helpers:
```typescript
/** Can report a blocker. Admins, managers, and contractors. UI further gates on task relevance. */
export function canReportBlocker(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager' || projectRole === 'contractor';
}

/** Can resolve a blocker. Admins and managers only. */
export function canResolveBlocker(isAdmin: boolean, projectRole: string | null): boolean {
  return isAdmin || projectRole === 'manager';
}
```

### 5. TaskDetail UI — Reporting a Blocker

**Who sees the "Blocked" button:** The button appears when ALL of:
- `canReportBlocker(isAdmin, projectRole)` is true
- Task is not already blocked (`!task.is_blocked`)
- Task stage is `Ready` or `In Progress`
- User has task relevance: `isAssignedToMe || meIsActiveWorker || isAdmin || projectRole === 'manager'`

This matches the existing participation model: solo tasks require assignment, crew tasks require active worker status, admins/managers can always act.

**UI flow:**
- Button labeled "Blocked" with a red/warning icon, placed in the lifecycle actions row alongside Dibs/Start/Complete
- Opens a Sheet (bottom, mobile-friendly) containing:
  - Radio group for reason (from `BLOCKER_REASONS`)
  - Optional textarea: "Note (optional)"
  - Optional textarea: "What do you need from the manager?" (`needs_from_manager`)
  - Submit button: "Report Blocker"
- On submit:
  1. Insert into `task_blockers` with `blocked_by_user_id = user.id`
  2. Update `tasks` set `is_blocked = true` where `id = taskId`
  3. Refresh task data

**TaskDetail — Blocker display card:** When `task.is_blocked`, show a red-bordered Card at the top of the detail view (before lifecycle buttons) showing:
- Red "Blocked" badge + reason label
- Blocked by (name from profiles) + timestamp
- Note (if present)
- "Needs from manager" (if present)
- For managers/admins (`canResolveBlocker`): "Resolve" button opening an inline dialog with optional resolution note textarea + "Resolve Blocker" button
- On resolve:
  1. Update `task_blockers` set `resolved_at = now()`, `resolved_by_user_id = user.id`, `resolution_note`
  2. Update `tasks` set `is_blocked = false`
  3. Refresh

### 6. StatusBadge + TaskCard

**StatusBadge:** Add entry to colorMap:
```typescript
Blocked: 'bg-destructive/15 text-destructive',
```

**TaskCard:** When `task.is_blocked`:
- Show a separate `<StatusBadge status="Blocked" />` badge next to the existing stage badge
- The stage badge remains (Ready, In Progress, etc.) — blocked is orthogonal
- New prop: `isBlocked?: boolean` (derived from `task.is_blocked`)

### 7. Today — Blocked Section

**For managers/admins:**
- New section titled "Blocked" shown between "Needs Review" and "In Progress"
- Query: `tasks` where `is_blocked = true` AND `project_id IN memberProjectIds` AND `stage != 'Done'`
- Shows all blocked tasks across the user's projects

**For contractors:**
- New section titled "Blocked" shown between "Needs Review" (if visible) and "In Progress"
- Query: tasks where `is_blocked = true` AND either:
  - `assigned_to_user_id = user.id`, OR
  - task ID is in `myActiveTaskIds` (crew worker)
- Blocked tasks are also **removed** from the In Progress / Assigned sections to avoid duplication

**Implementation:** Add `blocked` state array in `fetchTasks`. For managers, a dedicated query. For contractors, filter from already-fetched tasks. Deduplicate: tasks shown in Blocked section are excluded from In Progress and Assigned.

### 8. `needs_manager_review` Stays Separate

No changes to the review flow. Blockers and review-required are independent orthogonal flags on a task.

### 9. Files Changed

| File | Action |
|------|--------|
| New migration SQL | enum, table, column, index, 4 RLS policies |
| `src/lib/supabase-types.ts` | Add `BlockerReason`, `BLOCKER_REASONS` |
| `src/lib/permissions.ts` | Add `canReportBlocker`, `canResolveBlocker` |
| `src/components/StatusBadge.tsx` | Add `Blocked` to colorMap |
| `src/components/TaskCard.tsx` | Show Blocked badge when `task.is_blocked` |
| `src/pages/TaskDetail.tsx` | Blocker report sheet, blocker display card, resolve flow |
| `src/pages/Today.tsx` | Add Blocked section for both managers and contractors |

