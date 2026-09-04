ALTER TABLE public.material_library
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS material_library_category_idx ON public.material_library (category);
CREATE INDEX IF NOT EXISTS material_library_brand_idx ON public.material_library (brand);
CREATE INDEX IF NOT EXISTS material_library_vendor_name_idx ON public.material_library (vendor_name);

ALTER TABLE public.task_materials
  ADD COLUMN IF NOT EXISTS product_library_id uuid REFERENCES public.material_library(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS task_materials_product_library_id_idx ON public.task_materials (product_library_id);

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.material_library(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id),
  vendor_name text,
  vendor_url text,
  sku text,
  unit_cost numeric,
  unit text,
  date_recorded date NOT NULL DEFAULT CURRENT_DATE,
  source_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_history TO authenticated;
GRANT ALL ON public.product_price_history TO service_role;

ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS product_price_history_product_idx ON public.product_price_history (product_id, date_recorded DESC);

CREATE POLICY "Org members can view product price history"
  ON public.product_price_history FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert product price history"
  ON public.product_price_history FOR INSERT TO authenticated
  WITH CHECK (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update product price history"
  ON public.product_price_history FOR UPDATE TO authenticated
  USING (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id))
  WITH CHECK (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can delete product price history"
  ON public.product_price_history FOR DELETE TO authenticated
  USING (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id));

CREATE OR REPLACE FUNCTION public.record_product_price(
  p_product_id uuid,
  p_unit_cost numeric,
  p_vendor_name text DEFAULT NULL,
  p_vendor_url text DEFAULT NULL,
  p_sku text DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_source_project_id uuid DEFAULT NULL,
  p_source_task_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT org_id INTO v_org FROM public.material_library WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF v_org IS NOT NULL AND NOT public.is_org_member(v_user, v_org) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.product_price_history (
    product_id, org_id, vendor_name, vendor_url, sku, unit_cost, unit,
    source_project_id, source_task_id, notes, created_by
  ) VALUES (
    p_product_id, v_org, p_vendor_name, p_vendor_url, p_sku, p_unit_cost, p_unit,
    p_source_project_id, p_source_task_id, p_notes, v_user
  ) RETURNING id INTO v_id;

  UPDATE public.material_library
  SET unit_cost = COALESCE(p_unit_cost, unit_cost),
      vendor_name = COALESCE(NULLIF(p_vendor_name, ''), vendor_name),
      vendor_url = COALESCE(NULLIF(p_vendor_url, ''), vendor_url),
      sku = COALESCE(NULLIF(p_sku, ''), sku),
      unit = COALESCE(NULLIF(p_unit, ''), unit),
      updated_at = now()
  WHERE id = p_product_id;

  RETURN v_id;
END;
$$;