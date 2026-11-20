-- FASE 2 - ADN Empresarial
-- Separa la biblioteca interna del Classroom de alumnas.
-- Esta migracion agrega el modelo y endurece RLS; NO clasifica cursos existentes.
-- Los cursos legacy quedan con audience NULL y solo el personal puede verlos
-- hasta que el administrador les asigne explicitamente 'internal' o 'student'.
-- Ejecutar primero en una base de pruebas, nunca directamente en produccion.

BEGIN;

-- 1) Clasificacion del publico. NULL se permite temporalmente para cursos legacy.
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
  'Audiencia del curso: internal (administradores/profesores) o student (Classroom). NULL solo para registros legacy pendientes de clasificacion.';

-- 2) Helper seguro: el personal ve cualquier curso; las alumnas solo cursos
-- Classroom para los que tengan un permiso explicito.
CREATE OR REPLACE FUNCTION public.puede_ver_curso(_curso_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'soporte'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.cursos c
        JOIN public.permisos_cursos p
          ON p.curso_id = c.id
        WHERE c.id = _curso_id
          AND c.audience = 'student'
          AND p.usuario_id = auth.uid()
      )
    );
$function$;

-- Helper para proteger el acceso directo a una leccion por UUID.
CREATE OR REPLACE FUNCTION public.puede_ver_leccion(_leccion_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.lecciones l
    JOIN public.modulos_curso m ON m.id = l.modulo_id
    WHERE l.id = _leccion_id
      AND public.puede_ver_curso(m.curso_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_curso(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_ver_leccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_curso(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_leccion(uuid) TO authenticated;

-- 3) Validacion adicional: crear curso requiere audience y solo admin
-- puede cambiar la clasificacion despues de creado.
CREATE OR REPLACE FUNCTION public.validar_audience_curso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.audience IS NULL THEN
    RAISE EXCEPTION 'Debes seleccionar Biblioteca interna o Classroom al crear el curso.';
  END IF;

  IF NEW.audience NOT IN ('internal', 'student') THEN
    RAISE EXCEPTION 'Clasificacion de curso no valida.';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Solo un administrador puede crear cursos.';
    END IF;

    IF NEW.audience IS DISTINCT FROM OLD.audience THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar la clasificacion del curso.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cursos_validar_audience ON public.cursos;
CREATE TRIGGER cursos_validar_audience
BEFORE INSERT OR UPDATE OF audience ON public.cursos
FOR EACH ROW
EXECUTE FUNCTION public.validar_audience_curso();

-- 4) Reemplazar politicas permisivas originales. En PostgreSQL las politicas
-- permisivas se combinan con OR; por eso se eliminan las politicas abiertas.
DROP POLICY IF EXISTS "cursos_select" ON public.cursos;
DROP POLICY IF EXISTS "cursos_staff_write" ON public.cursos;
DROP POLICY IF EXISTS "cursos_audience_select" ON public.cursos;
DROP POLICY IF EXISTS "cursos_admin_write" ON public.cursos;

CREATE POLICY "cursos_audience_select"
ON public.cursos
FOR SELECT
TO authenticated
USING (public.puede_ver_curso(id));

CREATE POLICY "cursos_admin_write"
ON public.cursos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5) Modulos: lectura segun audiencia del curso; escritura solo personal.
DROP POLICY IF EXISTS "modulos_select" ON public.modulos_curso;
DROP POLICY IF EXISTS "modulos_staff_write" ON public.modulos_curso;
DROP POLICY IF EXISTS "modulos_audience_select" ON public.modulos_curso;
DROP POLICY IF EXISTS "modulos_staff_write_scoped" ON public.modulos_curso;

CREATE POLICY "modulos_audience_select"
ON public.modulos_curso
FOR SELECT
TO authenticated
USING (public.puede_ver_curso(curso_id));

CREATE POLICY "modulos_staff_write_scoped"
ON public.modulos_curso
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'soporte'::public.app_role))
  AND public.puede_ver_curso(curso_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'soporte'::public.app_role))
  AND public.puede_ver_curso(curso_id)
);

-- 6) Lecciones: proteccion por el curso al que pertenece el modulo.
DROP POLICY IF EXISTS "lecciones_select" ON public.lecciones;
DROP POLICY IF EXISTS "lecciones_staff_write" ON public.lecciones;
DROP POLICY IF EXISTS "lecciones_audience_select" ON public.lecciones;
DROP POLICY IF EXISTS "lecciones_staff_write_scoped" ON public.lecciones;

CREATE POLICY "lecciones_audience_select"
ON public.lecciones
FOR SELECT
TO authenticated
USING (public.puede_ver_leccion(id));

CREATE POLICY "lecciones_staff_write_scoped"
ON public.lecciones
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'soporte'::public.app_role))
  AND public.puede_ver_leccion(id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'soporte'::public.app_role))
  AND public.puede_ver_curso(
    (SELECT m.curso_id
     FROM public.modulos_curso m
     WHERE m.id = modulo_id)
  )
);

-- 7) Permisos: cada alumna consulta unicamente sus permisos de Classroom.
DROP POLICY IF EXISTS "permisos_select" ON public.permisos_cursos;
DROP POLICY IF EXISTS "permisos_admin_write" ON public.permisos_cursos;
DROP POLICY IF EXISTS "permisos_student_select" ON public.permisos_cursos;
DROP POLICY IF EXISTS "permisos_admin_manage" ON public.permisos_cursos;

CREATE POLICY "permisos_student_select"
ON public.permisos_cursos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.cursos c
      WHERE c.id = curso_id
        AND c.audience = 'student'
    )
  )
);

CREATE POLICY "permisos_admin_manage"
ON public.permisos_cursos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 8) Progreso: la alumna conserva y administra unicamente su progreso
-- de lecciones a las que tiene acceso. Admin conserva acceso de soporte.
DROP POLICY IF EXISTS "progreso_self" ON public.progreso_lecciones;
DROP POLICY IF EXISTS "progreso_self_classroom" ON public.progreso_lecciones;

CREATE POLICY "progreso_self_classroom"
ON public.progreso_lecciones
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    usuario_id = auth.uid()
    AND public.puede_ver_leccion(leccion_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    usuario_id = auth.uid()
    AND public.puede_ver_leccion(leccion_id)
  )
);

COMMIT;

-- NOTA DE CLASIFICACION:
-- No se actualiza audience de ningun curso existente en esta migracion.
-- Una vez confirmados los UUID exactos desde la auditoria, el administrador
-- asignara explicitamente 'internal' o 'student' a cada curso correspondiente.
-- Los registros legacy con audience NULL quedan visibles solo para admin/soporte.
