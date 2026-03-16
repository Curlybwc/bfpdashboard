-- Add Venmo manual-helper metadata and confirmation audit fields for worker payroll
DO $$ BEGIN
  ALTER TYPE public.worker_payment_source ADD VALUE IF NOT EXISTS 'venmo_manual';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.worker_payout_profiles
  ADD COLUMN IF NOT EXISTS venmo_handle text,
  ADD COLUMN IF NOT EXISTS venmo_note_template text;

ALTER TABLE public.worker_payments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmation_note text;

UPDATE public.worker_payments
SET
  paid_at = COALESCE(paid_at, created_at),
  marked_paid_by = COALESCE(marked_paid_by, created_by)
WHERE status = 'paid';
