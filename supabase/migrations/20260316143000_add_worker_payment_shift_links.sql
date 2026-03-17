-- Durable per-shift payment linkage to prevent double-pay across periods

CREATE TABLE IF NOT EXISTS public.worker_payment_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_payment_id uuid NOT NULL REFERENCES public.worker_payments(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id),
  worker_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hours_paid numeric NOT NULL CHECK (hours_paid > 0),
  hourly_rate_used numeric NOT NULL CHECK (hourly_rate_used >= 0),
  amount_paid numeric(12,2) NOT NULL CHECK (amount_paid >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id),
  UNIQUE (worker_payment_id, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_payment_shifts_payment_id
  ON public.worker_payment_shifts(worker_payment_id);

CREATE INDEX IF NOT EXISTS idx_worker_payment_shifts_worker_id
  ON public.worker_payment_shifts(worker_user_id);

CREATE INDEX IF NOT EXISTS idx_worker_payment_shifts_created_at
  ON public.worker_payment_shifts(created_at);

CREATE OR REPLACE FUNCTION public.validate_worker_payment_shift_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_shift_user uuid;
  v_payment_user uuid;
BEGIN
  SELECT s.user_id INTO v_shift_user
  FROM public.shifts s
  WHERE s.id = NEW.shift_id;

  IF v_shift_user IS NULL THEN
    RAISE EXCEPTION 'Shift not found for link row';
  END IF;

  SELECT wp.worker_user_id INTO v_payment_user
  FROM public.worker_payments wp
  WHERE wp.id = NEW.worker_payment_id;

  IF v_payment_user IS NULL THEN
    RAISE EXCEPTION 'Worker payment not found for link row';
  END IF;

  IF v_shift_user <> NEW.worker_user_id THEN
    RAISE EXCEPTION 'worker_user_id must match shift.user_id';
  END IF;

  IF v_payment_user <> NEW.worker_user_id THEN
    RAISE EXCEPTION 'worker_user_id must match worker_payments.worker_user_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_worker_payment_shift_consistency_trigger ON public.worker_payment_shifts;
CREATE TRIGGER validate_worker_payment_shift_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.worker_payment_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_worker_payment_shift_consistency();

ALTER TABLE public.worker_payment_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Select own or admin worker payment shifts" ON public.worker_payment_shifts;
CREATE POLICY "Select own or admin worker payment shifts"
  ON public.worker_payment_shifts FOR SELECT
  USING (worker_user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert worker payment shifts" ON public.worker_payment_shifts;
CREATE POLICY "Admins insert worker payment shifts"
  ON public.worker_payment_shifts FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update worker payment shifts" ON public.worker_payment_shifts;
CREATE POLICY "Admins update worker payment shifts"
  ON public.worker_payment_shifts FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete worker payment shifts" ON public.worker_payment_shifts;
CREATE POLICY "Admins delete worker payment shifts"
  ON public.worker_payment_shifts FOR DELETE
  USING (is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_mark_visible_shifts_paid(
  p_worker_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_shift_ids uuid[],
  p_payment_source public.worker_payment_source DEFAULT 'manual_quickbooks',
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
  v_inserted_count integer;
  v_amount_total numeric(12,2);
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_admin(v_caller) THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;

  IF p_worker_user_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'worker_user_id, period_start, and period_end are required';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end must be on or after period_start';
  END IF;

  IF p_shift_ids IS NULL OR array_length(p_shift_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one visible shift id is required';
  END IF;

  INSERT INTO public.worker_payments (
    worker_user_id,
    payout_run_id,
    pay_period_start,
    pay_period_end,
    paid_date,
    amount,
    payment_source,
    status,
    paid_at,
    marked_paid_by,
    stripe_transfer_id,
    stripe_payout_id,
    stripe_balance_transaction_id,
    external_reference,
    memo,
    confirmation_note,
    created_by
  ) VALUES (
    p_worker_user_id,
    NULL,
    p_period_start,
    p_period_end,
    current_date,
    0,
    p_payment_source,
    'paid',
    now(),
    v_caller,
    NULL,
    NULL,
    NULL,
    NULL,
    p_memo,
    p_confirmation_note,
    v_caller
  )
  RETURNING id INTO v_payment_id;

  WITH candidate_shifts AS (
    SELECT
      s.id AS shift_id,
      s.user_id AS worker_user_id,
      s.total_hours,
      COALESCE(s.hourly_rate_snapshot, p.hourly_rate, 0) AS hourly_rate_used
    FROM public.shifts s
    LEFT JOIN public.worker_payment_shifts wps ON wps.shift_id = s.id
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.user_id = p_worker_user_id
      AND s.shift_date >= p_period_start
      AND s.shift_date <= p_period_end
      AND s.id = ANY(p_shift_ids)
      AND wps.id IS NULL
  ), inserted_links AS (
    INSERT INTO public.worker_payment_shifts (
      worker_payment_id,
      shift_id,
      worker_user_id,
      hours_paid,
      hourly_rate_used,
      amount_paid
    )
    SELECT
      v_payment_id,
      c.shift_id,
      c.worker_user_id,
      c.total_hours,
      c.hourly_rate_used,
      round((c.total_hours * c.hourly_rate_used)::numeric, 2)
    FROM candidate_shifts c
    ON CONFLICT (shift_id) DO NOTHING
    RETURNING amount_paid
  )
  SELECT COUNT(*), COALESCE(SUM(amount_paid), 0)
  INTO v_inserted_count, v_amount_total
  FROM inserted_links;

  IF v_inserted_count = 0 THEN
    DELETE FROM public.worker_payments WHERE id = v_payment_id;
    RAISE EXCEPTION 'No unpaid shifts were available to mark as paid for the selected worker/period';
  END IF;

  UPDATE public.worker_payments
  SET amount = v_amount_total
  WHERE id = v_payment_id;

  RETURN jsonb_build_object(
    'worker_payment_id', v_payment_id,
    'linked_shift_count', v_inserted_count,
    'amount', v_amount_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_visible_shifts_paid(uuid, date, date, uuid[], public.worker_payment_source, text, text)
  TO authenticated;
