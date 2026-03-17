
-- Add qb_bill_id column to worker_payable_batches for storing the QuickBooks Bill ID
ALTER TABLE public.worker_payable_batches
  ADD COLUMN IF NOT EXISTS qb_bill_id text;
