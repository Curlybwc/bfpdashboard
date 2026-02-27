ALTER TABLE public.tasks
ADD COLUMN claimed_by_user_id uuid REFERENCES public.profiles(id),
ADD COLUMN claimed_at timestamptz,
ADD COLUMN started_by_user_id uuid REFERENCES public.profiles(id),
ADD COLUMN started_at timestamptz,
ADD COLUMN completed_at timestamptz;