
-- Crew groups table
CREATE TABLE public.crew_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crew_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View crew groups" ON public.crew_groups FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert crew groups" ON public.crew_groups FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Update crew groups" ON public.crew_groups FOR UPDATE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Delete crew groups" ON public.crew_groups FOR DELETE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE TRIGGER update_crew_groups_updated_at BEFORE UPDATE ON public.crew_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Crew group members table
CREATE TABLE public.crew_group_members (
  crew_group_id uuid NOT NULL REFERENCES public.crew_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (crew_group_id, user_id)
);

ALTER TABLE public.crew_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View crew group members" ON public.crew_group_members FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Insert crew group members" ON public.crew_group_members FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
CREATE POLICY "Delete crew group members" ON public.crew_group_members FOR DELETE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));
