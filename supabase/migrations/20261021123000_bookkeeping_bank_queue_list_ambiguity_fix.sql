-- Fix: bookkeeping_bank_queue_list failed for every caller with
-- 'column reference "id" is ambiguous' (Jen's report, 2026-10-21).
-- The function's RETURNS TABLE declares an OUT parameter named `id`;
-- the company lookup `where id = _company_id` collided with it.
-- Alias the companies table and qualify the column. Everything else
-- in the function is unchanged.
--
-- Verified by executing the function under a caller JWT after
-- applying (see sprint checkpoint) — existence checks alone missed
-- this; execution is the verification standard for RPC changes.

CREATE OR REPLACE FUNCTION public.bookkeeping_bank_queue_list(_company_id uuid)
 RETURNS TABLE(id uuid, txn_date date, raw_name text, signed_amount numeric, amount_out numeric, proposal_account text, proposal_class text, proposal_basis text, proposal_state text, review_state text, account_display text, source text)
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
           t.proposal_state, t.review_state, fa.display_name, t.source
    from public.bookkeeping_bank_transactions t
    join public.financial_accounts fa on fa.id = t.financial_account_id
    where t.company_id = _company_id
    order by t.txn_date, t.raw_name;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) TO authenticated, service_role;
