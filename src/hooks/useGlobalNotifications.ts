import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { notify, registerSW, ensureNotificationPermission } from "@/lib/notifications";
import { subscribePushIfPossible } from "@/lib/push-subscribe";

/**
 * Suscribe al usuario a notificaciones globales:
 *  - Mensajes nuevos en sus chats 1a1
 *  - Mensajes en canal general
 *  - Recordatorios de sesiones 1a1 (10 min antes y al iniciar)
 *  - Recordatorios de actividades de "Mi Agenda" (5 min antes)
 *  - Sesión finalizada → calificación pendiente
 */
export function useGlobalNotifications() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const remindedRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());

  // Registrar SW + pedir permiso al montar
  useEffect(() => {
    if (!uid) return;
    registerSW();
    // Pedir permiso después de un pequeño delay para que no sea agresivo
    const t = setTimeout(async () => {
      const perm = await ensureNotificationPermission();
      if (perm === "granted") {
        // Suscribir al Web Push (para notificaciones con navegador cerrado)
        subscribePushIfPossible(uid);
      }
    }, 2500);

    // Navegar cuando el SW pide abrir una URL al click
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; url?: string } | undefined;
      if (data?.type === "NAVIGATE" && data.url) {
        try {
          if (/^https?:\/\//i.test(data.url)) window.open(data.url, "_blank");
          else window.location.assign(data.url);
        } catch { /* noop */ }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => {
      clearTimeout(t);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [uid]);

  // --- Realtime: mensajes 1a1 dirigidos a este usuario ---
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notif-msg-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes_chat_1a1" }, async (payload) => {
        const row = payload.new as { id: string; chat_id: string; autor_id: string; contenido: string | null; tipo: string };
        if (row.autor_id === uid) return;
        if (seenRef.current.has(row.id)) return;
        seenRef.current.add(row.id);
        // Verifica que el chat sea suyo
        const { data: chat } = await supabase
          .from("chats_1a1")
          .select("usuario_a_id, usuario_b_id")
          .eq("id", row.chat_id)
          .maybeSingle();
        if (!chat) return;
        if (chat.usuario_a_id !== uid && chat.usuario_b_id !== uid) return;
        const { data: prof } = await supabase
          .from("profiles").select("nombre_completo, email").eq("id", row.autor_id).maybeSingle();
        const nombre = prof?.nombre_completo || prof?.email || "Mensaje nuevo";
        notify({
          title: nombre,
          body: row.tipo === "texto" ? (row.contenido ?? "") : `Te envió un ${row.tipo}`,
          tag: `chat-${row.chat_id}`,
          url: "/chats",
          sound: "ping",
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "canal_general_mensajes" }, async (payload) => {
        const row = payload.new as { id: string; autor_id: string; contenido: string | null; tipo: string };
        if (row.autor_id === uid) return;
        if (seenRef.current.has(row.id)) return;
        seenRef.current.add(row.id);
        const { data: prof } = await supabase
          .from("profiles").select("nombre_completo, email").eq("id", row.autor_id).maybeSingle();
        notify({
          title: `${prof?.nombre_completo || "Comunidad"} · #general`,
          body: row.tipo === "texto" ? (row.contenido ?? "") : `Compartió un ${row.tipo}`,
          tag: `general-${row.id}`,
          url: "/general",
          sound: "soft",
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sesiones_1a1" }, async (payload) => {
        const row = payload.new as { id: string; alumna_id: string; estado: string; finalizada_at: string | null };
        if (row.alumna_id !== uid) return;
        if (row.estado === "finalizada" || row.finalizada_at) {
          notify({
            title: "Clase finalizada",
            body: "Califica a tu profesor en 30 segundos ⭐",
            tag: `rate-${row.id}`,
            url: "/inicio",
            sound: "ring",
          });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sesiones_1a1" }, async (payload) => {
        const row = payload.new as { id: string; profesor_id: string; alumna_id: string; fecha: string; hora_inicio: string };
        if (seenRef.current.has(`new-${row.id}`)) return;
        seenRef.current.add(`new-${row.id}`);
        // Notifica al profesor y a los admins
        const isProfesor = row.profesor_id === uid;
        const isAdmin = role === "admin";
        if (!isProfesor && !isAdmin) return;
        const { data: alumna } = await supabase
          .from("profiles").select("nombre_completo, email").eq("id", row.alumna_id).maybeSingle();
        const nombre = alumna?.nombre_completo || alumna?.email || "Una alumna";
        const fechaTxt = new Date(row.fecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
        notify({
          title: "Nueva reserva 1 a 1",
          body: `${nombre} agendó para ${fechaTxt} · ${String(row.hora_inicio).slice(0,5)}`,
          tag: `new-${row.id}`,
          url: "/agenda-1a1",
          sound: "ring",
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [uid]);

  // --- Poll cada minuto: recordatorios de clases y agenda ---
  useEffect(() => {
    if (!uid) return;
    const check = async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const nowMin = now.getHours() * 60 + now.getMinutes();

      // Sesiones 1a1: usuarias y profesores
      const filterCol = role === "usuario" ? "alumna_id" : "profesor_id";
      const { data: ses } = await supabase
        .from("sesiones_1a1")
        .select("id, profesor_id, alumna_id, fecha, hora_inicio, zoom_link, estado")
        .eq(filterCol, uid)
        .eq("fecha", today);
      for (const s of ses ?? []) {
        if (s.estado === "cancelada" || s.estado === "finalizada") continue;
        const [hh, mm] = String(s.hora_inicio).split(":").map(Number);
        const startMin = hh * 60 + mm;
        const diff = startMin - nowMin;
        // 10 min antes
        if (diff === 10 && !remindedRef.current.has(`pre10-${s.id}`)) {
          remindedRef.current.add(`pre10-${s.id}`);
          notify({
            title: "Tu sesión 1 a 1 comienza en 10 min",
            body: "Prepárate, en 10 minutos arranca tu clase.",
            tag: `pre10-${s.id}`,
            url: "/agenda-1a1",
            sound: "soft",
          });
        }
        // Al iniciar
        if (diff === 0 && !remindedRef.current.has(`start-${s.id}`)) {
          remindedRef.current.add(`start-${s.id}`);
          notify({
            title: "¡Tu sesión 1 a 1 está empezando!",
            body: "Entra ahora a la reunión Zoom.",
            tag: `start-${s.id}`,
            url: s.zoom_link || "/agenda-1a1",
            sound: "ring",
          });
        }
      }

      // Mi Agenda Emprendedora
      if (role === "usuario") {
        const { data: act } = await supabase
          .from("ae_actividades")
          .select("id, titulo, fecha, hora_inicio")
          .eq("usuario_id", uid)
          .eq("fecha", today);
        for (const a of act ?? []) {
          const [hh, mm] = String(a.hora_inicio).split(":").map(Number);
          const diff = hh * 60 + mm - nowMin;
          if (diff === 5 && !remindedRef.current.has(`act5-${a.id}`)) {
            remindedRef.current.add(`act5-${a.id}`);
            notify({
              title: "Recordatorio de agenda",
              body: `En 5 min: ${a.titulo}`,
              tag: `act-${a.id}`,
              url: "/mi-agenda",
              sound: "soft",
            });
          }
          if (diff === 0 && !remindedRef.current.has(`act0-${a.id}`)) {
            remindedRef.current.add(`act0-${a.id}`);
            notify({
              title: a.titulo,
              body: "Tu actividad de agenda comienza ahora.",
              tag: `act-${a.id}`,
              url: "/mi-agenda",
              sound: "ping",
            });
          }
        }
      }
    };
    check();
    const t = window.setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [uid, role]);
}