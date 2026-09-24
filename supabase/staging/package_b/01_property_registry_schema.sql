-- ============================================================
-- Ezzie Package B — Property Registry Expansion (STAGING ONLY)
-- Target: staging ref iuaqsqdxflakhphnwyec. DO NOT apply to production
-- (fuwjacbhgkgibdvjwryr) until staging sign-off.
-- Additive only. Reuses Package A: properties, units, people,
-- business_organizations, property_organization_relationships,
-- property_external_ids, projects.property_id.
-- Conventions: unknown = NULL (no false/0 defaults on facts);
-- child FKs to properties are ON DELETE RESTRICT; provenance columns
-- source_system / source_record_id / import_batch_id / as_of_date.
-- ============================================================

-- 0. Preflight: refuse to run if any Package B table already exists
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN (
    'tenancies','tenancy_occupants','utility_accounts','property_equipment',
    'equipment_filter_specs','property_maintenance_events','property_events',
    'loans','loan_property_links','insurance_policies','insurance_policy_property_links',
    'property_tax_records','property_valuations','property_compliance_records',
    'property_documents');
  IF n > 0 THEN RAISE EXCEPTION 'Package B preflight failed: % tables already exist', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='can_view_property')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_shared_core_admin') THEN
    RAISE EXCEPTION 'Package A helpers missing';
  END IF;
END $$;

-- 1. Additive columns on existing Package A tables (all nullable)
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS acquired_on date,
  ADD COLUMN IF NOT EXISTS sold_on date,
  ADD COLUMN IF NOT EXISTS year_built int,
  ADD COLUMN IF NOT EXISTS parcel_number text,
  ADD COLUMN IF NOT EXISTS county text,
  -- Derived cache of the confirmed placed_in_service event. Never edited directly.
  ADD COLUMN IF NOT EXISTS placed_in_service_on date;
COMMENT ON COLUMN public.properties.placed_in_service_on IS
  'DERIVED: synchronized from the latest confirmed property_events(placed_in_service). Direct writes are rejected.';

ALTER TABLE public.properties
  ADD CONSTRAINT properties_status_check
  CHECK (status IN ('active','inactive','sold','under_contract','unknown')) NOT VALID;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_sold_date_order
  CHECK (sold_on IS NULL OR acquired_on IS NULL OR sold_on >= acquired_on) NOT VALID;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS bedrooms numeric(4,1),
  ADD COLUMN IF NOT EXISTS bathrooms numeric(4,1),
  ADD COLUMN IF NOT EXISTS square_feet int,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_record_id text;

-- 2. Shared validation: unit must belong to the row's property
CREATE OR REPLACE FUNCTION public.validate_unit_belongs_to_property()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units u WHERE u.id = NEW.unit_id AND u.property_id = NEW.property_id) THEN
    RAISE EXCEPTION 'unit % does not belong to property %', NEW.unit_id, NEW.property_id;
  END IF;
  RETURN NEW;
END $$;

-- 3. Tenancies (Person -> tenancy -> Unit/Property). Tenant PII is admin-only.
CREATE TABLE public.tenancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('prospective','active','notice','ended','unknown')),
  lease_start date, lease_end date, move_in date, move_out date,
  rent_amount numeric(12,2), deposit_amount numeric(12,2),
  rent_frequency text CHECK (rent_frequency IS NULL OR rent_frequency IN ('monthly','weekly','other')),
  source_system text, source_record_id text, import_batch_id uuid, as_of_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lease_end IS NULL OR lease_start IS NULL OR lease_end >= lease_start),
  CHECK (move_out IS NULL OR move_in IS NULL OR move_out >= move_in),
  CHECK (rent_amount IS NULL OR rent_amount >= 0)
);
CREATE TABLE public.tenancy_occupants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id uuid NOT NULL REFERENCES public.tenancies(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('primary','co_tenant','occupant','guarantor')),
  effective_from date, effective_to date,
  source_system text, source_record_id text, import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenancy_id, person_id, role),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

-- 4. Utility accounts
CREATE TABLE public.utility_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  utility_type text NOT NULL CHECK (utility_type IN ('electric','gas','water','sewer','trash','internet','other')),
  provider_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  provider_name_raw text,
  account_number text,
  payer_type text NOT NULL DEFAULT 'unknown' CHECK (payer_type IN ('owner','tenant','unknown')),
  payer_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  payer_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  autopay boolean, leave_on boolean, ebill boolean,   -- NULL = unknown
  effective_from date, effective_to date,
  source_system text, source_record_id text, import_batch_id uuid, as_of_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

