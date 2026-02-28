
-- 1. Recreate own-profile SELECT as PERMISSIVE (same USING expression)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((auth.uid() = id) OR is_admin(auth.uid()));

-- 2. Add teammate SELECT policy (permissive by default)
CREATE POLICY "Project teammates can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_members pm1
    JOIN public.project_members pm2
      ON pm1.project_id = pm2.project_id
    WHERE pm1.user_id = auth.uid()
      AND pm2.user_id = profiles.id
  )
);

-- 3. Performance indexes
CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON public.project_members (user_id);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id
  ON public.project_members (project_id);
