
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin_email BOOLEAN;
BEGIN
  is_admin_email := (NEW.email = 'jzime2323@gmail.com');

  INSERT INTO public.profiles (id, email, nombre_completo, estado)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', ''),
    'activo'::public.user_estado
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN is_admin_email THEN 'admin'::public.app_role ELSE 'usuario'::public.app_role END
  );

  RETURN NEW;
END;
$function$;

UPDATE public.profiles SET estado = 'activo'::public.user_estado WHERE estado = 'pendiente_aprobacion'::public.user_estado;
