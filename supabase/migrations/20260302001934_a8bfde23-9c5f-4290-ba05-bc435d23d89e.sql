
-- Create material_inventory table
CREATE TABLE public.material_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NULL,
  vendor_url text NULL,
  qty numeric NOT NULL,
  unit text NULL,
  location_type text NOT NULL,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles(id)
);

-- Indexes
CREATE INDEX idx_material_inventory_status ON public.material_inventory(status);
CREATE INDEX idx_material_inventory_location ON public.material_inventory(location_type, project_id);
CREATE INDEX idx_material_inventory_name ON public.material_inventory(lower(name));
CREATE INDEX idx_material_inventory_sku ON public.material_inventory(sku);

-- Enable RLS
ALTER TABLE public.material_inventory ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view material inventory"
  ON public.material_inventory FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can insert material inventory"
  ON public.material_inventory FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admins and managers can update material inventory"
  ON public.material_inventory FOR UPDATE
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admins and managers can delete material inventory"
  ON public.material_inventory FOR DELETE
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
