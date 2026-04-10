
-- ============================================================
-- 1. ADD org_id TO LIBRARY TABLES
-- ============================================================
ALTER TABLE public.cost_items ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.store_sections ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.material_library ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.task_recipes ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.task_material_bundles ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.rehab_library ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_templates ADD COLUMN org_id uuid REFERENCES public.organizations(id);

CREATE INDEX idx_cost_items_org ON public.cost_items(org_id);
CREATE INDEX idx_store_sections_org ON public.store_sections(org_id);
CREATE INDEX idx_material_library_org ON public.material_library(org_id);
CREATE INDEX idx_task_recipes_org ON public.task_recipes(org_id);
CREATE INDEX idx_task_material_bundles_org ON public.task_material_bundles(org_id);
CREATE INDEX idx_rehab_library_org ON public.rehab_library(org_id);
CREATE INDEX idx_checklist_templates_org ON public.checklist_templates(org_id);

-- ============================================================
-- 2. FIX UNIQUE CONSTRAINTS TO BE ORG-SCOPED
-- ============================================================
-- store_sections: name unique per org (allow NULL org_id for seeds)
ALTER TABLE public.store_sections DROP CONSTRAINT IF EXISTS store_sections_name_key;
CREATE UNIQUE INDEX store_sections_name_org_unique ON public.store_sections (name, org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX store_sections_name_seed_unique ON public.store_sections (name) WHERE org_id IS NULL;

-- material_library: normalized_name unique per org
DROP INDEX IF EXISTS material_library_normalized_name_idx;
CREATE UNIQUE INDEX material_library_normalized_name_org_unique ON public.material_library (normalized_name, org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX material_library_normalized_name_seed_unique ON public.material_library (normalized_name) WHERE org_id IS NULL;

-- cost_items: normalized_name unique per org
DROP INDEX IF EXISTS cost_items_normalized_name_unique;
CREATE UNIQUE INDEX cost_items_normalized_name_org_unique ON public.cost_items (normalized_name, org_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX cost_items_normalized_name_seed_unique ON public.cost_items (normalized_name) WHERE org_id IS NULL;

-- ============================================================
-- 3. BACKFILL EXISTING ROWS WITH CURRENT ORG
-- ============================================================
UPDATE public.cost_items SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
UPDATE public.store_sections SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
UPDATE public.material_library SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
UPDATE public.task_recipes SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
UPDATE public.task_material_bundles SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
UPDATE public.rehab_library SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;
UPDATE public.checklist_templates SET org_id = (SELECT id FROM public.organizations LIMIT 1) WHERE org_id IS NULL;

-- ============================================================
-- 4. UPDATE RLS POLICIES
-- ============================================================
-- cost_items
DROP POLICY IF EXISTS "View cost items" ON public.cost_items;
DROP POLICY IF EXISTS "Admin insert cost items" ON public.cost_items;
DROP POLICY IF EXISTS "Admin update cost items" ON public.cost_items;
DROP POLICY IF EXISTS "Admin delete cost items" ON public.cost_items;

CREATE POLICY "View org cost items" ON public.cost_items FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org cost items" ON public.cost_items FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org cost items" ON public.cost_items FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org cost items" ON public.cost_items FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- store_sections
DROP POLICY IF EXISTS "Authenticated users can view store sections" ON public.store_sections;
DROP POLICY IF EXISTS "Admins and managers can insert store sections" ON public.store_sections;
DROP POLICY IF EXISTS "Admins and managers can update store sections" ON public.store_sections;
DROP POLICY IF EXISTS "Admins can delete store sections" ON public.store_sections;

CREATE POLICY "View org store sections" ON public.store_sections FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org store sections" ON public.store_sections FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org store sections" ON public.store_sections FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org store sections" ON public.store_sections FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- material_library
DROP POLICY IF EXISTS "View material library" ON public.material_library;
DROP POLICY IF EXISTS "Admin/manager insert material library" ON public.material_library;
DROP POLICY IF EXISTS "Admin/manager update material library" ON public.material_library;
DROP POLICY IF EXISTS "Admin delete material library" ON public.material_library;

CREATE POLICY "View org material library" ON public.material_library FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org material library" ON public.material_library FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org material library" ON public.material_library FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org material library" ON public.material_library FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- task_recipes
DROP POLICY IF EXISTS "View task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Insert task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Update task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Delete task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Admin delete task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Admin insert task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Admin update task recipes" ON public.task_recipes;
DROP POLICY IF EXISTS "Authenticated view task recipes" ON public.task_recipes;

CREATE POLICY "View org task recipes" ON public.task_recipes FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org task recipes" ON public.task_recipes FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org task recipes" ON public.task_recipes FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org task recipes" ON public.task_recipes FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- task_material_bundles
DROP POLICY IF EXISTS "View task material bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Insert task material bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Update task material bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Delete task material bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Admin delete bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Admin insert bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Admin update bundles" ON public.task_material_bundles;
DROP POLICY IF EXISTS "Authenticated view bundles" ON public.task_material_bundles;

CREATE POLICY "View org bundles" ON public.task_material_bundles FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org bundles" ON public.task_material_bundles FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org bundles" ON public.task_material_bundles FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org bundles" ON public.task_material_bundles FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- rehab_library
DROP POLICY IF EXISTS "View rehab library" ON public.rehab_library;
DROP POLICY IF EXISTS "Insert rehab library" ON public.rehab_library;
DROP POLICY IF EXISTS "Update rehab library" ON public.rehab_library;
DROP POLICY IF EXISTS "Delete rehab library" ON public.rehab_library;

CREATE POLICY "View org rehab library" ON public.rehab_library FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org rehab library" ON public.rehab_library FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org rehab library" ON public.rehab_library FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org rehab library" ON public.rehab_library FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- checklist_templates
DROP POLICY IF EXISTS "View checklist templates" ON public.checklist_templates;
DROP POLICY IF EXISTS "Admin insert checklist templates" ON public.checklist_templates;
DROP POLICY IF EXISTS "Admin update checklist templates" ON public.checklist_templates;
DROP POLICY IF EXISTS "Admin delete checklist templates" ON public.checklist_templates;

CREATE POLICY "View org checklist templates" ON public.checklist_templates FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id));
CREATE POLICY "Insert org checklist templates" ON public.checklist_templates FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Update org checklist templates" ON public.checklist_templates FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND (is_admin(auth.uid()) OR can_manage_projects(auth.uid())));
CREATE POLICY "Delete org checklist templates" ON public.checklist_templates FOR DELETE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND is_admin(auth.uid()));

