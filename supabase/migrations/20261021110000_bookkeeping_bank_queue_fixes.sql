-- QuickBooks Write-Back Stage 1: review fixes (independent review 2026-10-21,
-- verdict MERGE AFTER FIXES — S1, S2, S3 + sign-convention check from S4).
--
-- S1 AUTHORIZATION: both door RPCs now require
-- shared_ingestion_is_manager(auth.uid(), org). The bank tables' org_id is a
-- business_organizations id, while the helper's per-org paths key on
-- organizations ids stored on profiles; until companies carry an
-- organizations link, the helper's ADMIN path is what admits callers
-- (is_admin profiles — the owner and admins). That is the intended Stage 1
-- posture: bank classification approval is an admin act, and the queue route
-- is AdminGuarded in both apps. PRE-PRODUCTION REQUIREMENT: resolve the
-- organizations <-> business_organizations mapping and re-test the
-- manager path before this queue holds production data.
-- This also corrects the stale note in 20261021100000: authenticated access
-- IS defined by the queue door RPCs (this batch), service_role remains the
-- only direct table writer.

-- S2: Postgres grants EXECUTE to PUBLIC by default; revoke it explicitly.
revoke execute on function public.bookkeeping_bank_queue_list(uuid) from public, anon;
revoke execute on function public.bookkeeping_bank_queue_review(uuid, text, text, boolean) from public, anon;

-- Sign convention becomes a database fact, not a loader habit (S4).
alter table public.bookkeeping_bank_transactions
  add constraint bookkeeping_bank_txn_sign_check check (signed_amount = -amount_out);

-- Batch sanity (review nit N5).
alter table public.bookkeeping_bank_import_batches
  add constraint bookkeeping_bank_batches_period_check
    check (period_end is null or period_start is null or period_end >= period_start),
  add constraint bookkeeping_bank_batches_rowcount_check check (row_count >= 0);

-- List: add the manager check.
create or replace function public.bookkeeping_bank_queue_list(_company_id uuid)
returns table (
  id uuid, txn_date date, raw_name text, signed_amount numeric, amount_out numeric,
  proposal_account text, proposal_class text, proposal_basis text,
  proposal_state text, review_state text, account_display text, source text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select business_organization_id into v_org_id
    from public.companies where id = _company_id;
  if v_org_id is null then
    raise exception 'Company not found';
  end if;
  if not public.shared_ingestion_is_manager(auth.uid(), v_org_id) then
    raise exception 'Not authorized to view this company''s bank queue';
  end if;
  return query
    select t.id, t.txn_date, t.raw_name, t.signed_amount, t.amount_out,
           t.proposal_account, t.proposal_class, t.proposal_basis,
           t.proposal_state, t.review_state, fa.display_name, t.source
    from public.bookkeeping_bank_transactions t
    join public.financial_accounts fa on fa.id = t.financial_account_id
    where t.company_id = _company_id
    order by t.txn_date, t.raw_name;
end $$;

-- Review: manager check + S3 approve guard + stamp only on a real change (N4).
create or replace function public.bookkeeping_bank_queue_review(
  _txn_id uuid,
  _account text default null,
  _class text default null,
  _approve boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_old_account text;
  v_effective_account text;
  v_actor text;
  v_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  select org_id, proposal_account into v_org_id, v_old_account
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
  -- S3: an approval is a classification decision. A row with no account
  -- cannot be approved; Stage 2 will push only from approved rows.
  if _approve and v_effective_account is null then
    raise exception 'Cannot approve: no account is classified for this transaction';
  end if;

  v_changed := _approve
    or (_account is not null and nullif(btrim(_account), '') is distinct from v_old_account)
    or _class is not null;
  if not v_changed then
    return _txn_id;
  end if;

  v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  update public.bookkeeping_bank_transactions
     set proposal_account = v_effective_account,
         proposal_class   = case when _class is not null then nullif(btrim(_class), '') else proposal_class end,
         review_state     = case when _approve then 'approved'
                                 when _account is not null or _class is not null then 'edited'
                                 else review_state end,
         reviewed_by = v_actor,
         reviewed_at = now(),
         updated_at  = now()
   where id = _txn_id;
  return _txn_id;
end $$;

grant execute on function public.bookkeeping_bank_queue_list(uuid) to authenticated, service_role;
grant execute on function public.bookkeeping_bank_queue_review(uuid, text, text, boolean) to authenticated, service_role;
