-- Worker payout ledger foundations (schema only; no Stripe API logic)

-- Enums (new additions)
DO $$ BEGIN
  CREATE TYPE public.payout_onboarding_status AS ENUM ('not_started', 'in_progress', 'completed', 'restricted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_run_status AS ENUM ('draft', 'submitted', 'completed', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.worker_payment_source AS ENUM ('stripe_connect', 'manual_quickbooks');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.worker_payment_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'voided');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.worker_tax_classification AS ENUM ('contractor_1099', 'employee_w2');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Keep tax classification separate from payout mechanics
CREATE TABLE IF NOT EXISTS public.worker_tax_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tax_classification public.worker_tax_classification NOT NULL DEFAULT 'contractor_1099',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.worker_payout_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_connected_account_id text NULL UNIQUE,
  onboarding_status public.payout_onboarding_status NOT NULL DEFAULT 'not_started',
  details_submitted boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  charges_enabled boolean NOT NULL DEFAULT false,
  default_payment_source public.worker_payment_source NOT NULL DEFAULT 'stripe_connect',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  payout_date date NULL,
  status public.payout_run_status NOT NULL DEFAULT 'draft',
  notes text NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_runs_period_check CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.worker_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payout_run_id uuid NULL REFERENCES public.payout_runs(id) ON DELETE SET NULL,
  pay_period_start date NULL,
  pay_period_end date NULL,
  paid_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_source public.worker_payment_source NOT NULL,
  status public.worker_payment_status NOT NULL DEFAULT 'pending',
  stripe_transfer_id text NULL,
  stripe_payout_id text NULL,
  stripe_balance_transaction_id text NULL,
  external_reference text NULL,
  memo text NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_payments_period_check CHECK (
    pay_period_start IS NULL
    OR pay_period_end IS NULL
    OR pay_period_end >= pay_period_start
  )
);

-- Indexes for payroll run processing and YTD reporting
CREATE INDEX IF NOT EXISTS idx_payout_runs_period ON public.payout_runs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payout_runs_status ON public.payout_runs(status);

CREATE INDEX IF NOT EXISTS idx_worker_payments_worker_paid_date ON public.worker_payments(worker_user_id, paid_date);
CREATE INDEX IF NOT EXISTS idx_worker_payments_status ON public.worker_payments(status);
CREATE INDEX IF NOT EXISTS idx_worker_payments_run_id ON public.worker_payments(payout_run_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS worker_tax_profiles_updated_at ON public.worker_tax_profiles;
CREATE TRIGGER worker_tax_profiles_updated_at
  BEFORE UPDATE ON public.worker_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS worker_payout_profiles_updated_at ON public.worker_payout_profiles;
CREATE TRIGGER worker_payout_profiles_updated_at
  BEFORE UPDATE ON public.worker_payout_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS payout_runs_updated_at ON public.payout_runs;
CREATE TRIGGER payout_runs_updated_at
  BEFORE UPDATE ON public.payout_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.worker_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_payout_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_payments ENABLE ROW LEVEL SECURITY;

-- worker_tax_profiles policies
DROP POLICY IF EXISTS "Select own or admin worker tax profiles" ON public.worker_tax_profiles;
CREATE POLICY "Select own or admin worker tax profiles"
  ON public.worker_tax_profiles FOR SELECT
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin insert worker tax profiles" ON public.worker_tax_profiles;
CREATE POLICY "Admin insert worker tax profiles"
  ON public.worker_tax_profiles FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin update worker tax profiles" ON public.worker_tax_profiles;
CREATE POLICY "Admin update worker tax profiles"
  ON public.worker_tax_profiles FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin delete worker tax profiles" ON public.worker_tax_profiles;
CREATE POLICY "Admin delete worker tax profiles"
  ON public.worker_tax_profiles FOR DELETE
  USING (is_admin(auth.uid()));

-- worker_payout_profiles policies
DROP POLICY IF EXISTS "Select own or admin worker payout profiles" ON public.worker_payout_profiles;
CREATE POLICY "Select own or admin worker payout profiles"
  ON public.worker_payout_profiles FOR SELECT
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin insert worker payout profiles" ON public.worker_payout_profiles;
CREATE POLICY "Admin insert worker payout profiles"
  ON public.worker_payout_profiles FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin update worker payout profiles" ON public.worker_payout_profiles;
CREATE POLICY "Admin update worker payout profiles"
  ON public.worker_payout_profiles FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin delete worker payout profiles" ON public.worker_payout_profiles;
CREATE POLICY "Admin delete worker payout profiles"
  ON public.worker_payout_profiles FOR DELETE
  USING (is_admin(auth.uid()));

-- payout_runs policies
DROP POLICY IF EXISTS "Admins select payout runs" ON public.payout_runs;
CREATE POLICY "Admins select payout runs"
  ON public.payout_runs FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert payout runs" ON public.payout_runs;
CREATE POLICY "Admins insert payout runs"
  ON public.payout_runs FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update payout runs" ON public.payout_runs;
CREATE POLICY "Admins update payout runs"
  ON public.payout_runs FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete payout runs" ON public.payout_runs;
CREATE POLICY "Admins delete payout runs"
  ON public.payout_runs FOR DELETE
  USING (is_admin(auth.uid()));

-- worker_payments policies
DROP POLICY IF EXISTS "Select own or admin worker payments" ON public.worker_payments;
CREATE POLICY "Select own or admin worker payments"
  ON public.worker_payments FOR SELECT
  USING (worker_user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins insert worker payments" ON public.worker_payments;
CREATE POLICY "Admins insert worker payments"
  ON public.worker_payments FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update worker payments" ON public.worker_payments;
CREATE POLICY "Admins update worker payments"
  ON public.worker_payments FOR UPDATE
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete worker payments" ON public.worker_payments;
CREATE POLICY "Admins delete worker payments"
  ON public.worker_payments FOR DELETE
  USING (is_admin(auth.uid()));
