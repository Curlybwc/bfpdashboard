-- Packet 3 / Batch A — Wire existing references into determination
-- (canon 05.02 §25.2 pipeline, §25.3 classification hard rule, §25.10
-- FR-05.02-24 learning loop, §25.11 FR-05.02-25 determination;
-- PRD FR-05.02-18 classification identity).
--
-- A1: bookkeeping_utility_account_crosswalk — an explicit, owner-
-- confirmed mapping between the bank-series MSD account number and
-- the property register's adapter record. The two number series do
-- NOT join (bank 5490632 / 5490903 vs adapter 1464778-8), and nothing
-- here pairs them algorithmically: drafts exist only where a stated
-- basis exists, and the classify utilities step fires ONLY on
-- confirmed rows. Amount is never identity (§25.3 / FR-05.02-18).
--
-- A2: property_payees.property_link_basis records WHY a roster row
-- links to the property register (properties.id); the roster list RPC
-- surfaces the link state. Linkage itself is resolved by derivation
-- on exact unambiguous match only — never guessed.
--
-- A3: bookkeeping_bank_txn_evidence — bank transaction <-> email
-- evidence links, written by bookkeeping_email_evidence_match, which
-- requires ALL THREE of amount + ±5-day window + vendor-text overlap.
-- Evidence is a supporting record attached to the transaction (a
-- verb: "evidence was matched, by this basis"), never a field on the
-- transaction and never an identity by itself: in classify it can
-- only cite itself in the basis and lift unidentified -> needs_review.
-- NOTE on the evidence source: the spec named the v0.1 processor
-- table bookkeeping_financial_events, but that table is empty — the
-- email evidence Ezzie actually holds lives in
-- bookkeeping_email_transactions (written by Morning Meeting; 174
-- rows in staging). The link therefore references
-- bookkeeping_email_transactions, the live evidence store.
--
-- Stage discipline: Stage 1 only — nothing here writes to QuickBooks.
-- Grants (Supabase Data API rule, 2026-10-20): stated explicitly;
-- authenticated + service_role, never anon. All reads/writes flow
-- through the SECURITY DEFINER door functions below, manager-gated by
-- shared_ingestion_is_manager like the rest of the queue.

-- ---------------------------------------------------------------- A1
CREATE TABLE IF NOT EXISTS public.bookkeeping_utility_account_crosswalk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_account_number text NOT NULL,
  adapter_id uuid REFERENCES public.property_management_utility_accounts_adapter(id) ON DELETE RESTRICT,
  property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'rejected')),
  basis text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, bank_account_number)
);

CREATE INDEX IF NOT EXISTS bookkeeping_utility_crosswalk_company_status_idx
  ON public.bookkeeping_utility_account_crosswalk (company_id, status);

ALTER TABLE public.bookkeeping_utility_account_crosswalk ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bookkeeping_utility_account_crosswalk TO authenticated;
GRANT ALL ON public.bookkeeping_utility_account_crosswalk TO service_role;

