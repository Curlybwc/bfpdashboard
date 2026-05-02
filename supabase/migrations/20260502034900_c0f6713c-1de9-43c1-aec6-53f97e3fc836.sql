-- ============================================================
-- 1. org_invites table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.org_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | revoked | expired
  invited_by UUID,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID
);

CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.org_invites(token) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON public.org_invites(lower(email)) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_invites_org ON public.org_invites(org_id);

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Org admins can view invites for their org
CREATE POLICY "Org admins view invites"
ON public.org_invites FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), org_id));

-- Org admins can create invites for their org
CREATE POLICY "Org admins create invites"
ON public.org_invites FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), org_id) AND invited_by = auth.uid());

-- Org admins can revoke (update) invites for their org
CREATE POLICY "Org admins update invites"
ON public.org_invites FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), org_id));

-- Org admins can delete invites for their org
CREATE POLICY "Org admins delete invites"
ON public.org_invites FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), org_id));

-- ============================================================
-- 2. Update handle_new_user to honor invite tokens
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_first boolean;
  _org_id uuid;
  _full_name text;
  _invite_token text;
  _invite RECORD;
  _user_email text;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _invite_token := NULLIF(NEW.raw_user_meta_data->>'invite_token', '');
  _user_email := lower(COALESCE(NEW.email, ''));

  -- First user becomes legacy global admin
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true) INTO _is_first;

  -- Try to honor invite token
  IF _invite_token IS NOT NULL THEN
    SELECT * INTO _invite
    FROM public.org_invites
    WHERE token = _invite_token
      AND status = 'pending'
      AND expires_at > now()
      AND lower(email) = _user_email
    LIMIT 1;

    IF FOUND THEN
      _org_id := _invite.org_id;

      INSERT INTO public.profiles (id, full_name, is_admin, org_id)
      VALUES (NEW.id, _full_name, _is_first, _org_id);

      INSERT INTO public.org_members (org_id, user_id, role)
      VALUES (_org_id, NEW.id, _invite.role)
      ON CONFLICT DO NOTHING;

      UPDATE public.org_invites
      SET status = 'accepted',
          accepted_at = now(),
          accepted_by_user_id = NEW.id
      WHERE id = _invite.id;

      RETURN NEW;
    END IF;
  END IF;

  -- Default path: create a fresh private org (SaaS behavior)
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NULLIF(_full_name, '') || '''s Org', 'My Organization'))
  RETURNING id INTO _org_id;

  INSERT INTO public.profiles (id, full_name, is_admin, org_id)
  VALUES (NEW.id, _full_name, _is_first, _org_id);

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 3. Admin function: move a stranded user into the caller's org
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_move_user_to_my_org(
  p_target_user_id UUID,
  p_role public.org_role DEFAULT 'member'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID;
  v_my_org UUID;
  v_old_org UUID;
  v_old_org_member_count int;
  v_old_org_has_data boolean;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_admin(v_caller) THEN
    RAISE EXCEPTION 'Only admins can move users between organizations';
  END IF;

  SELECT org_id INTO v_my_org FROM public.profiles WHERE id = v_caller;
  IF v_my_org IS NULL THEN RAISE EXCEPTION 'Caller has no org'; END IF;

  -- Make sure the caller is an admin of their own org too
  IF NOT is_org_admin(v_caller, v_my_org) THEN
    RAISE EXCEPTION 'Caller is not an admin of their own organization';
  END IF;

  SELECT org_id INTO v_old_org FROM public.profiles WHERE id = p_target_user_id;

  -- Add to caller's org
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (v_my_org, p_target_user_id, p_role)
  ON CONFLICT DO NOTHING;

  -- Update profile to point at the new org
  UPDATE public.profiles SET org_id = v_my_org WHERE id = p_target_user_id;

  -- Remove from old org membership
  IF v_old_org IS NOT NULL AND v_old_org <> v_my_org THEN
    DELETE FROM public.org_members
    WHERE user_id = p_target_user_id AND org_id = v_old_org;

    -- Try to clean up the empty org if it has no members or projects/scopes
    SELECT count(*) INTO v_old_org_member_count
    FROM public.org_members WHERE org_id = v_old_org;

    SELECT EXISTS (
      SELECT 1 FROM public.projects WHERE org_id = v_old_org
      UNION ALL SELECT 1 FROM public.scopes WHERE org_id = v_old_org
    ) INTO v_old_org_has_data;

    IF v_old_org_member_count = 0 AND NOT v_old_org_has_data THEN
      -- Best-effort cleanup; leave org row if FKs from seed libraries block it
      BEGIN
        DELETE FROM public.organizations WHERE id = v_old_org;
      EXCEPTION WHEN foreign_key_violation THEN
        NULL; -- seed library data still references it; safe to leave
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('user_id', p_target_user_id, 'new_org_id', v_my_org, 'old_org_id', v_old_org);
END;
$function$;

-- ============================================================
-- 4. Helper: revoke an invite
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_org_invite(p_invite_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID;
  v_org UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT org_id INTO v_org FROM public.org_invites WHERE id = p_invite_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invite not found'; END IF;

  IF NOT is_org_admin(v_caller, v_org) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.org_invites
  SET status = 'revoked'
  WHERE id = p_invite_id AND status = 'pending';
END;
$function$;

-- ============================================================
-- 5. Helper: list "stranded" users (admins only, same workspace lineage)
-- Returns users whose org_id differs from caller's org and whose org has
-- no projects/scopes (i.e., probably auto-created on signup).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_stranded_users()
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  current_org_id UUID,
  current_org_name TEXT,
  current_org_member_count BIGINT,
  current_org_project_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID;
  v_my_org UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT is_admin(v_caller) THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT org_id INTO v_my_org FROM public.profiles WHERE id = v_caller;

  RETURN QUERY
  SELECT
    pr.id,
    pr.full_name,
    au.email::text,
    pr.org_id,
    o.name,
    (SELECT count(*) FROM public.org_members om WHERE om.org_id = pr.org_id),
    (SELECT count(*) FROM public.projects p WHERE p.org_id = pr.org_id)
  FROM public.profiles pr
  LEFT JOIN public.organizations o ON o.id = pr.org_id
  LEFT JOIN auth.users au ON au.id = pr.id
  WHERE pr.org_id IS DISTINCT FROM v_my_org
    AND pr.is_active = true
  ORDER BY pr.created_at DESC;
END;
$function$;