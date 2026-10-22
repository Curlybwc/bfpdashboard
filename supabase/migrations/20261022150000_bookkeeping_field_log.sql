-- Packet 4 / Batch B — Field log: capture entries matched at ingest;
-- open loops visible (canon 05.02 §25.1 pipeline, §25.9 FR-05.02-23
-- Notes discipline, §25.10/§25.11 learning loop + derivation events;
-- PRD §22 FR-05.02-17 Stage 1 mirror; FR-05.02-20/21 push/read-back
-- events are future Stage 2 emitters — the kind list must not
-- preclude them, but this batch builds NO Stage 2 emitter).
--
-- Transactions and properties are NOUNS — durable records that
-- already exist. A log entry is a VERB: something that happened to a
-- transaction (it was ingested, matched by a roster entry, proposed,
-- reviewed, synced). Verbs live here as events attached to the noun,
-- never as status fields baked onto bookkeeping_bank_transactions.
--
-- Append-only, structurally: the table grants SELECT only. INSERT
-- flows exclusively through the SECURITY DEFINER door
-- bookkeeping_field_log_emit; UPDATE and DELETE are revoked from
-- authenticated and service_role alike, and no RLS policy offers
-- them. No emitter may write a line for an action that did not
-- happen, and an emit failure never takes the underlying action down
-- with it — the door returns false and raises a warning instead, so
-- the gap is a missing entry the coverage checks can catch.
--
-- Stage discipline: Stage 1 only — nothing here writes to QuickBooks.
-- Grants (Supabase Data API rule, 2026-10-20): stated
-- explicitly; authenticated + service_role, never anon.

-- ---------------------------------------------------------------- B1
CREATE TABLE IF NOT EXISTS public.bookkeeping_field_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Total insertion order. created_at alone cannot order entries
  -- written inside one transaction (now() is transaction-stable);
  -- emitters stamp clock_timestamp(), and seq breaks every tie.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  org_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bank_transaction_id uuid REFERENCES public.bookkeeping_bank_transactions(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.bookkeeping_bank_import_batches(id) ON DELETE RESTRICT,
  property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK (event_kind IN (
    'ingested', 'matched', 'proposed', 'evidence_attached',
    'derivation_finding', 'reviewed', 'approved',
    'synced_to_register', 'loop_opened', 'loop_resolved'
  )),
  source text NOT NULL CHECK (source IN (
    'loader', 'classify_roster', 'classify_rule', 'classify_utility_map',
    'email_matcher', 'derivation', 'register_sync', 'human'
  )),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookkeeping_field_log_txn_seq_idx
  ON public.bookkeeping_field_log_entries (bank_transaction_id, seq);
CREATE INDEX IF NOT EXISTS bookkeeping_field_log_company_kind_idx
  ON public.bookkeeping_field_log_entries (company_id, event_kind, seq);
CREATE INDEX IF NOT EXISTS bookkeeping_field_log_loop_idx
  ON public.bookkeeping_field_log_entries (bank_transaction_id, event_kind, seq)
  WHERE event_kind IN ('loop_opened', 'loop_resolved');

ALTER TABLE public.bookkeeping_field_log_entries ENABLE ROW LEVEL SECURITY;

-- Direct reads are org-scoped to managers of the row's org (the same
-- gate every queue door uses). No INSERT/UPDATE/DELETE policy exists:
-- writes flow through the emit door only.
CREATE POLICY bookkeeping_field_log_select_manager
  ON public.bookkeeping_field_log_entries
  FOR SELECT TO authenticated
  USING (public.shared_ingestion_is_manager(auth.uid(), org_id));

GRANT SELECT ON public.bookkeeping_field_log_entries TO authenticated;
GRANT SELECT ON public.bookkeeping_field_log_entries TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.bookkeeping_field_log_entries FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.bookkeeping_field_log_entries IS
  'Append-only field log (Batch B): events that happened to a bank transaction / batch / property. Inserts only via bookkeeping_field_log_emit; UPDATE/DELETE revoked from every app role.';

-- Open loops: a transaction whose latest loop event is loop_opened
-- (a later loop event — a resolution, or a newer opening — supersedes
-- it). Owner-rights view: granted to service_role only; app reads
-- flow through the SECURITY DEFINER doors below so org scope holds.
CREATE OR REPLACE VIEW public.bookkeeping_field_log_open_loops AS
SELECT e.bank_transaction_id, e.org_id, e.company_id,
       e.created_at AS opened_at, e.id AS opened_entry_id
