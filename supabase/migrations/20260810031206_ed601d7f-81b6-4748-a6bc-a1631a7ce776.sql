-- 1. Menciones en canal general
ALTER TABLE public.canal_general_mensajes
  ADD COLUMN IF NOT EXISTS menciones uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mencion_everyone boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.notif_canal_general()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _dest uuid[];
BEGIN
  IF NEW.mencion_everyone THEN
    _dest := ARRAY(SELECT id FROM public.profiles WHERE id <> NEW.autor_id);
  ELSE
    _dest := COALESCE(NEW.menciones, '{}'::uuid[]);
  END IF;

  IF array_length(_dest, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.notificar(
    _dest,
    'general',
    public.nombre_usuario(NEW.autor_id) || ' · #general',
    CASE WHEN NEW.tipo = 'texto' THEN LEFT(COALESCE(NEW.contenido, ''), 140) ELSE 'Compartió un ' || NEW.tipo END,
    '/inicio', NEW.autor_id, NEW.id
  );
  RETURN NEW;
END; $$;

-- 2. Reemplazos de clase
CREATE TABLE IF NOT EXISTS public.reemplazos_clase (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('clase','1a1')),
  referencia_id uuid NOT NULL,
  profesor_reporta uuid NOT NULL,
  profesor_reemplazado uuid NOT NULL,
  fecha date NOT NULL,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reemplazos_clase TO authenticated;
GRANT ALL ON public.reemplazos_clase TO service_role;

ALTER TABLE public.reemplazos_clase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reemplazos_select" ON public.reemplazos_clase
  FOR SELECT TO authenticated
  USING (
    profesor_reporta = auth.uid()
    OR profesor_reemplazado = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'soporte'::public.app_role)
  );

CREATE POLICY "reemplazos_insert" ON public.reemplazos_clase
  FOR INSERT TO authenticated
  WITH CHECK (profesor_reporta = auth.uid());

CREATE POLICY "reemplazos_delete" ON public.reemplazos_clase
  FOR DELETE TO authenticated
  USING (profesor_reporta = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.reemplazo_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _dur integer; _prof uuid;
BEGIN
  IF NEW.profesor_reemplazado = NEW.profesor_reporta THEN
    RAISE EXCEPTION 'No puedes reportarte a ti mismo como reemplazo';
  END IF;

  IF NEW.tipo = 'clase' THEN
    SELECT duracion_min, profesor_id INTO _dur, _prof FROM public.clases_en_vivo WHERE id = NEW.referencia_id;
  ELSE
    SELECT duracion_min, profesor_id INTO _dur, _prof FROM public.sesiones_1a1 WHERE id = NEW.referencia_id;
  END IF;

  IF _prof IS NULL THEN RAISE EXCEPTION 'Clase o sesión no encontrada'; END IF;
  IF _prof IS DISTINCT FROM NEW.profesor_reporta THEN
    RAISE EXCEPTION 'Solo el profesor asignado puede reportar el reemplazo';
  END IF;
  IF _dur IS NOT NULL THEN
    RAISE EXCEPTION 'Esta clase ya tiene la duración registrada';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER reemplazos_validar_ins
  BEFORE INSERT ON public.reemplazos_clase
  FOR EACH ROW EXECUTE FUNCTION public.reemplazo_validar();

CREATE OR REPLACE FUNCTION public.notif_reemplazo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.notificar(
    ARRAY[NEW.profesor_reemplazado], 'reemplazo',
    'Reporte de reemplazo',
    public.nombre_usuario(NEW.profesor_reporta) || ' reportó que te reemplazó el ' || to_char(NEW.fecha, 'DD/MM'),
    '/mis-clases-asignadas', NEW.profesor_reporta, NEW.id
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER notif_reemplazo_ins
  AFTER INSERT ON public.reemplazos_clase
  FOR EACH ROW EXECUTE FUNCTION public.notif_reemplazo();

-- 3. Precio por clase/sesión
CREATE TABLE IF NOT EXISTS public.pagos_items_precio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('clase','1a1')),
  referencia_id uuid NOT NULL,
  mes smallint NOT NULL,
  anio smallint NOT NULL,
  monto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, referencia_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_items_precio TO authenticated;
GRANT ALL ON public.pagos_items_precio TO service_role;

ALTER TABLE public.pagos_items_precio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precios_select" ON public.pagos_items_precio
  FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "precios_admin_write" ON public.pagos_items_precio
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER pagos_items_precio_updated_at
  BEFORE UPDATE ON public.pagos_items_precio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Ajustes manuales de minutos
CREATE TABLE IF NOT EXISTS public.pagos_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  mes smallint NOT NULL,
  anio smallint NOT NULL,
  minutos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profesor_id, mes, anio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_ajustes TO authenticated;
GRANT ALL ON public.pagos_ajustes TO service_role;

ALTER TABLE public.pagos_ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ajustes_select" ON public.pagos_ajustes
  FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "ajustes_admin_write" ON public.pagos_ajustes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER pagos_ajustes_updated_at
  BEFORE UPDATE ON public.pagos_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();