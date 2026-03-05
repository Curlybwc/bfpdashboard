
-- Rehab Library table
CREATE TABLE public.rehab_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  keywords text[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rehab_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View rehab library" ON public.rehab_library FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert rehab library" ON public.rehab_library FOR INSERT WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Update rehab library" ON public.rehab_library FOR UPDATE USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Delete rehab library" ON public.rehab_library FOR DELETE USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- Rehab Library Items table
CREATE TABLE public.rehab_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.rehab_library(id) ON DELETE CASCADE,
  description text NOT NULL,
  trade text,
  recipe_hint_id uuid REFERENCES public.task_recipes(id),
  default_status text NOT NULL DEFAULT 'Repair',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rehab_library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View rehab library items" ON public.rehab_library_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert rehab library items" ON public.rehab_library_items FOR INSERT WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Update rehab library items" ON public.rehab_library_items FOR UPDATE USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Delete rehab library items" ON public.rehab_library_items FOR DELETE USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE INDEX idx_rehab_library_items_order ON public.rehab_library_items(library_id, sort_order);

-- Recipe Step Materials table
CREATE TABLE public.task_recipe_step_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_step_id uuid NOT NULL REFERENCES public.task_recipe_steps(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  qty numeric,
  unit text,
  store text,
  sku text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_recipe_step_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View recipe step materials" ON public.task_recipe_step_materials FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert recipe step materials" ON public.task_recipe_step_materials FOR INSERT WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Update recipe step materials" ON public.task_recipe_step_materials FOR UPDATE USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Delete recipe step materials" ON public.task_recipe_step_materials FOR DELETE USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE INDEX idx_recipe_step_materials ON public.task_recipe_step_materials(recipe_step_id);

-- Update expand_recipe RPC to also insert materials
CREATE OR REPLACE FUNCTION public.expand_recipe(
  p_parent_task_id uuid,
  p_recipe_id uuid,
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parent RECORD;
  v_step RECORD;
  v_mat RECORD;
  v_count integer := 0;
  v_new_task_id uuid;
BEGIN
  SELECT id, project_id, trade, priority, room_area, expanded_recipe_id
  INTO v_parent
  FROM public.tasks
  WHERE id = p_parent_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent task not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE parent_task_id = p_parent_task_id) THEN
    RAISE EXCEPTION 'Task already has children';
  END IF;

  IF v_parent.expanded_recipe_id IS NOT NULL THEN
    RAISE EXCEPTION 'Task already expanded from a recipe';
  END IF;

  FOR v_step IN
    SELECT id, title, sort_order, trade, notes
    FROM public.task_recipe_steps
    WHERE recipe_id = p_recipe_id
    ORDER BY sort_order
  LOOP
    INSERT INTO public.tasks (
      project_id, parent_task_id, task, sort_order,
      source_recipe_id, source_recipe_step_id,
      trade, priority, room_area, stage, materials_on_site, created_by
    ) VALUES (
      v_parent.project_id, p_parent_task_id, v_step.title, v_step.sort_order * 10,
      p_recipe_id, v_step.id,
      COALESCE(v_step.trade, v_parent.trade), v_parent.priority,
      v_parent.room_area, 'Not Ready', 'No', p_user_id
    )
    RETURNING id INTO v_new_task_id;

    -- Insert materials for this step
    FOR v_mat IN
      SELECT material_name, qty, unit, store, sku, notes
      FROM public.task_recipe_step_materials
      WHERE recipe_step_id = v_step.id
    LOOP
      INSERT INTO public.task_materials (
        task_id, name, quantity, unit, sku, store_section, item_type, provided_by
      ) VALUES (
        v_new_task_id, v_mat.material_name, v_mat.qty, v_mat.unit,
        v_mat.sku, v_mat.store, 'material', 'either'
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.tasks
  SET expanded_recipe_id = p_recipe_id
  WHERE id = p_parent_task_id;

  RETURN v_count;
END;
$$;