-- 5. Equipment + HVAC filter specs + maintenance history
CREATE TABLE public.property_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  equipment_type text NOT NULL CHECK (equipment_type IN ('hvac','furnace','ac_condenser','heat_pump',
    'water_heater','refrigerator','range','dishwasher','microwave','washer','dryer','other')),
  make text, model text, serial_number text,
  installed_on date, warranty_expires_on date, removed_on date,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('in_service','removed','failed','unknown')),
  source_system text, source_record_id text, import_batch_id uuid, as_of_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (removed_on IS NULL OR installed_on IS NULL OR removed_on >= installed_on)
);
CREATE TABLE public.equipment_filter_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.property_equipment(id) ON DELETE RESTRICT,
  filter_size text NOT NULL, quantity int CHECK (quantity IS NULL OR quantity > 0), location text,
  effective_from date, effective_to date,
  source_system text, source_record_id text, import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.property_maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  equipment_id uuid REFERENCES public.property_equipment(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('filter_change','hvac_clean_check','service','repair','inspection','other')),
  performed_on date,
  performed_by_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  performed_by_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  cost numeric(12,2),
  source_system text, source_record_id text, import_batch_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Property events / milestones (authoritative time-aware store)
CREATE TABLE public.property_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('acquired','sold','rental_listing_activated',
    'placed_in_service','rehab_started','rehab_completed','tenancy_started','other')),
  event_date date,
  confirmation_status text NOT NULL DEFAULT 'proposed'
    CHECK (confirmation_status IN ('proposed','confirmed','rejected','superseded')),
  confirmed_by uuid, confirmed_at timestamptz,
  evidence_summary text,
  supersedes_event_id uuid REFERENCES public.property_events(id) ON DELETE RESTRICT,
  source_system text, source_record_id text, import_batch_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (confirmation_status <> 'confirmed' OR (event_date IS NOT NULL AND confirmed_at IS NOT NULL))
);
-- at most one confirmed placed_in_service per property/unit scope
CREATE UNIQUE INDEX property_events_one_confirmed_pis
  ON public.property_events (property_id, COALESCE(unit_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE event_type='placed_in_service' AND confirmation_status='confirmed';

-- 7. Loans (durable, many-to-many with properties)
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  borrower_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  loan_number text, loan_type text,
  is_blanket boolean,
  original_amount numeric(14,2), interest_rate numeric(7,4),
  originated_on date, maturity_on date, paid_off_on date,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('active','paid_off','refinanced','unknown')),
  source_system text, source_record_id text, import_batch_id uuid, as_of_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.loan_property_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  allocation_amount numeric(14,2), allocation_percentage numeric(6,3)
    CHECK (allocation_percentage IS NULL OR allocation_percentage BETWEEN 0 AND 100),
  lien_position int,
  effective_from date, effective_to date, release_on date,
  source_system text, source_record_id text, import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

-- 8. Insurance (one policy -> many properties)
CREATE TABLE public.insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  insured_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  policy_number text, coverage_type text,
  premium numeric(12,2), term_start date, term_end date,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('active','expired','canceled','unknown')),
  source_system text, source_record_id text, import_batch_id uuid, as_of_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (term_end IS NULL OR term_start IS NULL OR term_end >= term_start)
);
CREATE TABLE public.insurance_policy_property_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  coverage_amount numeric(14,2), premium_allocation numeric(12,2),
  effective_from date, effective_to date,
  source_system text, source_record_id text, import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Taxes, valuations, compliance, documents
CREATE TABLE public.property_tax_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  tax_year int NOT NULL, parcel_number text,
  taxing_authority_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  assessed_value numeric(14,2), tax_amount numeric(12,2), due_on date, paid_on date,
  source_system text, source_record_id text, import_batch_id uuid, as_of_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX property_tax_records_year_parcel
  ON public.property_tax_records (property_id, tax_year, COALESCE(parcel_number,''));
