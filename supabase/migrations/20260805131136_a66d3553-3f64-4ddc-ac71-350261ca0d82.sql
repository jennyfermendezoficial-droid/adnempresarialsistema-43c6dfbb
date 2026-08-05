CREATE TABLE public.notificaciones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  cuerpo text,
  url text,
  actor_id uuid,
  referencia_id uuid,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notificaciones TO authenticated;
GRANT ALL ON public.notificaciones TO service_role;

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notificaciones_select_own" ON public.notificaciones
  FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY "notificaciones_update_own" ON public.notificaciones
  FOR UPDATE TO authenticated USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "notificaciones_delete_own" ON public.notificaciones
  FOR DELETE TO authenticated USING (usuario_id = auth.uid());

CREATE INDEX notificaciones_usuario_idx ON public.notificaciones (usuario_id, leida, created_at DESC);

-- Helper para insertar notificaciones desde triggers
CREATE OR REPLACE FUNCTION public.notificar(
  _usuarios uuid[], _tipo text, _titulo text, _cuerpo text,
  _url text, _actor uuid, _referencia uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.notificaciones (usuario_id, tipo, titulo, cuerpo, url, actor_id, referencia_id)
  SELECT u, _tipo, _titulo, _cuerpo, _url, _actor, _referencia
  FROM unnest(_usuarios) AS u
  WHERE u IS NOT NULL AND (_actor IS NULL OR u <> _actor);
$$;

-- Nombre legible de un usuario
CREATE OR REPLACE FUNCTION public.nombre_usuario(_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(nombre_completo, ''), email, 'Alguien') FROM public.profiles WHERE id = _id;
$$;

-- Canal general
CREATE OR REPLACE FUNCTION public.notif_canal_general()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.notificar(
    ARRAY(SELECT id FROM public.profiles WHERE id <> NEW.autor_id),
    'general',
    public.nombre_usuario(NEW.autor_id) || ' · #general',
    CASE WHEN NEW.tipo = 'texto' THEN LEFT(COALESCE(NEW.contenido, ''), 140) ELSE 'Compartió un ' || NEW.tipo END,
    '/general', NEW.autor_id, NEW.id
  );
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_canal_general_ins AFTER INSERT ON public.canal_general_mensajes
FOR EACH ROW EXECUTE FUNCTION public.notif_canal_general();

-- Chat 1 a 1
CREATE OR REPLACE FUNCTION public.notif_chat_1a1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _dest uuid;
BEGIN
  SELECT CASE WHEN c.usuario_a_id = NEW.autor_id THEN c.usuario_b_id ELSE c.usuario_a_id END
    INTO _dest FROM public.chats_1a1 c WHERE c.id = NEW.chat_id;
  IF _dest IS NOT NULL THEN
    PERFORM public.notificar(ARRAY[_dest], 'chat',
      public.nombre_usuario(NEW.autor_id),
      CASE WHEN NEW.tipo = 'texto' THEN LEFT(COALESCE(NEW.contenido, ''), 140) ELSE 'Te envió un ' || NEW.tipo END,
      '/chats', NEW.autor_id, NEW.chat_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_chat_1a1_ins AFTER INSERT ON public.mensajes_chat_1a1
FOR EACH ROW EXECUTE FUNCTION public.notif_chat_1a1();

-- Chat de profesores
CREATE OR REPLACE FUNCTION public.notif_chat_profes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.notificar(
    ARRAY(SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','soporte') AND user_id <> NEW.autor_id),
    'chat_profesores',
    public.nombre_usuario(NEW.autor_id) || ' · Profesores',
    CASE WHEN NEW.tipo = 'texto' THEN LEFT(COALESCE(NEW.contenido, ''), 140) ELSE 'Compartió un ' || NEW.tipo END,
    '/chat-profesores', NEW.autor_id, NEW.id
  );
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_chat_profes_ins AFTER INSERT ON public.chat_profesores_mensajes
FOR EACH ROW EXECUTE FUNCTION public.notif_chat_profes();

-- Sesiones 1 a 1
CREATE OR REPLACE FUNCTION public.notif_sesion_1a1_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.notificar(
    ARRAY(SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin')
      || ARRAY[NEW.profesor_id],
    'sesion_nueva', 'Nueva reserva 1 a 1',
    public.nombre_usuario(NEW.alumna_id) || ' agendó para ' || to_char(NEW.fecha, 'DD/MM') || ' · ' || to_char(NEW.hora_inicio, 'HH24:MI'),
    '/agenda-1a1', NEW.alumna_id, NEW.id
  );
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_sesion_1a1_ins AFTER INSERT ON public.sesiones_1a1
FOR EACH ROW EXECUTE FUNCTION public.notif_sesion_1a1_ins();

CREATE OR REPLACE FUNCTION public.notif_sesion_1a1_fin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.estado = 'finalizada' AND OLD.estado IS DISTINCT FROM 'finalizada' THEN
    PERFORM public.notificar(ARRAY[NEW.alumna_id], 'sesion_finalizada',
      'Clase finalizada', 'Califica a tu profesor en 30 segundos',
      '/inicio', NULL, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_sesion_1a1_fin AFTER UPDATE ON public.sesiones_1a1
FOR EACH ROW EXECUTE FUNCTION public.notif_sesion_1a1_fin();

-- Clases en vivo
CREATE OR REPLACE FUNCTION public.notif_clase_nueva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _dest uuid[];
BEGIN
  IF NEW.curso_id IS NULL THEN
    _dest := ARRAY(SELECT id FROM public.profiles);
  ELSE
    _dest := ARRAY(SELECT usuario_id FROM public.permisos_cursos WHERE curso_id = NEW.curso_id);
  END IF;
  IF NEW.profesor_id IS NOT NULL THEN _dest := _dest || ARRAY[NEW.profesor_id]; END IF;
  PERFORM public.notificar(_dest, 'clase_nueva',
    'Nueva clase en vivo',
    NEW.titulo || ' · ' || to_char(NEW.fecha, 'DD/MM') || ' ' || to_char(NEW.hora_inicio, 'HH24:MI'),
    '/calendario-clases', NEW.created_by, NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_clase_nueva_ins AFTER INSERT ON public.clases_en_vivo
FOR EACH ROW EXECUTE FUNCTION public.notif_clase_nueva();

-- Tareas
CREATE OR REPLACE FUNCTION public.notif_tarea_nueva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _dest uuid[];
BEGIN
  IF NEW.curso_id IS NULL THEN
    _dest := ARRAY(SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'usuario');
  ELSE
    _dest := ARRAY(SELECT usuario_id FROM public.permisos_cursos WHERE curso_id = NEW.curso_id);
  END IF;
  PERFORM public.notificar(_dest, 'tarea_nueva', 'Nueva tarea',
    NEW.titulo, '/tareas', NEW.created_by, NEW.id);
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_tarea_nueva_ins AFTER INSERT ON public.tareas
FOR EACH ROW EXECUTE FUNCTION public.notif_tarea_nueva();

CREATE OR REPLACE FUNCTION public.notif_entrega_nueva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _prof uuid; _titulo text;
BEGIN
  SELECT created_by, titulo INTO _prof, _titulo FROM public.tareas WHERE id = NEW.tarea_id;
  IF _prof IS NOT NULL THEN
    PERFORM public.notificar(ARRAY[_prof], 'entrega_nueva', 'Nueva entrega de tarea',
      public.nombre_usuario(NEW.alumna_id) || ' entregó: ' || COALESCE(_titulo, ''),
      '/tareas', NEW.alumna_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_entrega_nueva_ins AFTER INSERT ON public.tareas_entregas
FOR EACH ROW EXECUTE FUNCTION public.notif_entrega_nueva();

CREATE OR REPLACE FUNCTION public.notif_entrega_calificada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _titulo text;
BEGIN
  IF NEW.calificacion IS DISTINCT FROM OLD.calificacion OR NEW.feedback IS DISTINCT FROM OLD.feedback THEN
    SELECT titulo INTO _titulo FROM public.tareas WHERE id = NEW.tarea_id;
    PERFORM public.notificar(ARRAY[NEW.alumna_id], 'tarea_calificada', 'Tu tarea fue revisada',
      COALESCE(_titulo, 'Tarea') || CASE WHEN NEW.calificacion IS NOT NULL THEN ' · Nota: ' || NEW.calificacion ELSE '' END,
      '/tareas', NULL, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER notif_entrega_calificada_upd AFTER UPDATE ON public.tareas_entregas
FOR EACH ROW EXECUTE FUNCTION public.notif_entrega_calificada();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;