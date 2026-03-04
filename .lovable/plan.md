

## Edit Project Title & Address — Plan

### A) Current State

- **`projects` table**: has `name` (text, NOT NULL) and `address` (text, nullable). No changes needed.
- **RLS UPDATE policy**: `"Members can update projects"` allows `is_admin(auth.uid()) OR is_project_member(auth.uid(), id)`. Already sufficient — admins and project members can update. No migration needed.
- **ProjectDetail header**: `PageHeader` receives `title={project.name}`. Address shown below header in a secondary line with `StatusBadge`.
- **ProjectList**: Shows `p.name` as title, `p.address` with MapPin icon as secondary text. Both read directly from fetched data (no cache — just `useState` + `fetchProjects()`).
- **Admin/role detection**: `useAdmin()` for `isAdmin`/`canManageProjects`; `projectRole` derived from `project_members` query in `fetchData()`.
- **`canCreateTask`**: `isAdmin || projectRole === 'manager' || projectRole === 'contractor'` — reuse this to gate edit access (managers and admins should edit project details).

### B) Plan

**UI — `ProjectDetail.tsx` only**

1. Add an **Edit (Pencil) button** in the `PageHeader` actions area, visible when `isAdmin || projectRole === 'manager'`.
2. Clicking opens a **shadcn Dialog** (same pattern as the "New Task" dialog already in the file) with:
   - **Title** field: `Input`, required, pre-filled with `project.name`
   - **Address** field: `Input`, optional, pre-filled with `project.address || ''`
3. On submit: `supabase.from('projects').update({ name, address: address || null }).eq('id', id)`
4. On success: close dialog, toast "Project updated", call `fetchData()` to refresh local state (this updates the header title and address line immediately).
5. On error: keep dialog open, show destructive toast.

**No DB/RLS migration needed.** The existing UPDATE policy already covers admins and project members.

**Display behavior** (already correct, no changes):
- ProjectDetail: `PageHeader title={project.name}`, address shown as secondary text below.
- ProjectList: `p.name` as heading, `p.address` with MapPin when present.
- No caching layer (react-query not used for projects) — navigation back to list triggers `fetchProjects()` via `useEffect`.

### C) Files to Touch

| File | Change |
|---|---|
| `src/pages/ProjectDetail.tsx` | Add Pencil button + edit Dialog with name/address fields + save handler |

No migration. No new files. No other pages need changes.

### D) Acceptance Criteria

- Admin or project manager sees Edit button; viewers/contractors do not
- Edit dialog pre-fills current name and address
- Title is required; address is optional (can be cleared to empty)
- Saving updates the project row and immediately refreshes the header title and address line
- Empty address saves as `null` (not empty string)
- Error keeps dialog open with destructive toast
- Non-authorized users cannot update via API (RLS enforced)

