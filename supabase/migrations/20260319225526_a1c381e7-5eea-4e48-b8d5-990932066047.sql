
-- 1. Add new columns to worker_payments
ALTER TABLE worker_payments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE worker_payments ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE worker_payments ADD COLUMN IF NOT EXISTS qb_txn_type text;
ALTER TABLE worker_payments ADD COLUMN IF NOT EXISTS qb_txn_amount numeric;

-- 2. Add new enum value (old values untouched)
ALTER TYPE worker_payment_source ADD VALUE IF NOT EXISTS 'quickbooks_linked';

-- 3. Backfill company_id from linked shifts
UPDATE worker_payments wp
SET company_id = sub.company_id
FROM (
  SELECT DISTINCT ON (wps.worker_payment_id) wps.worker_payment_id, p.company_id
  FROM worker_payment_shifts wps
  JOIN shifts s ON s.id = wps.shift_id
  JOIN projects p ON p.id = s.project_id
  WHERE p.company_id IS NOT NULL
) sub
WHERE sub.worker_payment_id = wp.id AND wp.company_id IS NULL;
