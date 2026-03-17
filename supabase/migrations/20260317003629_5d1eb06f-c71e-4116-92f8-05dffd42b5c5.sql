
ALTER TABLE public.worker_payout_profiles
  ADD COLUMN IF NOT EXISTS venmo_handle text,
  ADD COLUMN IF NOT EXISTS venmo_note_template text;

ALTER TABLE public.worker_payments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid;

CREATE TABLE IF NOT EXISTS public.worker_payment_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_payment_id uuid NOT NULL REFERENCES public.worker_payments(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  hours_paid numeric NOT NULL DEFAULT 0,
  hourly_rate_used numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_payment_id, shift_id)
);

ALTER TABLE public.worker_payment_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins select worker_payment_shifts"
  ON public.worker_payment_shifts FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins insert worker_payment_shifts"
  ON public.worker_payment_shifts FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins update worker_payment_shifts"
  ON public.worker_payment_shifts FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins delete worker_payment_shifts"
  ON public.worker_payment_shifts FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));
