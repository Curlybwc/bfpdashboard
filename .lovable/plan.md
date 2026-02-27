

## Admin System Implementation Plan

### Step 1: Database Migration — Update `handle_new_user()` + RLS for admin toggle

**SQL migration:**

```sql
-- 1. Update handle_new_user to bootstrap first user as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_first boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true) INTO _is_first;
  INSERT INTO public.profiles (id, full_name, is_admin)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), _is_first);
  RETURN NEW;
END;
$$;

-- 2. Allow admins to view all profiles (needed for user management)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR is_admin(auth.uid()));

-- 3. Allow admins to update any profile (for toggling is_admin)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin(auth.uid()));

-- 4. Allow admins to update project_members roles
CREATE POLICY "Update project members" ON public.project_members
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR get_project_role(auth.uid(), project_id) = 'manager');

-- 5. Allow admins to update scope_members roles
CREATE POLICY "Update scope members" ON public.scope_members
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR get_scope_role(auth.uid(), scope_id) = 'manager');
```

### Step 2: Create `src/hooks/useAdmin.tsx`

A hook that reads the current user's `is_admin` from `profiles` and exposes it. Caches the result.

```typescript
// Returns { isAdmin: boolean, loading: boolean }
// Fetches profiles.is_admin for auth.uid()
```

### Step 3: Create `src/pages/AdminPanel.tsx`

- Route: `/admin`
- Guard: redirects to `/projects` if not admin
- User Management tab:
  - Fetches all profiles (admin can see all via updated RLS)
  - Shows full_name, id, is_admin status
  - Toggle switch for is_admin (calls `supabase.from('profiles').update({ is_admin }).eq('id', userId)`)
  - Prevents removing last admin (check count of admins before toggling off)
  - Note: `auth.users.email` is not accessible from client. Display user ID and full_name. If email is needed, we can add an edge function later.

### Step 4: Update `src/pages/ProjectDetail.tsx` — Add Members Section

Below the task list, add a "Members" section visible to admins and managers:
- Fetches `project_members` joined with `profiles` for the project
- Shows each member's full_name, role
- Dropdown to change role (contractor/manager/read_only)
- "Add Member" dialog: select from all profiles (admin-only or manager) and assign role
- Uses the new UPDATE policy on project_members

### Step 5: Update `src/pages/ScopeDetail.tsx` — Add Members Section

Same pattern as project members:
- Fetches `scope_members` joined with `profiles`
- Shows full_name, role
- Dropdown to change role (viewer/editor/manager)
- "Add Member" dialog

### Step 6: Update `src/App.tsx` — Add `/admin` route

```tsx
<Route path="/admin" element={<AdminPanel />} />
```

### Step 7: Update `src/components/MobileNav.tsx` — Conditional Admin link

Add a Shield icon link to `/admin` that only renders when `useAdmin().isAdmin` is true.

### Files Created
- `src/hooks/useAdmin.tsx`
- `src/pages/AdminPanel.tsx`
- `src/components/ProjectMembers.tsx`
- `src/components/ScopeMembers.tsx`

### Files Modified
- `src/App.tsx` — add admin route
- `src/components/MobileNav.tsx` — add conditional admin nav link
- `src/pages/ProjectDetail.tsx` — add ProjectMembers component
- `src/pages/ScopeDetail.tsx` — add ScopeMembers component

### What is NOT modified
- Task logic — untouched
- Existing RLS on tasks, projects, scopes, scope_items, cost_items — untouched
- Existing INSERT policies on project_members, scope_members — untouched