FROM public.bookkeeping_field_log_entries e
WHERE e.event_kind = 'loop_opened'
  AND e.bank_transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bookkeeping_field_log_entries r
    WHERE r.bank_transaction_id = e.bank_transaction_id
      AND r.event_kind IN ('loop_opened', 'loop_resolved')
      AND r.seq > e.seq
  );

GRANT SELECT ON public.bookkeeping_field_log_open_loops TO service_role;

-- ------------------------------------------------------- emit door
-- The one way a log line comes to exist. Guard: the service role
-- (edge-function emitters), a caller who manages the org, or a
-- direct database session carrying no JWT claims at all (the Maven
-- bridge loader's SQL context — a session with direct DB access
-- already holds the database; forged claims in one buy nothing).
-- Everyone else is refused — and because emitters call this door for
-- actions that must stand on their own merits, a refusal (or any
-- other failure) is caught here: the door raises a warning and
-- returns false instead of aborting the caller's transaction. A
-- missing entry is therefore always a DETECTABLE gap, never a
-- silent pretence of coverage.
CREATE OR REPLACE FUNCTION public.bookkeeping_field_log_emit(
  _org_id uuid, _company_id uuid, _bank_transaction_id uuid,
  _batch_id uuid, _property_id uuid, _event_kind text, _source text,
  _detail jsonb, _actor text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or (auth.uid() is not null
        and public.shared_ingestion_is_manager(auth.uid(), _org_id))
    or (session_user = 'postgres' and auth.uid() is null)
  ) then
    raise exception 'Not authorized to append to the field log';
  end if;
  insert into public.bookkeeping_field_log_entries
    (org_id, company_id, bank_transaction_id, batch_id, property_id,
     event_kind, source, detail, actor, created_at)
  values
    (_org_id, _company_id, _bank_transaction_id, _batch_id, _property_id,
     _event_kind, _source, coalesce(_detail, '{}'::jsonb), _actor,
     clock_timestamp());
  return true;
