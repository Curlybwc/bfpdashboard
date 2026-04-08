
-- Create org role enum
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member');

-- Organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Org members table (junction between users and orgs)
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE user_id = _user_id AND org_id = _org_id);
$$;

CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid, _org_id uuid)
RETURNS org_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT role FROM public.org_members WHERE user_id = _user_id AND org_id = _org_id;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND role IN ('owner', 'admin')
  );
$$;

-- RLS: organizations visible to their members
CREATE POLICY "Org members can view their org"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "Org owners can update their org"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.get_org_role(auth.uid(), id) = 'owner')
  WITH CHECK (public.get_org_role(auth.uid(), id) = 'owner');

-- RLS: org_members visible to org members, manageable by org admins
CREATE POLICY "Org members can view membership"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org admins can insert members"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), org_id));

CREATE POLICY "Org admins can update members"
  ON public.org_members FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id));

CREATE POLICY "Org admins can delete members"
  ON public.org_members FOR DELETE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id));

-- Add org_id to projects
ALTER TABLE public.projects ADD COLUMN org_id uuid REFERENCES public.organizations(id);

-- Add org_id to profiles for quick lookup
ALTER TABLE public.profiles ADD COLUMN org_id uuid REFERENCES public.organizations(id);

-- Updated at trigger for organizations
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
