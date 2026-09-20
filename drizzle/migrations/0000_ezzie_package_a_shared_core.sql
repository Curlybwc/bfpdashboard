-- ============ SHARED CORE (Package A) ============

CREATE TABLE IF NOT EXISTS public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  legal_name text,
  preferred_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','deceased','unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_system text,
  notes text
);

CREATE TABLE IF NOT EXISTS public.person_contact_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('email','phone','other')),
  value text NOT NULL,
  normalized_value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','invalid')),
  visibility_scope text NOT NULL DEFAULT 'business' CHECK (visibility_scope IN ('business','private','restricted')),
  source_system text,
  source_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcm_person ON public.person_contact_methods(person_id);
CREATE INDEX IF NOT EXISTS idx_pcm_normalized ON public.person_contact_methods(normalized_value);

CREATE TABLE IF NOT EXISTS public.person_auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  auth_system text NOT NULL,
  external_subject_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT person_auth_identities_system_subject_key UNIQUE (auth_system, external_subject_id)
);
CREATE INDEX IF NOT EXISTS idx_pai_person ON public.person_auth_identities(person_id);

CREATE TABLE IF NOT EXISTS public.business_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  organization_type text NOT NULL CHECK (organization_type IN ('legal_entity','dba_brand','operating_division','vendor_business','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  normalized_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_system text,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_bo_normalized_name ON public.business_organizations(normalized_name);

CREATE TABLE IF NOT EXISTS public.organization_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  child_organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  effective_from date,
  effective_to date,
  source_system text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_rel_no_self CHECK (parent_organization_id <> child_organization_id),
  CONSTRAINT org_rel_date_order CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_org_rel_parent ON public.organization_relationships(parent_organization_id);
CREATE INDEX IF NOT EXISTS idx_org_rel_child ON public.organization_relationships(child_organization_id);

CREATE TABLE IF NOT EXISTS public.organization_person_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  effective_from date,
  effective_to date,
  source_system text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opr_date_order CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_opr_org ON public.organization_person_roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_opr_person ON public.organization_person_roles(person_id);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  address_line_1 text NOT NULL,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'US',
  normalized_address_key text,
  property_type text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_system text,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_properties_normalized_address ON public.properties(normalized_address_key);

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_label text NOT NULL,
  unit_type text,
  is_whole_property_unit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT units_property_label_key UNIQUE (property_id, unit_label)
);

CREATE TABLE IF NOT EXISTS public.property_organization_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  ownership_percentage numeric(7,4) CHECK (ownership_percentage IS NULL OR (ownership_percentage >= 0 AND ownership_percentage <= 100)),
  effective_from date,
  effective_to date,
  source_system text,
  source_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT por_date_order CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_por_property ON public.property_organization_relationships(property_id);
CREATE INDEX IF NOT EXISTS idx_por_org ON public.property_organization_relationships(organization_id);

CREATE TABLE IF NOT EXISTS public.person_external_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  system_key text NOT NULL,
  external_id text NOT NULL,
  external_type text,
  status text NOT NULL DEFAULT 'active',
  source_system text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT person_external_ids_system_external_key UNIQUE (system_key, external_id)
);

CREATE TABLE IF NOT EXISTS public.organization_external_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  system_key text NOT NULL,
  external_id text NOT NULL,
  external_type text,
  status text NOT NULL DEFAULT 'active',
  source_system text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT organization_external_ids_system_external_key UNIQUE (system_key, external_id)
);

CREATE TABLE IF NOT EXISTS public.property_external_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  system_key text NOT NULL,
  external_id text NOT NULL,
  external_type text,
  status text NOT NULL DEFAULT 'active',
  source_system text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT property_external_ids_system_external_key UNIQUE (system_key, external_id)
);

