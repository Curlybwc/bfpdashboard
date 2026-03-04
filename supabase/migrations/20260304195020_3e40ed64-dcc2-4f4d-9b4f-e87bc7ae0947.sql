
-- Create profile_aliases table
CREATE TABLE public.profile_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique alias across all users
CREATE UNIQUE INDEX profile_aliases_alias_unique ON public.profile_aliases (lower(alias));

-- Unique per user (prevent same alias twice for one user)
CREATE UNIQUE INDEX profile_aliases_user_alias_unique ON public.profile_aliases (user_id, lower(alias));

-- Enable RLS
ALTER TABLE public.profile_aliases ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user
CREATE POLICY "Authenticated users can view aliases"
  ON public.profile_aliases FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- INSERT: admin only
CREATE POLICY "Admins can insert aliases"
  ON public.profile_aliases FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));

-- UPDATE: admin only
CREATE POLICY "Admins can update aliases"
  ON public.profile_aliases FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()));

-- DELETE: admin only
CREATE POLICY "Admins can delete aliases"
  ON public.profile_aliases FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));
