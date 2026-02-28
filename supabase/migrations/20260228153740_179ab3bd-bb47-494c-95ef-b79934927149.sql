
-- 1. Create field_captures table
CREATE TABLE public.field_captures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  raw_text text NOT NULL,
  include_materials boolean NOT NULL DEFAULT true,
  ai_output jsonb,
  parse_status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Add columns to tasks
ALTER TABLE public.tasks
  ADD COLUMN needs_manager_review boolean NOT NULL DEFAULT false,
  ADD COLUMN field_capture_id uuid REFERENCES public.field_captures(id) ON DELETE CASCADE;

-- 3. Indexes
CREATE INDEX idx_field_captures_project_id ON public.field_captures(project_id);
CREATE INDEX idx_tasks_needs_manager_review ON public.tasks(needs_manager_review) WHERE needs_manager_review = true;
CREATE INDEX idx_tasks_field_capture_id ON public.tasks(field_capture_id) WHERE field_capture_id IS NOT NULL;

-- 4. Enable RLS on field_captures
ALTER TABLE public.field_captures ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for field_captures
CREATE POLICY "View field captures"
  ON public.field_captures FOR SELECT
  USING (is_admin(auth.uid()) OR is_project_member(auth.uid(), project_id));

CREATE POLICY "Insert field captures"
  ON public.field_captures FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR (get_project_role(auth.uid(), project_id) = ANY (ARRAY['contractor'::project_member_role, 'manager'::project_member_role])));

CREATE POLICY "Update field captures"
  ON public.field_captures FOR UPDATE
  USING (is_admin(auth.uid()) OR (get_project_role(auth.uid(), project_id) = ANY (ARRAY['contractor'::project_member_role, 'manager'::project_member_role])));

CREATE POLICY "Delete field captures"
  ON public.field_captures FOR DELETE
  USING (is_admin(auth.uid()));
