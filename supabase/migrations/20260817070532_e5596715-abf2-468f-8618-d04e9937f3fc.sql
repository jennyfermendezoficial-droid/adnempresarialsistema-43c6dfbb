-- 1. Descuentos por profesor/mes (con motivo obligatorio)
CREATE TABLE public.pagos_descuentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  mes smallint NOT NULL,
  anio smallint NOT NULL,
  monto numeric NOT NULL,
  motivo text NOT NULL,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_descuentos TO authenticated;
GRANT ALL ON public.pagos_descuentos TO service_role;
ALTER TABLE public.pagos_descuentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "descuentos_admin_all" ON public.pagos_descuentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "descuentos_propios_select" ON public.pagos_descuentos FOR SELECT TO authenticated
  USING (profesor_id = auth.uid());

-- 2. Tarifas por mes (valor hora clase / valor hora sesion)
CREATE TABLE public.pagos_tarifas_mes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  mes smallint NOT NULL,
  anio smallint NOT NULL,
  valor_hora_clase numeric NOT NULL DEFAULT 0,
  valor_hora_sesion numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profesor_id, mes, anio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_tarifas_mes TO authenticated;
GRANT ALL ON public.pagos_tarifas_mes TO service_role;
ALTER TABLE public.pagos_tarifas_mes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifas_mes_admin_all" ON public.pagos_tarifas_mes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "tarifas_mes_propias_select" ON public.pagos_tarifas_mes FOR SELECT TO authenticated
  USING (profesor_id = auth.uid());
CREATE TRIGGER pagos_tarifas_mes_updated_at BEFORE UPDATE ON public.pagos_tarifas_mes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Registros tardios (motivo del retraso)
CREATE TABLE public.registros_tardios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  referencia_id uuid NOT NULL,
  profesor_id uuid NOT NULL,
  fecha date NOT NULL,
  motivo text,
  registrado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, referencia_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_tardios TO authenticated;
GRANT ALL ON public.registros_tardios TO service_role;
ALTER TABLE public.registros_tardios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tardios_admin_all" ON public.registros_tardios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "tardios_propios_select" ON public.registros_tardios FOR SELECT TO authenticated
  USING (profesor_id = auth.uid());
CREATE POLICY "tardios_propios_write" ON public.registros_tardios FOR INSERT TO authenticated
  WITH CHECK (profesor_id = auth.uid());
CREATE POLICY "tardios_propios_update" ON public.registros_tardios FOR UPDATE TO authenticated
  USING (profesor_id = auth.uid()) WITH CHECK (profesor_id = auth.uid());

-- 4. Ficha del usuario
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cedula text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS tipo_cuenta text,
  ADD COLUMN IF NOT EXISTS numero_cuenta text,
  ADD COLUMN IF NOT EXISTS titular_cuenta text,
  ADD COLUMN IF NOT EXISTS banco_logo_url text,
  ADD COLUMN IF NOT EXISTS observacion_ficha text,
  ADD COLUMN IF NOT EXISTS ficha_completa boolean NOT NULL DEFAULT false;

-- 5. Logo del banco en cuentas de la empresa
ALTER TABLE public.pagos_cuentas_bancarias ADD COLUMN IF NOT EXISTS logo_url text;

-- 6. Portada editable de Comunidad
ALTER TABLE public.app_config
  ADD COLUMN IF NOT EXISTS comunidad_titulo text,
  ADD COLUMN IF NOT EXISTS comunidad_mensaje text,
  ADD COLUMN IF NOT EXISTS comunidad_imagen_url text;