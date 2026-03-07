

## Plan: Simplify Contractor Experience

### Summary
Targeted changes across 4 files to hide noise from contractors while preserving full manager/admin views. Uses existing role model (`isAdmin`, `canManageProjects`, project-level `role`).

### Role Detection
- **Admin**: `profiles.is_admin = true`
- **Manager**: `profiles.can_manage_projects = true` OR has `manager` role on any project
- **Contractor**: everyone else (not admin, not canManageProjects)

The `useAdmin` hook already exposes `isAdmin` and `canManageProjects`, which is sufficient to distinguish contractors at the nav level.

---

### Changes

#### 1. `src/components/MobileNav.tsx` — Role-aware navigation
- Import `useAdmin` (already imported) to read `canManageProjects`
- Derive `isContractor = !isAdmin && !canManageProjects`
- **Contractors see**: Today, Projects, Shopping, Sign Out (4 items)
- **Managers/Admins see**: Today, Projects, Scopes, Shopping, Admin (if admin), Sign Out
- Scopes link hidden for contractors

#### 2. `src/App.tsx` — Route guard for scope pages
- Add a small `<ContractorGuard>` wrapper component that checks `isAdmin || canManageProjects`
- Wrap `/scopes` and `/scopes/:id` routes with it
- If a contractor navigates directly to a scope URL, redirect to `/today`
- Admin/scope-related routes (`/admin/*`) already guarded by admin checks in AdminPanel; no change needed there since `MobileNav` hides the link and `AdminPanel` already checks `isAdmin`

#### 3. `src/pages/ProjectDetail.tsx` — Contractor-filtered task list
Currently, all `rootTasks` are shown to everyone. For contractors:
- Filter the main task list (lines 565-606) to only show tasks that are:
  - Assigned to the current user (`assigned_to_user_id === user.id`)
  - The user is an active crew worker on (`task_workers`)
  - Unassigned and available (`assigned_to_user_id === null` and stage is Ready)
  - In the user's crew candidate pool
- This requires fetching `task_workers` and `task_candidates` for the current user within `useProjectDetail` or inline
- Manager/admin view unchanged — sees all tasks
- The "What next?" card already has contractor-specific logic and stays as-is

#### 4. `src/hooks/useProjectDetail.ts` — Add crew membership data
- Fetch `task_workers` (active, for current user) and `task_candidates` (for current user) for the project's tasks
- Return `myActiveWorkerTaskIds` and `myCandidateTaskIds` sets so ProjectDetail can filter

---

### What stays the same
- **Today page**: Already has `ContractorView` vs `ManagerView` split — no changes needed
- **TaskDetail page**: Accessed via direct link from task cards, no filtering needed
- **Shifts / Shopping / Availability**: Remain accessible to all roles
- **AdminPanel**: Already checks `isAdmin` internally, and the nav link is already gated

### Route behavior
| Route | Contractor | Manager/Admin |
|-------|-----------|---------------|
| `/scopes`, `/scopes/:id` | Redirect → `/today` | Normal access |
| `/admin/*` | Nav hidden; AdminPanel self-guards | Normal access |
| `/projects/:id` | Filtered task list | Full task list |
| Everything else | No change | No change |

### Edge cases
- Contractor who is also a scope member: still redirected from scope pages (scope workflows are manager-facing). If this becomes an issue later, can add a scope-member check.
- Direct URL to `/scopes/:id/walkthrough`: also redirected for contractors.
- `ScopeWalkthrough` page: also guarded by the same wrapper.

### Files changed
1. `src/components/MobileNav.tsx`
2. `src/App.tsx`
3. `src/pages/ProjectDetail.tsx`
4. `src/hooks/useProjectDetail.ts`

