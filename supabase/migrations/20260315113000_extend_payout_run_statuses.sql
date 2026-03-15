-- Extend payout run lifecycle for submission outcomes
ALTER TYPE public.payout_run_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.payout_run_status ADD VALUE IF NOT EXISTS 'partially_failed';
