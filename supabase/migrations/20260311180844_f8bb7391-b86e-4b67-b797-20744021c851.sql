
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- View tenants: project members and admins
CREATE POLICY "View tenants" ON public.tenants
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id));

-- Insert tenants: admins and managers
CREATE POLICY "Insert tenants" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR get_project_role(auth.uid(), project_id) = 'manager'::project_member_role);

-- Update tenants: admins and managers
CREATE POLICY "Update tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR get_project_role(auth.uid(), project_id) = 'manager'::project_member_role);

-- Delete tenants: admins and managers
CREATE POLICY "Delete tenants" ON public.tenants
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) OR get_project_role(auth.uid(), project_id) = 'manager'::project_member_role);

-- Auto-update updated_at
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
