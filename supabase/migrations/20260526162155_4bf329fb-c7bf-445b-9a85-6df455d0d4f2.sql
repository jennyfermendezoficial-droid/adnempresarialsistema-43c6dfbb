
-- ====== MI AGENDA EMPRENDEDORA ======
-- Categorías de actividades (con color)
CREATE TABLE public.ae_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  nombre text NOT NULL,
  color text NOT NULL DEFAULT '#7A8B6F',
  icono text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_categorias TO authenticated;
GRANT ALL ON public.ae_categorias TO service_role;
ALTER TABLE public.ae_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_cat_self ON public.ae_categorias FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- Actividades de agenda
CREATE TABLE public.ae_actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  categoria_id uuid REFERENCES public.ae_categorias(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descripcion text,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  duracion_min int NOT NULL DEFAULT 60,
  color text,
  ubicacion text,
  link text,
  recordatorios jsonb DEFAULT '[]'::jsonb,
  recurrencia text DEFAULT 'ninguna',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_actividades TO authenticated;
GRANT ALL ON public.ae_actividades TO service_role;
ALTER TABLE public.ae_actividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_act_self ON public.ae_actividades FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- Movimientos financieros (negocio y casa)
CREATE TABLE public.ae_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  ambito text NOT NULL CHECK (ambito IN ('negocio','casa')),
  tipo text NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  categoria text,
  monto numeric(12,2) NOT NULL,
  descripcion text,
  fecha date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ae_movimientos TO authenticated;
GRANT ALL ON public.ae_movimientos TO service_role;
ALTER TABLE public.ae_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ae_mov_self ON public.ae_movimientos FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE INDEX ae_act_user_fecha_idx ON public.ae_actividades(usuario_id, fecha);
CREATE INDEX ae_mov_user_fecha_idx ON public.ae_movimientos(usuario_id, fecha);

-- Sesiones 1a1: permitir actualizar 'estado' desde webhook (admin/service role ya tiene acceso)
-- Agregamos columna para evitar duplicados de webhook
ALTER TABLE public.sesiones_1a1 ADD COLUMN IF NOT EXISTS finalizada_at timestamptz;
