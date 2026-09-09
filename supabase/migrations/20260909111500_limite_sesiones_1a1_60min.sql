-- Regla empresarial: una sesión 1 a 1 puede registrar/pagar como máximo 60 minutos.
-- Las clases en vivo NO están afectadas por este límite.

CREATE OR REPLACE FUNCTION public.limitar_duracion_sesion_1a1_60min()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.duracion_min, 0) > 60 THEN
    NEW.duracion_min := 60;
    IF NEW.hora_inicio IS NOT NULL THEN
      NEW.hora_fin := (NEW.hora_inicio + interval '60 minutes')::time;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limitar_duracion_sesion_1a1_60min ON public.sesiones_1a1;
CREATE TRIGGER trg_limitar_duracion_sesion_1a1_60min
BEFORE INSERT OR UPDATE ON public.sesiones_1a1
FOR EACH ROW
EXECUTE FUNCTION public.limitar_duracion_sesion_1a1_60min();

-- Normaliza cualquier dato histórico que haya quedado por encima del máximo.
UPDATE public.sesiones_1a1
SET
  duracion_min = 60,
  hora_fin = CASE
    WHEN hora_inicio IS NOT NULL THEN (hora_inicio + interval '60 minutes')::time
    ELSE hora_fin
  END
WHERE COALESCE(duracion_min, 0) > 60;

NOTIFY pgrst, 'reload schema';
