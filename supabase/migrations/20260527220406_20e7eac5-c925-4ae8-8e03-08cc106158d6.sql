CREATE TABLE public.ae_cuentas_bancarias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  nombre text NOT NULL,
  numero_cuenta text NOT NULL,
  tipo text NOT NULL DEFAULT 'banco',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_cuentas_bancarias TO authenticated;
GRANT ALL ON public.ae_cuentas_bancarias TO service_role;

ALTER TABLE public.ae_cuentas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY ae_cuentas_bancarias_self
ON public.ae_cuentas_bancarias
FOR ALL
TO authenticated
USING (usuario_id = auth.uid())
WITH CHECK (usuario_id = auth.uid());

CREATE INDEX ae_cuentas_bancarias_usuario_idx ON public.ae_cuentas_bancarias(usuario_id, activo, created_at);

CREATE TRIGGER set_ae_cuentas_bancarias_updated_at
BEFORE UPDATE ON public.ae_cuentas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();