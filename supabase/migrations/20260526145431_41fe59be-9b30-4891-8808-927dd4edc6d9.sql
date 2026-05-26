DROP POLICY IF EXISTS calif_alumna_insert ON public.calificaciones_mensuales;
CREATE POLICY calif_alumna_insert ON public.calificaciones_mensuales
FOR INSERT TO authenticated
WITH CHECK (
  alumna_id = auth.uid()
  AND (public.has_role(profesor_id, 'admin'::app_role) OR public.has_role(profesor_id, 'soporte'::app_role))
);