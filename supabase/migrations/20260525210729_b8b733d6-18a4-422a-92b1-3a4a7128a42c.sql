
-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'soporte', 'usuario');
CREATE TYPE public.user_estado AS ENUM ('pendiente_aprobacion', 'activo', 'inactivo');

-- Tabla profiles (datos públicos del usuario)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  nombre_completo TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  estado public.user_estado NOT NULL DEFAULT 'pendiente_aprobacion',
  tarifa_hora_clase NUMERIC(10,2) NOT NULL DEFAULT 0,
  tarifa_sesion_1a1 NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de roles (separada por seguridad)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Función security definer para chequear roles (evita recursión RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Trigger: al crear un user en auth.users, crear profile + asignar rol
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_email BOOLEAN;
BEGIN
  is_admin_email := (NEW.email = 'jzime2323@gmail.com');

  INSERT INTO public.profiles (id, email, nombre_completo, estado)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', ''),
    CASE WHEN is_admin_email THEN 'activo'::public.user_estado ELSE 'pendiente_aprobacion'::public.user_estado END
  );

  -- Rol por defecto
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN is_admin_email THEN 'admin'::public.app_role ELSE 'usuario'::public.app_role END
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CURSOS ============
CREATE TABLE public.cursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  color_cover TEXT DEFAULT '#7C6BFF',
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.modulos_curso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.lecciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id UUID NOT NULL REFERENCES public.modulos_curso(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  bunny_video_id TEXT,
  duracion_min INTEGER DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  recursos_adjuntos JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE public.permisos_cursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  fecha_otorgado TIMESTAMPTZ NOT NULL DEFAULT now(),
  otorgado_por UUID REFERENCES auth.users(id),
  UNIQUE(usuario_id, curso_id)
);

CREATE TABLE public.progreso_lecciones (
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leccion_id UUID NOT NULL REFERENCES public.lecciones(id) ON DELETE CASCADE,
  completada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_completada TIMESTAMPTZ,
  minutos_visto INTEGER DEFAULT 0,
  PRIMARY KEY (usuario_id, leccion_id)
);

-- ============ AGENDA ============
CREATE TABLE public.disponibilidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 4),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE public.sesiones_1a1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumna_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profesor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  zoom_link TEXT,
  zoom_meeting_id TEXT,
  estado TEXT NOT NULL DEFAULT 'confirmada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.clases_en_vivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  profesor_id UUID REFERENCES auth.users(id),
  zoom_link TEXT,
  zoom_meeting_id TEXT,
  recordatorio_enviado BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CHATS ============
CREATE TABLE public.chats_1a1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_a_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usuario_b_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_a_id, usuario_b_id)
);

CREATE TABLE public.mensajes_chat_1a1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats_1a1(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenido TEXT,
  tipo TEXT NOT NULL DEFAULT 'texto',
  media_url TEXT,
  leido BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.canal_general_mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenido TEXT,
  tipo TEXT NOT NULL DEFAULT 'texto',
  media_url TEXT,
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  anclado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ia_bot_interacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pregunta TEXT NOT NULL,
  respuesta TEXT,
  sugirio_agendar BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ PAGOS ============
CREATE TABLE public.bonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  motivo TEXT,
  frecuencia TEXT NOT NULL DEFAULT 'una_vez',
  mes SMALLINT NOT NULL,
  anio SMALLINT NOT NULL,
  otorgado_por UUID REFERENCES auth.users(id),
  estado TEXT NOT NULL DEFAULT 'por_pagar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.horas_trabajadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL,
  horas NUMERIC(5,2) NOT NULL,
  tarifa NUMERIC(10,2) NOT NULL,
  monto NUMERIC(10,2) NOT NULL,
  referencia_id UUID
);

CREATE TABLE public.pagos_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes SMALLINT NOT NULL,
  anio SMALLINT NOT NULL,
  total_horas NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_bonos NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'por_pagar',
  fecha_pago TIMESTAMPTZ,
  UNIQUE(profesor_id, mes, anio)
);

CREATE TABLE public.calificaciones_mensuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alumna_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes SMALLINT NOT NULL,
  anio SMALLINT NOT NULL,
  claridad SMALLINT CHECK (claridad BETWEEN 1 AND 5),
  didactica SMALLINT CHECK (didactica BETWEEN 1 AND 5),
  desenvolvimiento SMALLINT CHECK (desenvolvimiento BETWEEN 1 AND 5),
  practico SMALLINT CHECK (practico BETWEEN 1 AND 5),
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ RLS ============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modulos_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permisos_cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progreso_lecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_1a1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clases_en_vivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats_1a1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat_1a1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canal_general_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_bot_interacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horas_trabajadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calificaciones_mensuales ENABLE ROW LEVEL SECURITY;

