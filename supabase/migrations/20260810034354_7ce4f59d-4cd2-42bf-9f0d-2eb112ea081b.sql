CREATE TABLE public.pagos_cuentas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'banco',
  numero_cuenta text NOT NULL,
  titular text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_cuentas_bancarias TO authenticated;
GRANT ALL ON public.pagos_cuentas_bancarias TO service_role;

ALTER TABLE public.pagos_cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipo ve cuentas" ON public.pagos_cuentas_bancarias
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'soporte'::public.app_role));

CREATE POLICY "admin gestiona cuentas" ON public.pagos_cuentas_bancarias
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER pagos_cuentas_bancarias_updated_at
BEFORE UPDATE ON public.pagos_cuentas_bancarias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pagos_comprobantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  mes smallint NOT NULL,
  anio smallint NOT NULL,
  fecha_pago date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Guayaquil')::date,
  monto numeric NOT NULL DEFAULT 0,
  tipo_pago text NOT NULL DEFAULT 'transferencia',
  numero_comprobante text,
  cuenta_id uuid REFERENCES public.pagos_cuentas_bancarias(id) ON DELETE SET NULL,
  banco_texto text,
  observacion text,
  archivo_url text,
  datos_ocr jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pagos_comprobantes_periodo_idx ON public.pagos_comprobantes (anio, mes, profesor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_comprobantes TO authenticated;
GRANT ALL ON public.pagos_comprobantes TO service_role;

ALTER TABLE public.pagos_comprobantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipo y dueno ven abonos" ON public.pagos_comprobantes
FOR SELECT TO authenticated
USING (
  profesor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'soporte'::public.app_role)
);

CREATE POLICY "admin gestiona abonos" ON public.pagos_comprobantes
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TRIGGER pagos_comprobantes_updated_at
BEFORE UPDATE ON public.pagos_comprobantes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();