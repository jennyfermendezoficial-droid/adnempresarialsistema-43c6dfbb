CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, nombre_completo, estado)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', ''),
    'activo'::public.user_estado
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'usuario'::public.app_role);

  RETURN NEW;
END;
$function$;