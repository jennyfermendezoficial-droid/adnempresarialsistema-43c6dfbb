REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_active_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.is_active_user(uuid) FROM authenticated;