
CREATE TABLE public.material_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  sku text,
  vendor_url text,
  unit_cost numeric,
  unit text,
  store_section text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX material_library_normalized_name_idx ON public.material_library (normalized_name);

ALTER TABLE public.material_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View material library" ON public.material_library
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/manager insert material library" ON public.material_library
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admin/manager update material library" ON public.material_library
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admin delete material library" ON public.material_library
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

CREATE TRIGGER update_material_library_updated_at
  BEFORE UPDATE ON public.material_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
