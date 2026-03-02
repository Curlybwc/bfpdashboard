
-- Create store_sections table
CREATE TABLE IF NOT EXISTS public.store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.store_sections ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone authenticated can read
CREATE POLICY "Authenticated users can view store sections"
  ON public.store_sections FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS: Admins and managers can insert
CREATE POLICY "Admins and managers can insert store sections"
  ON public.store_sections FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- RLS: Admins and managers can update
CREATE POLICY "Admins and managers can update store sections"
  ON public.store_sections FOR UPDATE
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- RLS: Admins can delete
CREATE POLICY "Admins can delete store sections"
  ON public.store_sections FOR DELETE
  USING (is_admin(auth.uid()));

-- updated_at trigger
CREATE TRIGGER set_updated_at_store_sections
  BEFORE UPDATE ON public.store_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial sections
INSERT INTO public.store_sections (name, sort_order) VALUES
  ('Paint', 10),
  ('Electrical', 20),
  ('Plumbing', 30),
  ('HVAC', 40),
  ('Drywall', 50),
  ('Lumber', 60),
  ('Hardware', 70),
  ('Flooring', 80),
  ('Appliances', 90),
  ('Cleaning', 100),
  ('Garden', 110),
  ('Misc', 900)
ON CONFLICT (name) DO NOTHING;
