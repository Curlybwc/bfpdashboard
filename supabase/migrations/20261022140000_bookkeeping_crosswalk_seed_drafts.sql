-- Packet 3B addendum — seed crosswalk DRAFTS from the utility adapter
-- (Jen, 2026-10-22: she should not have to hand-create pairings Ezzie
-- can draft from her own Rentals Utilities data).
--
-- A1 (20261022120000) established that the bank text and the property
-- register's utility adapter carry two different MSD number series
-- that never join on their own, and that NOTHING pairs them
-- algorithmically. This function does not break that rule: it drafts a
-- crosswalk row ONLY where the adapter's own account number literally
-- appears in the company's bank text — the same bank-series number
-- classify extracts (substring 'MSD\s+WEB\s+([0-9]+)'). An adapter
-- account "appears" when the extracted bank number equals the
-- reference's account-number part (the digits before the check-digit
-- dash, the form the utility matcher itself uses) or the reference's
-- full digit string. Exact appearance only: no fuzzy matching, no
-- amount matching, no series translation (§25.3 / FR-05.02-18).
--
-- Seeded rows are DRAFTS. Drafts classify nothing — the classify
-- utility step fires only on owner-confirmed rows — so seeding can
-- never change a classification by itself. Idempotent: a bank number
-- that already has a crosswalk row (draft, confirmed, or rejected) is
-- reported as already present and never overwritten; owner rulings
-- are final against the seeder.
--
-- The adapter store (property_management_utility_accounts_adapter) is
-- the single Property Management source loaded from the Rentals
-- Utilities sheet; its rows live under the PM org while crosswalk
-- rows live under the company's bookkeeping org. A1's fixtures
-- already link across exactly this way; the seeder follows.
--
-- Provider scope: MSD only. The bank-text identity extraction in
-- classify is the MSD WEB pattern; other providers carry no bank-text
-- account identity yet, so there is no identical mechanism to
-- generalize to. Any other provider raises rather than guessing.
--
-- Stage discipline: Stage 1 only — nothing here writes to QuickBooks.
-- Grants follow the project rule: authenticated + service_role,
-- never anon; the function is a manager-gated SECURITY DEFINER door
-- like its crosswalk siblings.

