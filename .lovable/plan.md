

## Audit of Existing Multi-Tenant Work

### What already exists (confirmed from migrations + code)
1. **`organizations`** and **`org_members`** tables exist with RLS, helper functions (`get_user_org_id`, `is_org_member`, `is_org_admin`, `get_org_role`)
2. **`org_role` enum** exists: `owner`, `admin`, `member`
3. **`projects.org_id`** column exists and is populated for existing data
4. **`profiles.org_id`** column exists (quick lookup)
5. **`handle_new_user` trigger** creates an org + owner membership for every new signup
6. **Backfill migration** ran — existing admin became owner of "My Organization", all other users became members, all projects got org_id
7. **`convert_scope_to_project`** already sets org_id from caller's profile
8. **`ProjectList.tsx`** passes `org_id: orgId` on project creation
9. **`useOrg` hook** provides `orgId`, `orgName`, `orgRole` via React context
10. **`useGlobalPermissions`** checks org_members role for admin/manager flags

### What is incomplete / risky

| # | Gap | Risk |
|---|---|---|
| 1 | **`scopes` has no `org_id` column** | Scopes are visible globally via `is_scope_member` — no org isolation. A user in Org B who somehow gets added as a scope member can see Org A's scope. New scope creation doesn't set org ownership. |
| 2 | **`projects` RLS does not check org_id** | Current policy: `is_admin OR is_project_member`. Any admin from Org B could see Org A's projects via the global `is_admin()` check. |
| 3 | **`scopes` RLS does not check org_id** | Same problem — `is_admin()` is a global flag, not org-scoped. |
| 4 | **Library/template tables are globally visible** | `cost_items`, `task_recipes`, `rehab_library`, `checklist_templates`, `task_material_bundles`, `store_sections`, `material_library` — all have `SELECT` for any authenticated user. These need org_id to isolate per-tenant data. |
| 5 | **`profiles` RLS has no org-scoped visibility** | Profiles visible via project teammate join or admin flag. No policy for "org members can view each other's profiles." |
| 6 | **`ScopeList.tsx` has no org scoping** | Fetches all scopes user can see, no org_id filter. Scope creation doesn't set org_id. |
| 7 | **`useProjectList.ts` has no org_id filter** | Fetches all projects by type — relies entirely on RLS for isolation. |
| 8 | **Edge functions don't check org membership** | They check project/scope membership, which is fine for now but doesn't prevent cross-org access if membership is misconfigured. |

### Implementation Plan

**Phase 1: Scope org isolation (highest risk)**

1. **Add `org_id` column to `scopes`** — `ALTER TABLE scopes ADD COLUMN org_id uuid REFERENCES organizations(id)`
2. **Backfill existing scopes** — Set org_id from the scope creator's profile org_id
3. **Update `scopes` RLS** — Add org_id check: user can only SELECT scopes where `is_org_member(auth.uid(), org_id)` AND (is scope member OR is org admin). INSERT requires org_id matching caller's org.
4. **Update `ScopeList.tsx`** — Pass org_id on scope creation
5. **Update `convert_scope_to_project`** — Already reads org from caller profile, which is correct. Verify scope belongs to caller's org before converting.

**Phase 2: Tighten projects RLS**

6. **Update `projects` RLS SELECT** — Change from `is_admin(auth.uid()) OR is_project_member(auth.uid(), id)` to `is_org_member(auth.uid(), org_id) AND (is_admin(auth.uid()) OR is_project_member(auth.uid(), id))`. This ensures admins only see their own org's projects.
7. **Update `projects` RLS INSERT** — Add org_id check matching caller's org.

**Phase 3: Profile visibility for org members**

8. **Add profiles RLS policy** — "Org members can view each other's profiles": `EXISTS (SELECT 1 FROM org_members om1, org_members om2 WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id AND om1.org_id = om2.org_id)` — but use a security definer function to avoid recursion.

**Phase 4: Library/template org scoping (second wave)**

9. **Add `org_id` to library tables** — `cost_items`, `task_recipes`, `rehab_library`, `checklist_templates`, `task_material_bundles`, `store_sections`, `material_library`
10. **Backfill** with existing org's id
11. **Update RLS** on each to scope SELECT/INSERT/UPDATE/DELETE by org membership
12. **Update frontend queries** — Add org_id on creation for recipes, cost items, bundles, rehab library, etc.
13. **Update edge functions** — scope_walkthrough_parse and others that fetch cost_items/recipes globally should filter by org

### Files to change

| File | Change |
|---|---|
| Migration (new) | Add org_id to scopes, backfill, update RLS on scopes + projects |
| Migration (new) | Add org_id to library tables, backfill, update RLS |
| `src/pages/ScopeList.tsx` | Pass org_id on scope creation |
| `src/hooks/useProjectList.ts` | No change needed if RLS handles it (verify) |
| `src/integrations/supabase/types.ts` | Auto-regenerated after migration |

### What to defer

- Edge function org checks (low risk — they already check membership)
- `useProjectList.ts` explicit org_id filter (RLS is sufficient)
- Billing/subscription per org

### Risks to mitigate

- **Backfill correctness**: Some scopes may have been created by users without a profile org_id yet. Use `get_user_org_id(created_by)` with fallback.
- **Global `is_admin()` function**: Currently checks `profiles.is_admin` globally. Should eventually be scoped to org, but ripping it out now would break existing admin flows. Keep it but layer org checks on top in RLS.
- **Library tables going org-scoped**: This is a bigger change. Recipes, cost items etc. are currently shared globally. Making them org-scoped means each new org starts with an empty library. Consider whether to clone a "seed" library or allow cross-org read on templates. **Recommend asking the user about this.**

