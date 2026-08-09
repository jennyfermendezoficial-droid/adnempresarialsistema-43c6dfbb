-- 1) Profiles: bloquear cambio de columnas privilegiadas vía política
CREATE OR REPLACE FUNCTION public.profile_privileged_unchanged(_id uuid, _estado public.user_estado, _t1 numeric, _t2 numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _id AND p.estado = _estado
      AND p.tarifa_hora_clase = _t1 AND p.tarifa_sesion_1a1 = _t2
  )
$$;

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
FOR UPDATE TO authenticated
USING ((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (id = auth.uid() AND public.profile_privileged_unchanged(id, estado, tarifa_hora_clase, tarifa_sesion_1a1))
);

-- 2) tareas_entregas: alumnas no pueden tocar calificacion/feedback
CREATE OR REPLACE FUNCTION public.entrega_grade_unchanged(_id uuid, _calif numeric, _feedback text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tareas_entregas e
    WHERE e.id = _id
      AND e.calificacion IS NOT DISTINCT FROM _calif
      AND e.feedback IS NOT DISTINCT FROM _feedback
  )
$$;

DROP POLICY IF EXISTS entregas_update_self ON public.tareas_entregas;
CREATE POLICY entregas_update_self ON public.tareas_entregas
FOR UPDATE TO authenticated
USING (alumna_id = auth.uid())
WITH CHECK (
  alumna_id = auth.uid()
  AND public.entrega_grade_unchanged(id, calificacion, feedback)
  AND EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id = tareas_entregas.tarea_id
      AND (t.curso_id IS NULL OR EXISTS (
        SELECT 1 FROM public.permisos_cursos pc
        WHERE pc.curso_id = t.curso_id AND pc.usuario_id = auth.uid()
      ))
  )
);

-- corregir trigger: tareas no tiene profesor_id, usa created_by
CREATE OR REPLACE FUNCTION public.prevent_self_grading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _creador uuid;
BEGIN
  IF NEW.calificacion IS NOT DISTINCT FROM OLD.calificacion
     AND NEW.feedback IS NOT DISTINCT FROM OLD.feedback THEN
    RETURN NEW;
  END IF;

  IF public.has_role(_uid, 'admin'::public.app_role)
     OR public.has_role(_uid, 'soporte'::public.app_role) THEN
    RETURN NEW;
  END IF;

  SELECT t.created_by INTO _creador FROM public.tareas t WHERE t.id = NEW.tarea_id;
  IF _creador IS NOT NULL AND _creador = _uid THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No autorizado: solo el profesor o un admin pueden calificar o dejar feedback';
END;
$$;

-- 3) user_roles: dejar de exponer quién es admin/soporte
DROP POLICY IF EXISTS roles_staff_visible ON public.user_roles;

CREATE OR REPLACE FUNCTION public.listar_profesores()
RETURNS TABLE(id uuid, nombre_completo text, email text, avatar_url text, actividad text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url, p.actividad
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role IN ('admin'::public.app_role, 'soporte'::public.app_role)
    )
  ORDER BY p.nombre_completo
$$;

GRANT EXECUTE ON FUNCTION public.listar_profesores() TO authenticated;