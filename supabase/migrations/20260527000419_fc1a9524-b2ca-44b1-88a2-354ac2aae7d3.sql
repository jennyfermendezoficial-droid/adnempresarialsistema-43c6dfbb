
CREATE TABLE public.ae_cat_gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  ambito text NOT NULL CHECK (ambito IN ('negocio','casa')),
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'variable' CHECK (tipo IN ('fijo','variable','prestamo','ingreso')),
  color text NOT NULL DEFAULT '#B8894A',
  icono text,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_cat_gastos TO authenticated;
GRANT ALL ON public.ae_cat_gastos TO service_role;
ALTER TABLE public.ae_cat_gastos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_cat_gastos_self ON public.ae_cat_gastos FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE TABLE public.ae_items_cat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  categoria_id uuid NOT NULL REFERENCES public.ae_cat_gastos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  valor numeric NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  recurrencia text NOT NULL DEFAULT 'ninguna' CHECK (recurrencia IN ('ninguna','mismo_valor','mismo_concepto')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ae_items_cat_categoria_idx ON public.ae_items_cat(categoria_id, fecha);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_items_cat TO authenticated;
GRANT ALL ON public.ae_items_cat TO service_role;
ALTER TABLE public.ae_items_cat ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_items_cat_self ON public.ae_items_cat FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE TABLE public.ae_prestamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  categoria_id uuid REFERENCES public.ae_cat_gastos(id) ON DELETE CASCADE,
  ambito text NOT NULL CHECK (ambito IN ('negocio','casa')),
  tipo text NOT NULL DEFAULT 'banco' CHECK (tipo IN ('banco','tarjeta','personal')),
  nombre text NOT NULL,
  motivo text,
  deuda_total numeric NOT NULL,
  num_cuotas int NOT NULL,
  valor_cuota numeric NOT NULL,
  fecha_primera_cuota date NOT NULL,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_prestamos TO authenticated;
GRANT ALL ON public.ae_prestamos TO service_role;
ALTER TABLE public.ae_prestamos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_prestamos_self ON public.ae_prestamos FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE TABLE public.ae_cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id uuid NOT NULL REFERENCES public.ae_prestamos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL,
  numero int NOT NULL,
  valor numeric NOT NULL,
  fecha_programada date NOT NULL,
  fecha_pago date,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cancelado','atrasado')),
  observacion text,
  modificada boolean NOT NULL DEFAULT false,
  UNIQUE(prestamo_id, numero)
);
CREATE INDEX ae_cuotas_prestamo_idx ON public.ae_cuotas(prestamo_id, numero);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_cuotas TO authenticated;
GRANT ALL ON public.ae_cuotas TO service_role;
ALTER TABLE public.ae_cuotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_cuotas_self ON public.ae_cuotas FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