CREATE OR REPLACE FUNCTION public.bookkeeping_utility_crosswalk_seed_drafts(_company_id uuid, _provider text DEFAULT 'MSD')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_provider text := upper(coalesce(_provider, 'MSD'));
  v_actor text;
  v_bank_count integer := 0;
  v_created integer := 0;
  v_seeded jsonb := '[]'::jsonb;
  v_present jsonb := '[]'::jsonb;
  v_unmatched jsonb := '[]'::jsonb;
  v_ambiguous jsonb := '[]'::jsonb;
  v_adapter_residue jsonb := '[]'::jsonb;
  r record;
  v_n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if v_provider <> 'MSD' then
    raise exception 'Crosswalk seeding is implemented for MSD only: the bank-text account identity classify uses is the MSD WEB pattern, and other providers carry no bank-text account number to appear.';
  end if;
  select c.business_organization_id into v_org_id
    from public.companies c where c.id = _company_id;
  if v_org_id is null then
    raise exception 'Company not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to seed the utility crosswalk for this company';
  end if;
  v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text);

  -- Walk every distinct MSD bank number in the company's bank text,
  -- in order, and give each exactly one disposition — nothing is
  -- silently dropped.
  for r in
    with bank_numbers as (
      select substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)') as bank_number,
             count(*) as bank_rows
        from public.bookkeeping_bank_transactions t
       where t.company_id = _company_id
         and substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)') is not null
       group by 1
    ),
    matches as (
      select bn.bank_number,
             a.id as adapter_id,
             a.account_reference,
             a.source_record_id,
             a.property_id,
             p.display_name as property_label
        from bank_numbers bn
        join public.property_management_utility_accounts_adapter a
          on a.provider = v_provider
         and (split_part(a.account_reference, '-', 1) = bn.bank_number
              or regexp_replace(a.account_reference, '[^0-9]', '', 'g') = bn.bank_number)
        left join public.properties p on p.id = a.property_id
    )
    select bn.bank_number,
           bn.bank_rows,
           x.id as existing_id,
           x.status as existing_status,
           (select count(distinct m.property_id) from matches m
             where m.bank_number = bn.bank_number) as matched_properties,
           (select m.adapter_id from matches m
             where m.bank_number = bn.bank_number
             order by m.adapter_id limit 1) as adapter_id,
           (select m.account_reference from matches m
             where m.bank_number = bn.bank_number
             order by m.adapter_id limit 1) as adapter_reference,
           (select m.source_record_id from matches m
             where m.bank_number = bn.bank_number
             order by m.adapter_id limit 1) as adapter_source_record_id,
           (select m.property_id from matches m
             where m.bank_number = bn.bank_number
             order by m.adapter_id limit 1) as adapter_property_id,
           (select m.property_label from matches m
             where m.bank_number = bn.bank_number
             order by m.adapter_id limit 1) as adapter_property_label
      from bank_numbers bn
      left join public.bookkeeping_utility_account_crosswalk x
        on x.company_id = _company_id
       and x.bank_account_number = bn.bank_number
     order by bn.bank_number
  loop
    v_bank_count := v_bank_count + 1;
    if r.existing_id is not null then
      -- An owner ruling (or an earlier draft) already stands for this
      -- number. The seeder never overwrites any of them.
      v_present := v_present || jsonb_build_object(
        'bank_account_number', r.bank_number,
        'status', r.existing_status);
    elsif r.matched_properties = 1 and r.adapter_property_id is not null then
      insert into public.bookkeeping_utility_account_crosswalk
        (org_id, company_id, bank_account_number, adapter_id, property_id, status, basis)
      values
        (v_org_id, _company_id, r.bank_number, r.adapter_id, r.adapter_property_id, 'draft',
         'Draft seeded from the Rentals Utilities spreadsheet adapter record ' ||
         coalesce(r.adapter_source_record_id, '(no source record id)') ||
         ' (MSD account ' || r.adapter_reference || ', ' ||
         coalesce(r.adapter_property_label, 'property unnamed') || ') — ' ||
         'this account number appears in this company''s bank text (' ||
         r.bank_rows || ' bank row(s)). A seeded draft classifies nothing; ' ||
         'owner confirmation is required before classify uses it.')
      on conflict (company_id, bank_account_number) do nothing;
      get diagnostics v_n = row_count;
      if v_n = 1 then
        v_created := v_created + 1;
        v_seeded := v_seeded || jsonb_build_object(
          'bank_account_number', r.bank_number,
          'adapter_account_reference', r.adapter_reference,
          'adapter_source_record_id', r.adapter_source_record_id,
          'property_label', r.adapter_property_label);
      else
        v_present := v_present || jsonb_build_object(
          'bank_account_number', r.bank_number,
          'status', 'draft');
      end if;
    elsif r.matched_properties is not null and r.matched_properties > 1 then
      -- One account number serving several properties (a shared
      -- account): the mapping is the owner's to make, never a guess.
      v_ambiguous := v_ambiguous || jsonb_build_object(
        'bank_account_number', r.bank_number,
        'adapter_account_reference', r.adapter_reference,
        'matched_properties', r.matched_properties);
    else
      v_unmatched := v_unmatched || jsonb_build_object(
        'bank_account_number', r.bank_number,
        'bank_rows', r.bank_rows);
    end if;
  end loop;

  -- The other direction of residue: spreadsheet (adapter) MSD
  -- accounts whose number never appears in this company's bank text.
  -- They stay unmapped and are named here, not dropped.
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_reference', g.account_reference,
           'properties', g.property_labels) order by g.account_reference), '[]'::jsonb)
    into v_adapter_residue
    from (
      select a.account_reference,
             array_agg(distinct coalesce(p.display_name, a.source_record_id)
                       order by coalesce(p.display_name, a.source_record_id)) as property_labels
        from public.property_management_utility_accounts_adapter a
        left join public.properties p on p.id = a.property_id
       where a.provider = v_provider
         and not exists (
           select 1
             from public.bookkeeping_bank_transactions t
            where t.company_id = _company_id
              and substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)') is not null
              and (split_part(a.account_reference, '-', 1) =
                     substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)')
                   or regexp_replace(a.account_reference, '[^0-9]', '', 'g') =
                     substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)'))
         )
       group by a.account_reference
    ) g;

  return jsonb_build_object(
    'provider', v_provider,
    'bank_numbers_found', v_bank_count,
    'drafts_created', v_created,
    'seeded', v_seeded,
    'already_present', v_present,
    'bank_numbers_without_adapter_match', v_unmatched,
    'ambiguous_adapter_matches', v_ambiguous,
    'adapter_accounts_not_in_bank_text', v_adapter_residue,
    'actor', v_actor
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_seed_drafts(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_seed_drafts(uuid, text) TO authenticated, service_role;
