

# Architecture Snapshot: Tasks System

## 1. Database Structure (`tasks` table)

Full schema from the provided context:

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | No | gen_random_uuid() |
| project_id | uuid | No | — |
| task | text | No | — |
| stage | task_stage (enum) | No | 'Ready' |
| priority | task_priority (enum) | No | '2 – This Week' |
| materials_on_site | materials_status (enum) | No | 'No' |
| parent_task_id | uuid | Yes | — |
| assigned_to_user_id | uuid | Yes | — |
| claimed_by_user_id | uuid | Yes | — |
| claimed_at | timestamptz | Yes | — |
| started_by_user_id | uuid | Yes | — |
| started_at | timestamptz | Yes | — |
| completed_at | timestamptz | Yes | — |
| created_by | uuid | No | — |
| created_at | timestamptz | No | now() |
| updated_at | timestamptz | No | now() |
| due_date | date | Yes | — |
| trade | text | Yes | — |
| room_area | text | Yes | — |
| notes | text | Yes | — |
| actual_total_cost | numeric | Yes | — |
| source_scope_item_id | uuid | Yes | — |
| field_capture_id | uuid | Yes | — |
| needs_manager_review | boolean | No | false |
| assignment_mode | text | No | 'solo' |
| lead_user_id | uuid | Yes | — |

**Confirmed fields exist**: `parent_task_id`, `assigned_to_user_id`, `stage`, `priority`, `actual_total_cost`, `claimed_by_user_id`, `started_by_user_id`, `completed_at`.

**No ordering field exists** — no `position`, `order_index`, or `sort_order`. Tasks are ordered by `created_at DESC` in queries.

## 2. Task Hierarchy

- **Mechanism**: Self-referencing `parent_task_id` column.
- **Depth**: Single level only. The UI builds a flat map of `childrenMap[parent_id] = [children]` and renders children directly under parents. No recursive/deep nesting.
- **Tree built client-side** in `ProjectDetail.tsx` (lines 148-155):

```typescript
const rootTasks = tasks.filter(t => !t.parent_task_id);
const childrenMap: Record<string, any[]> = {};
tasks.forEach(t => {
  if (t.parent_task_id) {
    childrenMap[t.parent_task_id] = childrenMap[t.parent_task_id] || [];
    childrenMap[t.parent_task_id].push(t);
  }
});
```

- **Stage sync**: Bi-directional. Completing last child auto-completes parent. Un-doing a child reverts parent from Done to In Progress. Both handled in `TaskDetail.tsx` and `TaskCard.tsx`.

## 3. Task Creation Flow

**Primary creation point**: `ProjectDetail.tsx` lines 112-145.

- Inserts into `tasks` with fields: `project_id`, `task`, `stage`, `priority`, `materials_on_site`, `room_area`, `trade`, `notes`, `created_by`, `assigned_to_user_id`.
- Then optionally bulk-inserts `task_materials`.
- **No `parent_task_id` in the creation dialog** — subtasks are not created from this UI. There is no UI for creating subtasks currently visible.
- **Other creation paths**:
  - `field_mode_submit` edge function — creates tasks from AI-parsed field notes.
  - `scope_walkthrough_apply` edge function — creates tasks from scope conversion.
  - `walkthrough_parse_tasks` edge function — creates tasks from project walkthrough.

## 4. Project → Task Relationship

- `tasks.project_id` is required (NOT NULL, no default).
- Every task must belong to a project. No orphan tasks possible.
- Queried via `supabase.from('tasks').select('*').eq('project_id', id)`.

## 5. Task List UI

**File**: `src/pages/ProjectDetail.tsx` (lines 392-431).

- Root tasks rendered as `TaskCard` components.
- Expand/collapse via `expandedIds` Set state (lines 51, 157-164).
- Children rendered inline under expanded parents as `TaskCard` with `isChild` prop.
- `TaskCard` shows: status badge, priority flag, due date, material count, action buttons (Dibs/Start/Complete or Join/Leave for crew).

## 6. Cost Handling

- **`actual_total_cost`** on `tasks` — admin-only editable (protected by `protect_actual_cost` trigger).
- **No `estimated_cost` field** on tasks.
- **Cost rollup** in `ProjectDetail.tsx` (lines 167-174): Parent cost = sum of children's `actual_total_cost`. If no children, uses own value. Project total = sum of all root task costs.
- Scope items have separate pricing (`unit_cost_override`, `computed_total`, `pricing_status`) but those are on `scope_items`, not tasks.

## 7. Existing Templates/Recipes

**No task recipe or task template system exists.** The only "template" concept is `checklist_templates` / `checklist_items` for scope review checklists — completely unrelated to task generation.

No tables, files, or logic for: recipes, task_templates, reusable_tasks, blueprints.

## 8. Bulk Task Operations

**No bulk task operations exist.** There is no multi-select, batch edit, or duplicate functionality for tasks.

Bulk operations exist only for materials (`Shopping.tsx`, `ProjectMaterials.tsx`) — mark purchased/delivered in bulk. These don't touch tasks.

## 9. Edge Functions That Modify Tasks

| Function | Purpose |
|---|---|
| `field_mode_submit` | Creates tasks + materials from AI-parsed field notes |
| `walkthrough_parse_tasks` | AI parses project walkthrough text into tasks |
| `scope_walkthrough_apply` | Applies scope walkthrough results (creates/updates scope items, not tasks directly) |
| `scope_walkthrough_parse` | AI parses scope walkthrough (scope items, not tasks) |
| `field_mode_parse` | AI parses raw field text (returns parsed JSON, doesn't insert) |

Only `field_mode_submit` and `walkthrough_parse_tasks` actually INSERT into `tasks`.

## 10. Technical Constraints for Recipe Expansion

1. **No sort_order on tasks** — recipe children would need insertion order. Currently ordered by `created_at DESC`. Adding a `sort_order` column would be needed for deterministic ordering of expanded recipe steps.

2. **Single-level nesting only** — the UI only supports parent→children (one level). Recipes with nested sub-recipes would require deeper nesting support or flattening.

3. **No bulk task insert UI** — recipe expansion would need to insert N children in one operation. The DB and edge functions already do multi-insert (field_mode_submit inserts tasks in a loop), so the backend supports it. The frontend would need new logic.

4. **No task duplication** — no existing "clone task" helper to build on.

5. **`parent_task_id` not settable from UI** — the creation dialog doesn't expose it. Recipe expansion would bypass the dialog and insert directly.

6. **RLS is permissive enough** — contractors and managers can insert tasks on their projects, so recipe expansion wouldn't need RLS changes.

7. **Cost fields are task-level only** — recipes with estimated costs would need either a new field on tasks or mapping to scope_items via `source_scope_item_id`.

