CREATE OR REPLACE FUNCTION public.nivel_por_puntos(_p integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _p >= 33015 THEN 9 WHEN _p >= 8015 THEN 8 WHEN _p >= 2015 THEN 7
    WHEN _p >= 515 THEN 6 WHEN _p >= 155 THEN 5 WHEN _p >= 65 THEN 4
    WHEN _p >= 20 THEN 3 WHEN _p >= 5 THEN 2 ELSE 1 END;
$function$;