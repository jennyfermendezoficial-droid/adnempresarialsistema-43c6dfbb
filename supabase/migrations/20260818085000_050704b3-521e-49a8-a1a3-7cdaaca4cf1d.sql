
CREATE OR REPLACE FUNCTION public.puede_pagos(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_uid, 'admin')
      OR _uid = 'd0c055a2-1002-460e-a42c-4a65a9e59303'::uuid
$$;

DROP POLICY IF EXISTS "bonos_admin_write" ON public.bonos;
CREATE POLICY "bonos_admin_write" ON public.bonos FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
DROP POLICY IF EXISTS "bonos_select" ON public.bonos;
CREATE POLICY "bonos_select" ON public.bonos FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "ajustes_admin_write" ON public.pagos_ajustes;
CREATE POLICY "ajustes_admin_write" ON public.pagos_ajustes FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
DROP POLICY IF EXISTS "ajustes_select" ON public.pagos_ajustes;
CREATE POLICY "ajustes_select" ON public.pagos_ajustes FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "admin gestiona abonos" ON public.pagos_comprobantes;
CREATE POLICY "admin gestiona abonos" ON public.pagos_comprobantes FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "admin gestiona cuentas" ON public.pagos_cuentas_bancarias;
CREATE POLICY "admin gestiona cuentas" ON public.pagos_cuentas_bancarias FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "descuentos_admin_all" ON public.pagos_descuentos;
CREATE POLICY "descuentos_admin_all" ON public.pagos_descuentos FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
DROP POLICY IF EXISTS "descuentos_propios_select" ON public.pagos_descuentos;
CREATE POLICY "descuentos_propios_select" ON public.pagos_descuentos FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "precios_admin_write" ON public.pagos_items_precio;
CREATE POLICY "precios_admin_write" ON public.pagos_items_precio FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
DROP POLICY IF EXISTS "precios_select" ON public.pagos_items_precio;
CREATE POLICY "precios_select" ON public.pagos_items_precio FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "pagos_admin_write" ON public.pagos_mensuales;
CREATE POLICY "pagos_admin_write" ON public.pagos_mensuales FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
DROP POLICY IF EXISTS "pagos_select" ON public.pagos_mensuales;
CREATE POLICY "pagos_select" ON public.pagos_mensuales FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.puede_pagos(auth.uid()));

DROP POLICY IF EXISTS "tarifas_mes_admin_all" ON public.pagos_tarifas_mes;
CREATE POLICY "tarifas_mes_admin_all" ON public.pagos_tarifas_mes FOR ALL TO authenticated
  USING (public.puede_pagos(auth.uid())) WITH CHECK (public.puede_pagos(auth.uid()));
DROP POLICY IF EXISTS "tarifas_mes_propias_select" ON public.pagos_tarifas_mes;
CREATE POLICY "tarifas_mes_propias_select" ON public.pagos_tarifas_mes FOR SELECT TO authenticated
  USING (profesor_id = auth.uid() OR public.puede_pagos(auth.uid()));

DROP FUNCTION IF EXISTS public.perfiles_pagos(uuid[]);
CREATE OR REPLACE FUNCTION public.perfiles_pagos(_ids uuid[])
RETURNS TABLE(id uuid, nombre_completo text, email text, avatar_url text, cedula text,
  banco text, tipo_cuenta text, numero_cuenta text, titular_cuenta text, banco_logo_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.nombre_completo, p.email, p.avatar_url, p.cedula, p.banco, p.tipo_cuenta,
         p.numero_cuenta, p.titular_cuenta, p.banco_logo_url
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND (public.puede_pagos(auth.uid()) OR p.id = auth.uid())
$$;
