-- Ficha de profesor / datos de pago: lectura y guardado seguro del propio usuario.
-- Evita depender de permisos directos sobre public.profiles y nunca permite editar otro perfil.

CREATE OR REPLACE FUNCTION public.debe_completar_ficha_profesor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        public.has_role(auth.uid(), 'soporte')
        OR (
          lower(coalesce(p.nombre_completo, '')) LIKE '%erick%'
          AND lower(coalesce(p.nombre_completo, '')) LIKE '%troya%'
        )
        OR (
          lower(coalesce(p.nombre_completo, '')) LIKE '%jaime%'
          AND lower(coalesce(p.nombre_completo, '')) LIKE '%zambrano%'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.debe_completar_ficha_profesor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debe_completar_ficha_profesor() TO authenticated;

CREATE OR REPLACE FUNCTION public.obtener_mi_ficha_profesor()
RETURNS TABLE (
  id uuid,
  nombre_completo text,
  cedula text,
  fecha_nacimiento date,
  whatsapp text,
  direccion text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  banco_logo_url text,
  observacion_ficha text,
  avatar_url text,
  ficha_completa boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.nombre_completo,
    p.cedula,
    p.fecha_nacimiento,
    p.whatsapp,
    p.direccion,
    p.banco,
    p.tipo_cuenta,
    p.numero_cuenta,
    p.titular_cuenta,
    p.banco_logo_url,
    p.observacion_ficha,
    p.avatar_url,
    p.ficha_completa
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.obtener_mi_ficha_profesor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_mi_ficha_profesor() TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_mi_ficha_profesor(
  _nombre_completo text,
  _cedula text,
  _fecha_nacimiento date,
  _whatsapp text,
  _direccion text,
  _banco text,
  _tipo_cuenta text,
  _numero_cuenta text,
  _titular_cuenta text,
  _banco_logo_url text,
  _observacion_ficha text DEFAULT NULL,
  _avatar_url text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_completa boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_completa :=
    length(trim(coalesce(_nombre_completo, ''))) >= 3
    AND length(trim(coalesce(_cedula, ''))) >= 5
    AND _fecha_nacimiento IS NOT NULL
    AND length(trim(coalesce(_whatsapp, ''))) >= 7
    AND length(trim(coalesce(_direccion, ''))) >= 4
    AND length(trim(coalesce(_banco, ''))) >= 2
    AND length(trim(coalesce(_tipo_cuenta, ''))) >= 2
    AND length(trim(coalesce(_numero_cuenta, ''))) >= 5
    AND length(trim(coalesce(_titular_cuenta, ''))) >= 3
    AND length(trim(coalesce(_banco_logo_url, ''))) > 0;

  IF NOT v_completa THEN
    RAISE EXCEPTION 'Faltan datos obligatorios de la ficha';
  END IF;

  UPDATE public.profiles
  SET
    nombre_completo = trim(_nombre_completo),
    cedula = trim(_cedula),
    fecha_nacimiento = _fecha_nacimiento,
    whatsapp = trim(_whatsapp),
    direccion = trim(_direccion),
    banco = trim(_banco),
    tipo_cuenta = trim(_tipo_cuenta),
    numero_cuenta = trim(_numero_cuenta),
    titular_cuenta = trim(_titular_cuenta),
    banco_logo_url = trim(_banco_logo_url),
    observacion_ficha = NULLIF(trim(coalesce(_observacion_ficha, '')), ''),
    avatar_url = COALESCE(NULLIF(trim(coalesce(_avatar_url, '')), ''), avatar_url),
    ficha_completa = true
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_mi_ficha_profesor(text,text,date,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_mi_ficha_profesor(text,text,date,text,text,text,text,text,text,text,text,text) TO authenticated;

-- Si PostgREST estaba cacheando el schema, forzar que detecte las RPC recién creadas.
NOTIFY pgrst, 'reload schema';
