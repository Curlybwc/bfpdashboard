-- Queue Notes column (Jen, 2026-10-21): the column formerly shown as
-- "Basis" becomes a user-owned Notes field — last column in the
-- queue, optional, editable — and on Stage 2 push it becomes the
-- QuickBooks Memo verbatim. Ezzie's proposal_basis stays a separate
-- system-owned field (never repurposed); review_notes is seeded from
-- it so today's visible text is preserved as the note's first draft.

ALTER TABLE public.bookkeeping_bank_transactions
  ADD COLUMN IF NOT EXISTS review_notes text;

UPDATE public.bookkeeping_bank_transactions
SET review_notes = proposal_basis
WHERE review_notes IS NULL AND proposal_basis IS NOT NULL;

COMMENT ON COLUMN public.bookkeeping_bank_transactions.review_notes IS
  'User-owned queue note (optional, editable). Stage 2 maps it verbatim to the QuickBooks transaction Memo. Distinct from proposal_basis, which is Ezzie''s system-owned reasoning.';

-- List RPC: same function, plus review_notes in the result. All
-- column references qualified (ambiguity fix of 20261021123000 kept).
-- The return type changes, so drop first (CREATE OR REPLACE cannot
-- change a function's OUT row type).
DROP FUNCTION IF EXISTS public.bookkeeping_bank_queue_list(uuid);
CREATE OR REPLACE FUNCTION public.bookkeeping_bank_queue_list(_company_id uuid)
 RETURNS TABLE(id uuid, txn_date date, raw_name text, signed_amount numeric, amount_out numeric, proposal_account text, proposal_class text, proposal_basis text, proposal_state text, review_state text, account_display text, source text, review_notes text)
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
           t.review_notes
    from public.bookkeeping_bank_transactions t
    join public.financial_accounts fa on fa.id = t.financial_account_id
    where t.company_id = _company_id
    order by t.txn_date, t.raw_name;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_queue_list(uuid) TO authenticated, service_role;

-- Review RPC: gains an optional _notes parameter. Passing _notes
-- (including an empty string, which clears the note) saves it without
-- changing review_state by itself; account/class/approve semantics
-- are unchanged. The old 4-argument signature is dropped first so
-- the 5-argument version replaces it instead of overloading it.
DROP FUNCTION IF EXISTS public.bookkeeping_bank_queue_review(uuid, text, text, boolean);
CREATE OR REPLACE FUNCTION public.bookkeeping_bank_queue_review(_txn_id uuid, _account text DEFAULT NULL::text, _class text DEFAULT NULL::text, _approve boolean DEFAULT false, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         proposal_class   = case when _class is not null then nullif(btrim(_class), '') else proposal_class end,
         review_notes     = case when _notes is not null then nullif(btrim(_notes), '') else review_notes end,
         review_state     = case when _approve then 'approved'
                                 when _account is not null or _class is not null then 'edited'
                                 else review_state end,
         reviewed_by = v_actor,
         reviewed_at = now(),
         updated_at  = now()
   where id = _txn_id;
  return _txn_id;
end $function$;

REVOKE EXECUTE ON FUNCTION public.bookkeeping_bank_queue_review(uuid, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bookkeeping_bank_queue_review(uuid, text, text, boolean, text) TO authenticated, service_role;
