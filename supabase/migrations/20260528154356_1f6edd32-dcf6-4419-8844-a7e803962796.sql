
-- 1) Fix clases_en_vivo: restrict null-curso classes to staff/profesor only
DROP POLICY IF EXISTS clases_select ON public.clases_en_vivo;

CREATE POLICY clases_select ON public.clases_en_vivo
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'soporte'::app_role)
  OR profesor_id = auth.uid()
  OR (
    curso_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.permisos_cursos pc
      WHERE pc.usuario_id = auth.uid() AND pc.curso_id = clases_en_vivo.curso_id
    )
  )
);

-- 2) Realtime channel authorization
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_staff_only_topics" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_general_topic" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_chat_1a1_participants" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_soporte_participants" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_default_authenticated" ON realtime.messages;

-- Staff-only topics: chat_profesores_* and any notif-* topic for staff
CREATE POLICY "realtime_staff_only_topics" ON realtime.messages
FOR SELECT TO authenticated
USING (
  (realtime.topic() LIKE 'chat_profesores%' OR realtime.topic() LIKE 'chat-profesores%')
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'soporte'::app_role))
);

-- General canal: everyone authenticated
CREATE POLICY "realtime_general_topic" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'canal_general%'
  OR realtime.topic() LIKE 'general%'
);

-- Personal notification channels: only the owner
CREATE POLICY "realtime_personal_notif" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE ('notif-msg-' || auth.uid()::text || '%')
  OR realtime.topic() LIKE ('user-' || auth.uid()::text || '%')
);

-- Soporte privado topics: only the involved user or staff
CREATE POLICY "realtime_soporte_participants" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'soporte_privado%'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'soporte'::app_role)
    OR realtime.topic() LIKE ('soporte_privado-' || auth.uid()::text || '%')
  )
);

-- 1a1 chat topics: only chat participants
CREATE POLICY "realtime_chat_1a1_participants" ON realtime.messages
FOR SELECT TO authenticated
USING (
  (realtime.topic() LIKE 'chat-1a1-%' OR realtime.topic() LIKE 'mensajes_chat_1a1%' OR realtime.topic() LIKE 'chats_1a1%')
  AND EXISTS (
    SELECT 1 FROM public.chats_1a1 c
    WHERE (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
  )
);

-- Allow other postgres_changes-style topics for authenticated users on tables already protected by RLS
-- (mensajes for sesiones, ae_actividades reminders, etc.)
CREATE POLICY "realtime_authenticated_postgres_changes" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE 'sesiones_1a1%'
  OR realtime.topic() LIKE 'ae_%'
  OR realtime.topic() LIKE 'realtime:%'
);
