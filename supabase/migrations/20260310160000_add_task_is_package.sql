-- Lightweight discriminator for package container tasks.
-- Keeps existing parent/child model and stage data intact.
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS is_package boolean NOT NULL DEFAULT false;

-- Existing parent tasks become package containers.
UPDATE public.tasks t
SET is_package = true
WHERE EXISTS (
  SELECT 1
  FROM public.tasks c
  WHERE c.parent_task_id = t.id
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_parent_package
  ON public.tasks(project_id, parent_task_id, is_package);
