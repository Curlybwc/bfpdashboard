
CREATE OR REPLACE FUNCTION public.admin_mark_visible_shifts_paid(
  p_worker_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_shift_ids uuid[],
  p_payment_source worker_payment_source DEFAULT 'manual_quickbooks',
  p_memo text DEFAULT NULL,
  p_confirmation_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_payment_id uuid;
  v_shift RECORD;
  v_total_amount numeric := 0;
  v_linked_count int := 0;
  v_hourly_rate numeric;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_admin(v_caller) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT hourly_rate INTO v_hourly_rate FROM profiles WHERE id = p_worker_user_id;

  FOR v_shift IN
    SELECT s.id, s.total_hours, s.hourly_rate_snapshot
    FROM shifts s
    WHERE s.id = ANY(p_shift_ids)
      AND s.user_id = p_worker_user_id
      AND NOT EXISTS (
        SELECT 1 FROM worker_payment_shifts wps WHERE wps.shift_id = s.id
      )
  LOOP
    v_total_amount := v_total_amount + round(v_shift.total_hours * COALESCE(v_shift.hourly_rate_snapshot, v_hourly_rate, 0), 2);
    v_linked_count := v_linked_count + 1;
  END LOOP;

  IF v_linked_count = 0 THEN
    RETURN jsonb_build_object('linked_shift_count', 0, 'message', 'No unpaid shifts found');
  END IF;

  INSERT INTO worker_payments (
    worker_user_id, paid_date, amount, payment_source, status,
    pay_period_start, pay_period_end, memo, created_by,
    paid_at, marked_paid_by
  ) VALUES (
    p_worker_user_id, CURRENT_DATE, v_total_amount, p_payment_source, 'paid',
    p_period_start, p_period_end, COALESCE(p_memo, p_confirmation_note), v_caller,
    now(), v_caller
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO worker_payment_shifts (worker_payment_id, shift_id, hours_paid, hourly_rate_used, amount_paid)
  SELECT
    v_payment_id, s.id, s.total_hours,
    COALESCE(s.hourly_rate_snapshot, v_hourly_rate, 0),
    round(s.total_hours * COALESCE(s.hourly_rate_snapshot, v_hourly_rate, 0), 2)
  FROM shifts s
  WHERE s.id = ANY(p_shift_ids)
    AND s.user_id = p_worker_user_id
    AND NOT EXISTS (SELECT 1 FROM worker_payment_shifts wps WHERE wps.shift_id = s.id);

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'linked_shift_count', v_linked_count,
    'total_amount', v_total_amount
  );
END;
$$;
