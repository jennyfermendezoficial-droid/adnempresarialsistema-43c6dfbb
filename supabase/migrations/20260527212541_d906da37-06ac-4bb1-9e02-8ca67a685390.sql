
-- ============================================
-- FIX 1: Hide professor financial rates from alumnas
-- profiles_select_scoped allows alumnas with a sesion_1a1 to read full professor row.
-- Use column-level privileges so tarifa_* columns are NOT selectable by authenticated users
-- via the Data API. Admin/owner read of rates must go through SECURITY DEFINER functions.
-- ============================================
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, email, nombre_completo, avatar_url, estado,
  created_at, updated_at, negocio_foto_url, negocio_nombre
) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Helper for owner/admin to read their own rate fields safely
CREATE OR REPLACE FUNCTION public.get_my_tarifas()
RETURNS TABLE(tarifa_hora_clase numeric, tarifa_sesion_1a1 numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tarifa_hora_clase, tarifa_sesion_1a1
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_profesor_tarifas(_profesor_id uuid)
RETURNS TABLE(tarifa_hora_clase numeric, tarifa_sesion_1a1 numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tarifa_hora_clase, tarifa_sesion_1a1
  FROM public.profiles
  WHERE id = _profesor_id
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR _profesor_id = auth.uid());
$$;

-- ============================================
-- FIX 2: chat_profesores_mensajes — UPDATE must require staff (matches SELECT scope)
-- ============================================
DROP POLICY IF EXISTS cp_update_self ON public.chat_profesores_mensajes;
CREATE POLICY cp_update_self_staff
ON public.chat_profesores_mensajes
FOR UPDATE
TO authenticated
USING (
  autor_id = auth.uid()
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'soporte'::app_role))
);

-- ============================================
-- FIX 3: clases_en_vivo Zoom links — restrict per-course access
-- Add optional curso_id; tighten SELECT to staff / professor / matching course permission.
-- Legacy rows (curso_id IS NULL) remain visible to any user with at least one course permission
-- to preserve existing dashboard counts.
-- ============================================
ALTER TABLE public.clases_en_vivo
  ADD COLUMN IF NOT EXISTS curso_id uuid;

DROP POLICY IF EXISTS clases_select ON public.clases_en_vivo;
CREATE POLICY clases_select
ON public.clases_en_vivo
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'soporte'::app_role)
  OR profesor_id = auth.uid()
  OR (
    curso_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.permisos_cursos pc
      WHERE pc.usuario_id = auth.uid() AND pc.curso_id = clases_en_vivo.curso_id
    )
  )
  OR (
    curso_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.permisos_cursos pc WHERE pc.usuario_id = auth.uid()
    )
  )
);
