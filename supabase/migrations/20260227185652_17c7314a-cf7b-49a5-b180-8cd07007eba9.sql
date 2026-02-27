
-- Enums
CREATE TYPE public.project_status AS ENUM ('active', 'paused', 'complete');
CREATE TYPE public.project_member_role AS ENUM ('contractor', 'manager', 'read_only');
CREATE TYPE public.task_stage AS ENUM ('Ready', 'In Progress', 'Not Ready', 'Hold', 'Done');
CREATE TYPE public.task_priority AS ENUM ('1 – Now', '2 – This Week', '3 – Soon', '4 – When Time', '5 – Later');
CREATE TYPE public.materials_status AS ENUM ('Yes', 'Partial', 'No');
CREATE TYPE public.scope_status AS ENUM ('Draft', 'Converted', 'Archived');
CREATE TYPE public.scope_member_role AS ENUM ('viewer', 'editor', 'manager');
CREATE TYPE public.unit_type AS ENUM ('each', 'sqft', 'lf', 'piece');
CREATE TYPE public.pricing_status AS ENUM ('Priced', 'Needs Pricing');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer function for admin check
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = _user_id), false);
$$;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  status public.project_status NOT NULL DEFAULT 'active',
  scope_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Project members
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_member_role NOT NULL DEFAULT 'contractor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Scopes
CREATE TABLE public.scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  address TEXT NOT NULL,
  status public.scope_status NOT NULL DEFAULT 'Draft',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  converted_project_id UUID REFERENCES public.projects(id),
  baseline_locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scopes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ADD CONSTRAINT projects_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.scopes(id);

-- Scope members
CREATE TABLE public.scope_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.scope_member_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scope_id, user_id)
);
ALTER TABLE public.scope_members ENABLE ROW LEVEL SECURITY;

-- Cost items
CREATE TABLE public.cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit_type public.unit_type NOT NULL DEFAULT 'each',
  piece_length_ft NUMERIC,
  default_total_cost NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;

-- Scope items
CREATE TABLE public.scope_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES public.scopes(id) ON DELETE CASCADE,
  phase_key TEXT,
  description TEXT NOT NULL,
  cost_item_id UUID REFERENCES public.cost_items(id),
  qty NUMERIC,
  unit TEXT,
  unit_cost_override NUMERIC,
  computed_total NUMERIC,
  pricing_status public.pricing_status NOT NULL DEFAULT 'Needs Pricing',
  added_after_conversion BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scope_items ENABLE ROW LEVEL SECURITY;

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage public.task_stage NOT NULL DEFAULT 'Ready',
  priority public.task_priority NOT NULL DEFAULT '2 – This Week',
  due_date DATE,
  materials_on_site public.materials_status NOT NULL DEFAULT 'No',
  room_area TEXT,
  task TEXT NOT NULL,
  trade TEXT,
  assigned_to_user_id UUID REFERENCES auth.users(id),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  source_scope_item_id UUID REFERENCES public.scope_items(id),
  actual_total_cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.project_members WHERE user_id = _user_id AND project_id = _project_id); $$;

CREATE OR REPLACE FUNCTION public.is_scope_member(_user_id UUID, _scope_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.scope_members WHERE user_id = _user_id AND scope_id = _scope_id); $$;

CREATE OR REPLACE FUNCTION public.get_scope_role(_user_id UUID, _scope_id UUID)
RETURNS public.scope_member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.scope_members WHERE user_id = _user_id AND scope_id = _scope_id; $$;

CREATE OR REPLACE FUNCTION public.get_project_role(_user_id UUID, _project_id UUID)
RETURNS public.project_member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.project_members WHERE user_id = _user_id AND project_id = _project_id; $$;

-- RLS: Projects
CREATE POLICY "Members and admins can view projects" ON public.projects FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), id)
);
CREATE POLICY "Auth can insert projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Members can update projects" ON public.projects FOR UPDATE USING (
  public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), id)
);
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE USING (public.is_admin(auth.uid()));

-- RLS: Project members
CREATE POLICY "View project members" ON public.project_members FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id)
);
CREATE POLICY "Insert project members" ON public.project_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Delete project members" ON public.project_members FOR DELETE USING (public.is_admin(auth.uid()));

-- RLS: Tasks
CREATE POLICY "View tasks" ON public.tasks FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_project_member(auth.uid(), project_id)
);
CREATE POLICY "Insert tasks" ON public.tasks FOR INSERT WITH CHECK (
  public.is_admin(auth.uid()) OR (public.is_project_member(auth.uid(), project_id) AND public.get_project_role(auth.uid(), project_id) IN ('contractor', 'manager'))
);
CREATE POLICY "Update tasks" ON public.tasks FOR UPDATE USING (
  public.is_admin(auth.uid()) OR (public.is_project_member(auth.uid(), project_id) AND public.get_project_role(auth.uid(), project_id) IN ('contractor', 'manager'))
);
CREATE POLICY "Delete tasks" ON public.tasks FOR DELETE USING (public.is_admin(auth.uid()));

-- RLS: Scopes
CREATE POLICY "View scopes" ON public.scopes FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_scope_member(auth.uid(), id)
);
CREATE POLICY "Insert scopes" ON public.scopes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Update scopes" ON public.scopes FOR UPDATE USING (
  public.is_admin(auth.uid()) OR public.get_scope_role(auth.uid(), id) IN ('editor', 'manager')
);
CREATE POLICY "Delete scopes" ON public.scopes FOR DELETE USING (public.is_admin(auth.uid()));

-- RLS: Scope members
CREATE POLICY "View scope members" ON public.scope_members FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_scope_member(auth.uid(), scope_id)
);
CREATE POLICY "Insert scope members" ON public.scope_members FOR INSERT WITH CHECK (
  public.is_admin(auth.uid()) OR public.get_scope_role(auth.uid(), scope_id) IN ('editor', 'manager')
);
CREATE POLICY "Delete scope members" ON public.scope_members FOR DELETE USING (public.is_admin(auth.uid()));

-- RLS: Scope items
CREATE POLICY "View scope items" ON public.scope_items FOR SELECT USING (
  public.is_admin(auth.uid()) OR public.is_scope_member(auth.uid(), scope_id)
);
CREATE POLICY "Insert scope items" ON public.scope_items FOR INSERT WITH CHECK (
  public.is_admin(auth.uid()) OR public.get_scope_role(auth.uid(), scope_id) IN ('editor', 'manager')
);
CREATE POLICY "Update scope items" ON public.scope_items FOR UPDATE USING (
  public.is_admin(auth.uid()) OR public.get_scope_role(auth.uid(), scope_id) IN ('editor', 'manager')
);
CREATE POLICY "Delete scope items" ON public.scope_items FOR DELETE USING (public.is_admin(auth.uid()));

-- RLS: Cost items
CREATE POLICY "View cost items" ON public.cost_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin insert cost items" ON public.cost_items FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin update cost items" ON public.cost_items FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin delete cost items" ON public.cost_items FOR DELETE USING (public.is_admin(auth.uid()));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scopes_updated_at BEFORE UPDATE ON public.scopes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scope_items_updated_at BEFORE UPDATE ON public.scope_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cost_items_updated_at BEFORE UPDATE ON public.cost_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
