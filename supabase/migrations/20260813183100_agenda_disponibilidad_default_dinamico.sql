CREATE OR REPLACE FUNCTION public.agenda_slot_disponible(_profesor_id UUID, _fecha DATE, _hora_inicio TIME)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(ISODOW FROM _fecha)::INT BETWEEN 1 AND 5
    AND _hora_inicio >= '15:00'::time
    AND _hora_inicio < '19:00'::time
    AND COALESCE(
      (
        SELECT a.activo
        FROM public.agenda_disponibilidad_profesores a
        WHERE a.profesor_id = _profesor_id
          AND a.dia_semana = EXTRACT(ISODOW FROM _fecha)::INT - 1
        LIMIT 1
      ),
      TRUE
    );
$$;
GRANT EXECUTE ON FUNCTION public.agenda_slot_disponible(UUID, DATE, TIME) TO authenticated;
