
-- Upgrade existing global admins to org admins
UPDATE public.org_members om
SET role = 'admin'
WHERE role = 'member'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = om.user_id AND p.is_admin = true);

-- Allow global admins to manage invites in their own org
DROP POLICY IF EXISTS "Org admins create invites" ON public.org_invites;
CREATE POLICY "Org admins create invites"
ON public.org_invites FOR INSERT TO authenticated
WITH CHECK (
  (is_org_admin(auth.uid(), org_id) OR (is_admin(auth.uid()) AND org_id = get_user_org_id(auth.uid())))
  AND invited_by = auth.uid()
);

DROP POLICY IF EXISTS "Org admins view invites" ON public.org_invites;
CREATE POLICY "Org admins view invites"
ON public.org_invites FOR SELECT TO authenticated
USING (is_org_admin(auth.uid(), org_id) OR (is_admin(auth.uid()) AND org_id = get_user_org_id(auth.uid())));

DROP POLICY IF EXISTS "Org admins update invites" ON public.org_invites;
CREATE POLICY "Org admins update invites"
ON public.org_invites FOR UPDATE TO authenticated
USING (is_org_admin(auth.uid(), org_id) OR (is_admin(auth.uid()) AND org_id = get_user_org_id(auth.uid())));

DROP POLICY IF EXISTS "Org admins delete invites" ON public.org_invites;
CREATE POLICY "Org admins delete invites"
ON public.org_invites FOR DELETE TO authenticated
USING (is_org_admin(auth.uid(), org_id) OR (is_admin(auth.uid()) AND org_id = get_user_org_id(auth.uid())));
