
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can change anything
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot change privileged fields on their own profile
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
