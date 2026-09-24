-- Ezzie Package B rollback (STAGING). Destroys Package B data only.
BEGIN;
DROP SCHEMA IF EXISTS ezzie_import CASCADE;
DROP TRIGGER IF EXISTS trg_guard_pis ON public.properties;
DROP TRIGGER IF EXISTS trg_guard_pis_insert ON public.properties;
DROP TABLE IF EXISTS public.property_documents, public.property_compliance_records, public.property_valuations,
  public.property_tax_records, public.insurance_policy_property_links, public.insurance_policies,
  public.loan_property_links, public.loans, public.property_events, public.property_maintenance_events,
  public.equipment_filter_specs, public.property_equipment, public.utility_accounts,
  public.tenancy_occupants, public.tenancies CASCADE;
DROP FUNCTION IF EXISTS public.sync_property_placed_in_service(), public.guard_property_placed_in_service(),
  public.guard_property_pis_insert(), public.validate_maintenance_equipment(),
  public.validate_unit_belongs_to_property(), public.can_view_loan(uuid,uuid),
  public.can_view_insurance_policy(uuid,uuid);
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check,
  DROP CONSTRAINT IF EXISTS properties_sold_date_order,
  DROP COLUMN IF EXISTS placed_in_service_on, DROP COLUMN IF EXISTS county, DROP COLUMN IF EXISTS parcel_number,
  DROP COLUMN IF EXISTS year_built, DROP COLUMN IF EXISTS sold_on, DROP COLUMN IF EXISTS acquired_on;
ALTER TABLE public.units DROP COLUMN IF EXISTS source_record_id, DROP COLUMN IF EXISTS source_system,
  DROP COLUMN IF EXISTS square_feet, DROP COLUMN IF EXISTS bathrooms, DROP COLUMN IF EXISTS bedrooms;
COMMENT ON TABLE public.tenants IS NULL;
COMMIT;
