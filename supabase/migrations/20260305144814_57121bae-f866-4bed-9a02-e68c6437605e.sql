
-- 1. checklist_templates
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View checklist templates" ON public.checklist_templates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin insert checklist templates" ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admin update checklist templates" ON public.checklist_templates FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admin delete checklist templates" ON public.checklist_templates FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE TRIGGER update_checklist_templates_updated_at BEFORE UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. checklist_items
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  normalized_label text NOT NULL,
  category text,
  default_cost_item_id uuid REFERENCES public.cost_items(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_items_template_label ON public.checklist_items(template_id, normalized_label);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View checklist items" ON public.checklist_items FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin insert checklist items" ON public.checklist_items FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admin update checklist items" ON public.checklist_items FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admin delete checklist items" ON public.checklist_items FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE TRIGGER update_checklist_items_updated_at BEFORE UPDATE ON public.checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. scope_checklist_reviews
CREATE TABLE public.scope_checklist_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id uuid NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  state text NOT NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope_id, checklist_item_id)
);
ALTER TABLE public.scope_checklist_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View scope checklist reviews" ON public.scope_checklist_reviews FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_scope_member(auth.uid(), scope_id));
CREATE POLICY "Insert scope checklist reviews" ON public.scope_checklist_reviews FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR get_scope_role(auth.uid(), scope_id) IN ('editor','manager'));
CREATE POLICY "Update scope checklist reviews" ON public.scope_checklist_reviews FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR get_scope_role(auth.uid(), scope_id) IN ('editor','manager'));
CREATE POLICY "Delete scope checklist reviews" ON public.scope_checklist_reviews FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

CREATE TRIGGER update_scope_checklist_reviews_updated_at BEFORE UPDATE ON public.scope_checklist_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Add checklist_template_id to scopes
ALTER TABLE public.scopes ADD COLUMN checklist_template_id uuid REFERENCES public.checklist_templates(id) ON DELETE SET NULL;
