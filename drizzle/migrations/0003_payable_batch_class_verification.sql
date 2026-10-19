ALTER TABLE public.worker_payable_batches
  ADD COLUMN IF NOT EXISTS qb_class_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS qb_class_verified_id text;
COMMENT ON COLUMN public.worker_payable_batches.qb_class_verified_at IS 'Set only after the QB bill was read back and its line ClassRef matched the saved project class ID. Distinct from qb_exported_at (bill created).';