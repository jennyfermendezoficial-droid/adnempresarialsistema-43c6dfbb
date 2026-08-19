-- Estructura jerárquica opcional para Cursos y Clases en vivo del equipo.
-- Los registros existentes siguen siendo contenido público normal por defecto.

ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS parent_curso_id uuid,
  ADD COLUMN IF NOT EXISTS tiene_submodulos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solo_equipo boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cursos_parent_curso_id_fkey'
      AND conrelid = 'public.cursos'::regclass
  ) THEN
    ALTER TABLE public.cursos
      ADD CONSTRAINT cursos_parent_curso_id_fkey
      FOREIGN KEY (parent_curso_id)
      REFERENCES public.cursos(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cursos_parent_curso_id_idx
  ON public.cursos(parent_curso_id, tipo, orden);

CREATE INDEX IF NOT EXISTS cursos_solo_equipo_idx
  ON public.cursos(solo_equipo, tipo, orden);

-- Un hijo siempre pertenece a la misma familia de contenido que su padre,
-- queda marcado como contenido del equipo y no puede apuntarse a sí mismo.
CREATE OR REPLACE FUNCTION public.validar_jerarquia_cursos_equipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _parent_tipo text;
  _parent_equipo boolean;
  _ciclo boolean;
BEGIN
  IF NEW.parent_curso_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NOT NULL AND NEW.parent_curso_id = NEW.id THEN
    RAISE EXCEPTION 'Un bloque no puede ser su propio padre';
  END IF;

  SELECT tipo, solo_equipo
    INTO _parent_tipo, _parent_equipo
  FROM public.cursos
  WHERE id = NEW.parent_curso_id;

  IF _parent_tipo IS NULL THEN
    RAISE EXCEPTION 'El bloque padre no existe';
  END IF;

  IF _parent_tipo <> NEW.tipo THEN
    RAISE EXCEPTION 'El submódulo debe tener el mismo tipo que su bloque padre';
  END IF;

  IF NOT COALESCE(_parent_equipo, false) THEN
    RAISE EXCEPTION 'Solo los bloques exclusivos del equipo pueden contener esta jerarquía';
  END IF;

  NEW.solo_equipo := true;

  IF TG_OP = 'UPDATE' AND NEW.id IS NOT NULL THEN
    WITH RECURSIVE descendientes AS (
      SELECT id
      FROM public.cursos
      WHERE parent_curso_id = NEW.id
      UNION ALL
      SELECT c.id
      FROM public.cursos c
      JOIN descendientes d ON c.parent_curso_id = d.id
    )
    SELECT EXISTS (
      SELECT 1 FROM descendientes WHERE id = NEW.parent_curso_id
    ) INTO _ciclo;

    IF _ciclo THEN
      RAISE EXCEPTION 'La estructura produciría un ciclo de módulos';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_jerarquia_cursos_equipo_trg ON public.cursos;
CREATE TRIGGER validar_jerarquia_cursos_equipo_trg
BEFORE INSERT OR UPDATE OF parent_curso_id, tipo, solo_equipo
ON public.cursos
FOR EACH ROW
EXECUTE FUNCTION public.validar_jerarquia_cursos_equipo();

-- Evita que un usuario sin rol de equipo cree o convierta contenido en "solo_equipo"
-- mediante una llamada directa desde el cliente. Las políticas RLS existentes siguen
-- gobernando los permisos generales de la tabla.
CREATE OR REPLACE FUNCTION public.proteger_contenido_solo_equipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.solo_equipo, false)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
     AND NOT public.has_role(auth.uid(), 'soporte'::public.app_role) THEN
    RAISE EXCEPTION 'Solo Profesores y Líder/Dueño pueden gestionar contenido del equipo';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_contenido_solo_equipo_trg ON public.cursos;
CREATE TRIGGER proteger_contenido_solo_equipo_trg
BEFORE INSERT OR UPDATE OF solo_equipo, parent_curso_id
ON public.cursos
FOR EACH ROW
EXECUTE FUNCTION public.proteger_contenido_solo_equipo();
