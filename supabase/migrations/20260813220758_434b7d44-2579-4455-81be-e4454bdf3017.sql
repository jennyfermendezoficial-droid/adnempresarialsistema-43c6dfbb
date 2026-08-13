REVOKE ALL ON FUNCTION public.dar_puntos(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_post_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_comentario_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_comentario_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_like_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_like_del() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_leccion_completada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perfiles_publicos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfiles_publicos(uuid[]) TO authenticated;