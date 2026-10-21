-- Ezzie learning loop v1 (Jen, 2026-10-21): Ezzie learns classification
-- from (a) rules Jen teaches in the queue and (b) a per-property roster
-- of known payees (mortgage servicers, HOA/condo associations, insurers,
-- utilities) drafted from bank history and confirmed by Jen.
--
-- Discipline: amount alone never identifies; roster matches require
-- payee text + (expected amount when known). Only confirmed roster
-- entries and active rules classify. Learning applies only to rows
-- Ezzie has not solved and no human has touched (unidentified +
-- unreviewed); it never overwrites a human edit or approval.
--
-- Grants (Supabase Data API rule, 2026-10-20): stated explicitly.
-- All access runs through the SECURITY DEFINER functions below,
-- gated by shared_ingestion_is_manager like the queue functions.

CREATE TABLE IF NOT EXISTS public.bookkeeping_classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  pattern_text text NOT NULL,
  account text NOT NULL,
  class text,
  direction text NOT NULL DEFAULT 'any' CHECK (direction IN ('in', 'out', 'any')),
  source text NOT NULL DEFAULT 'taught',
  taught_from_txn_id uuid,
  taught_by text,
  active boolean NOT NULL DEFAULT true,
  times_applied integer NOT NULL DEFAULT 0,
  last_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.property_payees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  company_id uuid NOT NULL,
  property_id uuid,
  property_label text,
  payee_name text NOT NULL,
  match_text text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('mortgage', 'hoa', 'insurance', 'utility', 'other')),
  expected_amount numeric,
  account text,
  class text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'rejected')),
  source text NOT NULL DEFAULT 'mined_draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by text
);

ALTER TABLE public.bookkeeping_classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_payees ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bookkeeping_classification_rules TO authenticated;
GRANT ALL ON public.bookkeeping_classification_rules TO service_role;
GRANT SELECT ON public.property_payees TO authenticated;
GRANT ALL ON public.property_payees TO service_role;

-- Internal: apply confirmed roster entries, then active taught rules,
-- to one company's unsolved rows. Returns counts per source.
CREATE OR REPLACE FUNCTION public.bookkeeping_classify_apply(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_actor text;
  v_roster_count integer := 0;
  v_rule_count integer := 0;
  v_n integer := 0;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select c.business_organization_id into v_org_id
    from public.companies c where c.id = _company_id;
  if v_org_id is null then
    raise exception 'Company not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to classify for this company';
  end if;
  v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text);

  -- 1) Property roster (most specific): payee text match, plus the
  -- expected amount when the roster carries one.
  for r in
    select * from public.property_payees
    where company_id = _company_id and status = 'confirmed'
    order by created_at
  loop
    update public.bookkeeping_bank_transactions t
       set proposal_account = r.account,
           proposal_class = coalesce(r.class, t.proposal_class),
           proposal_state = 'proposed',
           proposal_basis = 'Property roster: ' || r.payee_name ||
             ' (' || r.kind || ') for ' || coalesce(r.property_label, 'this property') ||
             ' — confirmed by ' || coalesce(r.confirmed_by, 'owner') || '.',
           review_notes = case
             when t.review_notes is null or t.review_notes = t.proposal_basis
             then 'Property roster: ' || r.payee_name ||
               ' (' || r.kind || ') for ' || coalesce(r.property_label, 'this property') ||
               ' — confirmed by ' || coalesce(r.confirmed_by, 'owner') || '.'
             else t.review_notes end,
           updated_at = now()
     where t.company_id = _company_id
       and t.proposal_state = 'unidentified'
       and t.review_state = 'unreviewed'
       and t.raw_name ilike '%' || r.match_text || '%'
       and (r.expected_amount is null or abs(t.signed_amount) = r.expected_amount)
       and (r.class is null or t.proposal_class is null or t.proposal_class = r.class);
    get diagnostics v_n = row_count;
    v_roster_count := v_roster_count + v_n;
  end loop;

  -- 2) Taught rules.
  for r in
    select * from public.bookkeeping_classification_rules
    where company_id = _company_id and active
    order by created_at
  loop
    update public.bookkeeping_bank_transactions t
       set proposal_account = r.account,
           proposal_class = coalesce(r.class, t.proposal_class),
           proposal_state = 'proposed',
           proposal_basis = 'Learned rule (taught by ' || coalesce(r.taught_by, 'owner') ||
             '): "' || r.pattern_text || '" -> ' || r.account ||
             coalesce(' / ' || r.class, '') || '.',
           review_notes = case
             when t.review_notes is null or t.review_notes = t.proposal_basis
             then 'Learned rule (taught by ' || coalesce(r.taught_by, 'owner') ||
               '): "' || r.pattern_text || '" -> ' || r.account ||
               coalesce(' / ' || r.class, '') || '.'
             else t.review_notes end,
           updated_at = now()
     where t.company_id = _company_id
       and t.proposal_state = 'unidentified'
       and t.review_state = 'unreviewed'
       and t.raw_name ilike '%' || r.pattern_text || '%'
       and (r.direction = 'any'
            or (r.direction = 'out' and t.signed_amount < 0)
            or (r.direction = 'in' and t.signed_amount >= 0));
    if found then
      update public.bookkeeping_classification_rules
         set times_applied = times_applied + 1, last_applied_at = now()
       where id = r.id;
      v_rule_count := v_rule_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'roster_applied_rows', v_roster_count,
    'rules_that_fired', v_rule_count,
    'actor', v_actor
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_classify_apply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_classify_apply(uuid) TO authenticated, service_role;

