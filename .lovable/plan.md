

## Plan: Refactor Today into Role-Specific Daily Dashboard

### Files Changed

1. **`src/pages/Today.tsx`** — primary refactor (section layout, labels, ranking, shift check)
2. **`src/components/NextUpCard.tsx`** — new, presentational only
3. **`src/components/DailyReminders.tsx`** — new, presentational only

---

### 1. `src/components/NextUpCard.tsx` (new)

Pure presentational component. Receives a single task object plus the same metadata props TaskCard uses (projectMap, parentTitles, etc.).

**Props:**
```typescript
{ task: any | null; projectName: string; projectAddress?: string;
  parentTitle?: string; userId: string; isAdmin: boolean;
  onUpdate: () => void; crewProps: { isCrewTask; isActiveWorker; isCandidate; activeWorkerCount }; }
```

**Renders:**
- If `task` is null: a compact Card with "You're all caught up — nothing queued right now."
- If task exists: a slightly emphasized Card (e.g. `bg-primary/5 border-primary/20`) containing a single TaskCard with a small label "Suggested next" above it. No extra logic — just wrapping and styling.

### 2. `src/components/DailyReminders.tsx` (new)

Pure presentational. Receives pre-computed flags.

**Props:**
```typescript
{ showShiftReminder: boolean; onLogShift: () => void; }
```

**Renders:**
- If `showShiftReminder`: a compact alert-style card — "You haven't logged a shift today" with a "Log Shift" button calling `onLogShift`.
- If no reminders apply: renders nothing.
- No photo reminders (repo has no photo tracking). This is a documented future gap.

### 3. `src/pages/Today.tsx` — Refactor

**Data fetching additions** (inside existing `fetchTasks`):
- Add one parallel query to check if current user has a shift today:
  ```typescript
  supabase.from('shifts').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('shift_date', todayStr)
  ```
- Store result as `hasShiftToday` boolean state.

**Next Up ranking** (computed after state is set, before render):
- Combine `inProgress` + `assigned` (non-blocked tasks already assigned to me).
- Sort by: stage (`'In Progress'` before `'Ready'`) → priority (ascending) → sort_order (nulls last) → due_date (ascending, nulls last) → created_at (ascending).
- First result = `nextUpTask`. This is a simple deterministic pick from existing data, not a recommendation engine.

**Role check:** `const isContractor = !isAdmin && !isManager;`

**Section labels by role:**

| Section | Contractor Label | Manager/Admin Label |
|---------|-----------------|-------------------|
| Blocked | Blocked (count) | Blocked (count) |
| Needs Review | *(not shown)* | Needs Review |
| In Progress | Working Now | In Progress |
| Assigned | Up Next | Assigned |
| Available | Available to Take | Available |

**Contractor layout order:**
```
NextUpCard (hero — shows nextUpTask, or empty state)
DailyReminders (shift nudge if applicable)
Blocked (only if count > 0)
Working Now (inProgress, filtered to exclude nextUpTask)
Up Next (assigned)
Available to Take (available)
```

**Manager/Admin layout order:**
```
Needs Review (always shown, with empty state "No tasks pending review.")
Blocked (always shown, with count)
In Progress
Assigned
Available
```

**Shift reminder condition** (computed in Today.tsx, passed as prop):
- `showShiftReminder = !hasShiftToday && new Date().getHours() >= 10`

**NextUpCard exclusion**: When the nextUpTask is rendered in the hero card, filter it out of the "Working Now" or "Up Next" section list to avoid duplication.

**No other changes**: fetchTasks queries, TaskCard component, crew logic, blocker logic, header actions (Availability sheet, Log Shift, Field Mode) all remain identical.

### Summary of What Doesn't Change
- No database/schema/RLS changes
- No changes to TaskCard, MobileNav, routes, or any other page
- No changes to task assignment, crew eligibility, or blocker logic
- Header action buttons preserved as-is

