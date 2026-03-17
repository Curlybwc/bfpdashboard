
-- ============================================================
-- Stage 4A: QuickBooks integration tables + columns
-- ============================================================

-- 1. QuickBooks connections (one active connection model)
CREATE TABLE public.quickbooks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  company_name text,
  connected_by uuid NOT NULL REFERENCES public.profiles(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz
);

-- Enforce exactly one active connection at the database level
CREATE UNIQUE INDEX uq_one_active_qb_connection
  ON public.quickbooks_connections ((true))
  WHERE disconnected_at IS NULL;

ALTER TABLE public.quickbooks_connections ENABLE ROW LEVEL SECURITY;

-- Admins can see non-token columns via RLS; token columns are only accessed server-side via service role
CREATE POLICY "Admins can view QB connections"
  ON public.quickbooks_connections FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert QB connections"
  ON public.quickbooks_connections FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update QB connections"
  ON public.quickbooks_connections FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- 2. QuickBooks vendor mappings
CREATE TABLE public.quickbooks_vendor_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) UNIQUE,
  qb_vendor_id text NOT NULL,
  qb_vendor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quickbooks_vendor_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view vendor mappings"
  ON public.quickbooks_vendor_mappings FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert vendor mappings"
  ON public.quickbooks_vendor_mappings FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update vendor mappings"
  ON public.quickbooks_vendor_mappings FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete vendor mappings"
  ON public.quickbooks_vendor_mappings FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

-- 3. Add QB-specific columns to worker_payable_batches
-- Existing columns kept with clear semantics:
--   accounting_source = 'quickbooks' when exported to QB (was 'quickbooks_placeholder')
--   quickbooks_reference = QB Bill ID (already exists, now used for real)
--   external_reference = reserved for non-QB external refs
-- New columns for QB Bill detail tracking:
ALTER TABLE public.worker_payable_batches
  ADD COLUMN IF NOT EXISTS qb_bill_doc_number text,
  ADD COLUMN IF NOT EXISTS qb_export_error text,
  ADD COLUMN IF NOT EXISTS qb_exported_at timestamptz;