-- ============================================================
-- 5. SEED DATA (org_id = NULL — system templates)
-- ============================================================

-- Store Sections
INSERT INTO public.store_sections (org_id, name, sort_order) VALUES
  (NULL, 'Paint', 10),
  (NULL, 'Plumbing', 20),
  (NULL, 'Electrical', 30),
  (NULL, 'Lumber', 40),
  (NULL, 'Hardware', 50),
  (NULL, 'Flooring', 60),
  (NULL, 'Doors & Windows', 70),
  (NULL, 'Appliances', 80),
  (NULL, 'HVAC', 90),
  (NULL, 'Outdoor / Landscaping', 100);

-- Cost Items
INSERT INTO public.cost_items (org_id, name, normalized_name, unit_type, default_total_cost) VALUES
  (NULL, 'Interior Paint (per room)', 'interior paint (per room)', 'each', 150),
  (NULL, 'Drywall Repair', 'drywall repair', 'each', 75),
  (NULL, 'Replace Toilet', 'replace toilet', 'each', 250),
  (NULL, 'Replace Faucet', 'replace faucet', 'each', 120),
  (NULL, 'Replace Light Fixture', 'replace light fixture', 'each', 85),
  (NULL, 'Replace Outlet/Switch', 'replace outlet/switch', 'each', 15),
  (NULL, 'Install Flooring', 'install flooring', 'sqft', 4),
  (NULL, 'Replace Interior Door', 'replace interior door', 'each', 200),
  (NULL, 'Replace Exterior Door', 'replace exterior door', 'each', 500),
  (NULL, 'Countertop Install', 'countertop install', 'lf', 60),
  (NULL, 'Cabinet Refinish', 'cabinet refinish', 'lf', 40);

