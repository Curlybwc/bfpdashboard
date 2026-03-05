
-- 1. Bundle definition table
CREATE TABLE public.task_material_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade text,
  keywords text[] DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  recipe_id uuid REFERENCES public.task_recipes(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Bundle items table
CREATE TABLE public.task_material_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.task_material_bundles(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  qty numeric,
  unit text,
  sku text,
  vendor_url text,
  store_section text,
  provided_by text DEFAULT 'either',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bundle_item_provided_by CHECK (provided_by IN ('company','contractor','either'))
);

-- 3. Add bundles_applied flag to tasks
ALTER TABLE public.tasks ADD COLUMN bundles_applied boolean NOT NULL DEFAULT false;

-- 4. Indexes
CREATE INDEX idx_task_material_bundle_items_bundle ON public.task_material_bundle_items(bundle_id);
CREATE INDEX idx_task_material_bundles_active ON public.task_material_bundles(active);

-- 5. RLS on task_material_bundles
ALTER TABLE public.task_material_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View bundles" ON public.task_material_bundles
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert bundles" ON public.task_material_bundles
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Update bundles" ON public.task_material_bundles
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Delete bundles" ON public.task_material_bundles
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- 6. RLS on task_material_bundle_items
ALTER TABLE public.task_material_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View bundle items" ON public.task_material_bundle_items
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert bundle items" ON public.task_material_bundle_items
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Update bundle items" ON public.task_material_bundle_items
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Delete bundle items" ON public.task_material_bundle_items
  FOR DELETE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- 7. updated_at trigger for bundles
CREATE TRIGGER set_updated_at_task_material_bundles
  BEFORE UPDATE ON public.task_material_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
