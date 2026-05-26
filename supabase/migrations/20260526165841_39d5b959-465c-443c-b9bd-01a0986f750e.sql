
-- Habilitar realtime en tablas de mensajes y sesiones para notificaciones globales
ALTER TABLE public.mensajes_chat_1a1 REPLICA IDENTITY FULL;
ALTER TABLE public.canal_general_mensajes REPLICA IDENTITY FULL;
ALTER TABLE public.sesiones_1a1 REPLICA IDENTITY FULL;
ALTER TABLE public.soporte_privado_mensajes REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat_1a1; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.canal_general_mensajes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sesiones_1a1; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.soporte_privado_mensajes; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Foto del negocio para la portada del PDF
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS negocio_foto_url text,
  ADD COLUMN IF NOT EXISTS negocio_nombre text;

-- Tabla de suscripciones push (Web Push VAPID) — base para notificaciones con app cerrada
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_self_all"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