exception when others then
  raise warning 'bookkeeping_field_log_emit failed (% / %): %',
    _event_kind, _source, sqlerrm;
  return false;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_field_log_emit(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_field_log_emit(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, text) TO authenticated, service_role;

-- Loader door: after a batch load, every row the batch actually
-- inserted gets its 'ingested' entry (a re-run inserts nothing and
-- logs nothing — rows that already carry an ingested entry are
-- skipped). Rows the loader's own W3 patterns determined arrive with
-- their match on the record too: 'matched' + 'proposed' naming the
-- loader as the source that proposed them, or 'matched' with a
-- held-for-review result for the loader's holds (MSD / Lindell LOC /
-- statement splits). The classify pass that follows at ingest adds
-- its own entries for anything it changes.
CREATE OR REPLACE FUNCTION public.bookkeeping_field_log_emit_ingested(_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch record;
  v_txn record;
  v_ingested integer := 0;
  v_matched integer := 0;
  v_proposed integer := 0;
begin
  select * into v_batch
    from public.bookkeeping_bank_import_batches where id = _batch_id;
  if not found then
    raise exception 'Import batch not found';
  end if;
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or (auth.uid() is not null
        and public.shared_ingestion_is_manager(auth.uid(), v_batch.org_id))
    or (session_user = 'postgres' and auth.uid() is null)
  ) then
    raise exception 'Not authorized to log ingestion for this batch';
  end if;

  for v_txn in
    select * from public.bookkeeping_bank_transactions
    where batch_id = _batch_id
    order by txn_date, raw_name
  loop
    if exists (
      select 1 from public.bookkeeping_field_log_entries
      where bank_transaction_id = v_txn.id and event_kind = 'ingested'
    ) then
      continue;
    end if;
    if public.bookkeeping_field_log_emit(
         v_txn.org_id, v_txn.company_id, v_txn.id, _batch_id, null,
         'ingested', 'loader',
         jsonb_build_object(
           'basis', 'Ingested from the bank feed (' || v_txn.source || ').',
           'source_transaction_id', v_txn.source_transaction_id,
           'batch_id', _batch_id),
         'system:loader') then
      v_ingested := v_ingested + 1;
    end if;
    if v_txn.proposal_state = 'proposed' then
      if public.bookkeeping_field_log_emit(
           v_txn.org_id, v_txn.company_id, v_txn.id, _batch_id, null,
           'matched', 'loader',
           jsonb_build_object(
             'basis', v_txn.proposal_basis,
             'account', v_txn.proposal_account,
             'class', v_txn.proposal_class,
             'result', 'loader_pattern'),
           'system:loader') then
        v_matched := v_matched + 1;
      end if;
      if public.bookkeeping_field_log_emit(
           v_txn.org_id, v_txn.company_id, v_txn.id, _batch_id, null,
           'proposed', 'loader',
           jsonb_build_object(
             'basis', v_txn.proposal_basis,
             'account', v_txn.proposal_account,
             'class', v_txn.proposal_class),
           'system:loader') then
        v_proposed := v_proposed + 1;
      end if;
    elsif v_txn.proposal_state = 'needs_review' and v_txn.proposal_basis is not null then
      if public.bookkeeping_field_log_emit(
           v_txn.org_id, v_txn.company_id, v_txn.id, _batch_id, null,
           'matched', 'loader',
           jsonb_build_object(
             'basis', v_txn.proposal_basis,
             'account', v_txn.proposal_account,
             'class', v_txn.proposal_class,
             'result', 'held_needs_review'),
           'system:loader') then
        v_matched := v_matched + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ingested_entries', v_ingested,
    'matched_entries', v_matched,
    'proposed_entries', v_proposed,
    'actor', 'system:loader'
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_field_log_emit_ingested(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_field_log_emit_ingested(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------ reads
-- Per-row history for the queue's expandable row (both apps), in
-- insertion order: kind, source, the basis snapshot, actor, time.
CREATE OR REPLACE FUNCTION public.bookkeeping_field_log_list(_bank_transaction_id uuid)
 RETURNS TABLE(id uuid, seq bigint, event_kind text, source text, detail jsonb, actor text, created_at timestamptz)
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
  select t.org_id into v_org_id
    from public.bookkeeping_bank_transactions t where t.id = _bank_transaction_id;
  if v_org_id is null then
    raise exception 'Transaction not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to view the field log for this transaction';
  end if;
  return query
    select e.id, e.seq, e.event_kind, e.source, e.detail, e.actor, e.created_at
    from public.bookkeeping_field_log_entries e
    where e.bank_transaction_id = _bank_transaction_id
    order by e.seq;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_field_log_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_field_log_list(uuid) TO authenticated, service_role;

-- The one open-loops number: the queue header and Admin →
-- Classification Learning both read it from here; the queue owns
-- the list (the open-loops view), this is only its count.
CREATE OR REPLACE FUNCTION public.bookkeeping_field_log_open_loop_count(_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_count integer;
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
    raise exception 'Not authorized to view open loops for this company';
  end if;
  select count(*)::integer into v_count
    from public.bookkeeping_field_log_open_loops
   where company_id = _company_id;
  return v_count;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_field_log_open_loop_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_field_log_open_loop_count(uuid) TO authenticated, service_role;

-- Queue list: same function, plus each row's open-loop flag (the
-- header count and the All / Open loops chip both derive from it —
-- one list, one truth). Return type changes, so drop first.
DROP FUNCTION IF EXISTS public.bookkeeping_bank_queue_list(uuid);
CREATE OR REPLACE FUNCTION public.bookkeeping_bank_queue_list(_company_id uuid)
 RETURNS TABLE(id uuid, txn_date date, raw_name text, signed_amount numeric, amount_out numeric, proposal_account text, proposal_class text, proposal_basis text, proposal_state text, review_state text, account_display text, source text, review_notes text, evidence_count integer, is_open_loop boolean)
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
             where ev.bank_transaction_id = t.id),
           exists (select 1 from public.bookkeeping_field_log_open_loops ol
             where ol.bank_transaction_id = t.id)
    from public.bookkeeping_bank_transactions t
    join public.financial_accounts fa on fa.id = t.financial_account_id
    where t.company_id = _company_id
    order by t.txn_date, t.raw_name;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) TO authenticated, service_role;

