CREATE TABLE IF NOT EXISTS public.pagos_tarifas_profesor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id uuid NOT NULL,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio smallint NOT NULL,
  valor_hora_clase numeric NOT NULL DEFAULT 0 CHECK (valor_hora_clase >= 0),
  valor_hora_1a1 numeric NOT NULL DEFAULT 0 CHECK (valor_hora_1a1 >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profesor_id, mes, anio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagos_tarifas_profesor TO authenticated;
GRANT ALL ON public.pagos_tarifas_profesor TO service_role;

ALTER TABLE public.pagos_tarifas_profesor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarifas_equipo_select" ON public.pagos_tarifas_profesor
FOR SELECT TO authenticated
USING (
  profesor_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'soporte'::public.app_role)
);

CREATE POLICY "tarifas_admin_write" ON public.pagos_tarifas_profesor
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER pagos_tarifas_profesor_updated_at
BEFORE UPDATE ON public.pagos_tarifas_profesor
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