-- Material Library
INSERT INTO public.material_library (org_id, name, normalized_name, unit, unit_cost, store_section) VALUES
  (NULL, 'Interior Latex Paint', 'interior latex paint', 'gal', 35, 'Paint'),
  (NULL, 'Primer', 'primer', 'gal', 25, 'Paint'),
  (NULL, 'Drywall Sheet 4x8', 'drywall sheet 4x8', 'each', 15, 'Lumber'),
  (NULL, 'Joint Compound', 'joint compound', 'bucket', 12, 'Paint'),
  (NULL, 'Drywall Tape', 'drywall tape', 'roll', 5, 'Paint'),
  (NULL, 'Caulk Tube', 'caulk tube', 'each', 5, 'Paint'),
  (NULL, 'Painter''s Tape', 'painter''s tape', 'roll', 6, 'Paint'),
  (NULL, 'Drop Cloth', 'drop cloth', 'each', 8, 'Paint'),
  (NULL, 'Sandpaper Assorted', 'sandpaper assorted', 'pack', 8, 'Hardware'),
  (NULL, 'Wood Filler', 'wood filler', 'tube', 7, 'Paint'),
  (NULL, 'Outlet Cover Plate', 'outlet cover plate', 'each', 2, 'Electrical'),
  (NULL, 'Wire Nuts Assorted', 'wire nuts assorted', 'pack', 5, 'Electrical'),
  (NULL, 'Toilet Wax Ring', 'toilet wax ring', 'each', 5, 'Plumbing'),
  (NULL, 'Supply Line Braided', 'supply line braided', 'each', 10, 'Plumbing');

