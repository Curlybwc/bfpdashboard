
-- Allow the trigger (service role via SECURITY DEFINER) to insert org members
-- Also allow self-insert during signup flow
CREATE POLICY "System can insert org members"
  ON public.org_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin(auth.uid(), org_id));

-- Drop the narrower admin-only insert policy since the new one covers both cases
DROP POLICY IF EXISTS "Org admins can insert members" ON public.org_members;

-- Replace handle_new_user to auto-create org
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _is_first boolean;
  _org_id uuid;
  _full_name text;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Check if this is the very first user (legacy global admin)
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true) INTO _is_first;

  -- Create an organization for this user
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NULLIF(_full_name, '') || '''s Org', 'My Organization'))
  RETURNING id INTO _org_id;

  -- Create profile with org_id
  INSERT INTO public.profiles (id, full_name, is_admin, org_id)
  VALUES (NEW.id, _full_name, _is_first, _org_id);

  -- Add user as org owner
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;
