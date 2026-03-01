
-- Create tool_types table
CREATE TABLE public.tool_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NULL,
  vendor_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create tool_stock table (counts by location)
CREATE TABLE public.tool_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_type_id uuid NOT NULL REFERENCES public.tool_types(id) ON DELETE CASCADE,
  location_type text NOT NULL,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles(id),
  UNIQUE(tool_type_id, location_type, project_id)
);

-- Add tool_type_id FK to task_materials
ALTER TABLE public.task_materials ADD COLUMN tool_type_id uuid NULL REFERENCES public.tool_types(id);

-- RLS for tool_types
ALTER TABLE public.tool_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tool types"
  ON public.tool_types FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can insert tool types"
  ON public.tool_types FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admins and managers can update tool types"
  ON public.tool_types FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admins can delete tool types"
  ON public.tool_types FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

-- RLS for tool_stock
ALTER TABLE public.tool_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tool stock"
  ON public.tool_stock FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and managers can insert tool stock"
  ON public.tool_stock FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admins and managers can update tool stock"
  ON public.tool_stock FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Admins and managers can delete tool stock"
  ON public.tool_stock FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
