

## Plan: Scope Accuracy Dashboard

### Overview
Create a new admin page at `/admin/scope-accuracy` that aggregates estimated costs from `scope_items` against actual costs from linked `tasks` and `task_materials`, grouped by scope item description.

### Database Migration
Add three columns to `scope_items` for granular estimates (per the previously approved plan):

```sql
ALTER TABLE public.scope_items
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS estimated_labor_cost numeric,
  ADD COLUMN IF NOT EXISTS estimated_material_cost numeric;
```

### New Page: `src/pages/ScopeAccuracy.tsx`

**Data fetching**: Query `scope_items` with their parent `scopes`, then for each item query linked `tasks` (via `source_scope_item_id`) and aggregate `task_materials` costs.

The page will use a single query approach:
1. Fetch all `scope_items` joined to `scopes` (name, address)
2. Fetch all `tasks` that have a non-null `source_scope_item_id`, along with their `task_materials`
3. Client-side: group tasks by `source_scope_item_id`, compute actuals, join to scope items

**Table columns**:
| Column | Source |
|---|---|
| Item Name | `scope_items.description` |
| Scope | `scopes.name \|\| scopes.address` |
| Trade | from linked tasks |
| Projects Used | count of distinct `tasks.project_id` |
| Estimated Cost | `scope_items.computed_total` (falls back to `estimated_labor_cost + estimated_material_cost`) |
| Avg Actual Cost | average of `tasks.actual_total_cost` across linked tasks |
| Variance % | `(avg_actual / estimated - 1) * 100` |
| Total Actual | sum of all linked task actuals |

**Color coding** on variance:
- Green: within +/-10%
- Yellow: 10-25% over
- Red: >25% over

**Filters** (top of page):
- Scope selector (dropdown of all scopes)
- Trade (text/select)
- Date range (date pickers on `scope_items.created_at`)
- Project (dropdown of projects)

**Sorting**: Clickable column headers, default sort by variance % descending.

### Routing & Navigation

**`src/App.tsx`**: Add route `/admin/scope-accuracy` → `ScopeAccuracy`

**`src/pages/AdminPanel.tsx`**: Add "Accuracy" tab that navigates to `/admin/scope-accuracy`

### Files Changed

| File | Change |
|---|---|
| Migration SQL | Add 3 estimate columns to `scope_items` |
| `src/pages/ScopeAccuracy.tsx` | New page (dashboard) |
| `src/App.tsx` | Add route |
| `src/pages/AdminPanel.tsx` | Add tab trigger |

