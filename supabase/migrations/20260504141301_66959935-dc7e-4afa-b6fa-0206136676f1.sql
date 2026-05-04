-- =========================================================
-- Reimbursement system: enum, table, settings columns, storage
-- =========================================================

-- 1. Status enum
CREATE TYPE public.reimbursement_status AS ENUM (
  'submitted',
  'needs_info',
  'not_approved',
  'approved',
  'exported',
  'paid',
  'voided'
);

-- 2. Add reimbursement expense account fields to quickbooks_settings (per-company)
ALTER TABLE public.quickbooks_settings
  ADD COLUMN IF NOT EXISTS qb_reimbursement_expense_account_id text,
  ADD COLUMN IF NOT EXISTS qb_reimbursement_expense_account_name text;

-- 3. Main table
CREATE TABLE public.reimbursement_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  company_id            uuid,
  submitter_user_id     uuid NOT NULL,
  on_behalf_of_user_id  uuid,
  project_id            uuid,

  description           text NOT NULL,
  vendor_paid           text NOT NULL,
  expense_date          date NOT NULL,
  requested_amount      numeric NOT NULL CHECK (requested_amount > 0),
  approved_amount       numeric,

  status                public.reimbursement_status NOT NULL DEFAULT 'submitted',

  -- QuickBooks linkage (mirrors worker_payable_batches naming)
  qb_bill_id            text,
  qb_bill_doc_number    text,
  qb_exported_at        timestamptz,
  qb_export_error       text,

  -- Payment (mirrors worker_payments / worker_payable_batches naming)
  paid_at               timestamptz,
  marked_paid_by        uuid,
  settlement_method     text,
  external_reference    text,

  -- Approval / rejection / info-request workflow
  approved_at           timestamptz,
  approved_by           uuid,
  rejection_reason      text,
  info_request_note     text,
  contractor_response   text,
  admin_notes           text,

  receipt_paths         text[] NOT NULL DEFAULT '{}',

  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reimbursement_requests_org_status
  ON public.reimbursement_requests (org_id, status);
CREATE INDEX idx_reimbursement_requests_submitter
  ON public.reimbursement_requests (submitter_user_id);
CREATE INDEX idx_reimbursement_requests_on_behalf_of
  ON public.reimbursement_requests (on_behalf_of_user_id);
CREATE INDEX idx_reimbursement_requests_project
  ON public.reimbursement_requests (project_id);
CREATE INDEX idx_reimbursement_requests_company
  ON public.reimbursement_requests (company_id);
CREATE INDEX idx_reimbursement_requests_dup_check
  ON public.reimbursement_requests (org_id, vendor_paid, expense_date, requested_amount);

-- 4. Validation trigger: approved_amount must be > 0 and <= requested_amount
CREATE OR REPLACE FUNCTION public.validate_reimbursement_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.approved_amount IS NOT NULL THEN
    IF NEW.approved_amount <= 0 THEN
      RAISE EXCEPTION 'approved_amount must be greater than 0';
    END IF;
    IF NEW.approved_amount > NEW.requested_amount THEN
      RAISE EXCEPTION 'approved_amount (%) cannot exceed requested_amount (%)',
        NEW.approved_amount, NEW.requested_amount;
    END IF;
  END IF;

  -- Status gates
  IF NEW.status IN ('approved', 'exported', 'paid') AND NEW.approved_amount IS NULL THEN
    RAISE EXCEPTION 'approved_amount is required when status is %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_reimbursement_amounts
BEFORE INSERT OR UPDATE ON public.reimbursement_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_reimbursement_amounts();

-- 5. updated_at trigger
CREATE TRIGGER trg_reimbursement_requests_updated_at
BEFORE UPDATE ON public.reimbursement_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. RLS
ALTER TABLE public.reimbursement_requests ENABLE ROW LEVEL SECURITY;

-- View: submitter, on-behalf-of contractor, or org admin
CREATE POLICY "View own or admin reimbursements"
ON public.reimbursement_requests FOR SELECT
TO authenticated
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    is_org_admin(auth.uid(), org_id)
    OR submitter_user_id = auth.uid()
    OR on_behalf_of_user_id = auth.uid()
  )
);

-- Insert: must be org member; submitter_user_id must be self; admins may submit on behalf
CREATE POLICY "Insert reimbursements"
ON public.reimbursement_requests FOR INSERT
TO authenticated
WITH CHECK (
  is_org_member(auth.uid(), org_id)
  AND created_by = auth.uid()
  AND (
    -- Self-submit
    (submitter_user_id = auth.uid() AND on_behalf_of_user_id IS NULL)
    -- Admin submitting on behalf of a contractor
    OR (is_org_admin(auth.uid(), org_id) AND submitter_user_id = auth.uid())
  )
  AND status = 'submitted'
);

-- Update: contractor only while submitted; admins always
CREATE POLICY "Update reimbursements"
ON public.reimbursement_requests FOR UPDATE
TO authenticated
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    is_org_admin(auth.uid(), org_id)
    OR (
      (submitter_user_id = auth.uid() OR on_behalf_of_user_id = auth.uid())
      AND status = 'submitted'
    )
  )
);

-- Delete: admin only (rare; contractors withdraw via status -> voided)
CREATE POLICY "Delete reimbursements"
ON public.reimbursement_requests FOR DELETE
TO authenticated
USING (
  is_org_admin(auth.uid(), org_id)
);

-- =========================================================
-- 7. Storage bucket: private, with RLS on storage.objects
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('reimbursement-receipts', 'reimbursement-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- INSERT: authenticated, path must start with caller's user id
CREATE POLICY "Receipts: upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reimbursement-receipts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- SELECT: file owner OR org admin (admin check via path -> any reimbursement
-- in same org; we check by joining on path stored in receipt_paths is overkill,
-- so we allow any admin in any org since signed URLs are minted server-side
-- via an edge function that performs the row-level org check first.)
-- Conservative policy: file owner OR any admin.
CREATE POLICY "Receipts: view own or admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'reimbursement-receipts'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin(auth.uid())
  )
);

-- DELETE: file owner only while their parent reimbursement is submitted,
-- OR admin while parent is not yet exported/paid.
-- This is enforced primarily in the app layer; here we keep it permissive
-- for owner + admin and rely on the edge function to gate by status.
CREATE POLICY "Receipts: delete own or admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'reimbursement-receipts'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin(auth.uid())
  )
);

-- UPDATE (rename/move): owner or admin
CREATE POLICY "Receipts: update own or admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'reimbursement-receipts'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin(auth.uid())
  )
);