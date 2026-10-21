-- QuickBooks Write-Back Stage 1: bank mirror + classification queue (FOBAR first)
-- Canonical authority: 05.02 Blueprint §25 / PRD §22 (FR-05.02-17..22).
-- Stage 1 writes NOTHING to QuickBooks. Nouns: import batches + bank transactions.
-- Proposal fields live on the bank transaction in Stage 1; promotion into
-- bookkeeping_financial_events happens at Stage 2 push time.
-- APPLIED to Ezzie Staging 2026-10-21 via the Supabase connector (HTTP 201).
-- Loader note: batch inserts must carry ON CONFLICT (id) DO NOTHING so a
-- re-run is a clean no-op end to end (transaction rows already dedupe on
-- their unique key — verified 2026-10-21: re-run left 24 rows / 1 batch).

create table public.bookkeeping_bank_import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.business_organizations(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  source text not null check (source in ('plaid_maven_bridge','csv','teller','plaid_app')),
  source_detail text,
  period_start date,
  period_end date,
  row_count integer not null default 0,
  imported_by text not null default 'maven',
  imported_at timestamptz not null default now(),
  notes text
);

create table public.bookkeeping_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.business_organizations(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  batch_id uuid not null references public.bookkeeping_bank_import_batches(id) on delete restrict,
  source text not null check (source in ('plaid_maven_bridge','csv','teller','plaid_app')),
  source_transaction_id text not null,
  txn_date date not null,
  raw_name text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  amount_out numeric(14,2) not null,
  signed_amount numeric(14,2) not null,
  pending boolean not null default false,
  proposal_account text,
  proposal_class text,
  proposal_basis text,
  proposal_state text not null default 'unidentified'
    check (proposal_state in ('proposed','needs_review','unidentified')),
  review_state text not null default 'unreviewed'
    check (review_state in ('unreviewed','approved','edited')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (financial_account_id, source, source_transaction_id)
);

create index bookkeeping_bank_txn_queue_idx
  on public.bookkeeping_bank_transactions (company_id, txn_date, proposal_state);
create index bookkeeping_bank_batches_company_idx
  on public.bookkeeping_bank_import_batches (company_id, imported_at desc);

alter table public.bookkeeping_bank_import_batches enable row level security;
alter table public.bookkeeping_bank_transactions enable row level security;

-- Explicit grants (Supabase post-2026-10-30 rule). Stage 1 data flows through
-- service_role only (Maven bridge loader). Authenticated human access is
-- defined in the W4 queue-UI batch, once the organizations <->
-- business_organizations mapping for the queue is settled with evidence;
-- RLS stays ON with no permissive policy in the meantime.
grant all on public.bookkeeping_bank_import_batches to service_role;
grant all on public.bookkeeping_bank_transactions to service_role;
