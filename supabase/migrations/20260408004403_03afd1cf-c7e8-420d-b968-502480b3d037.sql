
-- Create a default org for existing users and link projects
DO $$
DECLARE
  v_org_id uuid;
  v_admin_id uuid;
BEGIN
  -- Find the existing admin user
  SELECT id INTO v_admin_id FROM public.profiles WHERE is_admin = true LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    -- Create org for the admin
    INSERT INTO public.organizations (name) VALUES ('My Organization')
    RETURNING id INTO v_org_id;

    -- Add admin as owner
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (v_org_id, v_admin_id, 'owner');

    -- Update admin profile
    UPDATE public.profiles SET org_id = v_org_id WHERE id = v_admin_id;

    -- Add all other existing users to this org as members
    INSERT INTO public.org_members (org_id, user_id, role)
    SELECT v_org_id, id, 'member'
    FROM public.profiles
    WHERE id != v_admin_id AND org_id IS NULL;

    -- Update their profiles
    UPDATE public.profiles SET org_id = v_org_id WHERE org_id IS NULL;

    -- Link all existing projects to this org
    UPDATE public.projects SET org_id = v_org_id WHERE org_id IS NULL;
  END IF;
END;
$$;
