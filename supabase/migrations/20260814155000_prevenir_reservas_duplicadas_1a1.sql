-- Evita que dos alumnas puedan reservar simultáneamente el mismo slot del mismo profesor.
-- Se usa un advisory lock transaccional para cerrar la condición de carrera sin
-- modificar ni borrar sesiones históricas existentes.
CREATE OR REPLACE FUNCTION public.evitar_reserva_1a1_duplicada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lock_key BIGINT;
  duplicate_exists BOOLEAN;
BEGIN
  -- Solo validamos reservas activas. Las canceladas/anuladas no bloquean el horario.
  IF lower(coalesce(NEW.estado, 'confirmada')) IN ('cancelada', 'cancelado', 'anulada') THEN
    RETURN NEW;
  END IF;

  -- Un lock por profesor + fecha + hora impide la carrera entre dos reservas simultáneas.
  lock_key := hashtextextended(
    NEW.profesor_id::text || '|' || NEW.fecha::text || '|' || NEW.hora_inicio::text,
    9147253
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT EXISTS (
    SELECT 1
    FROM public.sesiones_1a1 s
    WHERE s.profesor_id = NEW.profesor_id
      AND s.fecha = NEW.fecha
      AND s.hora_inicio = NEW.hora_inicio
      AND s.id <> NEW.id
      AND lower(coalesce(s.estado, 'confirmada')) NOT IN ('cancelada', 'cancelado', 'anulada')
  ) INTO duplicate_exists;

  IF duplicate_exists THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Este horario ya fue reservado por otra persona. Elige otro horario disponible.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evitar_reserva_1a1_duplicada ON public.sesiones_1a1;
CREATE TRIGGER trg_evitar_reserva_1a1_duplicada
  BEFORE INSERT OR UPDATE OF profesor_id, fecha, hora_inicio, estado
  ON public.sesiones_1a1
  FOR EACH ROW
  EXECUTE FUNCTION public.evitar_reserva_1a1_duplicada();