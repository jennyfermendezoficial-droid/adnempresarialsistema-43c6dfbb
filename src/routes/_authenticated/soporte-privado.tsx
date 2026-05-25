import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChatThread } from "@/components/ChatThread";

export const Route = createFileRoute("/_authenticated/soporte-privado")({ component: Page });

interface Profile { id: string; nombre_completo: string; email: string; avatar_url: string | null }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const [users, setUsers] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [authorMap, setAuthorMap] = useState<Record<string, { name: string }>>({});

  useEffect(() => {
    supabase.from("profiles").select("id,nombre_completo,email,avatar_url").then(({ data }) => {
      const list = (data ?? []) as Profile[];
      const m: Record<string, { name: string }> = {};
      list.forEach((p) => { m[p.id] = { name: p.nombre_completo || p.email }; });
      setAuthorMap(m);
      if (isStaff) setUsers(list.filter((p) => p.id !== uid));
    });
  }, [uid, isStaff]);

  if (!uid) return null;

  if (!isStaff) {
    return (
      <div className="p-6 max-w-3xl mx-auto h-screen flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Soporte privado</h1>
          <p className="text-sm text-muted-foreground">Conversación privada con el equipo. Solo tú y soporte la ven.</p>
        </div>
        <div className="flex-1 min-h-0">
          <ChatThread
            table="soporte_privado_mensajes"
            filter={{ column: "usuario_id", value: uid }}
            extraInsert={{ usuario_id: uid }}
            authorMap={authorMap}
            height="100%"
            allowDelete={false}
          />
        </div>
      </div>
    );
  }

  // Staff view: pick a user
  return (
    <div className="flex h-screen">
      <aside className="w-72 border-r overflow-y-auto p-3 bg-card">
        <h2 className="font-semibold mb-3">Conversaciones</h2>
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelected(u.id)}
            className={`w-full text-left p-2 rounded-lg mb-1 hover:bg-muted text-sm ${selected === u.id ? "bg-muted font-semibold" : ""}`}
          >
            {u.nombre_completo || u.email}
            <div className="text-[11px] opacity-60 truncate">{u.email}</div>
          </button>
        ))}
        {users.length === 0 && <p className="text-xs text-muted-foreground">Sin usuarios.</p>}
      </aside>
      <main className="flex-1 p-6 flex flex-col min-h-0">
        {selected ? (
          <>
            <h1 className="text-xl font-semibold mb-3">Chat con {authorMap[selected]?.name}</h1>
            <div className="flex-1 min-h-0">
              <ChatThread
                table="soporte_privado_mensajes"
                filter={{ column: "usuario_id", value: selected }}
                extraInsert={{ usuario_id: selected }}
                authorMap={authorMap}
                height="100%"
                allowDelete={false}
              />
            </div>
          </>
        ) : (
          <div className="m-auto text-muted-foreground">Selecciona un usuario para abrir la conversación.</div>
        )}
      </main>
    </div>
  );
}
