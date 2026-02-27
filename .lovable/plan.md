

## Admin System Implementation Plan

### Step 1: Database Migration

Execute a single migration with safe `DROP POLICY IF EXISTS` guards for the UPDATE policies, plus the `handle_new_user()` update and profiles RLS changes:

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

-- 2. Allow admins to view all profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR is_admin(auth.uid()));

-- 3. Allow admins to update any profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR is_admin(auth.uid()));

-- 4. Allow admins/managers to update project_members roles
DROP POLICY IF EXISTS "Update project members" ON public.project_members;
CREATE POLICY "Update project members" ON public.project_members
  FOR UPDATE TO authenticated
  USING (
    is_admin(auth.uid())
    OR get_project_role(auth.uid(), project_id) = 'manager'
  );

-- 5. Allow admins/managers to update scope_members roles
DROP POLICY IF EXISTS "Update scope members" ON public.scope_members;
CREATE POLICY "Update scope members" ON public.scope_members
  FOR UPDATE TO authenticated
  USING (
    is_admin(auth.uid())
    OR get_scope_role(auth.uid(), scope_id) = 'manager'
  );
```

### Step 2: Create `src/hooks/useAdmin.tsx`

Returns `{ isAdmin: boolean, loading: boolean }`. Queries `profiles.is_admin` for the current user via `useAuth().user.id`.

### Step 3: Create `src/pages/AdminPanel.tsx`

- Guarded route — redirects to `/projects` if not admin
- Lists all profiles with `full_name`, `id`, `is_admin` toggle
- Toggle calls `supabase.from('profiles').update({ is_admin }).eq('id', userId)`
- Prevents removing last admin by counting admins before toggling off

### Step 4: Create `src/components/ProjectMembers.tsx`

- Fetches `project_members` joined with `profiles` for a given project
- Shows each member's `full_name` and role
- Dropdown to change role (`contractor` / `manager` / `read_only`)
- "Add Member" dialog to select from all profiles and assign role

### Step 5: Create `src/components/ScopeMembers.tsx`

Same pattern — fetches `scope_members` joined with `profiles`, role dropdown (`viewer` / `editor` / `manager`), add member dialog.

### Step 6: Update `src/pages/ProjectDetail.tsx`

Add `<ProjectMembers projectId={id} />` below the task list.

### Step 7: Update `src/pages/ScopeDetail.tsx`

Add `<ScopeMembers scopeId={id} />` below the scope items list.

### Step 8: Update `src/App.tsx`

Add route: `<Route path="/admin" element={<AdminPanel />} />`

### Step 9: Update `src/components/MobileNav.tsx`

Add conditional `Shield` icon link to `/admin` when `useAdmin().isAdmin` is true.

### Files Created
- `src/hooks/useAdmin.tsx`
- `src/pages/AdminPanel.tsx`
- `src/components/ProjectMembers.tsx`
- `src/components/ScopeMembers.tsx`

### Files Modified
- `src/App.tsx`
- `src/components/MobileNav.tsx`
- `src/pages/ProjectDetail.tsx`
- `src/pages/ScopeDetail.tsx`

