-- Compatibilidad entre el registro bancario del profesor y Pagos e informes.
-- El formulario del profesor usa profesor_bancos_catalogo; Pagos consume bancos_catalogo.
DO $$
BEGIN
  IF to_regclass('public.bancos_catalogo') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW public.bancos_catalogo AS
      SELECT id, nombre, imagen_url AS logo_url
      FROM public.profesor_bancos_catalogo
      WHERE activo = true
    $view$;
  END IF;
END $$;

GRANT SELECT ON public.bancos_catalogo TO authenticated;
