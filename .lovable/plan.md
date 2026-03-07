

## Plan: Default Assignment Library (Revised)

### 1. Database Migration

**New table: `assignment_rules`**
```sql
CREATE TABLE public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  match_mode text NOT NULL DEFAULT 'contains',  -- 'exact' | 'contains'
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  outcome_type text NOT NULL,                    -- 'assign_user' | 'outside_vendor' | 'crew'
  outcome_user_id uuid,                          -- for 'assign_user'
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
-- RLS: same pattern as task_material_bundles
-- SELECT: authenticated
-- INSERT/UPDATE: admin or can_manage_projects
-- DELETE: admin only
```

**New column on `tasks`:**
```sql
ALTER TABLE public.tasks ADD COLUMN is_outside_vendor boolean NOT NULL DEFAULT false;
```

No `outcome_crew_candidates` in v1 — crew outcome just sets `assignment_mode = 'crew'`.

---

### 2. Matching Logic: `src/lib/assignmentRuleMatch.ts`

Conservative, deterministic matching. No Jaccard/fuzzy scoring.

```typescript
function normalizeForRuleMatch(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Rules sorted by priority ASC (first-match-wins)
for each rule (sorted by priority):
  for each keyword in rule.keywords:
    if match_mode === 'exact':
      match if normalizeForRuleMatch(task) === normalizeForRuleMatch(keyword)
    if match_mode === 'contains':
      match if normalizeForRuleMatch(task).includes(normalizeForRuleMatch(keyword))
  return first matching rule, or null
```

This is strict normalized string matching only. No synonym expansion, no Jaccard, no fuzzy scoring.

---

### 3. Shared Apply Mechanism: Database Function

Create a **SQL function** `apply_assignment_rules(p_task_id uuid)` that runs server-side. This is called from all three creation paths so tasks never briefly exist in the wrong state.

```sql
CREATE OR REPLACE FUNCTION public.apply_assignment_rules(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task RECORD;
  v_rule RECORD;
  v_task_norm text;
  v_kw text;
  v_kw_norm text;
  v_matched boolean;
  v_is_member boolean;
BEGIN
  SELECT id, task, project_id, assigned_to_user_id, assignment_mode, is_outside_vendor
  INTO v_task FROM tasks WHERE id = p_task_id;
  
  IF NOT FOUND THEN RETURN; END IF;
  -- Skip if already assigned manually
  IF v_task.assigned_to_user_id IS NOT NULL THEN RETURN; END IF;
  
  v_task_norm := lower(trim(regexp_replace(regexp_replace(v_task.task, '[^\w\s]', ' ', 'g'), '\s+', ' ', 'g')));
  
  FOR v_rule IN
    SELECT * FROM assignment_rules WHERE active = true ORDER BY priority ASC
  LOOP
    v_matched := false;
    FOREACH v_kw IN ARRAY v_rule.keywords LOOP
      v_kw_norm := lower(trim(regexp_replace(regexp_replace(v_kw, '[^\w\s]', ' ', 'g'), '\s+', ' ', 'g')));
      IF v_kw_norm = '' THEN CONTINUE; END IF;
      
      IF v_rule.match_mode = 'exact' AND v_task_norm = v_kw_norm THEN
        v_matched := true; EXIT;
      ELSIF v_rule.match_mode = 'contains' AND v_task_norm LIKE '%' || v_kw_norm || '%' THEN
        v_matched := true; EXIT;
      END IF;
    END LOOP;
    
    IF NOT v_matched THEN CONTINUE; END IF;
    
    -- Apply first matching rule
    IF v_rule.outcome_type = 'outside_vendor' THEN
      UPDATE tasks SET is_outside_vendor = true WHERE id = p_task_id;
    ELSIF v_rule.outcome_type = 'crew' THEN
      UPDATE tasks SET assignment_mode = 'crew' WHERE id = p_task_id;
    ELSIF v_rule.outcome_type = 'assign_user' AND v_rule.outcome_user_id IS NOT NULL THEN
      -- Only assign if user is a project member
      SELECT EXISTS(
        SELECT 1 FROM project_members
        WHERE project_id = v_task.project_id AND user_id = v_rule.outcome_user_id
      ) INTO v_is_member;
      IF v_is_member THEN
        UPDATE tasks SET assigned_to_user_id = v_rule.outcome_user_id WHERE id = p_task_id;
      END IF;
      -- If not a member, silently skip (task stays unassigned)
    END IF;
    
    RETURN; -- first-match-wins, done
  END LOOP;
END;
$$;
```

