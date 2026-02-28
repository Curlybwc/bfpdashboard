

## Findings: RLS & Permission Analysis for `can_manage_projects`

### 1. Current INSERT Policies

| Table | Policy | USING / WITH CHECK |
|-------|--------|--------------------|
| `projects` | "Auth can insert projects" | `auth.uid() IS NOT NULL` |
| `scopes` | "Insert scopes" | `auth.uid() IS NOT NULL` |
| `project_members` | "Insert project members" | `is_admin(auth.uid()) OR get_project_role(...) = 'manager' OR (self-bootstrap: user_id = auth.uid() AND role = 'manager' AND no existing members)` |
| `scope_members` | "Insert scope members" | Same pattern as project_members (self-bootstrap allowed) |

**Key finding**: Any authenticated user can already INSERT into `projects` and `scopes`. The bootstrap policy on `project_members` allows the creator to self-add as manager only when no members exist yet. This means the current system is **wide open for project/scope creation** -- adding `can_manage_projects` would actually be a **tightening** of permissions.

### 2. Task UPDATE Policy (Financial Field Protection)

| Table | Policy | Expression |
|-------|--------|------------|
| `tasks` | "Update tasks" | `is_admin(auth.uid()) OR (is_project_member(...) AND role IN ('contractor', 'manager'))` |

**`actual_total_cost` is NOT protected separately.** Any contractor or manager on the project can update it today. There is no column-level or trigger-based restriction. To prevent `can_manage_projects` users from editing financial fields, we would need either:
- A trigger that rejects changes to `actual_total_cost` unless `is_admin`
- Or column-level grants (complex in Supabase)

### 3. Auto-Add Creator Trigger

**No trigger exists.** The creator-to-manager membership is handled in application code:
- `ProjectList.tsx` line 38: manual insert after project creation
- `ScopeList.tsx` line 42: manual insert after scope creation
- `ScopeDetail.tsx` line 101: manual insert during scope-to-project conversion

This is a risk -- if the second insert fails silently, the creator is locked out. A database trigger would be more robust.

### 4. Policies Referencing `is_admin()`

Used in SELECT/UPDATE/DELETE across all tables. INSERT policies for `projects` and `scopes` do **not** reference `is_admin()` -- they only require authentication.

### 5. Privilege Escalation Risks

- **profiles.is_admin**: Protected by UPDATE policy `(auth.uid() = id) OR is_admin(auth.uid())`. A `can_manage_projects` user could update their own profile row but `is_admin` defaults to false and self-update is allowed. However, they could theoretically set `is_admin = true` on their own row since the UPDATE policy permits self-updates with no column restriction. **This is an existing vulnerability regardless of `can_manage_projects`.**
- **project_members role**: A project manager can update roles within their project. No escalation to admin.

### 6. Recommended Implementation Plan

1. **Migration**: Add `can_manage_projects boolean default false` to `profiles`
2. **Tighten INSERT on projects**: Change from `auth.uid() IS NOT NULL` to `is_admin(auth.uid()) OR can_manage_projects(auth.uid())`
3. **Tighten INSERT on scopes**: Same pattern
4. **Protect `actual_total_cost`**: Add a validation trigger on `tasks` that rejects changes to `actual_total_cost` unless `is_admin(auth.uid())`
5. **Protect `is_admin` column**: Add a validation trigger on `profiles` that prevents non-admins from setting `is_admin = true` (fixes existing vulnerability)
6. **Optional**: Add a trigger on `projects` INSERT to auto-add creator as manager in `project_members`
7. **Frontend**: Gate the "New Project" / "New Scope" buttons behind `isAdmin || canManageProjects`
8. **Admin Panel**: Add toggle for `can_manage_projects` alongside the admin toggle

### Files Affected

| File | Change |
|------|--------|
| Migration SQL | Add column, helper function, tighten RLS, add triggers |
| `src/hooks/useAuth.tsx` | Expose `canManageProjects` from profile |
| `src/pages/ProjectList.tsx` | Gate create button |
| `src/pages/ScopeList.tsx` | Gate create button |
| `src/pages/TaskDetail.tsx` | Disable `actual_total_cost` field for non-admins |
| `src/pages/AdminPanel.tsx` | Add `can_manage_projects` toggle |

