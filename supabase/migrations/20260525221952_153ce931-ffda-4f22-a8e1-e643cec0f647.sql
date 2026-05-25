
-- 1. clases_en_vivo: restringir SELECT
DROP POLICY IF EXISTS clases_select ON public.clases_en_vivo;
CREATE POLICY clases_select ON public.clases_en_vivo
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
  OR profesor_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.permisos_cursos pc WHERE pc.usuario_id = auth.uid())
);

-- 2. modulos_curso: requiere permiso al curso
DROP POLICY IF EXISTS modulos_select ON public.modulos_curso;
CREATE POLICY modulos_select ON public.modulos_curso
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.permisos_cursos pc
    WHERE pc.usuario_id = auth.uid() AND pc.curso_id = modulos_curso.curso_id
  )
);

-- 3. lecciones: requiere permiso al curso padre
DROP POLICY IF EXISTS lecciones_select ON public.lecciones;
CREATE POLICY lecciones_select ON public.lecciones
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.modulos_curso m
    JOIN public.permisos_cursos pc ON pc.curso_id = m.curso_id
    WHERE m.id = lecciones.modulo_id AND pc.usuario_id = auth.uid()
  )
);

-- 4. mensajes_chat_1a1: INSERT requiere ser participante
DROP POLICY IF EXISTS msg_insert ON public.mensajes_chat_1a1;
CREATE POLICY msg_insert ON public.mensajes_chat_1a1
FOR INSERT TO authenticated
WITH CHECK (
  autor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chats_1a1 c
    WHERE c.id = mensajes_chat_1a1.chat_id
      AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
  )
);

-- 5. calificaciones_mensuales: requiere sesión existente
DROP POLICY IF EXISTS calif_alumna_insert ON public.calificaciones_mensuales;
CREATE POLICY calif_alumna_insert ON public.calificaciones_mensuales
FOR INSERT TO authenticated
WITH CHECK (
  alumna_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sesiones_1a1 s
    WHERE s.alumna_id = auth.uid()
      AND s.profesor_id = calificaciones_mensuales.profesor_id
  )
);

-- 6. sesiones_1a1: soporte puede ver
DROP POLICY IF EXISTS sesiones_participantes ON public.sesiones_1a1;
CREATE POLICY sesiones_participantes ON public.sesiones_1a1
FOR SELECT TO authenticated
USING (
  alumna_id = auth.uid()
  OR profesor_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
);