---

### 4. Integration Points

**A. Manual task creation (`useCreateTask` in `src/hooks/useProjectMutations.ts`)**
After inserting the task and applying bundles, call:
```typescript
await supabase.rpc('apply_assignment_rules', { p_task_id: data.id });
```
Only when `assigned_to_user_id` was not set by the user (the SQL function also checks this, but skip the RPC call entirely for efficiency).

**B. Scope conversion (`convert_scope_to_project` RPC)**
Add a loop at the end of the existing `convert_scope_to_project` function body that calls `apply_assignment_rules` for each created task. This requires a migration to `CREATE OR REPLACE` the function with the added loop. Tasks are created in the same transaction, so rules apply atomically.

**C. Field mode submit (`supabase/functions/field_mode_submit/index.ts`)**
After inserting each task (and after bundle application), call `apply_assignment_rules` via the admin client:
```typescript
await adminClient.rpc('apply_assignment_rules', { p_task_id: taskRow.id });
```

---

### 5. ProjectDetail Filtering Update

In `src/pages/ProjectDetail.tsx`, update the contractor "available for dibs" filter to exclude outside vendor tasks:
```typescript
// Current
!t.assigned_to_user_id && t.assignment_mode === 'solo' && t.stage === 'Ready'
// Updated
!t.assigned_to_user_id && t.assignment_mode === 'solo' && t.stage === 'Ready' && !t.is_outside_vendor
```

Show an "Outside Vendor" badge in TaskCard when `is_outside_vendor === true`.

---

### 6. Admin UI: `src/pages/AdminAssignmentRules.tsx`

New page following the exact pattern of `AdminMaterialBundles.tsx`:
- List view: rule name, keyword badges, priority, outcome badge ("→ John Smith" / "→ Outside Vendor" / "→ Crew"), active toggle
- Create dialog: name, keywords (comma-separated), match mode (exact/contains), priority, outcome type, user picker (when assign_user)
- Detail/edit view: same fields, save/delete
- Route: `/admin/assignment-rules` with `AdminGuard`

---

### 7. AdminPanel Menu Update

Add to the Libraries group in `src/pages/AdminPanel.tsx`:
```typescript
{ label: 'Assignment Rules', action: () => handleNav('/admin/assignment-rules') },
```

---

### 8. Type Update

Add to `src/lib/supabase-types.ts`:
```typescript
export type AssignmentOutcome = 'assign_user' | 'outside_vendor' | 'crew';
```

---

### 9. Files Changed

| File | Change |
|------|--------|
| Migration SQL | `assignment_rules` table, `is_outside_vendor` column, `apply_assignment_rules` function, updated `convert_scope_to_project` |
| **New** `src/pages/AdminAssignmentRules.tsx` | Admin library page |
| `src/App.tsx` | Add `/admin/assignment-rules` route with AdminGuard |
| `src/pages/AdminPanel.tsx` | Add "Assignment Rules" to Libraries menu |
| `src/hooks/useProjectMutations.ts` | Call `apply_assignment_rules` RPC after task creation |
| `src/pages/ProjectDetail.tsx` | Exclude `is_outside_vendor` from dibs filter, show badge |
| `src/components/TaskCard.tsx` | Show "Outside Vendor" badge |
| `src/lib/supabase-types.ts` | Add `AssignmentOutcome` type |
| `supabase/functions/field_mode_submit/index.ts` | Call `apply_assignment_rules` RPC after task insert |

---

### 10. Known Limitations

- **No crew candidates in v1**: crew outcome only sets `assignment_mode = 'crew'`. Candidates must be added manually.
- **Rules are global**: no per-project rule overrides. A rule targeting a specific user silently skips if that user is not a project member.
- **No retroactive application**: rules only apply to newly created tasks.
- **Match mode is simple**: `contains` checks if keyword appears as substring in normalized task text. No word-boundary enforcement — "paint" matches "painting" and "repaint". This is intentional for v1 conservatism.
- **`convert_scope_to_project` becomes slightly larger**: the function gains a loop calling `apply_assignment_rules` per task. This is the cleanest way to keep it transactional.

