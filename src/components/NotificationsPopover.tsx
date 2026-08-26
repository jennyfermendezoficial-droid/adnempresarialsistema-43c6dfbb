import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell, MessageSquare, Users, CalendarClock, Video, ClipboardList, Star, CheckCircle2, AlarmClock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Notif {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  url: string | null;
  leida: boolean;
  created_at: string;
}

const ICONS: Record<string, typeof Bell> = {
  general: Users,
  chat: MessageSquare,
  chat_profesores: MessageSquare,
  sesion_nueva: CalendarClock,
  recordatorio: AlarmClock,
  sesion_finalizada: Star,
  clase_nueva: Video,
  tarea_nueva: ClipboardList,
  entrega_nueva: ClipboardList,
  tarea_calificada: CheckCircle2,
  sesion_pendiente_reprogramar: AlarmClock,
  sesion_reprogramada: CalendarClock,
  sesion_pendiente_registro: AlarmClock,
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

export function NotificationsPopover() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase
      .from("notificaciones")
      .select("id,tipo,titulo,cuerpo,url,leida,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notif[]);
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notificaciones-${uid}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones", filter: `usuario_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as Notif;
          setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, 30)));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [uid]);

  const unread = items.filter((n) => !n.leida).length;

  const markAll = async () => {
    if (!uid || unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    await supabase.from("notificaciones").update({ leida: true }).eq("usuario_id", uid).eq("leida", false);
  };

  const openItem = async (n: Notif) => {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    if (!n.leida) await supabase.from("notificaciones").update({ leida: true }).eq("id", n.id);
    setOpen(false);
    if (n.url && n.url.startsWith("/")) navigate({ to: n.url });
  };

  if (!uid) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Notificaciones"
        aria-label="Notificaciones"
        className="relative w-9 h-9 grid place-items-center rounded-full transition hover:bg-white/10 outline-none"
        style={{ color: "var(--violet-light)" }}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notificaciones</span>
          <button
            onClick={markAll}
            disabled={unread === 0}
            className="text-xs text-muted-foreground hover:underline disabled:opacity-40"
          >
            Marcar todo como leído
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 && (
            <p className="p-6 text-center text-xs text-muted-foreground">No tienes notificaciones.</p>
          )}
          {items.map((n) => {
            const Icon = ICONS[n.tipo] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`w-full text-left flex gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted transition ${n.leida ? "" : "bg-muted/40"}`}
              >
                <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full grid place-items-center bg-muted">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{n.titulo}</span>
                  {n.cuerpo && (
                    <span className="block text-xs text-muted-foreground line-clamp-2">{n.cuerpo}</span>
                  )}
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</span>
                </span>
                {!n.leida && <span className="mt-2 w-2 h-2 shrink-0 rounded-full bg-blue-500" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
