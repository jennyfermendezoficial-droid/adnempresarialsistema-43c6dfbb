
-- 1) Reafirmar el trigger de profiles (ya existe; lo dejamos idempotente)
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'No autorizado: solo un admin puede cambiar el estado de la cuenta';
  END IF;
  IF NEW.tarifa_hora_clase IS DISTINCT FROM OLD.tarifa_hora_clase THEN
    RAISE EXCEPTION 'No autorizado: solo un admin puede cambiar la tarifa por hora de clase';
  END IF;
  IF NEW.tarifa_sesion_1a1 IS DISTINCT FROM OLD.tarifa_sesion_1a1 THEN
    RAISE EXCEPTION 'No autorizado: solo un admin puede cambiar la tarifa por sesion 1a1';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_self_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- 2) Impedir que la alumna se autocalifique en tareas_entregas.
--    Solo admin, soporte, o el profesor dueño de la tarea pueden cambiar
--    calificacion / feedback.
CREATE OR REPLACE FUNCTION public.prevent_self_grading()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _profesor_id uuid;
  _is_staff boolean;
BEGIN
  -- Si no hay cambios en calificacion/feedback, no hay nada que validar.
  IF NEW.calificacion IS NOT DISTINCT FROM OLD.calificacion
     AND NEW.feedback IS NOT DISTINCT FROM OLD.feedback THEN
    RETURN NEW;
  END IF;

  _is_staff := public.has_role(_uid, 'admin'::public.app_role)
            OR public.has_role(_uid, 'soporte'::public.app_role);

  IF _is_staff THEN
    RETURN NEW;
  END IF;

  -- Permitir tambien al profesor asignado (creador de la tarea)
  SELECT t.profesor_id INTO _profesor_id
  FROM public.tareas t
  WHERE t.id = NEW.tarea_id;

  IF _profesor_id IS NOT NULL AND _profesor_id = _uid THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No autorizado: solo el profesor o un admin pueden calificar o dejar feedback';
END;
$$;

DROP TRIGGER IF EXISTS tareas_entregas_prevent_self_grading ON public.tareas_entregas;
CREATE TRIGGER tareas_entregas_prevent_self_grading
BEFORE UPDATE ON public.tareas_entregas
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_grading();
