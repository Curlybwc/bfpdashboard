-- Backfill worker_payable_batches: use project's company_id
UPDATE worker_payable_batches wpb
SET company_id = p.company_id
FROM projects p
WHERE wpb.company_id IS NULL
  AND wpb.project_id IS NOT NULL
  AND p.id = wpb.project_id
  AND p.company_id IS NOT NULL;

-- Backfill remaining worker_payable_batches (no project match) if only 1 company exists
-- (Not applicable here since we have 2 companies, but safe for future)
UPDATE worker_payable_batches
SET company_id = (SELECT id FROM companies LIMIT 1)
WHERE company_id IS NULL
  AND (SELECT count(*) FROM companies) = 1;