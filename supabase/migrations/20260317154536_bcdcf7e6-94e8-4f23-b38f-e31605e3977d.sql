
-- Payable batches: groups shifts into payable units per worker/project/period
CREATE TABLE public.worker_payable_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL REFERENCES public.profiles(id),
  project_id uuid REFERENCES public.projects(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'exported', 'paid', 'voided')),
  accounting_source text,
  settlement_method text,
  paid_at timestamptz,
  marked_paid_by uuid REFERENCES public.profiles(id),
  voided_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_payable_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on worker_payable_batches"
  ON public.worker_payable_batches FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- Link table: which shifts belong to which payable batch
CREATE TABLE public.worker_payable_batch_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_batch_id uuid NOT NULL REFERENCES public.worker_payable_batches(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id),
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_payable_batch_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on worker_payable_batch_shifts"
  ON public.worker_payable_batch_shifts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));
