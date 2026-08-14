import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPerfiles, type PerfilPublico } from "@/lib/perfiles";
import { Avatar } from "@/components/NivelBadge";
import { formatNombre } from "@/lib/nombres";
import { Search, MessageSquare, CalendarDays, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/miembros")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Miembros · ADN Empresarial" },
      { name: "description", content: "Explora los miembros de la comunidad ADN Empresarial, su nivel y actividad, y empieza una conversación." },
      { property: "og:title", content: "Miembros · ADN Empresarial" },
      { property: "og:description", content: "Miembros, administradores y quién está en línea ahora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Miembro extends PerfilPublico {
  role: string;
  ultimaActividad?: string | null;
}

const ONLINE_MS = 5 * 60 * 1000;

function slugHandle(m: Miembro) {
  const base = (formatNombre(m.nombre_completo) || "miembro")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const num = parseInt(m.id.replace(/\D/g, "").slice(0, 4) || "0", 10) % 10000;
  return `@${base}-${String(num).padStart(4, "0")}`;
}

function fechaCorta(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });
}

function activoHace(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < ONLINE_MS) return null;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `Activo hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Activo hace ${h}h`;
  return `Activo hace ${Math.floor(h / 24)}d`;
}

type Tab = "miembros" | "admins" | "online";

function Page() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Miembro[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("miembros");

  useEffect(() => {
    (async () => {
      const rpc = supabase.rpc as unknown as (fn: string) => Promise<{ data: { user_id: string; ultima_actividad: string }[] | null }>;
      const [perfiles, { data: roles }, { data: act }] = await Promise.all([
        fetchPerfiles(),
        supabase.from("user_roles").select("user_id,role"),
        rpc.call(supabase, "actividad_miembros").catch(() => ({ data: null })),
      ]);
      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r: { user_id: string; role: string }) => {
        if (!roleMap.has(r.user_id) || r.role === "admin") roleMap.set(r.user_id, r.role);
      });
      const actMap = new Map<string, string>();
      (act ?? []).forEach((a) => actMap.set(a.user_id, a.ultima_actividad));

      setRows(
        (perfiles ?? []).map((p) => ({
          ...p,
          role: roleMap.get(p.id) || "usuario",
          ultimaActividad: actMap.get(p.id) ?? null,
        })),
      );
    })();
  }, []);

  const isOnline = (m: Miembro) =>
    !!m.ultimaActividad && Date.now() - new Date(m.ultimaActividad).getTime() < ONLINE_MS;

  const counts = useMemo(
    () => ({
      miembros: rows.length,
      admins: rows.filter((r) => r.role === "admin" || r.role === "soporte").length,
      online: rows.filter(isOnline).length,
    }),
    [rows],
  );

  const lista = useMemo(() => {
    const base =
      tab === "admins"
        ? rows.filter((r) => r.role === "admin" || r.role === "soporte")
        : tab === "online"
          ? rows.filter(isOnline)
          : rows;
    const needle = q.trim().toLowerCase();
    return base.filter((r) => (formatNombre(r.nombre_completo) || "").toLowerCase().includes(needle));
  }, [rows, tab, q]);

  return (
    <div className="px-4 py-8 max-w-3xl mx-auto">
      <h1 className="sr-only">Miembros</h1>

      <div className="relative mb-5">
        <Search className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Buscar miembros"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl border bg-card outline-none focus:ring-2 focus:ring-[var(--violet)]/40"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <TabPill active={tab === "miembros"} onClick={() => setTab("miembros")} label="Miembros" count={counts.miembros} />
        <TabPill active={tab === "admins"} onClick={() => setTab("admins")} label="Administradores" count={counts.admins} />
        <TabPill active={tab === "online"} onClick={() => setTab("online")} label="En línea" count={counts.online} />
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden divide-y">
        {lista.map((m) => {
          const online = isOnline(m);
          const hace = activoHace(m.ultimaActividad);
          return (
            <div key={m.id} className="flex items-start gap-4 p-5 hover:bg-muted/40 transition">
              <Link to="/miembro/$userId" params={{ userId: m.id }}>
                <Avatar url={m.avatar_url} nombre={formatNombre(m.nombre_completo)} size={52} nivel={m.nivel ?? 1} />
              </Link>

              <div className="flex-1 min-w-0">
                <Link
                  to="/miembro/$userId"
                  params={{ userId: m.id }}
                  className="text-lg font-bold hover:underline block truncate"
                >
                  {formatNombre(m.nombre_completo) || "Miembro"}
                </Link>
                <div className="text-sm text-muted-foreground truncate">{slugHandle(m)}</div>

                {online ? (
                  <div className="mt-1.5 flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-muted-foreground">En línea ahora</span>
                  </div>
                ) : hace ? (
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" /> {hace}
                  </div>
                ) : null}

                {fechaCorta(m.created_at) && (
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="w-4 h-4" /> Se unió el {fechaCorta(m.created_at)}
                  </div>
                )}
              </div>

              <button
                onClick={() => navigate({ to: "/chats", search: { con: m.id } })}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-muted transition"
              >
                CHAT <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {lista.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay miembros que coincidan.</div>
        )}
      </div>
    </div>
  );
}

function TabPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition ${
        active ? "bg-foreground text-background border-transparent" : "bg-card hover:bg-muted"
      }`}
    >
      {label} <span className="opacity-70 font-normal">{count}</span>
    </button>
  );
}
