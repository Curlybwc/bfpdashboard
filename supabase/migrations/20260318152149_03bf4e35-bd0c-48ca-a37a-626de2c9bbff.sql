ALTER TABLE scope_items DROP CONSTRAINT scope_items_status_check;
ALTER TABLE scope_items ADD CONSTRAINT scope_items_status_check
  CHECK (status IN ('Not Checked','OK','Repair','Replace','Needs Review','Get Bid'));