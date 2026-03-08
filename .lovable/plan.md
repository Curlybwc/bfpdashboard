

## Plan: Recurring Tasks V1

### 1. Database Migration

Add columns to `tasks` using a validation trigger (not CHECK constraint per project guidelines):

```sql
ALTER TABLE public.tasks
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN recurrence_frequency text,
  ADD COLUMN recurrence_anchor_date date,
  ADD COLUMN recurrence_source_task_id uuid REFERENCES public.tasks(id);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_recurrence()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.recurrence_frequency IS NOT NULL AND NEW.recurrence_frequency NOT IN ('weekly','monthly','yearly') THEN
    RAISE EXCEPTION 'Invalid recurrence_frequency';
  END IF;
  IF NEW.is_recurring AND NEW.recurrence_frequency IS NULL THEN
    RAISE EXCEPTION 'recurrence_frequency required when is_recurring is true';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_recurrence
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_recurrence();
```

### 2. Server-side RPC: `complete_recurring_task`

A `SECURITY DEFINER` PL/pgSQL function that:
1. Marks the task Done (sets `stage='Done'`, `completed_at=now()`)
2. Checks `is_recurring = true` and that no task already exists with `recurrence_source_task_id = p_task_id`
3. Computes next `due_date`:
   - weekly: `+ interval '7 days'`
   - monthly: `due_date + interval '1 month'` (Postgres handles month-end rollover natively)
   - yearly: `due_date + interval '1 year'`
4. Inserts next occurrence copying: `project_id, task, priority, trade, room_area, notes, assigned_to_user_id, source_scope_item_id, source_recipe_id, is_recurring, recurrence_frequency, recurrence_anchor_date, assignment_mode, is_outside_vendor`
5. Sets `recurrence_source_task_id` to the completed task's id
6. Resets: `stage='Ready', started_at=null, completed_at=null, claimed_by/started_by=null, materials_on_site='No'`
7. Returns the new task id (or null if not recurring / already spawned)

This is called from both `TaskCard.handleComplete` and `TaskDetail.handleSave` (when stage transitions to Done).

### 3. Completion paths updated

**TaskCard.tsx `handleComplete`**: Instead of direct `supabase.from('tasks').update(...)`, check `task.is_recurring`. If true, call `supabase.rpc('complete_recurring_task', { p_task_id: task.id })`. If false, keep existing logic.

**TaskDetail.tsx `handleSave`**: When `stage === 'Done' && oldStage !== 'Done' && task.is_recurring`, call the same RPC after the main save. The save itself still updates all fields; the RPC handles spawning the next occurrence idempotently.

### 4. CreateTask input extended

**`useProjectMutations.ts`**: Add `due_date`, `is_recurring`, `recurrence_frequency` to `CreateTaskInput`. Pass them through to the insert. Set `recurrence_anchor_date = due_date` when `is_recurring`.

### 5. ProjectDetail create dialog

Add after the Notes field (before Materials collapsible):
- Due Date input (date type)
- When due date is set, show a "Recurring" switch
- When recurring is on, show frequency select (Weekly / Monthly / Yearly)
- Reset recurrence state when due date is cleared

### 6. TaskDetail edit form

After the existing Due Date input (line ~923), add:
- Recurring toggle (Switch)
- Frequency select when enabled
- Initialize from `task.is_recurring`, `task.recurrence_frequency`
- Include in save payload: `is_recurring`, `recurrence_frequency`, `recurrence_anchor_date`
- Validation: block save if `is_recurring` and no `dueDate`
- Show "Source task" link if `task.recurrence_source_task_id` exists
- Show simple text like "Next: {computed date}" when recurring

### 7. TaskCard badge

Show a small badge (e.g. "🔁 Weekly") on recurring tasks in the task card, near the existing priority/date badges.

### 8. Type updates

**`src/lib/supabase-types.ts`**: Add `RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly'`

### Files changed

| File | Change |
|------|--------|
| Migration SQL | Add columns, trigger, `complete_recurring_task` RPC |
| `src/lib/supabase-types.ts` | Add `RecurrenceFrequency` type |
| `src/hooks/useProjectMutations.ts` | Extend `CreateTaskInput` with due_date + recurrence fields |
| `src/pages/ProjectDetail.tsx` | Add due date + recurrence controls to create dialog |
| `src/pages/TaskDetail.tsx` | Add recurrence section, call RPC on Done transition |
| `src/components/TaskCard.tsx` | Call RPC for recurring complete, show recurrence badge |

### Known limitations

- Monthly rollover uses Postgres `+ interval '1 month'` which handles short months correctly (e.g. Jan 31 + 1 month = Feb 28)
- No chain editing ("this and all future")
- Reopening a Done recurring task does not delete the already-created next occurrence
- Task materials are not copied to the next occurrence; they start fresh
- `expanded_recipe_id` is not copied (recipe expansion is a manual step)

