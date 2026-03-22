UPDATE worker_payable_batches 
SET settlement_method = NULL 
WHERE id = '459ff661-d824-4124-a929-4f1905392414' 
  AND settlement_method = 'off_platform_manual' 
  AND qb_bill_id IS NULL 
  AND status = 'draft';