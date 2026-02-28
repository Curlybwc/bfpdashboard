
-- Task hierarchy
ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;

-- Scope item rehab status
ALTER TABLE scope_items ADD COLUMN status text NOT NULL DEFAULT 'Not Checked';
ALTER TABLE scope_items ADD CONSTRAINT scope_items_status_check
  CHECK (status IN ('Not Checked','OK','Repair','Replace','Needs Review'));

-- Scope snapshot fields
ALTER TABLE scopes ADD COLUMN estimated_total_snapshot numeric(12,2);
ALTER TABLE scopes ADD COLUMN converted_at timestamptz;

-- Project missing estimates flag
ALTER TABLE projects ADD COLUMN has_missing_estimates boolean NOT NULL DEFAULT false;
