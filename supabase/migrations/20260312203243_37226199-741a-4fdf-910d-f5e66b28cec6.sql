
-- Add assignment_mode and default_candidates to recipe steps
ALTER TABLE public.task_recipe_steps
  ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'solo',
  ADD COLUMN IF NOT EXISTS default_candidate_user_ids uuid[] NOT NULL DEFAULT '{}';

-- Also need a junction table for recipe step default candidates (better relational design)
-- Actually, using a uuid[] array is simpler and sufficient for this use case since
-- recipes are templates and candidates are just defaults to pre-populate.
