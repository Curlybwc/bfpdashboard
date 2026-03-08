
-- Task comments table
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- View: project members can see comments
CREATE POLICY "View task comments"
  ON public.task_comments FOR SELECT
  USING (
    is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
        AND is_project_member(auth.uid(), t.project_id)
    )
  );

-- Insert: admins, managers, contractors
CREATE POLICY "Insert task comments"
  ON public.task_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND (
      is_admin(auth.uid()) OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_comments.task_id
          AND get_project_role(auth.uid(), t.project_id) IN ('manager', 'contractor')
      )
    )
  );

-- Delete: only admins or comment owner
CREATE POLICY "Delete task comments"
  ON public.task_comments FOR DELETE
  USING (
    user_id = auth.uid() OR is_admin(auth.uid())
  );