-- Checklist Template
INSERT INTO public.checklist_templates (id, org_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', NULL, 'General Property Inspection');
INSERT INTO public.checklist_items (template_id, label, normalized_label, category, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Roof & Gutters', 'roof & gutters', 'Exterior', 1),
  ('a0000000-0000-0000-0000-000000000001', 'Exterior Walls & Siding', 'exterior walls & siding', 'Exterior', 2),
  ('a0000000-0000-0000-0000-000000000001', 'Foundation', 'foundation', 'Exterior', 3),
  ('a0000000-0000-0000-0000-000000000001', 'Windows', 'windows', 'Exterior', 4),
  ('a0000000-0000-0000-0000-000000000001', 'Exterior Doors', 'exterior doors', 'Exterior', 5),
  ('a0000000-0000-0000-0000-000000000001', 'HVAC System', 'hvac system', 'Systems', 6),
  ('a0000000-0000-0000-0000-000000000001', 'Plumbing (Main)', 'plumbing (main)', 'Systems', 7),
  ('a0000000-0000-0000-0000-000000000001', 'Electrical Panel', 'electrical panel', 'Systems', 8),
  ('a0000000-0000-0000-0000-000000000001', 'Water Heater', 'water heater', 'Systems', 9),
  ('a0000000-0000-0000-0000-000000000001', 'Kitchen', 'kitchen', 'Interior', 10),
  ('a0000000-0000-0000-0000-000000000001', 'Bathrooms', 'bathrooms', 'Interior', 11),
  ('a0000000-0000-0000-0000-000000000001', 'Flooring', 'flooring', 'Interior', 12),
  ('a0000000-0000-0000-0000-000000000001', 'Walls & Ceilings', 'walls & ceilings', 'Interior', 13),
  ('a0000000-0000-0000-0000-000000000001', 'Attic / Basement', 'attic / basement', 'Interior', 14);

-- Rehab Library: Bathroom
INSERT INTO public.rehab_library (id, org_id, name, category, keywords, created_by) VALUES
  ('b0000000-0000-0000-0000-000000000001', NULL, 'Bathroom Rehab', 'Interior', '{bathroom,bath,restroom}', '00000000-0000-0000-0000-000000000000');
INSERT INTO public.rehab_library_items (library_id, description, trade, sort_order, default_status) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Replace toilet', 'Plumbing', 1, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Replace vanity & sink', 'Plumbing', 2, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Replace faucet', 'Plumbing', 3, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Replace shower/tub surround', 'Plumbing', 4, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Tile floor', 'Flooring', 5, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Paint walls & ceiling', 'Painting', 6, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Replace light fixture', 'Electrical', 7, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Replace exhaust fan', 'Electrical', 8, 'Repair'),
  ('b0000000-0000-0000-0000-000000000001', 'Replace mirror & accessories', 'General', 9, 'Repair');

-- Rehab Library: Kitchen
INSERT INTO public.rehab_library (id, org_id, name, category, keywords, created_by) VALUES
  ('b0000000-0000-0000-0000-000000000002', NULL, 'Kitchen Rehab', 'Interior', '{kitchen}', '00000000-0000-0000-0000-000000000000');
INSERT INTO public.rehab_library_items (library_id, description, trade, sort_order, default_status) VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Refinish or replace cabinets', 'Carpentry', 1, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Replace countertops', 'Carpentry', 2, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Replace sink & faucet', 'Plumbing', 3, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Replace appliances', 'General', 4, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Tile backsplash', 'Tile', 5, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Paint walls & ceiling', 'Painting', 6, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Replace light fixtures', 'Electrical', 7, 'Repair'),
  ('b0000000-0000-0000-0000-000000000002', 'Install flooring', 'Flooring', 8, 'Repair');

-- Rehab Library: General Interior
INSERT INTO public.rehab_library (id, org_id, name, category, keywords, created_by) VALUES
  ('b0000000-0000-0000-0000-000000000003', NULL, 'General Interior', 'Interior', '{interior,room,bedroom,living}', '00000000-0000-0000-0000-000000000000');
INSERT INTO public.rehab_library_items (library_id, description, trade, sort_order, default_status) VALUES
  ('b0000000-0000-0000-0000-000000000003', 'Paint walls & ceiling', 'Painting', 1, 'Repair'),
  ('b0000000-0000-0000-0000-000000000003', 'Replace flooring', 'Flooring', 2, 'Repair'),
  ('b0000000-0000-0000-0000-000000000003', 'Replace light fixtures', 'Electrical', 3, 'Repair'),
  ('b0000000-0000-0000-0000-000000000003', 'Patch & repair drywall', 'Drywall', 4, 'Repair'),
  ('b0000000-0000-0000-0000-000000000003', 'Replace outlets & switches', 'Electrical', 5, 'Repair'),
  ('b0000000-0000-0000-0000-000000000003', 'Replace door hardware', 'Carpentry', 6, 'Repair'),
  ('b0000000-0000-0000-0000-000000000003', 'Clean or replace blinds/shades', 'General', 7, 'Repair');

-- Task Recipe: Paint Room
INSERT INTO public.task_recipes (id, org_id, name, trade, keywords, active, is_repeatable, created_by) VALUES
  ('c0000000-0000-0000-0000-000000000001', NULL, 'Paint Room', 'Painting', '{paint,room,walls,ceiling}', true, true, '00000000-0000-0000-0000-000000000000');
INSERT INTO public.task_recipe_steps (id, recipe_id, title, sort_order, trade) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Prep & protect surfaces', 1, 'Painting'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Patch holes & sand smooth', 2, 'Painting'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Prime walls', 3, 'Painting'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Paint walls (2 coats)', 4, 'Painting'),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'Paint trim & doors', 5, 'Painting'),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'Clean up & final touch-up', 6, 'Painting');
INSERT INTO public.task_recipe_step_materials (recipe_step_id, material_name, qty, unit, store_section, item_type) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Drop Cloth', 2, 'each', 'Paint', 'material'),
  ('d0000000-0000-0000-0000-000000000001', 'Painter''s Tape', 2, 'roll', 'Paint', 'material'),
  ('d0000000-0000-0000-0000-000000000002', 'Wood Filler', 1, 'tube', 'Paint', 'material'),
  ('d0000000-0000-0000-0000-000000000002', 'Sandpaper Assorted', 1, 'pack', 'Hardware', 'material'),
  ('d0000000-0000-0000-0000-000000000003', 'Primer', 1, 'gal', 'Paint', 'material'),
  ('d0000000-0000-0000-0000-000000000004', 'Interior Latex Paint', 2, 'gal', 'Paint', 'material'),
  ('d0000000-0000-0000-0000-000000000005', 'Caulk Tube', 1, 'each', 'Paint', 'material');

