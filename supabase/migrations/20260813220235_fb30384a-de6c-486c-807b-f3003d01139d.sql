-- BIOGRAFIA
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS biografia text;

-- CATEGORIAS
CREATE TABLE public.comunidad_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  color text NOT NULL DEFAULT '#7C6BFF',
  emoji text,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunidad_categorias TO authenticated;
GRANT ALL ON public.comunidad_categorias TO service_role;
ALTER TABLE public.comunidad_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_select" ON public.comunidad_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_admin" ON public.comunidad_categorias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'));

-- POSTS
CREATE TABLE public.comunidad_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id uuid NOT NULL,
  categoria_id uuid REFERENCES public.comunidad_categorias(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  contenido text,
  media_url text,
  media_tipo text,
  fijado boolean NOT NULL DEFAULT false,
  likes_count integer NOT NULL DEFAULT 0,
  comentarios_count integer NOT NULL DEFAULT 0,
  ultimo_comentario_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunidad_posts TO authenticated;
GRANT ALL ON public.comunidad_posts TO service_role;
ALTER TABLE public.comunidad_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_select" ON public.comunidad_posts FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "posts_insert" ON public.comunidad_posts FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());
CREATE POLICY "posts_update" ON public.comunidad_posts FOR UPDATE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'))
  WITH CHECK (autor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'));
CREATE POLICY "posts_delete" ON public.comunidad_posts FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'));
CREATE TRIGGER comunidad_posts_updated_at BEFORE UPDATE ON public.comunidad_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX comunidad_posts_orden_idx ON public.comunidad_posts (fijado DESC, created_at DESC);

-- COMENTARIOS
CREATE TABLE public.comunidad_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.comunidad_posts(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL,
  parent_id uuid REFERENCES public.comunidad_comentarios(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunidad_comentarios TO authenticated;
GRANT ALL ON public.comunidad_comentarios TO service_role;
ALTER TABLE public.comunidad_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "com_select" ON public.comunidad_comentarios FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "com_insert" ON public.comunidad_comentarios FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());
CREATE POLICY "com_update" ON public.comunidad_comentarios FOR UPDATE TO authenticated
  USING (autor_id = auth.uid()) WITH CHECK (autor_id = auth.uid());
CREATE POLICY "com_delete" ON public.comunidad_comentarios FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'soporte'));
CREATE INDEX comunidad_comentarios_post_idx ON public.comunidad_comentarios (post_id, created_at);

-- LIKES
CREATE TABLE public.comunidad_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  post_id uuid REFERENCES public.comunidad_posts(id) ON DELETE CASCADE,
  comentario_id uuid REFERENCES public.comunidad_comentarios(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT like_target_chk CHECK (num_nonnulls(post_id, comentario_id) = 1)
);
CREATE UNIQUE INDEX comunidad_likes_post_uq ON public.comunidad_likes (usuario_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX comunidad_likes_com_uq ON public.comunidad_likes (usuario_id, comentario_id) WHERE comentario_id IS NOT NULL;
GRANT SELECT, INSERT, DELETE ON public.comunidad_likes TO authenticated;
GRANT ALL ON public.comunidad_likes TO service_role;
ALTER TABLE public.comunidad_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes_select" ON public.comunidad_likes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "likes_insert" ON public.comunidad_likes FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "likes_delete" ON public.comunidad_likes FOR DELETE TO authenticated USING (usuario_id = auth.uid());

-- PUNTOS
CREATE TABLE public.puntos_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  origen text NOT NULL,
  referencia_id uuid,
  puntos integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX puntos_usuario_uq ON public.puntos_usuario (usuario_id, origen, referencia_id) WHERE referencia_id IS NOT NULL;
CREATE INDEX puntos_usuario_idx ON public.puntos_usuario (usuario_id);
GRANT SELECT ON public.puntos_usuario TO authenticated;
GRANT ALL ON public.puntos_usuario TO service_role;
ALTER TABLE public.puntos_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "puntos_select" ON public.puntos_usuario FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.nivel_por_puntos(_p integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _p >= 33015 THEN 9 WHEN _p >= 8015 THEN 8 WHEN _p >= 2015 THEN 7
    WHEN _p >= 515 THEN 6 WHEN _p >= 155 THEN 5 WHEN _p >= 65 THEN 4
    WHEN _p >= 20 THEN 3 WHEN _p >= 5 THEN 2 ELSE 1 END;
$$;

CREATE OR REPLACE FUNCTION public.dar_puntos(_uid uuid, _origen text, _ref uuid, _pts integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.puntos_usuario (usuario_id, origen, referencia_id, puntos)
  SELECT _uid, _origen, _ref, _pts WHERE _uid IS NOT NULL
  ON CONFLICT DO NOTHING;
$$;

-- TRIGGERS DE PUNTOS Y CONTADORES
CREATE OR REPLACE FUNCTION public.trg_post_ins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.dar_puntos(NEW.autor_id, 'post', NEW.id, 3);
  RETURN NEW;
END; $$;
CREATE TRIGGER comunidad_post_puntos AFTER INSERT ON public.comunidad_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_ins();

CREATE OR REPLACE FUNCTION public.trg_comentario_ins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.comunidad_posts
    SET comentarios_count = comentarios_count + 1, ultimo_comentario_at = NEW.created_at
    WHERE id = NEW.post_id;
  PERFORM public.dar_puntos(NEW.autor_id, 'comentario', NEW.id, 1);
  RETURN NEW;
END; $$;
CREATE TRIGGER comunidad_comentario_ins AFTER INSERT ON public.comunidad_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_comentario_ins();

CREATE OR REPLACE FUNCTION public.trg_comentario_del() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.comunidad_posts SET comentarios_count = GREATEST(comentarios_count - 1, 0)
    WHERE id = OLD.post_id;
  RETURN OLD;
END; $$;
CREATE TRIGGER comunidad_comentario_del AFTER DELETE ON public.comunidad_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_comentario_del();

CREATE OR REPLACE FUNCTION public.trg_like_ins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _autor uuid;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    UPDATE public.comunidad_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id
      RETURNING autor_id INTO _autor;
  ELSE
    UPDATE public.comunidad_comentarios SET likes_count = likes_count + 1 WHERE id = NEW.comentario_id
      RETURNING autor_id INTO _autor;
  END IF;
  IF _autor IS NOT NULL AND _autor <> NEW.usuario_id THEN
    PERFORM public.dar_puntos(_autor, 'like', NEW.id, 1);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER comunidad_like_ins AFTER INSERT ON public.comunidad_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_like_ins();

CREATE OR REPLACE FUNCTION public.trg_like_del() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.post_id IS NOT NULL THEN
    UPDATE public.comunidad_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  ELSE
    UPDATE public.comunidad_comentarios SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comentario_id;
  END IF;
  DELETE FROM public.puntos_usuario WHERE origen = 'like' AND referencia_id = OLD.id;
  RETURN OLD;
END; $$;
CREATE TRIGGER comunidad_like_del AFTER DELETE ON public.comunidad_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_like_del();

CREATE OR REPLACE FUNCTION public.trg_leccion_completada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.completada THEN
    PERFORM public.dar_puntos(NEW.usuario_id, 'leccion', NEW.leccion_id, 2);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER progreso_lecciones_puntos AFTER INSERT OR UPDATE ON public.progreso_lecciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_leccion_completada();

-- PERFILES PUBLICOS AMPLIADOS
DROP FUNCTION IF EXISTS public.perfiles_publicos(uuid[]);
CREATE OR REPLACE FUNCTION public.perfiles_publicos(_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(id uuid, nombre_completo text, avatar_url text, actividad text,
              biografia text, created_at timestamptz, puntos integer, nivel integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.nombre_completo, p.avatar_url, p.actividad, p.biografia, p.created_at,
         COALESCE(pt.total, 0)::integer AS puntos,
         public.nivel_por_puntos(COALESCE(pt.total, 0)::integer) AS nivel
  FROM public.profiles p
  LEFT JOIN (
    SELECT usuario_id, SUM(puntos) AS total FROM public.puntos_usuario GROUP BY usuario_id
  ) pt ON pt.usuario_id = p.id
  WHERE auth.uid() IS NOT NULL AND (_ids IS NULL OR p.id = ANY(_ids))
$$;

-- CATEGORIAS INICIALES
INSERT INTO public.comunidad_categorias (nombre, color, emoji, orden) VALUES
  ('Novedades', '#7C6BFF', '📣', 1),
  ('Dudas', '#22C55E', '❓', 2),
  ('Logros', '#F59E0B', '🏆', 3),
  ('Recursos', '#38BDF8', '📚', 4);

-- LIMPIEZA TUTORIALES
ALTER TABLE public.app_config DROP COLUMN IF EXISTS tutorial_alumnos_url;
ALTER TABLE public.app_config DROP COLUMN IF EXISTS tutorial_profesores_url;