-- ------------------------------------------------------- B2 emitters
-- Email matcher: every link it actually creates is an
-- 'evidence_attached' event on the bank row (the attachment is the
-- matcher's act; classify later citing the link creates no event of
-- its own). Same matcher contract as Batch A3 — amount + ±5 days +
-- vendor token, all three — only the inserted rows are now captured
-- so each new link is logged with its basis.
CREATE OR REPLACE FUNCTION public.bookkeeping_email_evidence_match(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_actor text;
  v_created integer := 0;
  v_rows integer := 0;
  v_link record;
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
  v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text);

  for v_link in
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
      returning id, bank_transaction_id, email_transaction_id, match_basis
    )
    select * from inserted
  loop
    v_created := v_created + 1;
    perform public.bookkeeping_field_log_emit(
      v_org_id, _company_id, v_link.bank_transaction_id, null, null,
      'evidence_attached', 'email_matcher',
      jsonb_build_object(
        'basis', v_link.match_basis,
        'evidence_link_id', v_link.id,
        'email_transaction_id', v_link.email_transaction_id),
      v_actor);
  end loop;

  select count(distinct bank_transaction_id) into v_rows
    from public.bookkeeping_bank_txn_evidence ev
    join public.bookkeeping_bank_transactions t on t.id = ev.bank_transaction_id
   where t.company_id = _company_id;

  return jsonb_build_object(
    'links_created', v_created,
    'rows_with_evidence', v_rows,
    'actor', v_actor
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_email_evidence_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_email_evidence_match(uuid) TO authenticated, service_role;

-- ------------------------------------------------------- classify v3
-- Same four determination steps as v2 (roster → utilities crosswalk
-- → taught rules → email evidence), plus the field-log trail (B2):
-- every row a step actually changes gets 'matched' + 'proposed'
-- entries naming the step and the firing record's id, with the basis
-- snapshot at event time; a proposal that closes an open loop writes
-- 'loop_resolved' with it; a withdrawn utility mapping writes
-- 'matched' with the hold it reverted to. The pass ends with the
-- loop sweep (step 5): a row still unidentified or needs_review gets
-- 'loop_opened' — once per open episode, never a duplicate while a
-- loop is already open.
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
  v_loops_opened integer := 0;
  v_loops_resolved integer := 0;
  v_fired boolean;
  v_basis text;
  r record;
  u record;
  w record;
  e record;
  l record;
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
    for u in
      with upd as (
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
           and (r.class is null or t.proposal_class is null or t.proposal_class = r.class)
        returning t.id as txn_id, t.proposal_basis as new_basis,
                  t.proposal_account as new_account, t.proposal_class as new_class
      )
      select * from upd
    loop
      v_roster_count := v_roster_count + 1;
      perform public.bookkeeping_field_log_emit(
        v_org_id, _company_id, u.txn_id, null, r.property_id,
        'matched', 'classify_roster',
        jsonb_build_object('basis', u.new_basis, 'roster_id', r.id,
                           'account', u.new_account, 'class', u.new_class),
        v_actor);
      perform public.bookkeeping_field_log_emit(
        v_org_id, _company_id, u.txn_id, null, r.property_id,
        'proposed', 'classify_roster',
        jsonb_build_object('basis', u.new_basis, 'roster_id', r.id,
                           'account', u.new_account, 'class', u.new_class),
        v_actor);
      if exists (select 1 from public.bookkeeping_field_log_open_loops ol
                  where ol.bank_transaction_id = u.txn_id) then
        perform public.bookkeeping_field_log_emit(
          v_org_id, _company_id, u.txn_id, null, r.property_id,
          'loop_resolved', 'classify_roster',
          jsonb_build_object('basis', 'Resolved by a roster proposal: ' || coalesce(u.new_basis, ''),
                             'resolved_by', 'classify_roster', 'roster_id', r.id),
          v_actor);
        v_loops_resolved := v_loops_resolved + 1;
      end if;
    end loop;
  end loop;

  -- 2) Utilities crosswalk: identify by the MSD account number in the
  -- bank text, never by amount (§25.3). Confirmed mapping -> propose
  -- Utilities + the mapped property's class. Mapping withdrawn (back
  -- to draft / rejected / gone) -> the row returns to the loader hold.
  for w in
    select t.id as txn_id,
           substring(t.raw_name from 'MSD\s+WEB\s+([0-9]+)') as acct_number,
           t.proposal_state as old_state,
           t.proposal_basis as old_basis,
           x.id as crosswalk_id,
           x.status as crosswalk_status,
           x.confirmed_by as crosswalk_confirmed_by,
           coalesce(x.property_id, xa.property_id) as property_id,
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
    if w.crosswalk_status = 'confirmed' and w.property_label is not null then
      if w.old_state <> 'proposed' or w.old_basis is null
         or w.old_basis not like 'Utility account map:%' then
        v_basis := 'Utility account map: MSD acct ' || w.acct_number ||
          ' → ' || w.property_label || ' (adapter, confirmed by ' ||
          coalesce(w.crosswalk_confirmed_by, 'owner') || ').';
        update public.bookkeeping_bank_transactions t
           set proposal_account = 'Utilities',
               proposal_class = w.property_label,
               proposal_state = 'proposed',
               proposal_basis = v_basis,
               review_notes = case
                 when t.review_notes is null or t.review_notes = t.proposal_basis
                 then v_basis
                 else t.review_notes end,
               updated_at = now()
         where t.id = w.txn_id;
        if found then
          v_utility_applied := v_utility_applied + 1;
          perform public.bookkeeping_field_log_emit(
            v_org_id, _company_id, w.txn_id, null, w.property_id,
            'matched', 'classify_utility_map',
            jsonb_build_object('basis', v_basis, 'crosswalk_id', w.crosswalk_id,
                               'account', 'Utilities', 'class', w.property_label),
            v_actor);
          perform public.bookkeeping_field_log_emit(
            v_org_id, _company_id, w.txn_id, null, w.property_id,
            'proposed', 'classify_utility_map',
            jsonb_build_object('basis', v_basis, 'crosswalk_id', w.crosswalk_id,
                               'account', 'Utilities', 'class', w.property_label),
            v_actor);
          if exists (select 1 from public.bookkeeping_field_log_open_loops ol
                      where ol.bank_transaction_id = w.txn_id) then
            perform public.bookkeeping_field_log_emit(
              v_org_id, _company_id, w.txn_id, null, w.property_id,
              'loop_resolved', 'classify_utility_map',
              jsonb_build_object('basis', 'Resolved by a utility-map proposal: ' || v_basis,
                                 'resolved_by', 'classify_utility_map',
                                 'crosswalk_id', w.crosswalk_id),
              v_actor);
            v_loops_resolved := v_loops_resolved + 1;
          end if;
        end if;
      end if;
    elsif w.old_basis like 'Utility account map:%' then
      -- The mapping that classified this row is no longer confirmed:
      -- return to the loader hold. No state in between exists.
      v_basis := 'MSD sewer charge. Account number from bank text: ' ||
        w.acct_number || '. Identify by account number, never by amount; ' ||
        'property held until the account-to-property map is owner-confirmed.';
      update public.bookkeeping_bank_transactions t
         set proposal_account = 'Utilities',
             proposal_class = null,
             proposal_state = 'needs_review',
             proposal_basis = v_basis,
             review_notes = case
               when t.review_notes is null or t.review_notes = t.proposal_basis
               then v_basis
               else t.review_notes end,
             updated_at = now()
       where t.id = w.txn_id;
      if found then
        v_utility_reverted := v_utility_reverted + 1;
        perform public.bookkeeping_field_log_emit(
          v_org_id, _company_id, w.txn_id, null, w.property_id,
          'matched', 'classify_utility_map',
          jsonb_build_object('basis', v_basis, 'crosswalk_id', w.crosswalk_id,
                             'account', 'Utilities', 'class', null,
                             'result', 'reverted_to_hold'),
          v_actor);
      end if;
    end if;
  end loop;

  -- 3) Taught rules.
  for r in
    select * from public.bookkeeping_classification_rules
    where company_id = _company_id and active
    order by created_at
  loop
    v_fired := false;
    for u in
      with upd as (
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
                or (r.direction = 'in' and t.signed_amount >= 0))
        returning t.id as txn_id, t.proposal_basis as new_basis,
                  t.proposal_account as new_account, t.proposal_class as new_class
      )
      select * from upd
    loop
      v_fired := true;
      perform public.bookkeeping_field_log_emit(
        v_org_id, _company_id, u.txn_id, null, null,
        'matched', 'classify_rule',
        jsonb_build_object('basis', u.new_basis, 'rule_id', r.id,
                           'account', u.new_account, 'class', u.new_class),
        v_actor);
      perform public.bookkeeping_field_log_emit(
        v_org_id, _company_id, u.txn_id, null, null,
        'proposed', 'classify_rule',
        jsonb_build_object('basis', u.new_basis, 'rule_id', r.id,
                           'account', u.new_account, 'class', u.new_class),
        v_actor);
      if exists (select 1 from public.bookkeeping_field_log_open_loops ol
                  where ol.bank_transaction_id = u.txn_id) then
        perform public.bookkeeping_field_log_emit(
          v_org_id, _company_id, u.txn_id, null, null,
          'loop_resolved', 'classify_rule',
          jsonb_build_object('basis', 'Resolved by a taught-rule proposal: ' || coalesce(u.new_basis, ''),
                             'resolved_by', 'classify_rule', 'rule_id', r.id),
          v_actor);
        v_loops_resolved := v_loops_resolved + 1;
      end if;
    end loop;
    if v_fired then
      update public.bookkeeping_classification_rules
         set times_applied = times_applied + 1, last_applied_at = now()
       where id = r.id;
      v_rule_count := v_rule_count + 1;
    end if;
  end loop;

  -- 4) Email evidence: cite matched evidence in the basis; evidence
  -- alone lifts unidentified -> needs_review (a human look) and never
  -- proposes an account or class. Idempotent: rows already carrying
  -- the citation are untouched. (The 'evidence_attached' entries
  -- themselves are the matcher's, written when each link was made.)
  for e in
    select t.id as txn_id, t.proposal_state as old_state, t.proposal_basis as old_basis,
           (select 'Email evidence: ' || coalesce(ev2.vendor_customer, ev2.email_from) ||
                   ' — "' || coalesce(ev2.email_subject, '(no subject)') || '", ' ||
                   ev2.transaction_date::text || ' ($' ||
                   to_char(abs(ev2.amount), 'FM999999990.00') || ').'
              from public.bookkeeping_bank_txn_evidence ev
              join public.bookkeeping_email_transactions ev2 on ev2.id = ev.email_transaction_id
             where ev.bank_transaction_id = t.id
             order by ev2.transaction_date, ev2.created_at
             limit 1) as citation
      from public.bookkeeping_bank_transactions t
     where t.company_id = _company_id
       and t.review_state = 'unreviewed'
       and exists (select 1 from public.bookkeeping_bank_txn_evidence ev
                    where ev.bank_transaction_id = t.id)
       and (t.proposal_basis is null or t.proposal_basis not like '%Email evidence:%')
  loop
    update public.bookkeeping_bank_transactions t
       set proposal_basis = case when e.old_basis is null or e.old_basis = ''
                                 then e.citation
                                 else e.old_basis || ' ' || e.citation end,
           review_notes = case
             when t.review_notes is null or t.review_notes = t.proposal_basis
             then case when e.old_basis is null or e.old_basis = ''
                       then e.citation
                       else e.old_basis || ' ' || e.citation end
             else t.review_notes end,
           proposal_state = case when e.old_state = 'unidentified'
                                 then 'needs_review' else t.proposal_state end,
           updated_at = now()
     where t.id = e.txn_id;
    if found then
      v_evidence_cited := v_evidence_cited + 1;
      if e.old_state = 'unidentified' then
        v_evidence_lifted := v_evidence_lifted + 1;
      end if;
    end if;
  end loop;

  -- 5) Loop sweep: a row that ENDS the pass still unidentified or
  -- needs_review (and not approved) is an open loop. Opened once per
  -- episode — a row already in the open-loops view is skipped; its
  -- resolution is written by whichever step (or reviewer) later
  -- proposes/approves it. The entry's source names the last
  -- determination that touched the row (loader for rows nothing has
  -- matched yet).
  for l in
    select t.id as txn_id, t.proposal_state as end_state,
           t.proposal_basis as end_basis,
           (select e2.source from public.bookkeeping_field_log_entries e2
             where e2.bank_transaction_id = t.id
               and e2.event_kind in ('matched', 'evidence_attached', 'ingested')
             order by e2.seq desc limit 1) as last_source
      from public.bookkeeping_bank_transactions t
     where t.company_id = _company_id
       and t.review_state <> 'approved'
       and t.proposal_state in ('unidentified', 'needs_review')
       and not exists (select 1 from public.bookkeeping_field_log_open_loops ol
                        where ol.bank_transaction_id = t.id)
  loop
    perform public.bookkeeping_field_log_emit(
      v_org_id, _company_id, l.txn_id, null, null,
      'loop_opened', coalesce(l.last_source, 'loader'),
      jsonb_build_object(
        'basis', 'Still ' || l.end_state || ' at the end of the classify pass' ||
                 coalesce(': ' || l.end_basis, ''),
        'pass', 'classify_apply',
        'proposal_state', l.end_state),
      v_actor);
    v_loops_opened := v_loops_opened + 1;
  end loop;

  return jsonb_build_object(
    'roster_applied_rows', v_roster_count,
    'utility_applied_rows', v_utility_applied,
    'utility_reverted_rows', v_utility_reverted,
    'rules_that_fired', v_rule_count,
    'evidence_cited_rows', v_evidence_cited,
    'evidence_lifted_rows', v_evidence_lifted,
    'loops_opened', v_loops_opened,
    'loops_resolved', v_loops_resolved,
    'actor', v_actor
  );
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_classify_apply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_classify_apply(uuid) TO authenticated, service_role;

