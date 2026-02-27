
DROP POLICY IF EXISTS "Insert project members" ON public.project_members;
CREATE POLICY "Insert project members" ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR get_project_role(auth.uid(), project_id) = 'manager'
    OR (
      user_id = auth.uid()
      AND role = 'manager'
      AND NOT EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = project_members.project_id
      )
    )
  );

DROP POLICY IF EXISTS "Insert scope members" ON public.scope_members;
CREATE POLICY "Insert scope members" ON public.scope_members
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR get_scope_role(auth.uid(), scope_id) = 'manager'
    OR (
      user_id = auth.uid()
      AND role = 'manager'
      AND NOT EXISTS (
        SELECT 1 FROM public.scope_members sm
        WHERE sm.scope_id = scope_members.scope_id
      )
    )
  );
