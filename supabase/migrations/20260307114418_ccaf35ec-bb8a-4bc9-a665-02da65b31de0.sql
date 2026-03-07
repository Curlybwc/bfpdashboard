
-- Public storage bucket for task photos
INSERT INTO storage.buckets (id, name, public) VALUES ('task-photos', 'task-photos', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload task photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-photos');

CREATE POLICY "Anyone can view task photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'task-photos');

CREATE POLICY "Admins can delete task photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-photos' AND public.is_admin(auth.uid()));

-- task_photos table
CREATE TABLE public.task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('before', 'progress', 'after')),
  storage_path text NOT NULL,
  caption text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

-- RLS: view if admin or project member
CREATE POLICY "View task photos"
ON public.task_photos FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = task_photos.task_id AND public.is_project_member(auth.uid(), t.project_id)
  )
);

-- RLS: insert if admin or contractor/manager on project
CREATE POLICY "Insert task photos"
ON public.task_photos FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid() AND (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.tasks t WHERE t.id = task_photos.task_id
      AND public.get_project_role(auth.uid(), t.project_id) IN ('manager', 'contractor')
    )
  )
);

-- RLS: delete admin only
CREATE POLICY "Delete task photos"
ON public.task_photos FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));
