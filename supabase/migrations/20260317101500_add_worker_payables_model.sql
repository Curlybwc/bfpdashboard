-- Local durable payables model for shift-level export/payment lifecycle tracking

DO $$ BEGIN
  CREATE TYPE public.worker_payable_batch_status AS ENUM ('draft', 'exported', 'paid', 'voided');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.worker_payable_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status public.worker_payable_batch_status NOT NULL DEFAULT 'draft',
  accounting_source text NULL,
  settlement_method text NULL,
  external_reference text NULL,
  quickbooks_reference text NULL,
  paid_at timestamptz NULL,
  marked_paid_by uuid NULL REFERENCES public.profiles(id),
  voided_at timestamptz NULL,
  voided_by uuid NULL REFERENCES public.profiles(id),
  void_reason text NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_payable_batches_period_check CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.worker_payable_batch_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_batch_id uuid NOT NULL REFERENCES public.worker_payable_batches(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz NULL,
  voided_by uuid NULL REFERENCES public.profiles(id),
  UNIQUE (payable_batch_id, shift_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_payable_batch_shifts_active_shift
  ON public.worker_payable_batch_shifts(shift_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_worker_payable_batches_worker_period
  ON public.worker_payable_batches(worker_user_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_worker_payable_batches_status
  ON public.worker_payable_batches(status);

CREATE INDEX IF NOT EXISTS idx_worker_payable_batch_shifts_batch_id
  ON public.worker_payable_batch_shifts(payable_batch_id);

CREATE OR REPLACE FUNCTION public.validate_worker_payable_batch_shift_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch_worker uuid;
  v_batch_project uuid;
  v_batch_status public.worker_payable_batch_status;
  v_shift_worker uuid;
  v_shift_project uuid;
BEGIN
  SELECT b.worker_user_id, b.project_id, b.status
  INTO v_batch_worker, v_batch_project, v_batch_status
  FROM public.worker_payable_batches b
  WHERE b.id = NEW.payable_batch_id;

  IF v_batch_worker IS NULL THEN
    RAISE EXCEPTION 'Payable batch not found for shift link';
  END IF;

  SELECT s.user_id, s.project_id
  INTO v_shift_worker, v_shift_project
  FROM public.shifts s
  WHERE s.id = NEW.shift_id;

  IF v_shift_worker IS NULL THEN
    RAISE EXCEPTION 'Shift not found for payable link';
  END IF;

  IF v_batch_status = 'voided' THEN
    RAISE EXCEPTION 'Cannot link shifts to a voided payable batch';
  END IF;

  IF v_batch_worker <> v_shift_worker THEN
    RAISE EXCEPTION 'Shift worker must match payable batch worker';
  END IF;

  IF v_batch_project IS NOT NULL AND v_batch_project <> v_shift_project THEN
    RAISE EXCEPTION 'Shift project must match payable batch project when project_id is set';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_worker_payable_batch_shift_link_trigger ON public.worker_payable_batch_shifts;
CREATE TRIGGER validate_worker_payable_batch_shift_link_trigger
  BEFORE INSERT OR UPDATE ON public.worker_payable_batch_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_worker_payable_batch_shift_link();

DROP TRIGGER IF EXISTS worker_payable_batches_updated_at ON public.worker_payable_batches;
CREATE TRIGGER worker_payable_batches_updated_at
  BEFORE UPDATE ON public.worker_payable_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.worker_payable_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_payable_batch_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select worker payable batches" ON public.worker_payable_batches;
CREATE POLICY "Admins select worker payable batches"
  ON public.worker_payable_batches FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert worker payable batches" ON public.worker_payable_batches;
CREATE POLICY "Admins insert worker payable batches"
  ON public.worker_payable_batches FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update worker payable batches" ON public.worker_payable_batches;
CREATE POLICY "Admins update worker payable batches"
  ON public.worker_payable_batches FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete worker payable batches" ON public.worker_payable_batches;
CREATE POLICY "Admins delete worker payable batches"
  ON public.worker_payable_batches FOR DELETE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins select worker payable batch shifts" ON public.worker_payable_batch_shifts;
CREATE POLICY "Admins select worker payable batch shifts"
  ON public.worker_payable_batch_shifts FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert worker payable batch shifts" ON public.worker_payable_batch_shifts;
CREATE POLICY "Admins insert worker payable batch shifts"
  ON public.worker_payable_batch_shifts FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update worker payable batch shifts" ON public.worker_payable_batch_shifts;
CREATE POLICY "Admins update worker payable batch shifts"
  ON public.worker_payable_batch_shifts FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete worker payable batch shifts" ON public.worker_payable_batch_shifts;
CREATE POLICY "Admins delete worker payable batch shifts"
  ON public.worker_payable_batch_shifts FOR DELETE
  USING (is_admin(auth.uid()));