CREATE TABLE public.property_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  valuation_date date, amount numeric(14,2),
  method text CHECK (method IS NULL OR method IN ('appraisal','bpo','tax_assessment','purchase_price','internal','other')),
  source_system text, source_record_id text, import_batch_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.property_compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  record_type text NOT NULL CHECK (record_type IN ('rental_license','inspection','certificate','other')),
  jurisdiction_organization_id uuid REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  identifier text, issued_on date, expires_on date, result text,
  source_system text, source_record_id text, import_batch_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.property_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  linked_entity_type text CHECK (linked_entity_type IS NULL OR linked_entity_type IN ('tenancy','utility_account',
    'equipment','maintenance_event','property_event','loan','insurance_policy','tax_record','valuation','compliance_record')),
  linked_entity_id uuid,
  document_type text, title text, storage_path text, external_url text,
  document_date date,
  source_system text, source_record_id text, import_batch_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (property_id IS NOT NULL OR linked_entity_id IS NOT NULL),
  CHECK ((linked_entity_type IS NULL) = (linked_entity_id IS NULL))
);

-- 10. Indexes (FKs + lookups; no global uniqueness on names/addresses)
CREATE INDEX ON public.tenancies (property_id); CREATE INDEX ON public.tenancies (unit_id);
CREATE INDEX ON public.tenancy_occupants (person_id);
CREATE INDEX ON public.utility_accounts (property_id);
CREATE INDEX ON public.utility_accounts (provider_organization_id, account_number);
CREATE INDEX ON public.property_equipment (property_id);
CREATE INDEX ON public.property_equipment (serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX ON public.equipment_filter_specs (equipment_id);
CREATE INDEX ON public.property_maintenance_events (property_id);
CREATE INDEX ON public.property_maintenance_events (equipment_id);
CREATE INDEX ON public.property_events (property_id, event_type);
CREATE INDEX ON public.loan_property_links (loan_id); CREATE INDEX ON public.loan_property_links (property_id);
CREATE INDEX ON public.insurance_policy_property_links (policy_id);
CREATE INDEX ON public.insurance_policy_property_links (property_id);
CREATE INDEX ON public.property_valuations (property_id);
CREATE INDEX ON public.property_compliance_records (property_id);
CREATE INDEX ON public.property_documents (property_id);
CREATE INDEX ON public.property_documents (linked_entity_type, linked_entity_id);
-- source idempotency (source row can only land once per table)
CREATE UNIQUE INDEX tenancies_source_uq ON public.tenancies (source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX utility_accounts_source_uq ON public.utility_accounts (source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX property_equipment_source_uq ON public.property_equipment (source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX loans_source_uq ON public.loans (source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX insurance_policies_source_uq ON public.insurance_policies (source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX loan_property_links_active_uq ON public.loan_property_links (loan_id, property_id, COALESCE(effective_from,'-infinity'::date));
CREATE UNIQUE INDEX insurance_links_active_uq ON public.insurance_policy_property_links (policy_id, property_id, COALESCE(effective_from,'-infinity'::date));

-- 11. Triggers
CREATE TRIGGER trg_tenancies_unit BEFORE INSERT OR UPDATE ON public.tenancies FOR EACH ROW EXECUTE FUNCTION public.validate_unit_belongs_to_property();
CREATE TRIGGER trg_utility_unit BEFORE INSERT OR UPDATE ON public.utility_accounts FOR EACH ROW EXECUTE FUNCTION public.validate_unit_belongs_to_property();
CREATE TRIGGER trg_equipment_unit BEFORE INSERT OR UPDATE ON public.property_equipment FOR EACH ROW EXECUTE FUNCTION public.validate_unit_belongs_to_property();
CREATE TRIGGER trg_maint_unit BEFORE INSERT OR UPDATE ON public.property_maintenance_events FOR EACH ROW EXECUTE FUNCTION public.validate_unit_belongs_to_property();
CREATE TRIGGER trg_events_unit BEFORE INSERT OR UPDATE ON public.property_events FOR EACH ROW EXECUTE FUNCTION public.validate_unit_belongs_to_property();
CREATE TRIGGER trg_compliance_unit BEFORE INSERT OR UPDATE ON public.property_compliance_records FOR EACH ROW EXECUTE FUNCTION public.validate_unit_belongs_to_property();
CREATE TRIGGER trg_tenancies_updated BEFORE UPDATE ON public.tenancies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_utility_updated BEFORE UPDATE ON public.utility_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_equipment_updated BEFORE UPDATE ON public.property_equipment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_insurance_updated BEFORE UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- maintenance equipment must be on same property
CREATE OR REPLACE FUNCTION public.validate_maintenance_equipment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.equipment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.property_equipment e WHERE e.id=NEW.equipment_id AND e.property_id=NEW.property_id) THEN
    RAISE EXCEPTION 'equipment % is not on property %', NEW.equipment_id, NEW.property_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_maint_equipment BEFORE INSERT OR UPDATE ON public.property_maintenance_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_maintenance_equipment();

-- placed_in_service_on is derived: sync from confirmed event, reject direct edits
CREATE OR REPLACE FUNCTION public.sync_property_placed_in_service()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid := COALESCE(NEW.property_id, OLD.property_id);
BEGIN
  PERFORM set_config('app.pis_sync','on',true);
  UPDATE public.properties p SET placed_in_service_on = (
    SELECT max(event_date) FROM public.property_events e
    WHERE e.property_id=pid AND e.unit_id IS NULL
      AND e.event_type='placed_in_service' AND e.confirmation_status='confirmed')
  WHERE p.id = pid;
  PERFORM set_config('app.pis_sync','off',true);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_property_events_pis AFTER INSERT OR UPDATE OR DELETE ON public.property_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_property_placed_in_service();

CREATE OR REPLACE FUNCTION public.guard_property_placed_in_service()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.placed_in_service_on IS DISTINCT FROM OLD.placed_in_service_on
     AND COALESCE(current_setting('app.pis_sync', true),'off') <> 'on' THEN
    RAISE EXCEPTION 'placed_in_service_on is derived from confirmed property_events; edit the event instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_pis BEFORE UPDATE OF placed_in_service_on ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_placed_in_service();
CREATE OR REPLACE FUNCTION public.guard_property_pis_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.placed_in_service_on IS NOT NULL THEN
    RAISE EXCEPTION 'placed_in_service_on is derived; create a confirmed property_event';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_pis_insert BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_pis_insert();

REVOKE EXECUTE ON FUNCTION public.sync_property_placed_in_service() FROM PUBLIC, anon, authenticated;

-- 12. Loan/insurance visibility helpers (visible if caller can see any linked property; admin always)
CREATE OR REPLACE FUNCTION public.can_view_loan(_user_id uuid, _loan_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_shared_core_admin(_user_id)
$$;
CREATE OR REPLACE FUNCTION public.can_view_insurance_policy(_user_id uuid, _policy_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_shared_core_admin(_user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_loan(uuid,uuid), public.can_view_insurance_policy(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_loan(uuid,uuid), public.can_view_insurance_policy(uuid,uuid) TO authenticated;

-- 13. GRANTs -> RLS -> policies
DO $$
DECLARE t text;
  admin_only text[] := ARRAY['tenancies','tenancy_occupants','utility_accounts','loans','loan_property_links',
    'insurance_policies','insurance_policy_property_links','property_tax_records','property_valuations','property_documents'];
  property_visible text[] := ARRAY['property_equipment','property_maintenance_events','property_events',
    'property_compliance_records'];
BEGIN
  FOREACH t IN ARRAY admin_only || property_visible || ARRAY['equipment_filter_specs'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "shared core admin write" ON public.%I FOR ALL TO authenticated USING (public.is_shared_core_admin(auth.uid())) WITH CHECK (public.is_shared_core_admin(auth.uid()))', t);
  END LOOP;
  -- tenant PII + financials: admin-only read (policy above covers SELECT)
  -- physical asset records: readable by anyone who can see the property
  FOREACH t IN ARRAY property_visible LOOP
    EXECUTE format('CREATE POLICY "property viewers read" ON public.%I FOR SELECT TO authenticated USING (public.can_view_property(auth.uid(), property_id))', t);
  END LOOP;
END $$;
CREATE POLICY "property viewers read" ON public.equipment_filter_specs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.property_equipment e
                 WHERE e.id = equipment_id AND public.can_view_property(auth.uid(), e.property_id)));

-- 14. Legacy tenants: deprecate only (0 rows at inspection; table, FK, RLS, UI untouched)
COMMENT ON TABLE public.tenants IS 'DEPRECATED: replaced by tenancies + tenancy_occupants (Package B). Do not write new rows.';