-- ============ NULLABLE LINKS ON EXISTING TABLES ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS business_organization_id uuid REFERENCES public.business_organizations(id);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id);
CREATE INDEX IF NOT EXISTS idx_profiles_person ON public.profiles(person_id);
CREATE INDEX IF NOT EXISTS idx_companies_business_org ON public.companies(business_organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_property ON public.projects(property_id);

-- ============ UPDATED_AT TRIGGERS ============
DROP TRIGGER IF EXISTS trg_people_updated_at ON public.people;
CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pcm_updated_at ON public.person_contact_methods;
CREATE TRIGGER trg_pcm_updated_at BEFORE UPDATE ON public.person_contact_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_bo_updated_at ON public.business_organizations;
CREATE TRIGGER trg_bo_updated_at BEFORE UPDATE ON public.business_organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_properties_updated_at ON public.properties;
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_units_updated_at ON public.units;
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_contact_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_auth_identities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_relationships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_person_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_organization_relationships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_external_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_external_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_external_ids TO authenticated;
GRANT ALL ON public.people, public.person_contact_methods, public.person_auth_identities,
  public.business_organizations, public.organization_relationships, public.organization_person_roles,
  public.properties, public.units, public.property_organization_relationships,
  public.person_external_ids, public.organization_external_ids, public.property_external_ids TO service_role;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_shared_core_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_property(_user_id uuid, _property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_shared_core_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.project_members pm ON pm.project_id = p.id
      WHERE p.property_id = _property_id AND pm.user_id = _user_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_person(_user_id uuid, _person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_shared_core_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _user_id AND pr.person_id = _person_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles target
      JOIN public.project_members pm_target ON pm_target.user_id = target.id
      JOIN public.project_members pm_self ON pm_self.project_id = pm_target.project_id
      WHERE target.person_id = _person_id AND pm_self.user_id = _user_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_business_organization(_user_id uuid, _business_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_shared_core_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.business_organization_id = _business_organization_id
        AND public.user_can_see_company(_user_id, c.id)
    )
  );
$$;

-- ============ RLS ============
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_person_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_organization_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_external_ids ENABLE ROW LEVEL SECURITY;

-- people
DROP POLICY IF EXISTS people_select ON public.people;
CREATE POLICY people_select ON public.people FOR SELECT TO authenticated USING (public.can_view_person(auth.uid(), id));
DROP POLICY IF EXISTS people_admin_write ON public.people;
CREATE POLICY people_admin_write ON public.people FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- person_contact_methods
DROP POLICY IF EXISTS pcm_select ON public.person_contact_methods;
CREATE POLICY pcm_select ON public.person_contact_methods FOR SELECT TO authenticated USING (
  public.is_shared_core_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.person_id = person_contact_methods.person_id)
);
DROP POLICY IF EXISTS pcm_admin_write ON public.person_contact_methods;
CREATE POLICY pcm_admin_write ON public.person_contact_methods FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- person_auth_identities
DROP POLICY IF EXISTS pai_select ON public.person_auth_identities;
CREATE POLICY pai_select ON public.person_auth_identities FOR SELECT TO authenticated USING (
  public.is_shared_core_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.person_id = person_auth_identities.person_id)
);
DROP POLICY IF EXISTS pai_admin_write ON public.person_auth_identities;
CREATE POLICY pai_admin_write ON public.person_auth_identities FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- person_external_ids (admin only)
DROP POLICY IF EXISTS pei_admin_all ON public.person_external_ids;
CREATE POLICY pei_admin_all ON public.person_external_ids FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- business_organizations
DROP POLICY IF EXISTS bo_select ON public.business_organizations;
CREATE POLICY bo_select ON public.business_organizations FOR SELECT TO authenticated
  USING (public.can_view_business_organization(auth.uid(), id));
DROP POLICY IF EXISTS bo_admin_write ON public.business_organizations;
CREATE POLICY bo_admin_write ON public.business_organizations FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- organization_relationships (admin only)
DROP POLICY IF EXISTS org_rel_admin_all ON public.organization_relationships;
CREATE POLICY org_rel_admin_all ON public.organization_relationships FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- organization_person_roles (admin only)
DROP POLICY IF EXISTS opr_admin_all ON public.organization_person_roles;
CREATE POLICY opr_admin_all ON public.organization_person_roles FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- organization_external_ids (admin only)
DROP POLICY IF EXISTS oei_admin_all ON public.organization_external_ids;
CREATE POLICY oei_admin_all ON public.organization_external_ids FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- properties
DROP POLICY IF EXISTS properties_select ON public.properties;
CREATE POLICY properties_select ON public.properties FOR SELECT TO authenticated
  USING (public.can_view_property(auth.uid(), id));
DROP POLICY IF EXISTS properties_admin_write ON public.properties;
CREATE POLICY properties_admin_write ON public.properties FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- units
DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
  USING (public.can_view_property(auth.uid(), property_id));
DROP POLICY IF EXISTS units_admin_write ON public.units;
CREATE POLICY units_admin_write ON public.units FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- property_organization_relationships (admin only)
DROP POLICY IF EXISTS por_admin_all ON public.property_organization_relationships;
CREATE POLICY por_admin_all ON public.property_organization_relationships FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));

-- property_external_ids (admin only)
DROP POLICY IF EXISTS prei_admin_all ON public.property_external_ids;
CREATE POLICY prei_admin_all ON public.property_external_ids FOR ALL TO authenticated
  USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()));