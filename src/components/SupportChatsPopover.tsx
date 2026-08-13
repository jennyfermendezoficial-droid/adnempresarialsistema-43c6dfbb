import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatThread } from "./ChatThread";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfiles } from "@/lib/perfiles";
import { useAuth } from "@/lib/auth-context";

interface Profile { id: string; nombre_completo: string; email?: string | null; avatar_url?: string | null }
interface Chat { id: string; usuario_a_id: string; usuario_b_id: string; last_message_at: string }
interface RoleRow { user_id: string; role: string }

const nombreDePerfil = (profile?: Profile | null) =>
  profile ? formatNombre(profile.nombre_completo) || profile.email || "Usuario" : "Usuario";

export function SupportChatsPopover() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [supportContacts, setSupportContacts] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const openRef = useRef(open);
  openRef.current = open;

  const selectedChat = chats.find((chat) => chat.id === selectedId) ?? null;
  const otherId = selectedChat ? (selectedChat.usuario_a_id === uid ? selectedChat.usuario_b_id : selectedChat.usuario_a_id) : null;
  const selectedName = otherId ? nombreDePerfil(profiles[otherId]) : "Chat";

  const authorMap = useMemo(() => {
    const map: Record<string, { name: string; avatar?: string | null }> = {};
    Object.values(profiles).forEach((p) => { map[p.id] = { name: nombreDePerfil(p), avatar: p.avatar_url }; });
    return map;
  }, [profiles]);

  const esContactoPermitido = (targetId: string | null) => {
    if (!targetId) return false;
    return isStaff ? roleMap[targetId] === "usuario" : roleMap[targetId] === "soporte";
  };

  const loadData = async () => {
    if (!uid) return;
    const rolesQuery = supabase
      .from("user_roles")
      .select("user_id,role")
      .eq("role", isStaff ? "usuario" : "soporte");

    const [profileResult, chatResult, rolesResult] = await Promise.all([
      fetchPerfiles(),
      supabase.from("chats_1a1").select("id,usuario_a_id,usuario_b_id,last_message_at")
        .or(`usuario_a_id.eq.${uid},usuario_b_id.eq.${uid}`).order("last_message_at", { ascending: false }),
      rolesQuery,
    ]);

    const list = (profileResult ?? []) as Profile[];
    const map: Record<string, Profile> = {};
    list.forEach((p) => { map[p.id] = p; });
    const nextRoleMap: Record<string, string> = {};
    ((rolesResult.data ?? []) as RoleRow[]).forEach((row) => { nextRoleMap[row.user_id] = row.role; });

    setProfiles(map);
    setRoleMap(nextRoleMap);
    setChats((chatResult.data as Chat[]) ?? []);

    if (!isStaff) {
      const supportIds = Object.keys(nextRoleMap).filter((id) => id !== uid);
      setSupportContacts(list.filter((p) => supportIds.includes(p.id)));
    } else {
      setSupportContacts([]);
    }
  };

  useEffect(() => { void loadData(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [uid, isStaff]);

  useEffect(() => {
    if (!uid) return;
    const chatsChannel = supabase.channel(`support-chats-${uid}`).on("postgres_changes", { event: "*", schema: "public", table: "chats_1a1" }, () => { void loadData(); }).subscribe();
    const messagesChannel = supabase.channel(`support-chat-messages-${uid}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes_chat_1a1" }, (payload) => {
      const message = payload.new as { chat_id?: string; autor_id?: string };
      if (!openRef.current && message.autor_id !== uid && chats.some((c) => c.id === message.chat_id)) setUnread(true);
    }).subscribe();
    return () => { supabase.removeChannel(chatsChannel); supabase.removeChannel(messagesChannel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, chats]);

  useEffect(() => {
    if (!selectedId || !selectedChat || !esContactoPermitido(otherId)) {
      if (selectedId && (!selectedChat || !esContactoPermitido(otherId))) setSelectedId(null);
    }
  }, [selectedId, selectedChat, otherId, isStaff, roleMap]);

  const openChatWith = async (targetId: string) => {
    if (!uid || !esContactoPermitido(targetId)) return;
    const existing = chats.find((c) => (c.usuario_a_id === uid && c.usuario_b_id === targetId) || (c.usuario_b_id === uid && c.usuario_a_id === targetId));
    if (existing) { setSelectedId(existing.id); setShowNew(false); return; }
    const { data, error } = await supabase.from("chats_1a1").insert({ usuario_a_id: uid, usuario_b_id: targetId }).select("id,usuario_a_id,usuario_b_id,last_message_at").single();
    if (error) return;
    setChats((current) => [data as Chat, ...current]);
    setSelectedId((data as Chat).id);
    setShowNew(false); setSearch("");
  };

  const visibleChats = chats.filter((chat) => {
    const targetId = chat.usuario_a_id === uid ? chat.usuario_b_id : chat.usuario_a_id;
    return !!profiles[targetId] && esContactoPermitido(targetId);
  });
  const filteredSupport = supportContacts.filter((p) => nombreDePerfil(p).toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={(value) => { setOpen(value); if (value) setUnread(false); }}>
      <PopoverTrigger title="Chats" aria-label="Chats" className="relative w-9 h-9 grid place-items-center rounded-full transition hover:bg-white/10 outline-none" style={{ color: "var(--violet-light)" }}>
        <MessageSquare className="w-[18px] h-[18px]" />
        {unread && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: "var(--violet)" }} />}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[470px] p-0 overflow-hidden">
        {!selectedId ? (
          <div className="h-[520px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b"><span className="text-sm font-semibold">Chats</span>{!isStaff && <button onClick={() => { setShowNew((v) => !v); setSearch(""); }} className="p-1.5 rounded-lg hover:bg-muted" title="Nuevo chat con soporte"><Plus className="w-4 h-4" /></button>}</div>
            {!isStaff && showNew && (
              <div className="p-3 border-b bg-background">
                <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar soporte" className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-muted/50 text-sm outline-none focus:border-violet-400" /></div>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                  {filteredSupport.map((p) => <button key={p.id} onClick={() => void openChatWith(p.id)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted text-left"><div className="w-9 h-9 rounded-full bg-violet-gradient text-white grid place-items-center text-sm font-semibold">{nombreDePerfil(p).slice(0, 1).toUpperCase()}</div><div><div className="text-sm font-semibold">{nombreDePerfil(p)}</div><div className="text-xs text-muted-foreground">Soporte</div></div></button>)}
                  {filteredSupport.length === 0 && <div className="p-3 text-xs text-muted-foreground text-center">No hay cuentas de soporte disponibles.</div>}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {visibleChats.map((chat) => { const target = profiles[chat.usuario_a_id === uid ? chat.usuario_b_id : chat.usuario_a_id]; return <button key={chat.id} onClick={() => setSelectedId(chat.id)} className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-muted border-b"><div className="w-10 h-10 rounded-full bg-muted grid place-items-center text-sm font-semibold shrink-0 overflow-hidden">{target?.avatar_url ? <img src={target.avatar_url} alt="" className="w-full h-full object-cover" /> : nombreDePerfil(target).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{nombreDePerfil(target)}</div><div className="text-[11px] text-muted-foreground">{new Date(chat.last_message_at).toLocaleString("es-PE", { day: "2-digit", month: "short" })}</div></div></button>; })}
              {visibleChats.length === 0 && <div className="h-full grid place-items-center p-8 text-center text-sm text-muted-foreground">{isStaff ? "Aquí aparecerán los alumnos que te escriban." : "No tienes conversaciones todavía. Pulsa + para hablar con soporte."}</div>}
            </div>
          </div>
        ) : (
          <div className="h-[520px] flex flex-col"><div className="flex items-center gap-2 px-3 py-3 border-b"><button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Volver a chats"><ArrowLeft className="w-4 h-4" /></button><div className="min-w-0"><div className="text-sm font-semibold truncate">{selectedName}</div><div className="text-[11px] text-muted-foreground">Chat privado</div></div></div><div className="flex-1 min-h-0 p-2"><ChatThread table="mensajes_chat_1a1" filter={{ column: "chat_id", value: selectedId }} extraInsert={{ chat_id: selectedId }} authorMap={authorMap} height="100%" emptyHint="Escribe tu primer mensaje." pushRecipientIds={otherId ? [otherId] : undefined} pushTitle={selectedName} pushUrl="/chats" /></div></div>
        )}
      </PopoverContent>
    </Popover>
  );
}