-- Crosswalk management (roster confirm/reject pattern, manager-gated).
CREATE OR REPLACE FUNCTION public.bookkeeping_utility_crosswalk_list(_company_id uuid)
 RETURNS TABLE(id uuid, bank_account_number text, adapter_id uuid, adapter_account_reference text, adapter_provider text, property_id uuid, property_label text, status text, basis text, confirmed_by text, confirmed_at timestamptz, created_at timestamptz)
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
    raise exception 'Not authorized to view the utility crosswalk for this company';
  end if;
  return query
    select x.id, x.bank_account_number, x.adapter_id,
           a.account_reference, a.provider,
           x.property_id, p.display_name,
           x.status, x.basis, x.confirmed_by, x.confirmed_at, x.created_at
    from public.bookkeeping_utility_account_crosswalk x
    left join public.property_management_utility_accounts_adapter a on a.id = x.adapter_id
    left join public.properties p on p.id = x.property_id
    where x.company_id = _company_id
    order by x.status, x.bank_account_number;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_list(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bookkeeping_utility_crosswalk_set_status(_crosswalk_id uuid, _status text, _adapter_id uuid DEFAULT NULL, _property_id uuid DEFAULT NULL)
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
  select org_id into v_org_id from public.bookkeeping_utility_account_crosswalk where id = _crosswalk_id;
  if v_org_id is null then
    raise exception 'Crosswalk entry not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to manage the utility crosswalk for this company';
  end if;
  if _status = 'confirmed' then
    -- A confirmed mapping must name the property it identifies; the
    -- account number alone (never the amount) is the identity.
    if coalesce(_property_id, (select property_id from public.bookkeeping_utility_account_crosswalk where id = _crosswalk_id)) is null
       and coalesce(_adapter_id, (select adapter_id from public.bookkeeping_utility_account_crosswalk where id = _crosswalk_id)) is null then
      raise exception 'Cannot confirm: the mapping names no adapter record or property';
    end if;
  end if;
  update public.bookkeeping_utility_account_crosswalk
     set status = _status,
         adapter_id = coalesce(_adapter_id, adapter_id),
         property_id = coalesce(_property_id, property_id),
         confirmed_at = case when _status = 'confirmed' then now() else confirmed_at end,
         confirmed_by = case when _status = 'confirmed'
                             then coalesce(auth.jwt() ->> 'email', auth.uid()::text)
                             else confirmed_by end,
         updated_at = now()
   where id = _crosswalk_id;
  return _crosswalk_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_set_status(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_utility_crosswalk_set_status(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- A2
ALTER TABLE public.property_payees
  ADD COLUMN IF NOT EXISTS property_link_basis text;

COMMENT ON COLUMN public.property_payees.property_link_basis IS
  'Why this roster row links to the property register (e.g. the exact label/address match derivation resolved). NULL with property_id NULL means not linked — resolution never guesses.';

-- Roster list: same function, plus the register link state (linked
-- property name + link basis). Return type changes, so drop first.
DROP FUNCTION IF EXISTS public.property_payees_list(uuid);
CREATE OR REPLACE FUNCTION public.property_payees_list(_company_id uuid)
 RETURNS TABLE(id uuid, property_id uuid, property_label text, payee_name text, match_text text, kind text, expected_amount numeric, account text, class text, status text, source text, created_at timestamptz, property_name text, property_link_basis text)
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
           p.expected_amount, p.account, p.class, p.status, p.source, p.created_at,
           pr.display_name, p.property_link_basis
    from public.property_payees p
    left join public.properties pr on pr.id = p.property_id
    where p.company_id = _company_id
    order by p.status, p.payee_name;
end $function$;

REVOKE EXECUTE ON FUNCTION public.property_payees_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_payees_list(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- A3
CREATE TABLE IF NOT EXISTS public.bookkeeping_bank_txn_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  bank_transaction_id uuid NOT NULL REFERENCES public.bookkeeping_bank_transactions(id) ON DELETE RESTRICT,
  email_transaction_id uuid NOT NULL REFERENCES public.bookkeeping_email_transactions(id) ON DELETE RESTRICT,
  match_basis text NOT NULL,
  match_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_transaction_id, email_transaction_id)
);

CREATE INDEX IF NOT EXISTS bookkeeping_bank_txn_evidence_txn_idx
  ON public.bookkeeping_bank_txn_evidence (bank_transaction_id);
CREATE INDEX IF NOT EXISTS bookkeeping_bank_txn_evidence_email_idx
  ON public.bookkeeping_bank_txn_evidence (email_transaction_id);

ALTER TABLE public.bookkeeping_bank_txn_evidence ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bookkeeping_bank_txn_evidence TO authenticated;
GRANT ALL ON public.bookkeeping_bank_txn_evidence TO service_role;

-- Normalized vendor/payee tokens for evidence matching: uppercase,
-- split on non-alphanumerics, drop short tokens and the generic bank /
-- corporate stopwords that appear in nearly every bank string (they
-- carry no identity). Identity-bearing tokens survive (MSD, EH,
-- BUSINESS, SHELTON, ...).
CREATE OR REPLACE FUNCTION public.bookkeeping_text_tokens(_text text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(tok), '{}'::text[])
  from (
    select distinct upper(tok) as tok
    from regexp_split_to_table(
           regexp_replace(coalesce(_text, ''), '[^A-Za-z0-9]+', ' ', 'g'), '\s+') as tok
    where length(tok) >= 2
      and upper(tok) not in ('THE','AND','FOR','INC','LLC','COMPANY','CO','BANK','TRUST',
                             'WEB','PPD','CCD','ACH','PMT','PAID','BILL','CONF','FROM',
                             'PAY','ENTRY','DEBIT','CREDIT','PURCHASE','CHECKING')
  ) s;
$function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_text_tokens(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_text_tokens(text) TO authenticated, service_role;

-- Matcher: candidate = same company (or company-unscoped email),
-- amount equal to the bank row's absolute amount, email transaction
-- date within ±5 days, AND vendor/payee text overlap with the bank
-- text. ALL THREE are required — amount + date alone never matches
-- (§25.3 / FR-05.02-18). Idempotent on the unique key; re-runnable.
CREATE OR REPLACE FUNCTION public.bookkeeping_email_evidence_match(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_created integer := 0;
  v_rows integer := 0;
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
    raise exception 'Not authorized to match email evidence for this company';
  end if;

  with candidates as (
    select t.id as txn_id, t.org_id as org_id, e.id as email_id,
           abs(t.signed_amount) as amount,
           e.transaction_date as email_date,
           t.txn_date as bank_date,
           (select array_agg(x order by x)
              from unnest(public.bookkeeping_text_tokens(coalesce(e.vendor_customer, e.email_from))) x
             where x = any(public.bookkeeping_text_tokens(t.raw_name))) as shared
      from public.bookkeeping_bank_transactions t
      join public.bookkeeping_email_transactions e
        on e.amount is not null
       and e.transaction_date is not null
       and (e.company_id is null or e.company_id = _company_id)
       and abs(e.amount) = abs(t.signed_amount)
       and e.transaction_date between t.txn_date - 5 and t.txn_date + 5
     where t.company_id = _company_id
  ),
  matched as (
    select * from candidates where shared is not null and array_length(shared, 1) >= 1
  ),
  inserted as (
    insert into public.bookkeeping_bank_txn_evidence
      (org_id, bank_transaction_id, email_transaction_id, match_basis, match_score)
    select org_id, txn_id, email_id,
           'Amount $' || to_char(amount, 'FM999999990.00') ||
           ' + email dated ' || email_date::text ||
           ' (within 5 days of the ' || bank_date::text || ' bank item)' ||
           ' + vendor text "' || array_to_string(shared, '", "') ||
           '" matches the bank text.',
           array_length(shared, 1)
      from matched
    on conflict (bank_transaction_id, email_transaction_id) do nothing
    returning bank_transaction_id
  )
  select count(*) into v_created from inserted;

  select count(distinct bank_transaction_id) into v_rows
    from public.bookkeeping_bank_txn_evidence ev
    join public.bookkeeping_bank_transactions t on t.id = ev.bank_transaction_id
   where t.company_id = _company_id;

  return jsonb_build_object(
    'links_created', v_created,
    'rows_with_evidence', v_rows,
    'actor', coalesce(auth.jwt() ->> 'email', auth.uid()::text)
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_email_evidence_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_email_evidence_match(uuid) TO authenticated, service_role;

-- Evidence detail for the queue's on-row surface (both apps).
CREATE OR REPLACE FUNCTION public.bookkeeping_bank_txn_evidence_list(_company_id uuid)
 RETURNS TABLE(bank_transaction_id uuid, email_transaction_id uuid, vendor text, subject text, email_date date, amount numeric, match_basis text, match_score numeric)
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
    raise exception 'Not authorized to view email evidence for this company';
  end if;
  return query
    select ev.bank_transaction_id, ev.email_transaction_id,
           coalesce(e.vendor_customer, e.email_from), e.email_subject,
           e.transaction_date, e.amount, ev.match_basis, ev.match_score
    from public.bookkeeping_bank_txn_evidence ev
    join public.bookkeeping_bank_transactions t on t.id = ev.bank_transaction_id
    join public.bookkeeping_email_transactions e on e.id = ev.email_transaction_id
    where t.company_id = _company_id
    order by e.transaction_date, e.email_subject;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_txn_evidence_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_txn_evidence_list(uuid) TO authenticated, service_role;

-- Queue list: same function, plus each row's evidence count for the
-- on-row badge. Return type changes, so drop first.
DROP FUNCTION IF EXISTS public.bookkeeping_bank_queue_list(uuid);
CREATE OR REPLACE FUNCTION public.bookkeeping_bank_queue_list(_company_id uuid)
 RETURNS TABLE(id uuid, txn_date date, raw_name text, signed_amount numeric, amount_out numeric, proposal_account text, proposal_class text, proposal_basis text, proposal_state text, review_state text, account_display text, source text, review_notes text, evidence_count integer)
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
    raise exception 'Not authorized to view this company''s bank queue';
  end if;
  return query
    select t.id, t.txn_date, t.raw_name, t.signed_amount, t.amount_out,
           t.proposal_account, t.proposal_class, t.proposal_basis,
           t.proposal_state, t.review_state, fa.display_name, t.source,
           t.review_notes,
           (select count(*)::integer from public.bookkeeping_bank_txn_evidence ev
             where ev.bank_transaction_id = t.id)
    from public.bookkeeping_bank_transactions t
    join public.financial_accounts fa on fa.id = t.financial_account_id
    where t.company_id = _company_id
    order by t.txn_date, t.raw_name;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) TO authenticated, service_role;

-- ------------------------------------------------------- classify v2
-- bookkeeping_classify_apply gains two steps, in determination order:
--   1) property roster (unchanged, account guard kept)
--   2) utilities crosswalk (NEW, A1): MSD rows identified by the
--      account number in the bank text; fires ONLY on a CONFIRMED
--      crosswalk row; a row previously classified by a crosswalk that
--      is no longer confirmed reverts to the loader hold (Utilities +
--      needs_review). Amount plays no part in the match.
--   3) taught rules (unchanged)
--   4) email evidence (NEW, A3): rows with a matched evidence link
--      gain the citation in their basis; evidence alone lifts
--      unidentified -> needs_review and NEVER proposes an account or
--      class.
-- Steps touch only unreviewed rows Ezzie has not had solved by a
-- human; learning never overwrites a human edit or approval.
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
  v_utility_applied integer := 0;
  v_utility_reverted integer := 0;
  v_evidence_cited integer := 0;
  v_evidence_lifted integer := 0;
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
  -- expected amount when the roster carries one. A confirmed entry
  -- with no account never fires (20261021131000 guard).
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

  -- 2) Utilities crosswalk: identify by the MSD account number in the
  -- bank text, never by amount (§25.3). Confirmed mapping -> propose
  -- Utilities + the mapped property's class. Mapping withdrawn (back
  -- to draft / rejected / gone) -> the row returns to the loader hold.
  for r in
    select t.id as txn_id,
           substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)') as acct_number,
           t.proposal_state as old_state,
           t.proposal_basis as old_basis,
           x.id as crosswalk_id,
           x.status as crosswalk_status,
           x.confirmed_by as crosswalk_confirmed_by,
           coalesce(p.display_name, pa.display_name) as property_label
      from public.bookkeeping_bank_transactions t
      left join public.bookkeeping_utility_account_crosswalk x
        on x.company_id = t.company_id
       and x.bank_account_number = substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)')
      left join public.properties p on p.id = x.property_id
      left join public.property_management_utility_accounts_adapter xa on xa.id = x.adapter_id
      left join public.properties pa on pa.id = xa.property_id
     where t.company_id = _company_id
       and t.review_state = 'unreviewed'
       and substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)') is not null
  loop
    if r.crosswalk_status = 'confirmed' and r.property_label is not null then
      if r.old_state <> 'proposed' or r.old_basis is null
         or r.old_basis not like 'Utility account map:%' then
        update public.bookkeeping_bank_transactions t
           set proposal_account = 'Utilities',
               proposal_class = r.property_label,
               proposal_state = 'proposed',
               proposal_basis = 'Utility account map: MSD acct ' || r.acct_number ||
                 ' → ' || r.property_label || ' (adapter, confirmed by ' ||
                 coalesce(r.crosswalk_confirmed_by, 'owner') || ').',
               review_notes = case
                 when t.review_notes is null or t.review_notes = t.proposal_basis
                 then 'Utility account map: MSD acct ' || r.acct_number ||
                   ' → ' || r.property_label || ' (adapter, confirmed by ' ||
                   coalesce(r.crosswalk_confirmed_by, 'owner') || ').'
                 else t.review_notes end,
               updated_at = now()
         where t.id = r.txn_id;
        if found then v_utility_applied := v_utility_applied + 1; end if;
      end if;
    elsif r.old_basis like 'Utility account map:%' then
      -- The mapping that classified this row is no longer confirmed:
      -- return to the loader hold. No state in between exists.
      update public.bookkeeping_bank_transactions t
         set proposal_account = 'Utilities',
             proposal_class = null,
             proposal_state = 'needs_review',
             proposal_basis = 'MSD sewer charge. Account number from bank text: ' ||
               r.acct_number || '. Identify by account number, never by amount; ' ||
               'property held until the account-to-property map is owner-confirmed.',
             review_notes = case
               when t.review_notes is null or t.review_notes = t.proposal_basis
               then 'MSD sewer charge. Account number from bank text: ' ||
                 r.acct_number || '. Identify by account number, never by amount; ' ||
                 'property held until the account-to-property map is owner-confirmed.'
               else t.review_notes end,
             updated_at = now()
       where t.id = r.txn_id;
      if found then v_utility_reverted := v_utility_reverted + 1; end if;
    end if;
  end loop;

  -- 3) Taught rules.
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

  -- 4) Email evidence: cite matched evidence in the basis; evidence
  -- alone lifts unidentified -> needs_review (a human look) and never
  -- proposes an account or class. Idempotent: rows already carrying
  -- the citation are untouched.
  for r in
    select t.id as txn_id, t.proposal_state as old_state, t.proposal_basis as old_basis,
           (select 'Email evidence: ' || coalesce(e.vendor_customer, e.email_from) ||
                   ' — "' || coalesce(e.email_subject, '(no subject)') || '", ' ||
                   e.transaction_date::text || ' ($' ||
                   to_char(abs(e.amount), 'FM999999990.00') || ').'
              from public.bookkeeping_bank_txn_evidence ev
              join public.bookkeeping_email_transactions e on e.id = ev.email_transaction_id
             where ev.bank_transaction_id = t.id
             order by e.transaction_date, e.created_at
             limit 1) as citation
      from public.bookkeeping_bank_transactions t
     where t.company_id = _company_id
       and t.review_state = 'unreviewed'
       and exists (select 1 from public.bookkeeping_bank_txn_evidence ev
                    where ev.bank_transaction_id = t.id)
       and (t.proposal_basis is null or t.proposal_basis not like '%Email evidence:%')
  loop
    update public.bookkeeping_bank_transactions t
       set proposal_basis = case when r.old_basis is null or r.old_basis = ''
                                 then r.citation
                                 else r.old_basis || ' ' || r.citation end,
           review_notes = case
             when t.review_notes is null or t.review_notes = t.proposal_basis
             then case when r.old_basis is null or r.old_basis = ''
                       then r.citation
                       else r.old_basis || ' ' || r.citation end
             else t.review_notes end,
           proposal_state = case when r.old_state = 'unidentified'
                                 then 'needs_review' else t.proposal_state end,
           updated_at = now()
     where t.id = r.txn_id;
    if found then
      v_evidence_cited := v_evidence_cited + 1;
      if r.old_state = 'unidentified' then
        v_evidence_lifted := v_evidence_lifted + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'roster_applied_rows', v_roster_count,
    'utility_applied_rows', v_utility_applied,
    'utility_reverted_rows', v_utility_reverted,
    'rules_that_fired', v_rule_count,
    'evidence_cited_rows', v_evidence_cited,
    'evidence_lifted_rows', v_evidence_lifted,
    'actor', v_actor
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_classify_apply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_classify_apply(uuid) TO authenticated, service_role;