-- Task Recipe: Replace Toilet
INSERT INTO public.task_recipes (id, org_id, name, trade, keywords, active, is_repeatable, created_by) VALUES
  ('c0000000-0000-0000-0000-000000000002', NULL, 'Replace Toilet', 'Plumbing', '{toilet,replace,plumbing}', true, true, '00000000-0000-0000-0000-000000000000');
INSERT INTO public.task_recipe_steps (id, recipe_id, title, sort_order, trade) VALUES
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000002', 'Turn off water & remove old toilet', 1, 'Plumbing'),
  ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'Inspect flange & repair if needed', 2, 'Plumbing'),
  ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 'Install new wax ring & set toilet', 3, 'Plumbing'),
  ('d0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000002', 'Connect water supply & test', 4, 'Plumbing');
INSERT INTO public.task_recipe_step_materials (recipe_step_id, material_name, qty, unit, store_section, item_type) VALUES
  ('d0000000-0000-0000-0000-000000000012', 'Toilet Wax Ring', 1, 'each', 'Plumbing', 'material'),
  ('d0000000-0000-0000-0000-000000000013', 'Supply Line Braided', 1, 'each', 'Plumbing', 'material');

-- Material Bundle: Paint Room Supplies
INSERT INTO public.task_material_bundles (id, org_id, name, trade, keywords, priority, active, created_by) VALUES
  ('e0000000-0000-0000-0000-000000000001', NULL, 'Paint Room Supplies', 'Painting', '{paint,room}', 100, true, '00000000-0000-0000-0000-000000000000');
INSERT INTO public.task_material_bundle_items (bundle_id, material_name, qty, unit, store_section) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Interior Latex Paint', 2, 'gal', 'Paint'),
  ('e0000000-0000-0000-0000-000000000001', 'Primer', 1, 'gal', 'Paint'),
  ('e0000000-0000-0000-0000-000000000001', 'Painter''s Tape', 2, 'roll', 'Paint'),
  ('e0000000-0000-0000-0000-000000000001', 'Drop Cloth', 2, 'each', 'Paint'),
  ('e0000000-0000-0000-0000-000000000001', 'Sandpaper Assorted', 1, 'pack', 'Hardware'),
  ('e0000000-0000-0000-0000-000000000001', 'Caulk Tube', 1, 'each', 'Paint'),
  ('e0000000-0000-0000-0000-000000000001', 'Wood Filler', 1, 'tube', 'Paint');

-- ============================================================
-- 6. CLONE FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.clone_seed_libraries_to_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  new_id uuid;
  step_rec RECORD;
  new_step_id uuid;