-- Review RPC: same contract as 20261021124500, plus the trail — a
-- save/edit writes 'reviewed'; an approval writes 'reviewed' +
-- 'approved' and resolves the row's open loop if it has one. The
-- emits run after the update they describe, inside the same
-- transaction, and (per the emit door) can never take the review
-- down with them.
CREATE OR REPLACE FUNCTION public.bookkeeping_bank_queue_review(_txn_id uuid, _account text DEFAULT NULL::text, _class text DEFAULT NULL::text, _approve boolean DEFAULT false, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_company_id uuid;
  v_old_account text;
  v_old_class text;
  v_effective_account text;
  v_new_class text;
  v_actor text;
  v_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select org_id, company_id, proposal_account, proposal_class
    into v_org_id, v_company_id, v_old_account, v_old_class
    from public.bookkeeping_bank_transactions where id = _txn_id;
  if v_org_id is null then
    raise exception 'Transaction not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to review this transaction';
  end if;

  v_effective_account := case when _account is not null
                              then nullif(btrim(_account), '')
                              else v_old_account end;
  v_new_class := case when _class is not null
                      then nullif(btrim(_class), '')
                      else v_old_class end;
  if _approve and v_effective_account is null then
    raise exception 'Cannot approve: no account is classified for this transaction';
  end if;

  v_changed := _approve
    or (_account is not null and nullif(btrim(_account), '') is distinct from v_old_account)
    or _class is not null
    or _notes is not null;
  if not v_changed then
    return _txn_id;
  end if;

  v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  update public.bookkeeping_bank_transactions
     set proposal_account = v_effective_account,
         proposal_class   = v_new_class,
         review_notes     = case when _notes is not null then nullif(btrim(_notes), '') else review_notes end,
         review_state     = case when _approve then 'approved'
                                 when _account is not null or _class is not null then 'edited'
                                 else review_state end,
         reviewed_by = v_actor,
         reviewed_at = now(),
         updated_at  = now()
   where id = _txn_id;

  perform public.bookkeeping_field_log_emit(
    v_org_id, v_company_id, _txn_id, null, null,
    'reviewed', 'human',
    jsonb_build_object(
      'basis', case when _approve
                    then 'Reviewed and approved in the Classification Queue.'
                    else 'Reviewed in the Classification Queue.' end,
      'account', v_effective_account,
      'class', v_new_class,
      'approved', _approve),
    v_actor);
  if _approve then
    perform public.bookkeeping_field_log_emit(
      v_org_id, v_company_id, _txn_id, null, null,
      'approved', 'human',
      jsonb_build_object(
        'basis', 'Approved in the Classification Queue: ' || v_effective_account ||
                 coalesce(' / ' || v_new_class, '') || '.',
        'account', v_effective_account,
        'class', v_new_class),
      v_actor);
    if exists (select 1 from public.bookkeeping_field_log_open_loops ol
                where ol.bank_transaction_id = _txn_id) then
      perform public.bookkeeping_field_log_emit(
        v_org_id, v_company_id, _txn_id, null, null,
        'loop_resolved', 'human',
        jsonb_build_object(
          'basis', 'Resolved by approval in the Classification Queue.',
          'resolved_by', 'review_approve'),
        v_actor);
    end if;
  end if;
  return _txn_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_queue_review(uuid, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_queue_review(uuid, text, text, boolean, text) TO authenticated, service_role;
