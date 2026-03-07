

## Plan: Lightweight In-App Operational Alerts (v1)

### Approach
Purely derived alerts computed from data already fetched on the Today page. No migration, no new table, no MobileNav badge, no global context.

### New Files

**`src/lib/alerts.ts`** — Pure function `generateAlerts()` that takes Today's already-fetched state and returns sorted `OperationalAlert[]`.

```typescript
interface OperationalAlert {
  id: string;           // e.g. "blocked-${taskId}"
  type: 'blocked' | 'review' | 'overdue' | 'shift' | 'photo';
  severity: 'high' | 'medium' | 'low';
  title: string;
  subtitle?: string;
  actionPath: string;
}
```

Alert types and audience:

| Alert | Audience | Source | Severity |
|-------|----------|--------|----------|
| Blocked task | Manager: all; Contractor: mine | `is_blocked` from fetched tasks | high |
| Needs review | Manager/admin only | `needs_manager_review` from fetched tasks | high |
| Overdue task | Manager: all; Contractor: mine | `due_date < today`, stage ≠ Done | medium |
| No shift logged | Contractor only | existing `hasShiftToday` + hour ≥ 10 | medium |
| Photo reminder | Contractor only | in-progress task with 0 photos | low |

Sorted by severity (high → low), then by due date.

**`src/components/AlertsBanner.tsx`** — Compact banner rendered at top of Today content. Each alert: colored icon + one-line title + project context + tap navigates + X dismisses. Dismissed IDs tracked in `useState<Set<string>>` (session-only). Renders nothing if no alerts. Max 6 shown with "Show all" expand.

### Modified Files

**`src/pages/Today.tsx`** — Import `generateAlerts` and `AlertsBanner`. Call `generateAlerts()` after fetch with existing state (inProgress, assigned, blocked, needsReview, available, photoCountMap, projectMap, hasShiftToday, isAdmin, isManager, isContractor, userId). Render `<AlertsBanner>` above ContractorView/ManagerView. No new queries needed — all data already fetched.

### What Is NOT Included
- No MobileNav badge (stale without global provider)
- No recently completed alerts (deferred)
- No database table, migration, or persistent dismissals
- No push/SMS/email
- No notification preferences

