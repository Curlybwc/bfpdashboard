-- Add crew task columns to tasks
ALTER TABLE public.tasks
  ADD COLUMN assignment_mode text NOT NULL DEFAULT 'solo',
  ADD COLUMN lead_user_id uuid NULL;

-- Create task_candidates (eligibility pool)
CREATE TABLE public.task_candidates (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_candidates_user ON public.task_candidates(user_id);

-- Create task_workers (active crew)
CREATE TABLE public.task_workers (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_workers_user ON public.task_workers(user_id);
CREATE INDEX idx_task_workers_task_active ON public.task_workers(task_id, active);

-- RLS on task_candidates
ALTER TABLE public.task_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select task candidates"
  ON public.task_candidates FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_candidates.task_id
        AND is_project_member(auth.uid(), t.project_id)
    )
  );

CREATE POLICY "Insert task candidates"
  ON public.task_candidates FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_candidates.task_id
        AND get_project_role(auth.uid(), t.project_id) = 'manager'
    )
  );

CREATE POLICY "Delete task candidates"
  ON public.task_candidates FOR DELETE
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_candidates.task_id
        AND get_project_role(auth.uid(), t.project_id) = 'manager'
    )
  );

-- RLS on task_workers
ALTER TABLE public.task_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select task workers"
  ON public.task_workers FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_workers.task_id
        AND is_project_member(auth.uid(), t.project_id)
    )
  );

CREATE POLICY "Insert task workers"
  ON public.task_workers FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.task_candidates tc
        WHERE tc.task_id = task_workers.task_id
          AND tc.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_workers.task_id
          AND t.stage != 'Done'
      )
    )
  );

CREATE POLICY "Update task workers"
  ON public.task_workers FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR is_admin(auth.uid())
  );

CREATE POLICY "Delete task workers"
  ON public.task_workers FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR is_admin(auth.uid())
  );