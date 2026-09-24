-- Package B staging verification. Runs inside a transaction and ROLLS BACK: leaves no data.
BEGIN;
DO $$
DECLARE p uuid; p2 uuid; u uuid; l uuid; e uuid; ok boolean;
BEGIN
  SELECT id INTO p FROM public.properties ORDER BY created_at LIMIT 1;
  SELECT id INTO p2 FROM public.properties WHERE id <> p ORDER BY created_at LIMIT 1;
  IF p IS NULL OR p2 IS NULL THEN RAISE EXCEPTION 'need 2 properties'; END IF;

  -- unit-belongs-to-property
  INSERT INTO public.units(property_id, unit_label, is_whole_property_unit, status) VALUES (p,'__test',false,'active') RETURNING id INTO u;
  ok := false; BEGIN INSERT INTO public.tenancies(property_id, unit_id) VALUES (p2,u); EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL unit/property mismatch accepted'; END IF;

  -- unknown stays NULL
  INSERT INTO public.utility_accounts(property_id, utility_type) VALUES (p,'water');
  IF EXISTS (SELECT 1 FROM public.utility_accounts WHERE property_id=p AND (autopay IS NOT NULL OR leave_on IS NOT NULL OR ebill IS NOT NULL OR payer_type<>'unknown'))
    THEN RAISE EXCEPTION 'FAIL unknown coerced'; END IF;

  -- blanket loan across two properties
  INSERT INTO public.loans(loan_number, is_blanket) VALUES ('__T1', true) RETURNING id INTO l;
  INSERT INTO public.loan_property_links(loan_id, property_id, allocation_percentage) VALUES (l,p,60),(l,p2,40);
  IF (SELECT count(*) FROM public.loan_property_links WHERE loan_id=l) <> 2 THEN RAISE EXCEPTION 'FAIL blanket loan'; END IF;

  -- placed_in_service derived + guarded
  ok := false; BEGIN UPDATE public.properties SET placed_in_service_on='2025-01-01' WHERE id=p; EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL direct PIS edit allowed'; END IF;
  INSERT INTO public.property_events(property_id, event_type, event_date) VALUES (p,'placed_in_service','2025-02-01') RETURNING id INTO e;
  IF (SELECT placed_in_service_on FROM public.properties WHERE id=p) IS NOT NULL THEN RAISE EXCEPTION 'FAIL proposed event set PIS'; END IF;
  UPDATE public.property_events SET confirmation_status='confirmed', confirmed_at=now() WHERE id=e;
  IF (SELECT placed_in_service_on FROM public.properties WHERE id=p) <> '2025-02-01' THEN RAISE EXCEPTION 'FAIL PIS not synced'; END IF;

  -- RESTRICT: property with children cannot be deleted
  ok := false; BEGIN DELETE FROM public.properties WHERE id=p; EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL property delete not restricted'; END IF;

  RAISE NOTICE 'Package B verification: ALL PASS';
END $$;
-- grants: no anon on any Package B table, RLS on everywhere
SELECT table_name, 'anon grant' AS problem FROM information_schema.role_table_grants
 WHERE grantee='anon' AND table_schema IN ('public','ezzie_import') AND table_name IN
 ('tenancies','tenancy_occupants','utility_accounts','property_equipment','equipment_filter_specs',
  'property_maintenance_events','property_events','loans','loan_property_links','insurance_policies',
  'insurance_policy_property_links','property_tax_records','property_valuations','property_compliance_records',
  'property_documents','import_batches','staging_rows','fact_conflicts')
UNION ALL
SELECT c.relname, 'rls off' FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity AND c.relname IN
 ('tenancies','tenancy_occupants','utility_accounts','property_equipment','equipment_filter_specs',
  'property_maintenance_events','property_events','loans','loan_property_links','insurance_policies',
  'insurance_policy_property_links','property_tax_records','property_valuations','property_compliance_records','property_documents');
-- expected: zero rows
ROLLBACK;
