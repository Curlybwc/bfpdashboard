-- Utility adapter: bill_name (name printed on the bill)
--
-- Jen, 2026-10-22: every utility account record must carry the name actually on the
-- bill, because it often differs from the company that PAYS the bill — e.g. MSD
-- account 1337372 (6748 Crest) bills "RENOVESTERS LLC" while Bahr Family Properties
-- LLC is the payer. The adapter is the account-level record, so the bill name lives
-- here — not on bookkeeping_utility_account_crosswalk, which is a per-company
-- bank-number mapping (a door into classification), not an account record.
--
-- Upsert door change: bill_name is written when a payload provides one and is NEVER
-- cleared by a payload that lacks one — Rentals Utilities sheet imports carry no bill
-- names, so a re-import must not erase portal-loaded names.

alter table public.property_management_utility_accounts_adapter
  add column if not exists bill_name text;

comment on column public.property_management_utility_accounts_adapter.bill_name is
  'Name printed on the utility bill, verbatim (from the provider/portal). May differ from the paying company (owner_entity_text / property owner).';

-- Re-assert the table's grants (explicit-grant posture: authenticated read, service_role all, never anon).
grant select on public.property_management_utility_accounts_adapter to authenticated;
grant all on public.property_management_utility_accounts_adapter to service_role;

create or replace function public.property_management_upsert_utility_account_adapter(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org_id uuid := nullif(_payload->>'org_id','')::uuid;
  v_source_system text := btrim(coalesce(_payload->>'source_system',''));
  v_source_record_id text := btrim(coalesce(_payload->>'source_record_id',''));
  v_provider text := btrim(coalesce(_payload->>'provider',''));
  v_account text := btrim(coalesce(_payload->>'account_reference',''));
  v_id uuid;
begin
  if v_org_id is null or v_source_system='' or v_source_record_id='' or v_provider='' or v_account='' then
    raise exception 'org_id, source_system, source_record_id, provider, and account_reference are required';
  end if;

  insert into public.property_management_utility_accounts_adapter(
    org_id,source_system,source_record_id,property_id,unit_id,provider,account_reference,
    responsibility,payer_text,owner_entity_text,autopay,leave_on,ebill,bill_name,
    source_snapshot,provenance,last_seen_at
  )
  values(
    v_org_id,v_source_system,v_source_record_id,
    nullif(_payload->>'property_id','')::uuid,
    nullif(_payload->>'unit_id','')::uuid,
    v_provider,v_account,
    coalesce(nullif(_payload->>'responsibility',''),'unknown'),
    nullif(_payload->>'payer_text',''),
    nullif(_payload->>'owner_entity_text',''),
    nullif(_payload->>'autopay','')::boolean,
    nullif(_payload->>'leave_on','')::boolean,
    nullif(_payload->>'ebill','')::boolean,
    nullif(_payload->>'bill_name',''),
    coalesce(_payload->'source_snapshot','{}'::jsonb),
    coalesce(_payload->'provenance','{}'::jsonb),
    now()
  )
  on conflict (org_id,source_system,source_record_id)
  do update set
    property_id=excluded.property_id,
    unit_id=excluded.unit_id,
    provider=excluded.provider,
    account_reference=excluded.account_reference,
    responsibility=excluded.responsibility,
    payer_text=excluded.payer_text,
    owner_entity_text=excluded.owner_entity_text,
    autopay=excluded.autopay,
    leave_on=excluded.leave_on,
    ebill=excluded.ebill,
    bill_name=coalesce(excluded.bill_name, public.property_management_utility_accounts_adapter.bill_name),
    source_snapshot=excluded.source_snapshot,
    provenance=excluded.provenance,
    last_seen_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.property_management_upsert_utility_account_adapter(jsonb) to service_role;
