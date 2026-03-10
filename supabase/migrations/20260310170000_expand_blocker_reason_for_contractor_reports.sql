-- Expand blocker reasons for contractor issue reporting flow.
ALTER TYPE public.blocker_reason ADD VALUE IF NOT EXISTS 'instruction_mismatch';
ALTER TYPE public.blocker_reason ADD VALUE IF NOT EXISTS 'new_work_discovered';
