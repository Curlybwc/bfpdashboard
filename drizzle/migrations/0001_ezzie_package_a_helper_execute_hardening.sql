REVOKE EXECUTE ON FUNCTION public.is_shared_core_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_property(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_person(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_business_organization(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shared_core_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_property(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_person(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_business_organization(uuid, uuid) TO authenticated, service_role;