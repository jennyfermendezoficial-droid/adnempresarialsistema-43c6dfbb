import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/miembros")({ component: Page });

interface Row { id: string; nombre_completo: string; email: string; avatar_url: string | null; estado: string; role?: string }

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,nombre_completo,email,avatar_url,estado"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r: { user_id: string; role: string }) => {
        if (!roleMap.has(r.user_id) || r.role === "admin") roleMap.set(r.user_id, r.role);
      });
      setRows(((profs as Row[]) ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) || "usuario" })));
    })();
  }, []);

  const filtered = rows.filter((r) => (r.nombre_completo + " " + r.email).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold mb-1">Miembros</h1>
      <p className="text-sm text-muted-foreground mb-4">{rows.length} {rows.length === 1 ? "miembro" : "miembros"} en la comunidad.</p>
      <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full mb-4 px-3 py-2 rounded-lg border bg-background" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((r) => (
          <div key={r.id} className="p-4 rounded-2xl border bg-card flex gap-3 items-center">
            {r.avatar_url ? (
              <img src={r.avatar_url} className="w-12 h-12 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-12 h-12 rounded-full grid place-items-center text-white font-semibold" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
                {(r.nombre_completo || r.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold truncate">{r.nombre_completo || r.email}</div>
              <div className="text-xs opacity-70 truncate">{r.email}</div>
              <div className="text-[11px] mt-1 flex gap-1">
                <span className="px-1.5 py-0.5 rounded bg-muted">{r.role}</span>
                <span className={`px-1.5 py-0.5 rounded ${r.estado === "activo" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{r.estado}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
