
-- Calificaciones: solo con actividad real
CREATE OR REPLACE FUNCTION public.profesor_tuvo_actividad(_alumna uuid, _prof uuid, _mes int, _anio int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM mentoria_alumnas m WHERE m.alumna_id=_alumna AND m.seleccionada)
  AND (
    EXISTS (SELECT 1 FROM sesiones_1a1 s WHERE s.alumna_id=_alumna AND s.profesor_id=_prof
      AND extract(month from s.fecha)=_mes AND extract(year from s.fecha)=_anio)
    OR EXISTS (SELECT 1 FROM clases_en_vivo c JOIN permisos_cursos p ON p.curso_id=c.curso_id AND p.usuario_id=_alumna
      WHERE c.profesor_id=_prof AND extract(month from c.fecha)=_mes AND extract(year from c.fecha)=_anio)
  )
$$;

CREATE OR REPLACE FUNCTION public.validar_calificacion_actividad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.profesor_tuvo_actividad(NEW.alumna_id, NEW.profesor_id, NEW.mes, NEW.anio) THEN
    RAISE EXCEPTION 'Solo puedes calificar a profesores con los que tuviste sesión o clase este mes.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validar_calificacion_actividad ON public.calificaciones_mensuales;
CREATE TRIGGER trg_validar_calificacion_actividad BEFORE INSERT OR UPDATE ON public.calificaciones_mensuales
FOR EACH ROW EXECUTE FUNCTION public.validar_calificacion_actividad();

DELETE FROM public.calificaciones_mensuales c
WHERE NOT public.profesor_tuvo_actividad(c.alumna_id, c.profesor_id, c.mes, c.anio);

-- Mentoría: valor del curso
CREATE TABLE public.mentoria_cursos (
  alumna_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  valor_total numeric NOT NULL DEFAULT 0,
  pagado_inicial numeric NOT NULL DEFAULT 0,
  cuota_mensual numeric NOT NULL DEFAULT 0,
  nombre_curso text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentoria_cursos TO authenticated;
GRANT ALL ON public.mentoria_cursos TO service_role;
ALTER TABLE public.mentoria_cursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pagos gestiona cursos" ON public.mentoria_cursos FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
CREATE POLICY "alumna ve su curso" ON public.mentoria_cursos FOR SELECT TO authenticated USING (alumna_id = auth.uid());

-- Freelance
CREATE TABLE public.freelance_miembros (
  usuario_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  area text,
  modalidad text NOT NULL DEFAULT 'hora',
  tarifa_hora numeric NOT NULL DEFAULT 0,
  monto_fijo numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.freelance_datos_pago (
  usuario_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  banco text, tipo_cuenta text, numero_cuenta text, titular_cuenta text, cedula_titular text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.freelance_actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  fecha date NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  horas numeric NOT NULL DEFAULT 0,
  archivo_path text,
  archivo_nombre text,
  archivo_tipo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.freelance_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  mes int NOT NULL, anio int NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('bono','descuento')),
  monto numeric NOT NULL,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.freelance_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  mes int NOT NULL, anio int NOT NULL,
  fecha_pago date NOT NULL,
  monto numeric NOT NULL,
  tipo_pago text NOT NULL,
  numero_comprobante text, banco text, referencia text, observacion text, archivo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.freelance_resumenes (
  usuario_id uuid NOT NULL, mes int NOT NULL, anio int NOT NULL,
  resumen text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, mes, anio)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['freelance_miembros','freelance_datos_pago','freelance_actividades','freelance_ajustes','freelance_pagos','freelance_resumenes'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "pagos gestiona" ON public.%I FOR ALL TO authenticated USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "freelance ve lo suyo" ON public.%I FOR SELECT TO authenticated USING (usuario_id = auth.uid())', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.es_freelance(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM freelance_miembros WHERE usuario_id=_uid AND activo)
$$;
CREATE POLICY "freelance guarda su cuenta" ON public.freelance_datos_pago FOR INSERT TO authenticated WITH CHECK (usuario_id=auth.uid() AND public.es_freelance(auth.uid()));
CREATE POLICY "freelance edita su cuenta" ON public.freelance_datos_pago FOR UPDATE TO authenticated USING (usuario_id=auth.uid()) WITH CHECK (usuario_id=auth.uid());
CREATE POLICY "freelance sube actividad" ON public.freelance_actividades FOR INSERT TO authenticated WITH CHECK (usuario_id=auth.uid() AND public.es_freelance(auth.uid()));
CREATE POLICY "freelance edita actividad" ON public.freelance_actividades FOR UPDATE TO authenticated USING (usuario_id=auth.uid()) WITH CHECK (usuario_id=auth.uid());
CREATE POLICY "freelance borra actividad" ON public.freelance_actividades FOR DELETE TO authenticated USING (usuario_id=auth.uid());

-- Lista de usuarios para seleccionar freelancers (solo pagos)
CREATE OR REPLACE FUNCTION public.listar_usuarios_freelance()
RETURNS TABLE(id uuid, nombre_completo text, email text, avatar_url text, seleccionado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.puede_pagos(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY SELECT p.id, p.nombre_completo, p.email, p.avatar_url,
    COALESCE(f.activo,false) FROM profiles p LEFT JOIN freelance_miembros f ON f.usuario_id=p.id
    ORDER BY p.nombre_completo;
END $$;
