
ALTER TABLE public.worker_payable_batches
ADD COLUMN IF NOT EXISTS split_from_batch_id uuid REFERENCES public.worker_payable_batches(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.split_payable_batch(
  p_batch_id uuid,
  p_first_amount numeric
)
RETURNS TABLE (original_batch_id uuid, new_batch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.worker_payable_batches%ROWTYPE;
  v_remainder numeric;
  v_new_id uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_batch FROM public.worker_payable_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- Permission: admin or project manager (or batch creator if admin)
  IF NOT (
    public.is_admin(v_caller)
    OR (v_batch.project_id IS NOT NULL AND public.get_project_role(v_caller, v_batch.project_id) = 'manager'::project_member_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to split this payment';
  END IF;

  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft payments can be split (current status: %)', v_batch.status;
  END IF;

  IF p_first_amount IS NULL OR p_first_amount <= 0 THEN
    RAISE EXCEPTION 'First amount must be greater than 0';
  END IF;

  IF p_first_amount >= v_batch.total_amount THEN
    RAISE EXCEPTION 'First amount must be less than the total ($%)', v_batch.total_amount;
  END IF;

  v_remainder := round(v_batch.total_amount::numeric - p_first_amount::numeric, 2);
  IF v_remainder <= 0 THEN
    RAISE EXCEPTION 'Remainder must be greater than 0';
  END IF;

  -- Create the remainder batch (no shift links — the original keeps them)
  INSERT INTO public.worker_payable_batches (
    worker_user_id,
    project_id,
    company_id,
    period_start,
    period_end,
    total_amount,
    status,
    settlement_method,
    accounting_source,
    created_by,
    split_from_batch_id
  ) VALUES (
    v_batch.worker_user_id,
    v_batch.project_id,
    v_batch.company_id,
    v_batch.period_start,
    v_batch.period_end,
    v_remainder,
    'draft',
    v_batch.settlement_method,
    v_batch.accounting_source,
    v_caller,
    v_batch.id
  )
  RETURNING id INTO v_new_id;

  -- Shrink the original to the first amount
  UPDATE public.worker_payable_batches
  SET total_amount = round(p_first_amount::numeric, 2),
      updated_at = now()
  WHERE id = v_batch.id;

  RETURN QUERY SELECT v_batch.id, v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_payable_batch(uuid, numeric) TO authenticated;