-- Teach: create a rule from a classified transaction, then apply
-- learning so matching unsolved rows resolve immediately.
CREATE OR REPLACE FUNCTION public.bookkeeping_rule_teach(_txn_id uuid, _pattern text, _account text, _class text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_company_id uuid;
  v_signed numeric;
  v_rule_id uuid;
  v_apply jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if _pattern is null or length(btrim(_pattern)) < 4 then
    raise exception 'Pattern must be at least 4 characters';
  end if;
  if _account is null or btrim(_account) = '' then
    raise exception 'An account is required to teach a rule';
  end if;
  select org_id, company_id, signed_amount into v_org_id, v_company_id, v_signed
    from public.bookkeeping_bank_transactions where id = _txn_id;
  if v_org_id is null then
    raise exception 'Transaction not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to teach rules for this company';
  end if;

  insert into public.bookkeeping_classification_rules
    (org_id, company_id, pattern_text, account, class, direction, source, taught_from_txn_id, taught_by)
  values
    (v_org_id, v_company_id, upper(btrim(_pattern)), btrim(_account),
     nullif(btrim(coalesce(_class, '')), ''),
     case when v_signed is null then 'any' when v_signed < 0 then 'out' else 'in' end,
     'taught', _txn_id, coalesce(auth.jwt() ->> 'email', auth.uid()::text))
  returning id into v_rule_id;

  v_apply := public.bookkeeping_classify_apply(v_company_id);
  return jsonb_build_object('rule_id', v_rule_id, 'apply', v_apply);
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_rule_teach(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_rule_teach(uuid, text, text, text) TO authenticated, service_role;

-- Rule management.
CREATE OR REPLACE FUNCTION public.bookkeeping_rules_list(_company_id uuid)
 RETURNS TABLE(id uuid, pattern_text text, account text, class text, direction text, source text, taught_by text, active boolean, times_applied integer, last_applied_at timestamptz, created_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select c.business_organization_id into v_org_id
    from public.companies c where c.id = _company_id;
  if v_org_id is null then
    raise exception 'Company not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to view rules for this company';
  end if;
  return query
    select r.id, r.pattern_text, r.account, r.class, r.direction, r.source,
           r.taught_by, r.active, r.times_applied, r.last_applied_at, r.created_at
    from public.bookkeeping_classification_rules r
    where r.company_id = _company_id
    order by r.active desc, r.created_at desc;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_rules_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_rules_list(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bookkeeping_rule_set_active(_rule_id uuid, _active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select org_id into v_org_id from public.bookkeeping_classification_rules where id = _rule_id;
  if v_org_id is null then
    raise exception 'Rule not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to manage rules for this company';
  end if;
  update public.bookkeeping_classification_rules set active = _active where id = _rule_id;
  return _rule_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_rule_set_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_rule_set_active(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bookkeeping_rule_delete(_rule_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select org_id into v_org_id from public.bookkeeping_classification_rules where id = _rule_id;
  if v_org_id is null then
    raise exception 'Rule not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to manage rules for this company';
  end if;
  delete from public.bookkeeping_classification_rules where id = _rule_id;
  return _rule_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_rule_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_rule_delete(uuid) TO authenticated, service_role;

-- Roster management.
CREATE OR REPLACE FUNCTION public.property_payees_list(_company_id uuid)
 RETURNS TABLE(id uuid, property_id uuid, property_label text, payee_name text, match_text text, kind text, expected_amount numeric, account text, class text, status text, source text, created_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select c.business_organization_id into v_org_id
    from public.companies c where c.id = _company_id;
  if v_org_id is null then
    raise exception 'Company not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to view the roster for this company';
  end if;
  return query
    select p.id, p.property_id, p.property_label, p.payee_name, p.match_text, p.kind,
           p.expected_amount, p.account, p.class, p.status, p.source, p.created_at
    from public.property_payees p
    where p.company_id = _company_id
    order by p.status, p.payee_name;
end $function$;

REVOKE EXECUTE ON FUNCTION public.property_payees_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_payees_list(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.property_payee_set_status(_payee_id uuid, _status text, _property_label text DEFAULT NULL, _account text DEFAULT NULL, _class text DEFAULT NULL, _expected_amount numeric DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if _status not in ('draft', 'confirmed', 'rejected') then
    raise exception 'Invalid status';
  end if;
  select org_id into v_org_id from public.property_payees where id = _payee_id;
  if v_org_id is null then
    raise exception 'Roster entry not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to manage the roster for this company';
  end if;
  update public.property_payees
     set status = _status,
         property_label = coalesce(_property_label, property_label),
         account = coalesce(_account, account),
         class = coalesce(_class, class),
         expected_amount = coalesce(_expected_amount, expected_amount),
         confirmed_at = case when _status = 'confirmed' then now() else confirmed_at end,
         confirmed_by = case when _status = 'confirmed'
                             then coalesce(auth.jwt() ->> 'email', auth.uid()::text)
                             else confirmed_by end
   where id = _payee_id;
  return _payee_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.property_payee_set_status(uuid, text, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_payee_set_status(uuid, text, text, text, text, numeric) TO authenticated, service_role;
