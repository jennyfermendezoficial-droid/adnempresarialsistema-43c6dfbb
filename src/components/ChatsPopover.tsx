import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Search, ArrowLeft, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatThread } from "./ChatThread";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfiles, type PerfilPublico } from "@/lib/perfiles";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface Chat { id: string; usuario_a_id: string; usuario_b_id: string; last_message_at: string }
interface UltimoMsg { chat_id: string; autor_id: string; contenido: string | null; tipo: string; created_at: string; leido: boolean }

class ChatErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div className="h-full grid place-items-center p-4 text-center text-sm text-muted-foreground">
          No se pudo cargar el chat. Cierra y vuelve a abrir el panel.
        </div>
      );
    }
    return this.props.children;
  }
}

function tiempoRelativo(iso: string) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias < 1) return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  if (dias < 30) return `${dias}d`;
  return d.toLocaleDateString("es-EC", { month: "short", day: "numeric" });
}

function preview(m?: UltimoMsg) {
  if (!m) return "Sin mensajes todavía";
  if (m.tipo === "texto") return m.contenido || "";
  if (m.tipo === "audio") return "Nota de voz";
  if (m.tipo === "imagen") return "Imagen";
  return "Archivo";
}

export function ChatsPopover() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";

  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, PerfilPublico>>({});
  const [ultimos, setUltimos] = useState<Record<string, UltimoMsg>>({});
  const [soporte, setSoporte] = useState<PerfilPublico[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "no_leidos">("todos");
  const [selected, setSelected] = useState<string | null>(null);

  const otro = useCallback((c: Chat) => (c.usuario_a_id === uid ? c.usuario_b_id : c.usuario_a_id), [uid]);

  const cargar = useCallback(async () => {
    if (!uid) return;
    const { data: rows } = await supabase
      .from("chats_1a1").select("*").order("last_message_at", { ascending: false });
    const lista = (rows as Chat[]) ?? [];
    setChats(lista);

    const ids = new Set<string>(lista.map((c) => (c.usuario_a_id === uid ? c.usuario_b_id : c.usuario_a_id)));

    // Solo los alumnos pueden iniciar chats, y solo con soporte/profesores.
    if (!isStaff) {
      const { data: staff } = await supabase.rpc("listar_profesores");
      const s = ((staff ?? []) as { id: string; nombre_completo: string; avatar_url: string | null }[])
        .filter((p) => p.id !== uid)
        .map((p) => ({ id: p.id, nombre_completo: p.nombre_completo, avatar_url: p.avatar_url }));
      setSoporte(s);
      s.forEach((p) => ids.add(p.id));
    } else {
      setSoporte([]);
    }

    if (ids.size) {
      const perfs = await fetchPerfiles(Array.from(ids));
      const m: Record<string, PerfilPublico> = {};
      perfs.forEach((p) => { m[p.id] = p; });
      setPerfiles(m);
    }

    if (lista.length) {
      const { data: msgs } = await supabase
        .from("mensajes_chat_1a1")
        .select("chat_id,autor_id,contenido,tipo,created_at,leido")
        .in("chat_id", lista.map((c) => c.id))
        .order("created_at", { ascending: true });
      const u: Record<string, UltimoMsg> = {};
      ((msgs ?? []) as UltimoMsg[]).forEach((m) => { u[m.chat_id] = m; });
      setUltimos(u);
    } else {
      setUltimos({});
    }
  }, [uid, isStaff]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime: refresca lista y marca no leídos
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`chats-popover-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes_chat_1a1" }, () => { cargar(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chats_1a1" }, () => { cargar(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [uid, cargar]);

  const nombre = (id: string) => formatNombre(perfiles[id]?.nombre_completo || "") || "Usuario";

  const noLeidos = useMemo(
    () => chats.filter((c) => { const m = ultimos[c.id]; return m && m.autor_id !== uid && !m.leido; }).length,
    [chats, ultimos, uid],
  );

  const chatsVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return chats
      .filter((c) => (filtro === "todos" ? true : (() => { const m = ultimos[c.id]; return m && m.autor_id !== uid && !m.leido; })()))
      .filter((c) => !q || nombre(otro(c)).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, ultimos, busqueda, filtro, perfiles, uid, otro]);

  const soporteSinChat = useMemo(() => {
    if (isStaff) return [];
    const q = busqueda.trim().toLowerCase();
    const conChat = new Set(chats.map((c) => otro(c)));
    return soporte
      .filter((p) => !conChat.has(p.id))
      .filter((p) => !q || (formatNombre(p.nombre_completo || "") || "").toLowerCase().includes(q));
  }, [isStaff, soporte, chats, busqueda, otro]);

  const abrirCon = async (otherId: string) => {
    if (!uid) return;
    const existe = chats.find((c) => otro(c) === otherId);
    if (existe) return setSelected(existe.id);
    const { data, error } = await supabase
      .from("chats_1a1").insert({ usuario_a_id: uid, usuario_b_id: otherId }).select().single();
    if (error) return toast.error(error.message);
    setChats((c) => [data as Chat, ...c]);
    setSelected((data as Chat).id);
  };

  const marcarLeido = async (chatId: string) => {
    if (!uid) return;
    await supabase.from("mensajes_chat_1a1").update({ leido: true })
      .eq("chat_id", chatId).neq("autor_id", uid).eq("leido", false);
    setUltimos((u) => (u[chatId] ? { ...u, [chatId]: { ...u[chatId], leido: true } } : u));
  };

  const seleccionar = (chatId: string) => { setSelected(chatId); marcarLeido(chatId); };

  const chatActivo = chats.find((c) => c.id === selected);
  const authorMap = useMemo(() => {
    const m: Record<string, { name: string; avatar?: string | null }> = {};
    Object.values(perfiles).forEach((p) => {
      m[p.id] = { name: formatNombre(p.nombre_completo || "") || "Usuario", avatar: p.avatar_url };
    });
    return m;
  }, [perfiles]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelected(null); }}>
      <PopoverTrigger
        title="Chats"
        aria-label="Chats"
        className="relative w-9 h-9 grid place-items-center rounded-full transition hover:bg-white/10 outline-none"
        style={{ color: "var(--violet-light)" }}
      >
        <MessageSquare className="w-[18px] h-[18px]" />
        {noLeidos > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: "var(--violet)" }} />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-0 overflow-hidden">
        {selected && chatActivo ? (
          <>
            <div className="flex items-center gap-2 px-2 py-2 border-b">
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Volver">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold truncate">{nombre(otro(chatActivo))}</span>
            </div>
            <div className="h-[420px]">
              <ChatErrorBoundary>
                <ChatThread
                  table="mensajes_chat_1a1"
                  filter={{ column: "chat_id", value: chatActivo.id }}
                  extraInsert={{ chat_id: chatActivo.id }}
                  authorMap={authorMap}
                  height="100%"
                  emptyHint="Escribe tu duda o consulta."
                  pushRecipientIds={[otro(chatActivo)]}
                  pushTitle="Mensaje nuevo"
                  pushUrl="/chats"
                />
              </ChatErrorBoundary>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">Chats</span>
              <button
                onClick={() => setFiltro((f) => (f === "todos" ? "no_leidos" : "todos"))}
                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
              >
                {filtro === "todos" ? "Todos" : "No leídos"} <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-50" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={isStaff ? "Buscar en tus chats" : "Buscar usuarios"}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-muted text-sm outline-none"
                />
              </div>
            </div>
            <div className="h-[420px] overflow-y-auto">
              {chatsVisibles.map((c) => {
                const o = otro(c);
                const m = ultimos[c.id];
                const sinLeer = !!m && m.autor_id !== uid && !m.leido;
                return (
                  <button
                    key={c.id}
                    onClick={() => seleccionar(c.id)}
                    className="w-full text-left px-3 py-2.5 flex gap-3 items-center hover:bg-muted border-b"
                  >
                    <Avatar url={perfiles[o]?.avatar_url} name={nombre(o)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">
                        <span className="font-semibold">{nombre(o)}</span>
                        <span className="text-muted-foreground"> · {tiempoRelativo(m?.created_at || c.last_message_at)}</span>
                      </div>
                      <div className={`text-xs truncate ${sinLeer ? "font-semibold" : "text-muted-foreground"}`}>
                        {preview(m)}
                      </div>
                    </div>
                  </button>
                );
              })}

              {soporteSinChat.length > 0 && (
                <>
                  <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Soporte
                  </div>
                  {soporteSinChat.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => abrirCon(p.id)}
                      className="w-full text-left px-3 py-2.5 flex gap-3 items-center hover:bg-muted border-b"
                    >
                      <Avatar url={p.avatar_url} name={formatNombre(p.nombre_completo || "") || "Soporte"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{formatNombre(p.nombre_completo || "") || "Soporte"}</div>
                        <div className="text-xs text-muted-foreground truncate">Escribir a soporte</div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {chatsVisibles.length === 0 && soporteSinChat.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">
                  {isStaff ? "Aún no tienes chats. Aparecerán cuando un alumno te escriba." : "No hay resultados."}
                </p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) return <img src={url} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-full shrink-0 grid place-items-center text-xs font-bold bg-muted text-muted-foreground">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
