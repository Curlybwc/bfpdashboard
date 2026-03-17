
-- 1. Add venmo_manual to worker_payment_source enum
ALTER TYPE worker_payment_source ADD VALUE IF NOT EXISTS 'venmo_manual';
