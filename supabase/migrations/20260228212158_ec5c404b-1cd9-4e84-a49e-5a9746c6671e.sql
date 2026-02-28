
-- 1. Add can_manage_projects column to profiles
ALTER TABLE public.profiles ADD COLUMN can_manage_projects boolean NOT NULL DEFAULT false;

-- 2. Create helper function
CREATE OR REPLACE FUNCTION public.can_manage_projects(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT can_manage_projects FROM public.profiles WHERE id = _user_id), false);
$$;

-- 3. Tighten INSERT on projects
DROP POLICY IF EXISTS "Auth can insert projects" ON public.projects;
CREATE POLICY "Auth can insert projects" ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid()) OR can_manage_projects(auth.uid())
  );

-- 4. Tighten INSERT on scopes
DROP POLICY IF EXISTS "Insert scopes" ON public.scopes;
CREATE POLICY "Insert scopes" ON public.scopes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid()) OR can_manage_projects(auth.uid())
  );

-- 5. Protect is_admin column from self-escalation
CREATE OR REPLACE FUNCTION public.protect_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can change the is_admin flag';
    END IF;
  END IF;
  IF NEW.can_manage_projects IS DISTINCT FROM OLD.can_manage_projects THEN
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can change the can_manage_projects flag';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_admin_flag_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_flag();

-- 6. Protect actual_total_cost from non-admins
CREATE OR REPLACE FUNCTION public.protect_actual_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.actual_total_cost IS DISTINCT FROM OLD.actual_total_cost THEN
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can update actual_total_cost';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_actual_cost_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_actual_cost();
