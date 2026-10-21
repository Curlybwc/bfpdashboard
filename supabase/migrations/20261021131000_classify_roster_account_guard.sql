-- Guard fix for the learning loop (2026-10-21): a confirmed roster
-- entry with no account must never fire — it would propose a null
-- account. Entries classify only once an account is on file.

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
      and account is not null
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
