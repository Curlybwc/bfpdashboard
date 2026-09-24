-- ============================================================
-- Ezzie Package B — Import staging (STAGING ONLY)
-- Private schema: no anon/authenticated grants. Operators use service role.
-- Nothing here is read by the app.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS ezzie_import;
REVOKE ALL ON SCHEMA ezzie_import FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ezzie_import TO service_role;

CREATE TABLE ezzie_import.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL CHECK (source_system IN ('rent_roll','rentals_utilities',
    'bfp_monthly_expenses','bfp_dashboard_projects','alta','tax_records','lease_documents','other')),
  source_label text NOT NULL,
  source_as_of_date date,
  file_hash text NOT NULL,
  status text NOT NULL DEFAULT 'loaded'
    CHECK (status IN ('loaded','matched','in_review','approved','promoted','rejected')),
  loaded_by text, created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  UNIQUE (source_system, file_hash)
);

CREATE TABLE ezzie_import.staging_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES ezzie_import.import_batches(id) ON DELETE CASCADE,
  source_row_number int NOT NULL,
  source_record_id text NOT NULL,
  target_entity text NOT NULL CHECK (target_entity IN ('property','unit','person','tenancy',
    'utility_account','equipment','filter_spec','maintenance_event','property_event','loan',
    'insurance_policy','tax_record','valuation','compliance_record','document','organization')),
  raw jsonb NOT NULL,
  normalized jsonb,
  match_status text NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending','matched','new','needs_attention','approved','rejected','promoted')),
  matched_id uuid,
  match_method text CHECK (match_method IS NULL OR match_method IN
    ('external_id','project_link','normalized_address','contact_exact','manual')),
  exception_reason text,
  reviewed_by text, reviewed_at timestamptz, decision_note text,
  promoted_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_row_number, target_entity)
);
CREATE INDEX ON ezzie_import.staging_rows (batch_id, match_status);

-- Field-level conflicts between sources ("Needs Attention"). Identical facts never land here.
CREATE TABLE ezzie_import.fact_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_entity text NOT NULL,
  canonical_id uuid,
  field_name text NOT NULL,
  existing_value jsonb, existing_source text, existing_source_record_id text,
  incoming_value jsonb, incoming_row_id uuid REFERENCES ezzie_import.staging_rows(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_existing','resolved_incoming','resolved_other','dismissed')),
  resolution_value jsonb, resolution_evidence text, resolved_by text, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ezzie_import.fact_conflicts (status);

GRANT ALL ON ALL TABLES IN SCHEMA ezzie_import TO service_role;
