-- Unifica la autorización real de Pagos e informes con la interfaz.
-- Roles internos NO cambian: admin / soporte / usuario.
-- Los admin son gestores y Erick conserva soporte pero queda autorizado por email.

CREATE OR REPLACE FUNCTION public.puede_gestionar_pagos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'detroitsilva010@gmail.com';
$$;

GRANT EXECUTE ON FUNCTION public.puede_gestionar_pagos() TO authenticated;

-- Cuentas de origen: ya no visibles para todo soporte.
DROP POLICY IF EXISTS "equipo ve cuentas" ON public.pagos_cuentas_bancarias;
DROP POLICY IF EXISTS "admin gestiona cuentas" ON public.pagos_cuentas_bancarias;
DROP POLICY IF EXISTS "gestores pagos ven cuentas" ON public.pagos_cuentas_bancarias;
DROP POLICY IF EXISTS "gestores pagos administran cuentas" ON public.pagos_cuentas_bancarias;

CREATE POLICY "gestores pagos ven cuentas" ON public.pagos_cuentas_bancarias
FOR SELECT TO authenticated
USING (public.puede_gestionar_pagos());

CREATE POLICY "gestores pagos administran cuentas" ON public.pagos_cuentas_bancarias
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

-- Comprobantes: el profesor puede conservar acceso a sus propios registros;
-- la gestión completa queda únicamente en gestores autorizados.
DROP POLICY IF EXISTS "equipo y dueno ven abonos" ON public.pagos_comprobantes;
DROP POLICY IF EXISTS "admin gestiona abonos" ON public.pagos_comprobantes;
DROP POLICY IF EXISTS "profesor o gestor ve abonos" ON public.pagos_comprobantes;
DROP POLICY IF EXISTS "gestores pagos administran abonos" ON public.pagos_comprobantes;

CREATE POLICY "profesor o gestor ve abonos" ON public.pagos_comprobantes
FOR SELECT TO authenticated
USING (profesor_id = auth.uid() OR public.puede_gestionar_pagos());

CREATE POLICY "gestores pagos administran abonos" ON public.pagos_comprobantes
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

-- Tarifas por hora: el profesor puede ver la propia; solo gestores pueden modificarlas.
DROP POLICY IF EXISTS "tarifas_equipo_select" ON public.pagos_tarifas_profesor;
DROP POLICY IF EXISTS "tarifas_admin_write" ON public.pagos_tarifas_profesor;
DROP POLICY IF EXISTS "tarifas_profesor_o_gestor_select" ON public.pagos_tarifas_profesor;
DROP POLICY IF EXISTS "tarifas_gestor_write" ON public.pagos_tarifas_profesor;

CREATE POLICY "tarifas_profesor_o_gestor_select" ON public.pagos_tarifas_profesor
FOR SELECT TO authenticated
USING (profesor_id = auth.uid() OR public.puede_gestionar_pagos());

CREATE POLICY "tarifas_gestor_write" ON public.pagos_tarifas_profesor
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

-- Valores individuales y ajustes: se mantienen las políticas propias existentes
-- y se agrega acceso completo para la cuenta especial autorizada.
DROP POLICY IF EXISTS "precios_gestor_pagos_all" ON public.pagos_items_precio;
CREATE POLICY "precios_gestor_pagos_all" ON public.pagos_items_precio
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

DROP POLICY IF EXISTS "ajustes_gestor_pagos_all" ON public.pagos_ajustes;
CREATE POLICY "ajustes_gestor_pagos_all" ON public.pagos_ajustes
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

-- Bonos y cierres mensuales deben poder ser gestionados por las mismas cuentas.
DROP POLICY IF EXISTS "bonos_gestor_pagos_all" ON public.bonos;
CREATE POLICY "bonos_gestor_pagos_all" ON public.bonos
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

DROP POLICY IF EXISTS "pagos_mensuales_gestor_all" ON public.pagos_mensuales;
CREATE POLICY "pagos_mensuales_gestor_all" ON public.pagos_mensuales
FOR ALL TO authenticated
USING (public.puede_gestionar_pagos())
WITH CHECK (public.puede_gestionar_pagos());

-- Para mostrar la cuenta destino del profesor dentro de Registrar pago.
DROP POLICY IF EXISTS "profesor_datos_gestor_pagos_select" ON public.profesor_datos;
CREATE POLICY "profesor_datos_gestor_pagos_select" ON public.profesor_datos
FOR SELECT TO authenticated
USING (public.puede_gestionar_pagos());

DROP POLICY IF EXISTS "profesor_cuentas_gestor_pagos_select" ON public.profesor_cuentas_bancarias;
CREATE POLICY "profesor_cuentas_gestor_pagos_select" ON public.profesor_cuentas_bancarias
FOR SELECT TO authenticated
USING (public.puede_gestionar_pagos());

-- Archivos de comprobantes y logos de cuentas de origen.
DROP POLICY IF EXISTS "gestor pagos storage insertar" ON storage.objects;
CREATE POLICY "gestor pagos storage insertar" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('comprobantes', 'pagos-bancos')
  AND public.puede_gestionar_pagos()
);

DROP POLICY IF EXISTS "gestor pagos storage actualizar" ON storage.objects;
CREATE POLICY "gestor pagos storage actualizar" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id IN ('comprobantes', 'pagos-bancos')
  AND public.puede_gestionar_pagos()
)
WITH CHECK (
  bucket_id IN ('comprobantes', 'pagos-bancos')
  AND public.puede_gestionar_pagos()
);

DROP POLICY IF EXISTS "gestor pagos storage borrar" ON storage.objects;
CREATE POLICY "gestor pagos storage borrar" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id IN ('comprobantes', 'pagos-bancos')
  AND public.puede_gestionar_pagos()
);

DROP POLICY IF EXISTS "gestor pagos storage leer" ON storage.objects;
CREATE POLICY "gestor pagos storage leer" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('comprobantes', 'pagos-bancos')
  AND public.puede_gestionar_pagos()
);
