
DROP POLICY IF EXISTS "Delete tasks" ON public.tasks;

CREATE POLICY "Delete tasks"
ON public.tasks
FOR DELETE
USING (
  is_admin(auth.uid())
  OR get_project_role(auth.uid(), project_id) = 'manager'
);

DROP POLICY IF EXISTS "Insert tasks" ON public.tasks;

CREATE POLICY "Insert tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  is_admin(auth.uid())
  OR (is_project_member(auth.uid(), project_id) AND get_project_role(auth.uid(), project_id) IN ('contractor', 'manager'))
);
