

## Plan: Surface Blocked State in TaskCard, Today, and ProjectDetail

### 1. TaskCard Changes (`src/components/TaskCard.tsx`)

**New prop:**
```typescript
blockerInfo?: { reason: string; needs_from_manager?: string | null } | null;
```

**Visual changes when `task.is_blocked && blockerInfo`:**
- Override the left border to `border-l-4 border-red-500` (replacing the priority border when blocked)
- Below the badge row (after line 252's closing `</div>`), render a compact blocker summary:

```tsx
{task.is_blocked && blockerInfo && (
  <div className="mt-1 px-2 py-1 bg-destructive/5 rounded text-xs text-destructive">
    <span className="font-medium">{BLOCKER_REASONS.find(r => r.value === blockerInfo.reason)?.label || blockerInfo.reason}</span>
    {blockerInfo.needs_from_manager && (
      <span className="text-muted-foreground ml-1">— {blockerInfo.needs_from_manager.slice(0, 60)}{blockerInfo.needs_from_manager.length > 60 ? '…' : ''}</span>
    )}
  </div>
)}
```

- Import `BLOCKER_REASONS` from `@/lib/supabase-types`
- Priority border logic: if `task.is_blocked`, force `border-l-4 border-red-500` regardless of priority
- No resolve action on card. No new dialogs.

### 2. Today Changes (`src/pages/Today.tsx`)

**Batch-fetch blocker info** — after all tasks are loaded and blocked task IDs are known, add one query:

```typescript
const blockedTaskIds = blockedTasks.map(t => t.id);
let blockerMap: Record<string, { reason: string; needs_from_manager?: string | null }> = {};
if (blockedTaskIds.length > 0) {
  const { data: blockerRows } = await supabase
    .from('task_blockers')
    .select('task_id, reason, needs_from_manager')
    .in('task_id', blockedTaskIds)
    .is('resolved_at', null);
  (blockerRows || []).forEach(r => {
    blockerMap[r.task_id] = { reason: r.reason, needs_from_manager: r.needs_from_manager };
  });
}
```

Store in state: `const [blockerMap, setBlockerMap] = useState<Record<string, { reason: string; needs_from_manager?: string | null }>>({});`

**Pass to TaskCard:** Add `blockerInfo={blockerMap[t.id] || null}` in the Section renderer's TaskCard.

**Section header changes:**
- Blocked section title becomes `Blocked (${blocked.length})` with count
- Add red accent: the `<h2>` gets `text-destructive` class when title starts with "Blocked"
- For managers/admins, always render the Blocked section (even when empty), showing "No blocked tasks — all clear."
- For contractors, keep current behavior (hide when empty)

### 3. ProjectDetail Changes (`src/pages/ProjectDetail.tsx`)

**Blocked summary banner** — add a lightweight banner above the task list (before `<div className="space-y-2">` at line 366):

```tsx
const blockedCount = useMemo(() => tasks.filter(t => t.is_blocked).length, [tasks]);

{blockedCount > 0 && (
  <div className="mb-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-center gap-2">
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span>{blockedCount} task{blockedCount !== 1 ? 's' : ''} blocked</span>
  </div>
)}
```

- Import `AlertTriangle` from lucide-react
- No blocker info fetching in ProjectDetail (keeps it lightweight — just a count from existing task data)
- No `blockerInfo` prop passed to TaskCards in ProjectDetail (they already show the red "Blocked" badge)

### 4. Files Changed

| File | Change |
|------|--------|
| `src/components/TaskCard.tsx` | New `blockerInfo` prop, blocker summary line, blocked border override |
| `src/pages/Today.tsx` | Batch-fetch blockers into map, pass `blockerInfo` to cards, section count + prominence |
| `src/pages/ProjectDetail.tsx` | `blockedCount` memo + banner above task list |

### 5. What is NOT changing

- No resolve action on TaskCard
- No new components
- No schema/migration changes
- StatusBadge unchanged
- TaskDetail unchanged
- permissions.ts unchanged

