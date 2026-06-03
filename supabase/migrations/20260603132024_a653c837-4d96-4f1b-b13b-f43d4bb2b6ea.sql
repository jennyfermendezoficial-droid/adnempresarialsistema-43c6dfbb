
-- 1. calificaciones_mensuales: require existing sesiones_1a1 link
DROP POLICY IF EXISTS calif_alumna_insert ON public.calificaciones_mensuales;
CREATE POLICY calif_alumna_insert
ON public.calificaciones_mensuales
FOR INSERT TO authenticated
WITH CHECK (
  alumna_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sesiones_1a1 s
    WHERE s.alumna_id = auth.uid()
      AND s.profesor_id = calificaciones_mensuales.profesor_id
  )
);

-- 2. profiles_staff_visible: fix has_role(id, ...) -> has_role(auth.uid(), ...)
DROP POLICY IF EXISTS profiles_staff_visible ON public.profiles;
CREATE POLICY profiles_staff_visible
ON public.profiles
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
);

-- 3. profiles_select_scoped: remove sesiones_1a1 EXISTS so students can't read tarifas
DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_scoped
ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
);

-- 4. realtime_chat_1a1_participants: scope to the specific chat in the topic
DROP POLICY IF EXISTS realtime_chat_1a1_participants ON realtime.messages;
CREATE POLICY realtime_chat_1a1_participants
ON realtime.messages
FOR SELECT TO authenticated
USING (
  (
    realtime.topic() LIKE 'rt-mensajes_chat_1a1-%'
    OR realtime.topic() LIKE 'chat-1a1-%'
    OR realtime.topic() LIKE 'mensajes_chat_1a1-%'
    OR realtime.topic() LIKE 'chats_1a1-%'
  )
  AND EXISTS (
    SELECT 1 FROM public.chats_1a1 c
    WHERE c.id::text = split_part(realtime.topic(), '-', -1)
      AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
  )
);

-- 5. tareas: restrict to staff or students enrolled in the course
DROP POLICY IF EXISTS tareas_select_all ON public.tareas;
CREATE POLICY tareas_select_scoped
ON public.tareas
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
  OR curso_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.permisos_cursos pc
    WHERE pc.usuario_id = auth.uid()
      AND pc.curso_id = tareas.curso_id
  )
);
