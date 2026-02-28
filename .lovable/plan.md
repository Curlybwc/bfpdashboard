

## Today Tab — Full Diagnostic Analysis

### 1. Today Tab Structure

- **File**: `src/pages/Today.tsx`
- **Component**: `Today` (default export)
- **Task cards**: Rendered by `src/components/TaskCard.tsx` (shared component)
- **Sections**: Defined **inline** inside `Today.tsx` as a local `Section` component (lines 132-153). Not abstracted to a separate file.
- **Queries**: **4 separate filtered queries** run in parallel via `Promise.all` (lines 49-77), plus a conditional 5th for `needsReview` (lines 84-94). They are NOT derived from a single shared query.

  | Section | Filter |
  |---|---|
  | In Progress | `assigned_to_user_id = me` AND `stage = 'In Progress'` |
  | Assigned | `assigned_to_user_id = me` AND `stage = 'Ready'` |
  | Available | `assigned_to_user_id IS NULL` AND `stage = 'Ready'` AND `materials_on_site = 'Yes'` AND `project_id IN (my projects)` — limit 20 |
  | Needs Review | `needs_manager_review = true` AND `project_id IN (my projects)` — limit 30, admin/manager only |

- **Project names**: Batch-fetched after all tasks load (lines 99-108). Only `id` and `name` — **address is NOT fetched**.
- **Parent titles**: Batch-fetched for child tasks (lines 112-123).

### 2. Task Data Model

All columns on `tasks` table:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK to projects |
| `task` | text | Title |
| `stage` | enum `task_stage` | Ready, In Progress, Not Ready, Hold, Done |
| `priority` | enum `task_priority` | 1 – Now, 2 – This Week, 3 – Soon, 4 – When Time, 5 – Later |
| `parent_task_id` | uuid | Self-referencing FK |
| `assigned_to_user_id` | uuid | Current assignee |
| `claimed_by_user_id` | uuid | Who claimed via Dibs |
| `claimed_at` | timestamptz | When claimed |
| `started_at` | timestamptz | When started |
| `started_by_user_id` | uuid | Who started |
| `completed_at` | timestamptz | When completed |
| `materials_on_site` | enum `materials_status` | Yes, Partial, No |
| `room_area` | text | Room/area label |
| `trade` | text | Trade category |
| `notes` | text | Free text |
| `due_date` | date | Optional |
| `actual_total_cost` | numeric | Optional |
| `source_scope_item_id` | uuid | Link to scope |
| `created_by` | uuid | Creator |
| `created_at` / `updated_at` | timestamptz | Timestamps |
| `needs_manager_review` | boolean | DEFAULT false — **EXISTS** |
| `field_capture_id` | uuid | FK to field_captures ON DELETE CASCADE — **EXISTS** |

**Already present**: `needs_manager_review` (boolean) and `field_capture_id` (uuid). No `Field Complete`, `flagged_by_field`, `reviewed_at`, or `reviewed_by` columns exist. The current `needs_manager_review` boolean is sufficient for manager-only review gating without adding a new stage or breaking lifecycle.

### 3. Task Card Layout

**Component**: `src/components/TaskCard.tsx` — 253 lines.

**Card structure** (JSX summary):
- Wrapped in shadcn `<Card className="p-3">` with conditional `ml-6` for child tasks
- Entire card body is a `<Link to={/projects/${project_id}/tasks/${task_id}}>` — **navigates on click**, no inline expand, no modal
- **Parent breadcrumb**: If `parentTitle` prop, shows `"Parent Title →"` above task name
- **Task title**: `task.task`, truncated, `text-sm` (or `text-xs` for children)
- **Project name**: Shown below title as `text-xs text-muted-foreground` via `projectName` prop. **Address is NOT shown.**
- **Metadata row** (flex-wrap):
  - `StatusBadge` (stage)
  - Priority with Flag icon
  - Due date with Calendar icon (if set)
  - Material count with 📦 emoji (if > 0)
  - "Needs Materials" warning badge (if materials exist but `materials_on_site !== 'Yes'`)
  - "Materials" button (opens TaskMaterialsSheet) — always shown, right-aligned
- **Action buttons** (conditional, below card body):
  - Dibs (unassigned + Ready)
  - Start (assigned to me + Ready + materials gate)
  - Complete (assigned to me + In Progress + subtask gate)

### 4. Actions & Lifecycle

