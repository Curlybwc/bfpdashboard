
-- New enum for blocker reasons
CREATE TYPE public.blocker_reason AS ENUM (
  'missing_materials', 'access_issue', 'waiting_on_approval',
  'hidden_damage', 'tool_equipment', 'waiting_on_trade', 'other'
);

-- New table for task blockers
CREATE TABLE public.task_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reason blocker_reason NOT NULL,
  note text,
  needs_from_manager text,
  blocked_by_user_id uuid NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_blockers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_task_blockers_task_id ON public.task_blockers(task_id);

-- Denormalized column on tasks
ALTER TABLE public.tasks ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;

-- RLS policies
CREATE POLICY "View task blockers" ON public.task_blockers FOR SELECT
USING (EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.id = task_blockers.task_id
    AND (is_admin(auth.uid()) OR is_project_member(auth.uid(), t.project_id))
));

CREATE POLICY "Insert task blockers" ON public.task_blockers FOR INSERT
WITH CHECK (
  blocked_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = task_blockers.task_id
      AND (is_admin(auth.uid())
           OR get_project_role(auth.uid(), t.project_id) IN ('manager','contractor'))
  )
);

CREATE POLICY "Update task blockers" ON public.task_blockers FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.id = task_blockers.task_id
    AND (is_admin(auth.uid())
         OR get_project_role(auth.uid(), t.project_id) = 'manager')
));

CREATE POLICY "Delete task blockers" ON public.task_blockers FOR DELETE
USING (is_admin(auth.uid()));
