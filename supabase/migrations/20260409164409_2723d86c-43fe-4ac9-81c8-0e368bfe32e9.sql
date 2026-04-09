
-- Phase 1: Add org_id to scopes
ALTER TABLE public.scopes ADD COLUMN org_id uuid REFERENCES public.organizations(id);

-- Backfill existing scopes from creator's profile org_id
UPDATE public.scopes s
SET org_id = COALESCE(
  (SELECT org_id FROM public.profiles WHERE id = s.created_by),
  (SELECT id FROM public.organizations LIMIT 1)
)
WHERE s.org_id IS NULL;

-- Make org_id NOT NULL after backfill
ALTER TABLE public.scopes ALTER COLUMN org_id SET NOT NULL;

-- Phase 1: Update scopes RLS
DROP POLICY IF EXISTS "View scopes" ON public.scopes;
DROP POLICY IF EXISTS "Insert scopes" ON public.scopes;
DROP POLICY IF EXISTS "Update scopes" ON public.scopes;
DROP POLICY IF EXISTS "Delete scopes" ON public.scopes;

CREATE POLICY "View scopes" ON public.scopes FOR SELECT TO authenticated
USING (
  is_org_member(auth.uid(), org_id) AND (
    is_org_admin(auth.uid(), org_id) OR is_scope_member(auth.uid(), id)
  )
);

CREATE POLICY "Insert scopes" ON public.scopes FOR INSERT TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  (is_admin(auth.uid()) OR can_manage_projects(auth.uid()))
);

CREATE POLICY "Update scopes" ON public.scopes FOR UPDATE TO authenticated
USING (
  is_org_member(auth.uid(), org_id) AND (
    is_org_admin(auth.uid(), org_id) OR
    get_scope_role(auth.uid(), id) IN ('editor', 'manager')
  )
);

CREATE POLICY "Delete scopes" ON public.scopes FOR DELETE TO authenticated
USING (
  is_org_member(auth.uid(), org_id) AND is_org_admin(auth.uid(), org_id)
);

-- Phase 2: Tighten projects RLS
DROP POLICY IF EXISTS "Members and admins can view projects" ON public.projects;
DROP POLICY IF EXISTS "Auth can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Members can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;

CREATE POLICY "Members and admins can view projects" ON public.projects FOR SELECT TO authenticated
USING (
  is_org_member(auth.uid(), org_id) AND (
    is_admin(auth.uid()) OR is_project_member(auth.uid(), id)
  )
);

CREATE POLICY "Auth can insert projects" ON public.projects FOR INSERT TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid()) AND
  (is_admin(auth.uid()) OR can_manage_projects(auth.uid()))
);

CREATE POLICY "Members can update projects" ON public.projects FOR UPDATE TO authenticated
USING (
  is_org_member(auth.uid(), org_id) AND (
    is_admin(auth.uid()) OR is_project_member(auth.uid(), id)
  )
);

CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE TO authenticated
USING (
  is_org_member(auth.uid(), org_id) AND is_org_admin(auth.uid(), org_id)
);

-- Phase 3: Profile visibility for org members
-- Create helper function to avoid recursion
CREATE OR REPLACE FUNCTION public.is_same_org(_user_id_a uuid, _user_id_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members om1
    JOIN public.org_members om2 ON om1.org_id = om2.org_id
    WHERE om1.user_id = _user_id_a AND om2.user_id = _user_id_b
  );
$$;

CREATE POLICY "Org members can view each other"
ON public.profiles FOR SELECT TO authenticated
USING (is_same_org(auth.uid(), id));
