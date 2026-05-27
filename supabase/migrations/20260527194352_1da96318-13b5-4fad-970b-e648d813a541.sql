
-- 1) Companies: restrict read access to admins or users whose org owns a project linked to the company
DROP POLICY IF EXISTS "Authenticated read companies" ON public.companies;

CREATE OR REPLACE FUNCTION public.user_can_see_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.org_members om ON om.org_id = p.org_id
    WHERE p.company_id = _company_id AND om.user_id = _user_id
  );
$$;

CREATE POLICY "Org members read related companies"
ON public.companies FOR SELECT TO authenticated
USING (public.user_can_see_company(auth.uid(), id));

-- 2) Tenants: restrict read to admins and project managers (contractors no longer see phone/PII)
DROP POLICY IF EXISTS "View tenants" ON public.tenants;
CREATE POLICY "View tenants"
ON public.tenants FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.get_project_role(auth.uid(), project_id) = 'manager'::public.project_member_role
);

-- 3) Profiles sensitive columns: remove direct read access for non-service callers
REVOKE SELECT (hourly_rate, tax_info_filed, dd_on_file, skip_qb_export) ON public.profiles FROM authenticated;
REVOKE SELECT (hourly_rate, tax_info_filed, dd_on_file, skip_qb_export) ON public.profiles FROM anon;

-- Block non-admins from updating their own pay/payroll flags
CREATE OR REPLACE FUNCTION public.protect_profile_pay_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
      OR NEW.tax_info_filed IS DISTINCT FROM OLD.tax_info_filed
      OR NEW.dd_on_file IS DISTINCT FROM OLD.dd_on_file
      OR NEW.skip_qb_export IS DISTINCT FROM OLD.skip_qb_export)
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can modify payroll fields on profiles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_pay_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_pay_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_pay_fields();

-- Self-read for current user
CREATE OR REPLACE FUNCTION public.get_my_profile_pay()
RETURNS TABLE(hourly_rate numeric, tax_info_filed boolean, dd_on_file boolean, skip_qb_export boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hourly_rate, tax_info_filed, dd_on_file, skip_qb_export
  FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile_pay() TO authenticated;

-- Admin-only listing of pay fields for all profiles
CREATE OR REPLACE FUNCTION public.admin_get_profile_pay()
RETURNS TABLE(id uuid, hourly_rate numeric, tax_info_filed boolean, dd_on_file boolean, skip_qb_export boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  RETURN QUERY SELECT p.id, p.hourly_rate, p.tax_info_filed, p.dd_on_file, p.skip_qb_export FROM public.profiles p;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_pay() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_pay() TO authenticated;

-- 4) Task photos storage: make bucket private and tighten policies
UPDATE storage.buckets SET public = false WHERE id = 'task-photos';

DROP POLICY IF EXISTS "Anyone can view task photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload task photos" ON storage.objects;

CREATE POLICY "Project members can view task photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-photos'
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.task_photos tp
      JOIN public.tasks t ON t.id = tp.task_id
      WHERE tp.storage_path = name
        AND public.is_project_member(auth.uid(), t.project_id)
    )
  )
);

CREATE POLICY "Project members can upload task photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-photos'
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = ((string_to_array(name, '/'))[1])::uuid
        AND public.is_project_member(auth.uid(), t.project_id)
    )
  )
);