BEGIN
  INSERT INTO cost_items (org_id, name, normalized_name, unit_type, default_total_cost, piece_length_ft, active)
  SELECT p_org_id, name, normalized_name, unit_type, default_total_cost, piece_length_ft, active
  FROM cost_items WHERE org_id IS NULL;

  INSERT INTO store_sections (org_id, name, sort_order, is_active)
  SELECT p_org_id, name, sort_order, is_active
  FROM store_sections WHERE org_id IS NULL;

  INSERT INTO material_library (org_id, name, normalized_name, sku, vendor_url, unit_cost, unit, store_section, is_active)
  SELECT p_org_id, name, normalized_name, sku, vendor_url, unit_cost, unit, store_section, is_active
  FROM material_library WHERE org_id IS NULL;

  FOR rec IN SELECT * FROM task_recipes WHERE org_id IS NULL LOOP
    new_id := gen_random_uuid();
    INSERT INTO task_recipes (id, org_id, name, trade, keywords, estimated_cost, active, is_repeatable, created_by)
    VALUES (new_id, p_org_id, rec.name, rec.trade, rec.keywords, rec.estimated_cost, rec.active, rec.is_repeatable, rec.created_by);
    FOR step_rec IN SELECT * FROM task_recipe_steps WHERE recipe_id = rec.id LOOP
      new_step_id := gen_random_uuid();
      INSERT INTO task_recipe_steps (id, recipe_id, title, sort_order, trade, assignment_mode, is_optional, notes, default_candidate_user_ids, created_by)
      VALUES (new_step_id, new_id, step_rec.title, step_rec.sort_order, step_rec.trade, step_rec.assignment_mode, step_rec.is_optional, step_rec.notes, '{}', step_rec.created_by);
      INSERT INTO task_recipe_step_materials (recipe_step_id, material_name, qty, unit, sku, vendor_url, store_section, provided_by, item_type, qty_formula, notes, unit_cost)
      SELECT new_step_id, material_name, qty, unit, sku, vendor_url, store_section, provided_by, item_type, qty_formula, notes, unit_cost
      FROM task_recipe_step_materials WHERE recipe_step_id = step_rec.id;
    END LOOP;
  END LOOP;

  FOR rec IN SELECT * FROM task_material_bundles WHERE org_id IS NULL LOOP
    new_id := gen_random_uuid();
    INSERT INTO task_material_bundles (id, org_id, name, trade, keywords, priority, active, created_by)
    VALUES (new_id, p_org_id, rec.name, rec.trade, rec.keywords, rec.priority, rec.active, rec.created_by);
    INSERT INTO task_material_bundle_items (bundle_id, material_name, qty, unit, sku, vendor_url, store_section, provided_by)
    SELECT new_id, material_name, qty, unit, sku, vendor_url, store_section, provided_by
    FROM task_material_bundle_items WHERE bundle_id = rec.id;
  END LOOP;

  FOR rec IN SELECT * FROM rehab_library WHERE org_id IS NULL LOOP
    new_id := gen_random_uuid();
    INSERT INTO rehab_library (id, org_id, name, category, keywords, active, created_by)
    VALUES (new_id, p_org_id, rec.name, rec.category, rec.keywords, rec.active, rec.created_by);
    INSERT INTO rehab_library_items (library_id, description, trade, sort_order, default_status)
    SELECT new_id, description, trade, sort_order, default_status
    FROM rehab_library_items WHERE library_id = rec.id;
  END LOOP;

  FOR rec IN SELECT * FROM checklist_templates WHERE org_id IS NULL LOOP
    new_id := gen_random_uuid();
    INSERT INTO checklist_templates (id, org_id, name, active)
    VALUES (new_id, p_org_id, rec.name, rec.active);
    INSERT INTO checklist_items (template_id, label, normalized_label, category, sort_order, active)
    SELECT new_id, label, normalized_label, category, sort_order, active
    FROM checklist_items WHERE template_id = rec.id;
  END LOOP;
END;
$$;

-- ============================================================
-- 7. AUTO-CLONE TRIGGER ON NEW ORG
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_org_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM clone_seed_libraries_to_org(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clone_seeds_on_org_create
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.on_org_created();
