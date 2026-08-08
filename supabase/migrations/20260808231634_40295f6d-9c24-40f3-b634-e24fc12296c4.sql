CREATE OR REPLACE FUNCTION public.titlecase_nombre(_txt text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _clean text;
  _parts text[];
  _out text[] := ARRAY[]::text[];
  _w text;
  _i int := 0;
  _low text[] := ARRAY['de','del','la','las','los','y','e','da','do','dos','van','von','di'];
BEGIN
  IF _txt IS NULL THEN RETURN NULL; END IF;
  _clean := btrim(regexp_replace(_txt, '\s+', ' ', 'g'));
  IF _clean = '' THEN RETURN _clean; END IF;
  _parts := string_to_array(_clean, ' ');
  FOREACH _w IN ARRAY _parts LOOP
    _i := _i + 1;
    IF _i > 1 AND lower(_w) = ANY(_low) THEN
      _out := _out || lower(_w);
    ELSE
      _out := _out || (upper(left(_w, 1)) || lower(substr(_w, 2)));
    END IF;
  END LOOP;
  RETURN array_to_string(_out, ' ');
END;
$$;

CREATE OR REPLACE FUNCTION public.normalizar_nombre_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nombre_completo := public.titlecase_nombre(NEW.nombre_completo);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalizar_nombre ON public.profiles;
CREATE TRIGGER profiles_normalizar_nombre
BEFORE INSERT OR UPDATE OF nombre_completo ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalizar_nombre_profile();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre_completo, estado)
  VALUES (
    NEW.id,
    NEW.email,
    public.titlecase_nombre(COALESCE(NEW.raw_user_meta_data->>'nombre_completo', '')),
    'activo'::public.user_estado
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'usuario'::public.app_role);

  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET nombre_completo = public.titlecase_nombre(nombre_completo)
WHERE nombre_completo IS DISTINCT FROM public.titlecase_nombre(nombre_completo);