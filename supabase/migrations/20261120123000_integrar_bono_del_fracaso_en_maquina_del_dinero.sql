-- Organizar "Del fracaso al éxito Bono" dentro de "MÁQUINA DEL DINERO - BONOS".
-- Conserva IDs de módulos y lecciones: videos, recursos y progreso no se recrean.
-- Migra los permisos de alumnos al curso contenedor y oculta la tarjeta independiente.
DO $$
DECLARE
  v_parent_id uuid;
  v_source_id uuid;
  v_module_id uuid;
  v_module_count integer;
BEGIN
  SELECT id INTO STRICT v_parent_id
  FROM public.cursos
  WHERE lower(btrim(nombre)) = lower('MÁQUINA DEL DINERO - BONOS ™')
    AND tipo = 'curso';

  SELECT id INTO STRICT v_source_id
  FROM public.cursos
  WHERE lower(btrim(nombre)) = lower('Del fracaso al exito Bono')
    AND tipo = 'curso';

  IF v_parent_id = v_source_id THEN
    RAISE EXCEPTION 'El curso contenedor y el curso que se va a integrar no pueden ser el mismo registro.';
  END IF;

  SELECT count(*), min(id) INTO v_module_count, v_module_id
  FROM public.modulos_curso
  WHERE curso_id = v_source_id;

  IF v_module_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente 1 módulo dentro de "Del fracaso al exito Bono", pero se encontraron % . No se realizaron cambios.',
      v_module_count;
  END IF;

  -- Conceder al curso contenedor los accesos que ya tenían los alumnos en el curso independiente.
  INSERT INTO public.permisos_cursos (usuario_id, curso_id, fecha_otorgado, otorgado_por)
  SELECT usuario_id, v_parent_id, fecha_otorgado, otorgado_por
  FROM public.permisos_cursos
  WHERE curso_id = v_source_id
  ON CONFLICT (usuario_id, curso_id) DO UPDATE
    SET fecha_otorgado = LEAST(public.permisos_cursos.fecha_otorgado, EXCLUDED.fecha_otorgado),
        otorgado_por = COALESCE(public.permisos_cursos.otorgado_por, EXCLUDED.otorgado_por);

  -- Mover el mismo módulo, sin recrearlo, y dejarlo con el nombre solicitado.
  UPDATE public.modulos_curso
  SET curso_id = v_parent_id,
      nombre = 'Del fracaso al éxito',
      orden = COALESCE(
        (SELECT max(orden) + 1 FROM public.modulos_curso WHERE curso_id = v_parent_id AND id <> v_module_id),
        0
      )
  WHERE id = v_module_id;

  -- El registro anterior deja de conceder accesos por separado y deja de mostrarse en la biblioteca.
  DELETE FROM public.permisos_cursos WHERE curso_id = v_source_id;

  UPDATE public.cursos
  SET visible_en_biblioteca = true
  WHERE id = v_parent_id;

  UPDATE public.cursos
  SET visible_en_biblioteca = false
  WHERE id = v_source_id;
END $$;
