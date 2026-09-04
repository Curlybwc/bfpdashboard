REVOKE ALL ON FUNCTION public.invalidate_company_qb_mappings(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_company_qb_connection_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_company_qb_mappings(uuid, text) TO service_role;