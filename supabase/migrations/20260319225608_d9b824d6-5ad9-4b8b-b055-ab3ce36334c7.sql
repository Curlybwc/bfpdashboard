
-- Index for allocation queries
CREATE INDEX IF NOT EXISTS idx_wp_company_extref
  ON worker_payments(company_id, external_reference)
  WHERE payment_source = 'quickbooks_linked';

-- Atomic RPC: save_linked_historical_payments
CREATE OR REPLACE FUNCTION public.save_linked_historical_payments(
  p_caller_id uuid,
  p_company_id uuid,
  p_external_reference text,
  p_qb_txn_type text,
  p_qb_txn_amount numeric,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_sum numeric;
  v_new_sum numeric;
  v_alloc jsonb;
  v_inserted_count int := 0;
  v_lock_key bigint;
BEGIN
  IF NOT is_admin(p_caller_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;
  IF p_external_reference IS NULL OR p_external_reference = '' THEN RAISE EXCEPTION 'external_reference is required'; END IF;
  IF p_qb_txn_amount IS NULL OR p_qb_txn_amount <= 0 THEN RAISE EXCEPTION 'qb_txn_amount must be positive'; END IF;
  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN RAISE EXCEPTION 'At least one allocation is required'; END IF;

  -- Transaction-scoped advisory lock keyed on company_id + external_reference
  v_lock_key := hashtext(p_company_id::text || '::' || p_external_reference);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Sum existing linked amount
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_sum
  FROM worker_payments
  WHERE company_id = p_company_id
    AND external_reference = p_external_reference
    AND payment_source = 'quickbooks_linked';

  -- Sum new allocations
  SELECT COALESCE(SUM((a->>'amount')::numeric), 0) INTO v_new_sum
  FROM jsonb_array_elements(p_allocations) a;

  -- Validate total
  IF v_existing_sum + v_new_sum > p_qb_txn_amount THEN
    RAISE EXCEPTION 'Over-allocation: existing $% + new $% = $% exceeds QB transaction amount $%',
      v_existing_sum, v_new_sum, v_existing_sum + v_new_sum, p_qb_txn_amount;
  END IF;

  -- Insert allocations
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    IF (v_alloc->>'amount')::numeric <= 0 THEN
      RAISE EXCEPTION 'Each allocation amount must be positive';
    END IF;
    IF v_alloc->>'worker_user_id' IS NULL THEN
      RAISE EXCEPTION 'worker_user_id is required for each allocation';
    END IF;
    IF v_alloc->>'paid_date' IS NULL THEN
      RAISE EXCEPTION 'paid_date is required for each allocation';
    END IF;

    INSERT INTO worker_payments (
      worker_user_id, amount, paid_date, memo,
      payment_source, status, external_reference,
      company_id, project_id, qb_txn_type, qb_txn_amount,
      created_by, paid_at, marked_paid_by,
      pay_period_start, pay_period_end
    ) VALUES (
      (v_alloc->>'worker_user_id')::uuid,
      (v_alloc->>'amount')::numeric,
      (v_alloc->>'paid_date')::date,
      v_alloc->>'memo',
      'quickbooks_linked',
      'paid',
      p_external_reference,
      p_company_id,
      (v_alloc->>'project_id')::uuid,
      p_qb_txn_type,
      p_qb_txn_amount,
      p_caller_id,
      now(),
      p_caller_id,
      (v_alloc->>'pay_period_start')::date,
      (v_alloc->>'pay_period_end')::date
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_count', v_inserted_count,
    'existing_sum', v_existing_sum,
    'new_sum', v_new_sum,
    'total_allocated', v_existing_sum + v_new_sum,
    'qb_txn_amount', p_qb_txn_amount
  );
END;
$$;

-- RPC: save_local_historical_payment (local-only, server-side)
CREATE OR REPLACE FUNCTION public.save_local_historical_payment(
  p_caller_id uuid,
  p_worker_user_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_company_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_memo text DEFAULT NULL,
  p_pay_period_start date DEFAULT NULL,
  p_pay_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  IF NOT is_admin(p_caller_id) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_worker_user_id IS NULL THEN RAISE EXCEPTION 'worker_user_id is required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF p_paid_date IS NULL THEN RAISE EXCEPTION 'paid_date is required'; END IF;

  INSERT INTO worker_payments (
    worker_user_id, amount, paid_date, memo,
    payment_source, status,
    company_id, project_id,
    created_by, paid_at, marked_paid_by
  ) VALUES (
    p_worker_user_id, p_amount, p_paid_date, p_memo,
    'manual_quickbooks', 'paid',
    p_company_id, p_project_id,
    p_caller_id, now(), p_caller_id
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('payment_id', v_payment_id);
END;
$$;
