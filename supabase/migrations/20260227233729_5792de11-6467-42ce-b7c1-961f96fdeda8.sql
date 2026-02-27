CREATE TABLE public.task_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric,
  unit text,
  purchased boolean NOT NULL DEFAULT false,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task materials" ON public.task_materials FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_materials.task_id
  AND (is_admin(auth.uid()) OR is_project_member(auth.uid(), t.project_id))
));

CREATE POLICY "Modify task materials" ON public.task_materials FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  WHERE t.id = task_materials.task_id
  AND (is_admin(auth.uid()) OR get_project_role(auth.uid(), t.project_id) IN ('manager','contractor'))
));