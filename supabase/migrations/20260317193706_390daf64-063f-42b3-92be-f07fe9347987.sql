
-- quickbooks_settings: single-row app-wide config for QB export
CREATE TABLE public.quickbooks_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  labor_expense_account_id text,
  labor_expense_account_name text,
  singleton boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quickbooks_settings_singleton UNIQUE (singleton),
  CONSTRAINT quickbooks_settings_singleton_check CHECK (singleton = true)
);

ALTER TABLE public.quickbooks_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select qb settings" ON public.quickbooks_settings
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert qb settings" ON public.quickbooks_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update qb settings" ON public.quickbooks_settings
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- quickbooks_class_mappings: one QB class per project
CREATE TABLE public.quickbooks_class_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  qb_class_id text NOT NULL,
  qb_class_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE public.quickbooks_class_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select class mappings" ON public.quickbooks_class_mappings
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert class mappings" ON public.quickbooks_class_mappings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update class mappings" ON public.quickbooks_class_mappings
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete class mappings" ON public.quickbooks_class_mappings
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
