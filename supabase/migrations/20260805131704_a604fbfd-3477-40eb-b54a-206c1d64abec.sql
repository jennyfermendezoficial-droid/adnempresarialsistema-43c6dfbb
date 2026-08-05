REVOKE ALL ON public.notificaciones FROM anon;
REVOKE ALL ON public.notificaciones FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON public.notificaciones TO authenticated;
GRANT ALL ON public.notificaciones TO service_role;

REVOKE ALL ON public.chats_1a1 FROM anon;
REVOKE ALL ON public.chats_1a1 FROM authenticated;
GRANT SELECT, INSERT ON public.chats_1a1 TO authenticated;
GRANT ALL ON public.chats_1a1 TO service_role;