-- Profiles: el usuario ve y edita su propio profile; admin ve todos
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles: solo lectura propia + admin
CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Cursos: todos los authenticated pueden ver; admin/soporte editar
CREATE POLICY "cursos_select" ON public.cursos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cursos_staff_write" ON public.cursos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));

CREATE POLICY "modulos_select" ON public.modulos_curso FOR SELECT TO authenticated USING (true);
CREATE POLICY "modulos_staff_write" ON public.modulos_curso FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));

CREATE POLICY "lecciones_select" ON public.lecciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "lecciones_staff_write" ON public.lecciones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));

-- Permisos cursos: alumna ve los suyos; admin gestiona
CREATE POLICY "permisos_select" ON public.permisos_cursos FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "permisos_admin_write" ON public.permisos_cursos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Progreso: alumna gestiona el suyo
CREATE POLICY "progreso_self" ON public.progreso_lecciones FOR ALL TO authenticated
  USING (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Disponibilidad
CREATE POLICY "dispo_select" ON public.disponibilidad FOR SELECT TO authenticated USING (true);
CREATE POLICY "dispo_self_write" ON public.disponibilidad FOR ALL TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Sesiones 1a1
CREATE POLICY "sesiones_participantes" ON public.sesiones_1a1 FOR SELECT TO authenticated
  USING (alumna_id = auth.uid() OR profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sesiones_alumna_insert" ON public.sesiones_1a1 FOR INSERT TO authenticated
  WITH CHECK (alumna_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sesiones_admin_modify" ON public.sesiones_1a1 FOR UPDATE TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sesiones_admin_delete" ON public.sesiones_1a1 FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Clases en vivo
CREATE POLICY "clases_select" ON public.clases_en_vivo FOR SELECT TO authenticated USING (true);
CREATE POLICY "clases_staff_write" ON public.clases_en_vivo FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));

-- Chats 1a1
CREATE POLICY "chats_participantes" ON public.chats_1a1 FOR SELECT TO authenticated
  USING (usuario_a_id = auth.uid() OR usuario_b_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "chats_insert" ON public.chats_1a1 FOR INSERT TO authenticated
  WITH CHECK (usuario_a_id = auth.uid() OR usuario_b_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Mensajes chat 1a1
CREATE POLICY "msg_select" ON public.mensajes_chat_1a1 FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chats_1a1 c
      WHERE c.id = chat_id AND (c.usuario_a_id = auth.uid() OR c.usuario_b_id = auth.uid())
    ) OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "msg_insert" ON public.mensajes_chat_1a1 FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid());
CREATE POLICY "msg_update_self" ON public.mensajes_chat_1a1 FOR UPDATE TO authenticated
  USING (autor_id = auth.uid());
CREATE POLICY "msg_delete_self" ON public.mensajes_chat_1a1 FOR DELETE TO authenticated
  USING (autor_id = auth.uid());

-- Canal general
CREATE POLICY "canal_select" ON public.canal_general_mensajes FOR SELECT TO authenticated USING (true);
CREATE POLICY "canal_insert" ON public.canal_general_mensajes FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid());
CREATE POLICY "canal_update_self_or_staff" ON public.canal_general_mensajes FOR UPDATE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'soporte'));
CREATE POLICY "canal_delete_self_or_admin" ON public.canal_general_mensajes FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- IA bot
CREATE POLICY "bot_self" ON public.ia_bot_interacciones FOR ALL TO authenticated
  USING (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (usuario_id = auth.uid());

-- Bonos / horas / pagos / calificaciones: admin gestiona; profesor ve los suyos
CREATE POLICY "bonos_select" ON public.bonos FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "bonos_admin_write" ON public.bonos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "horas_select" ON public.horas_trabajadas FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "horas_admin_write" ON public.horas_trabajadas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pagos_select" ON public.pagos_mensuales FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pagos_admin_write" ON public.pagos_mensuales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "calif_select" ON public.calificaciones_mensuales FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR alumna_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "calif_alumna_insert" ON public.calificaciones_mensuales FOR INSERT TO authenticated
  WITH CHECK (alumna_id = auth.uid());
