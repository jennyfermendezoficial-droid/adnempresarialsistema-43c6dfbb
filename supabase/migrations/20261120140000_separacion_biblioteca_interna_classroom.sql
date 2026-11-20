-- DESPLIEGUE 1 - ADN Empresarial
-- Preparacion compatible para futura separacion de Biblioteca interna y Classroom.
-- SOLO agrega metadatos opcionales. No activa bibliotecas ni modifica seguridad.
-- No cambia cursos existentes, permisos, modulos, lecciones ni progreso.
-- No crea triggers ni modifica politicas RLS.

BEGIN;

ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS audience text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cursos_audience_check'
      AND conrelid = 'public.cursos'::regclass
  ) THEN
    ALTER TABLE public.cursos
      ADD CONSTRAINT cursos_audience_check
      CHECK (audience IS NULL OR audience IN ('internal', 'student'));
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.cursos.audience IS
  'Clasificacion futura del curso: internal (Biblioteca interna) o student (Classroom). NULL durante el despliegue 1.';

COMMIT;

-- VALIDACION POSTERIOR (solo lectura):
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'cursos'
--   AND column_name = 'audience';
--
-- SELECT audience, COUNT(*)
-- FROM public.cursos
-- GROUP BY audience;
--
-- Resultado esperado en despliegue 1: todos los registros existentes conservan
-- audience NULL. La aplicacion actual no debe filtrar ni exigir esta columna.