| State | Condition |
|---|---|
| **Available (Dibs)** | `assigned_to_user_id IS NULL` AND `stage = 'Ready'` |
| **Assigned (Start)** | `assigned_to_user_id = me` AND `stage = 'Ready'` |
| **In Progress (Complete)** | `assigned_to_user_id = me` AND `stage = 'In Progress'` |

**Action button logic** (lines 52-57 of TaskCard):
- `showDibs`: unassigned + Ready
- `showStart`: assigned to me + Ready (disabled if materials not on site)
- `showComplete`: assigned to me + In Progress (disabled if children not all Done)

**Guards**:
- Materials gate: UI-only tooltip. No backend enforcement.
- Subtask gate: UI-only. `canComplete = hasChildren ? allChildrenDone : true`
- Dibs limit: Client-side count check (5 max), with admin bypass and confirm dialog
- Auto-complete parent: When last child completes, parent auto-set to Done (client-side in `handleComplete`)

### 5. Permissions / Roles

- **Stored in**: `project_members` table with `role` column (enum: `contractor`, `manager`, `read_only`)
- **Admin flag**: `profiles.is_admin` boolean, checked via `useAdmin()` hook (`src/hooks/useAdmin.tsx`)
- **Auth**: Supabase Auth via `useAuth()` hook (`src/hooks/useAuth.tsx`)
- **Manager detection in Today**: Separate query checks if user has `role = 'manager'` on ANY project (lines 38-46)
- **Conditional manager section**: `{(isAdmin || isManager) && needsReview.length > 0 && <Section ... />}` (line 166)

### 6. Query Layer

- **No custom hook**. All data fetching is inline in `Today.tsx` inside a `useCallback` named `fetchTasks` (lines 24-126).
- **React Query is NOT used** here. Uses raw `useState` + `useEffect` + `useCallback`.
- **Tasks are NOT joined with projects**. Project names are fetched in a separate batch query after tasks load (lines 99-108): `select('id, name')` from `projects` where `id IN (all task project_ids)`.
- **To add address**: Change line 104 from `select('id, name')` to `select('id, name, address')` and store in state alongside names.

### 7. UI Constraints

- **TaskCard is reused** in two places:
  1. `src/pages/Today.tsx` — all 4 sections
  2. `src/pages/ProjectDetail.tsx` — project task list with parent/child expand
- **Modifying TaskCard WILL affect ProjectDetail**. Any prop additions must be optional with defaults.

### 8. Styling System

- **Cards**: shadcn/ui `<Card>` with `p-3` padding
- **Tailwind**: Used directly throughout, no CSS modules or styled-components
- **Priority colors**: None. Priority is rendered as plain text with a Flag icon. No color differentiation.
- **Status colors**: Defined in `src/components/StatusBadge.tsx` via `colorMap`:
  - Ready: `bg-primary/15 text-primary`
  - In Progress: `bg-orange-100 text-orange-700`
  - Not Ready: `bg-muted text-muted-foreground`
  - Hold: `bg-muted text-muted-foreground`
  - Done: `bg-success/15 text-success`
- **Materials warning**: `border-warning text-warning` badge

### 9. Technical Constraints

- **Performance**: Each TaskCard fires an individual `task_materials` count query on mount (line 40-45). With 20+ cards, that is 20+ parallel queries — potential N+1 concern.
- **Pagination**: Only the Available section has `limit(20)` and Needs Review has `limit(30)`. In Progress and Assigned have no limit.
- **Sorting**: Deterministic — triple sort: `due_date ASC NULLS LAST`, then `priority ASC`, then `created_at ASC`.

### 10. Summary

**How Today is built**: A single-page component with 4 inline sections (Needs Review, In Progress, Assigned, Available), each backed by a separate Supabase query. Tasks are rendered via a shared `TaskCard` component that handles its own lifecycle actions (Dibs/Start/Complete) and fetches its own material count. Project names and parent titles are batch-fetched after tasks load. No React Query; all state is raw `useState`.

**Constraints affecting clarity improvements**:
1. TaskCard is shared with ProjectDetail — changes must be backward-compatible
2. Each TaskCard fires its own material count query — adds latency at scale
3. Project address is not currently fetched — trivial to add
4. No priority color system exists — would need to be created
5. React Query is not used — refactoring to it would be beneficial but is a larger change

**Needs Review section**: Already implemented and **purely additive**. Uses existing `needs_manager_review` boolean column (already in schema). No schema change needed. Visible only to admins and managers, gated by `(isAdmin || isManager) && needsReview.length > 0`.

