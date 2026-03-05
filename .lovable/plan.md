

## Plan: Crew Tasks (Multi-Person, Multi-Day)

### 1. Database Migration

Single migration adding columns, tables, indexes, RLS, and a helper function.

**New columns on `tasks`:**
- `assignment_mode text NOT NULL DEFAULT 'solo'` (values: `'solo'`, `'crew'`)
- `lead_user_id uuid NULL`

**New table `task_candidates` (eligibility pool):**
```sql
CREATE TABLE public.task_candidates (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_candidates_user ON public.task_candidates(user_id);
```

**New table `task_workers` (active crew):**
```sql
CREATE TABLE public.task_workers (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_workers_user ON public.task_workers(user_id);
CREATE INDEX idx_task_workers_task_active ON public.task_workers(task_id, active);
```

**RLS on `task_candidates`:**
- SELECT: `is_admin(auth.uid()) OR EXISTS(SELECT 1 FROM tasks t WHERE t.id = task_id AND is_project_member(auth.uid(), t.project_id))`
- INSERT/DELETE: `is_admin(auth.uid()) OR EXISTS(SELECT 1 FROM tasks t WHERE t.id = task_id AND get_project_role(auth.uid(), t.project_id) = 'manager')`

**RLS on `task_workers`:**
- SELECT: same as task_candidates SELECT
- INSERT: `(user_id = auth.uid() AND EXISTS(SELECT 1 FROM task_candidates tc WHERE tc.task_id = task_workers.task_id AND tc.user_id = auth.uid())) OR is_admin(auth.uid())`
- UPDATE: `user_id = auth.uid() OR is_admin(auth.uid())`
- DELETE: `user_id = auth.uid() OR is_admin(auth.uid())`

### 2. Today Tab (`src/pages/Today.tsx`)

Add two additional queries in `fetchTasks` after existing solo queries:

**Crew In Progress:** Query `task_workers` where `user_id = me, active = true`, get task_ids, then fetch those tasks where `assignment_mode = 'crew'` and `stage != 'Done'`. Merge into `inProgress` array, dedupe by id.

**Crew Available:** Query `task_candidates` where `user_id = me`, get task_ids. Query `task_workers` where `user_id = me, active = true`, get active_ids. Available crew = candidate_ids minus active_ids. Fetch those tasks where `assignment_mode = 'crew'` and `stage != 'Done'`. Merge into `available`, dedupe by id.

Existing solo queries already filter by `assigned_to_user_id` which is null for crew tasks, so no cross-contamination.

### 3. TaskCard (`src/components/TaskCard.tsx`)

Add optional props: `isCrewTask?: boolean`, `isActiveWorker?: boolean`, `isCandidate?: boolean`, `activeWorkerCount?: number`.

When `isCrewTask`:
- Show a small crew icon + "N active" badge next to status
- Replace Dibs with "Join" button (if candidate and not active) — upserts `task_workers` row
- Show "Leave" button (if active worker) — updates `active=false, left_at=now()`
- Hide solo Start/Complete buttons; crew tasks use Join/Leave only
- After Join, optionally set task stage to 'In Progress' if currently 'Ready'

### 4. TaskDetail (`src/pages/TaskDetail.tsx`)

**Crew toggle** (visible to admin/manager only, below Assigned To):
- Switch labeled "Crew Task"
- Solo→Crew: update `assignment_mode='crew'`, `lead_user_id = assigned_to_user_id`, `assigned_to_user_id = null`. Insert prior assignee into `task_candidates` + upsert into `task_workers(active=true)`.
- Crew→Solo: fetch active workers. If exactly 1, assign to them; else if `lead_user_id`, assign to lead; else null. Update `assignment_mode='solo'`. Delete all `task_candidates` and `task_workers` for task.

**Crew panel** (when `assignment_mode='crew'`, replaces Assigned To dropdown):
- "Active Crew" list showing names from `task_workers` joined to `profiles`
- Join/Leave button for current user
- Manager/admin: candidate pool editor — searchable select from `projectMembers` to add/remove candidates

**Solo mode**: keep existing Assigned To UI unchanged.

### 5. Files to Modify

1. **Migration SQL** — new columns, tables, indexes, RLS
2. `src/pages/Today.tsx` — crew task queries merged into sections
3. `src/components/TaskCard.tsx` — crew badge, Join/Leave actions
4. `src/pages/TaskDetail.tsx` — crew toggle, crew panel, candidate management
5. `src/lib/supabase-types.ts` — add `AssignmentMode` type

### 6. Key Edge Cases

- Solo queries use `assigned_to_user_id` (null for crew) — no overlap
- Crew Available shows even when task is 'In Progress' (multiple people can join)
- Upsert PK on `task_workers` prevents duplicate joins
- Done tasks filtered out everywhere by existing stage checks
- Crew→Solo cleanup deletes both tables to prevent orphan rows

