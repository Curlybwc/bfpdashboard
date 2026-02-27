ALTER TABLE public.project_members
ADD CONSTRAINT project_members_user_id_profiles_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

ALTER TABLE public.scope_members
ADD CONSTRAINT scope_members_user_id_profiles_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;