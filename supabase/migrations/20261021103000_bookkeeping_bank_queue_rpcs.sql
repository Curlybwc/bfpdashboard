-- QuickBooks Write-Back Stage 1: queue door functions (05.02 §25.6).
-- The review queue is a human view over bookkeeping_bank_transactions,
-- reached through these door functions — never the only path to the data
-- (Maven operates the same tables through the service door).
-- Stage 1: review actions record state in Ezzie only. No QuickBooks writes.

create or replace function public.bookkeeping_bank_queue_list(_company_id uuid)
returns table (
  id uuid, txn_date date, raw_name text, signed_amount numeric, amount_out numeric,
  proposal_account text, proposal_class text, proposal_basis text,
  proposal_state text, review_state text, account_display text, source text
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
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
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if not exists (select 1 from public.bookkeeping_bank_transactions where id = _txn_id) then
    raise exception 'Transaction not found';
  end if;
  v_actor := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  update public.bookkeeping_bank_transactions
     set proposal_account = case when _account is not null then nullif(btrim(_account), '') else proposal_account end,
         proposal_class   = case when _class   is not null then nullif(btrim(_class), '')   else proposal_class end,
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
