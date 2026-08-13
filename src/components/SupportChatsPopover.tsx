import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, MessageSquare, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatThread } from "./ChatThread";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfiles, type PerfilPublico } from "@/lib/perfiles";
import { useAuth } from "@/lib/auth-context";

class ChatErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="h-full grid place-items-center p-4 text-center text-sm text-muted-foreground">No se pudo cargar el chat. Cierra y vuelve a abrir el panel.</div>;
    return this.props.children;
  }
}

interface ChatRow { id: string; usuario_a_id: string; usuario_b_id: string; last_message_at: string }
const getName = (profile?: PerfilPublico) => profile ? formatNombre(profile.nombre_completo) || profile.email || "Usuario" : "Usuario";

export function SupportChatsPopover() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PerfilPublico>>({});
  const [supportContacts, setSupportContacts] = useState<PerfilPublico[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const openRef = useRef(open);
  openRef.current = open;

  const selectedChat = chats.find((chat) => chat.id === selectedId) ?? null;
  const otherId = selectedChat ? selectedChat.usuario_a_id === uid ? selectedChat.usuario_b_id : selectedChat.usuario_a_id : null;
  const selectedName = otherId ? getName(profiles[otherId]) : "Chat";

  const authorMap = useMemo(() => {
    const map: Record<string, { name: string; avatar?: string | null }> = {};
    Object.values(profiles).forEach((profile) => { map[profile.id] = { name: getName(profile), avatar: profile.avatar_url }; });
    return map;
  }, [profiles]);

  const loadData = async () => {
    if (!uid) return;
    const { data: chatData } = await supabase.from("chats_1a1").select("id,usuario_a_id,usuario_b_id,last_message_at").or(`usuario_a_id.eq.${uid},usuario_b_id.eq.${uid}`).order("last_message_at", { ascending: false });
    const nextChats = (chatData as ChatRow[]) ?? [];
    setChats(nextChats);
    const ids = Array.from(new Set(nextChats.flatMap((chat) => [chat.usuario_a_id, chat.usuario_b_id]).filter((id) => id && id !== uid)));
    const profileList = ids.length ? await fetchPerfiles(ids) : [];
    const nextProfiles: Record<string, PerfilPublico> = {};
    profileList.forEach((profile) => { nextProfiles[profile.id] = profile; });
    setProfiles(nextProfiles);
    if (!isStaff) {
      const { data } = await supabase.rpc("listar_soporte_chat");
      setSupportContacts((data as PerfilPublico[]) ?? []);
    } else setSupportContacts([]);
  };

  useEffect(() => { void loadData(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [uid, isStaff]);
  useEffect(() => {
    if (!uid) return;
    const channel = supabase.channel(`top-chat-${uid}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes_chat_1a1" }, (payload) => {
      const message = payload.new as { chat_id?: string; autor_id?: string };
      const belongsToMe = chats.some((chat) => chat.id === message.chat_id);
      if (!openRef.current && belongsToMe && message.autor_id !== uid) setUnread(true);
      if (belongsToMe) void loadData();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, chats, isStaff]);

  const openChatWith = async (targetId: string) => {
    if (!uid || isStaff) return;
    const existing = chats.find((chat) => (chat.usuario_a_id === uid && chat.usuario_b_id === targetId) || (chat.usuario_b_id === uid && chat.usuario_a_id === targetId));
    if (existing) { setSelectedId(existing.id); setShowNew(false); setSearch(""); return; }
    const { data, error } = await supabase.rpc("crear_chat_soporte", { _target_id: targetId });
    if (error || !data) return;
    const created = data as ChatRow;
    const target = (await fetchPerfiles([targetId]))[0];
    if (target) setProfiles((current) => ({ ...current, [target.id]: target }));
    setChats((current) => [created, ...current]);
    setSelectedId(created.id);
    setShowNew(false);
    setSearch("");
  };

  const visibleChats = chats.filter((chat) => {
    const other = chat.usuario_a_id === uid ? chat.usuario_b_id : chat.usuario_a_id;
    const profile = profiles[other];
    return profile && getName(profile).toLowerCase().includes(search.trim().toLowerCase());
  });
  const filteredSupport = supportContacts.filter((profile) => getName(profile).toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={(value) => { setOpen(value); if (value) { setUnread(false); setShowNew(false); setSearch(""); void loadData(); } }}>
      <PopoverTrigger title="Chats" aria-label="Chats" className="relative w-9 h-9 grid place-items-center rounded-full transition hover:bg-white/10 outline-none" style={{ color: "var(--violet-light)" }}>
        <MessageSquare className="w-[18px] h-[18px]" />
        {unread && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: "var(--violet)" }} />}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[470px] p-0 overflow-hidden">
        {selectedId ? (
          <div className="h-[520px] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-background"><button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Volver a chats"><ArrowLeft className="w-4 h-4" /></button><div className="min-w-0"><div className="text-sm font-semibold truncate">{selectedName}</div><div className="text-[11px] text-muted-foreground">Chat privado</div></div></div>
            <div className="flex-1 min-h-0 p-2"><ChatErrorBoundary><ChatThread table="mensajes_chat_1a1" filter={{ column: "chat_id", value: selectedId }} extraInsert={{ chat_id: selectedId }} authorMap={authorMap} height="100%" emptyHint="Escribe tu primer mensaje." pushRecipientIds={otherId ? [otherId] : undefined} pushTitle={selectedName} pushUrl="/chats" /></ChatErrorBoundary></div>
          </div>
        ) : (
          <div className="h-[520px] flex flex-col bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b"><span className="text-sm font-semibold">Chats</span><button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Todos<ChevronDown className="w-3.5 h-3.5" /></button></div>
            <div className="p-3 border-b"><div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isStaff ? "Buscar usuarios" : "Buscar soporte"} className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted border border-transparent text-sm outline-none focus:border-violet-400" /></div></div>
            <div className="flex-1 overflow-y-auto">
              {visibleChats.map((chat) => {
                const other = chat.usuario_a_id === uid ? chat.usuario_b_id : chat.usuario_a_id;
                const profile = profiles[other];
                return <button key={chat.id} onClick={() => setSelectedId(chat.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b hover:bg-muted/70"><div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0 grid place-items-center text-sm font-semibold">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : getName(profile).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{getName(profile)}</div><div className="text-xs text-muted-foreground truncate">{new Date(chat.last_message_at).toLocaleString("es-PE", { day: "2-digit", month: "short" })}</div></div></button>;
              })}
              {visibleChats.length === 0 && !showNew && <div className="h-full grid place-items-center p-8 text-center text-sm text-muted-foreground">{isStaff ? "Aquí aparecerán los alumnos que te escriban." : "No tienes conversaciones todavía."}</div>}
            </div>
            {!isStaff && <div className="border-t p-3 bg-background"><button onClick={() => setShowNew((value) => !value)} className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold border hover:bg-muted transition"><Plus className="w-4 h-4" />Nuevo chat con soporte</button>{showNew && <div className="mt-2 max-h-44 overflow-y-auto space-y-1">{filteredSupport.map((profile) => <button key={profile.id} onClick={() => void openChatWith(profile.id)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted text-left"><div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 grid place-items-center text-sm font-semibold">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : getName(profile).slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="text-sm font-semibold truncate">{getName(profile)}</div><div className="text-xs text-muted-foreground">Soporte</div></div></button>)}{filteredSupport.length === 0 && <div className="p-3 text-xs text-muted-foreground text-center">No hay cuentas de soporte disponibles.</div>}</div>}</div>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
