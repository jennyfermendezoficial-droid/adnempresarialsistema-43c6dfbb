import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChatThread } from "@/components/ChatThread";
import { Plus, Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chats")({ component: Page });

interface Profile { id: string; nombre_completo: string; email: string }
interface Chat { id: string; usuario_a_id: string; usuario_b_id: string; last_message_at: string }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [chats, setChats] = useState<Chat[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [allUsers, setAllUsers] = useState<Profile[]>([]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      const { data: profs } = await supabase.from("profiles").select("id,nombre_completo,email");
      const list = (profs ?? []) as Profile[];
      const m: Record<string, Profile> = {};
      list.forEach((p) => { m[p.id] = p; });
      setProfiles(m);

      if (isStaff) {
        // Profesores (admin/soporte) SOLO pueden abrir chats con estudiantes (rol "usuario").
        // Entre staff usamos WhatsApp / chat-profesores.
        const { data: staffRoles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admin", "soporte"]);
        const staffIds = new Set(((staffRoles ?? []) as { user_id: string }[]).map((r) => r.user_id));
        setAllUsers(list.filter((p) => p.id !== uid && !staffIds.has(p.id)));
      } else {
        // Estudiantes solo pueden chatear con admin o soporte (profesores).
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["admin", "soporte"]);
        const staffIds = new Set(((roles ?? []) as { user_id: string }[]).map((r) => r.user_id));
        setAllUsers(list.filter((p) => p.id !== uid && staffIds.has(p.id)));
      }
    })();
    supabase.from("chats_1a1").select("*").order("last_message_at", { ascending: false }).then(({ data }) => {
      setChats((data as Chat[]) ?? []);
    });
  }, [uid, isStaff]);

  const authorMap = useMemo(() => {
    const m: Record<string, { name: string }> = {};
    Object.values(profiles).forEach((p) => { m[p.id] = { name: p.nombre_completo || p.email }; });
    return m;
  }, [profiles]);

  const other = (c: Chat) => (c.usuario_a_id === uid ? c.usuario_b_id : c.usuario_a_id);

  const openChatWith = async (otherId: string) => {
    if (!uid) return;
    const existing = chats.find((c) => (c.usuario_a_id === uid && c.usuario_b_id === otherId) || (c.usuario_b_id === uid && c.usuario_a_id === otherId));
    if (existing) { setSelected(existing.id); setShowNew(false); return; }
    const { data, error } = await supabase.from("chats_1a1").insert({ usuario_a_id: uid, usuario_b_id: otherId }).select().single();
    if (error) return toast.error(error.message);
    setChats((c) => [data as Chat, ...c]);
    setSelected((data as Chat).id);
    setShowNew(false);
  };

  if (!uid) return null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-screen">
      {/* En móvil: si hay chat seleccionado se oculta la lista */}
      <aside className={`${selected ? "hidden md:flex" : "flex"} w-full md:w-80 border-r flex-col bg-card`}>
        <div className="p-3 border-b flex items-center gap-2">
          <h2 className="font-semibold flex-1">Chats</h2>
          <button onClick={() => setShowNew((v) => !v)} className="p-1.5 rounded-lg hover:bg-muted" title="Nuevo chat"><Plus className="w-4 h-4" /></button>
        </div>
        {showNew && (
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 opacity-50" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuario…" className="w-full pl-8 pr-2 py-2 rounded-lg border bg-background text-sm" />
            </div>
            <div className="max-h-64 overflow-y-auto mt-2">
              {allUsers.filter((u) => (u.nombre_completo || u.email).toLowerCase().includes(search.toLowerCase())).map((u) => (
                <button key={u.id} onClick={() => openChatWith(u.id)} className="w-full text-left p-2 rounded-lg hover:bg-muted text-sm">
                  {u.nombre_completo || u.email}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {chats.map((c) => {
            const o = profiles[other(c)];
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 hover:bg-muted border-b ${selected === c.id ? "bg-muted" : ""}`}>
                <div className="text-sm font-semibold">{o?.nombre_completo || o?.email || "Usuario"}</div>
                <div className="text-[11px] opacity-60">{new Date(c.last_message_at).toLocaleString("es-PE")}</div>
              </button>
            );
          })}
          {chats.length === 0 && <p className="p-4 text-xs text-muted-foreground">No tienes chats. Pulsa + para iniciar.</p>}
        </div>
      </aside>
      <main className={`${selected ? "flex" : "hidden md:flex"} flex-1 p-4 md:p-6 flex-col min-h-0`}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setSelected(null)} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-lg md:text-xl font-semibold truncate">
                {profiles[other(chats.find((c) => c.id === selected)!)]?.nombre_completo || "Chat"}
              </h1>
            </div>
            <div className="flex-1 min-h-0">
              <ChatThread
                table="mensajes_chat_1a1"
                filter={{ column: "chat_id", value: selected }}
                extraInsert={{ chat_id: selected }}
                authorMap={authorMap}
                height="100%"
                pushRecipientIds={(() => {
                  const c = chats.find((c) => c.id === selected);
                  return c ? [other(c)] : undefined;
                })()}
                pushTitle={profiles[other(chats.find((c) => c.id === selected)!)]?.nombre_completo || "Mensaje nuevo"}
                pushUrl="/chats"
              />
            </div>
          </>
        ) : (
          <div className="m-auto text-muted-foreground">Selecciona o inicia un chat.</div>
        )}
      </main>
    </div>
  );
}
