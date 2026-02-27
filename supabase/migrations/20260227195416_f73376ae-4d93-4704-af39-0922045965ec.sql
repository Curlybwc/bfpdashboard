
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
