import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MessageSquare, CalendarDays, Clock, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPerfiles, type PerfilPublico } from "@/lib/perfiles";
import { Avatar } from "@/components/NivelBadge";

export const Route = createFileRoute("/_authenticated/miembros")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Miembros de la comunidad | ADN Empresarial" },
      { name: "description", content: "Conoce a los miembros de la comunidad ADN Empresarial: su nivel, actividad y chatea con ellos." },
      { property: "og:title", content: "Miembros de la comunidad | ADN Empresarial" },
      { property: "og:description", content: "Conoce a los miembros de la comunidad ADN Empresarial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Filtro = "todos" | "admins" | "online";

function handleDe(p: PerfilPublico) {
  const base = (p.nombre_completo || "miembro")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-");
  const sufijo = (parseInt(p.id.replace(/\D/g, "").slice(0, 6) || "0", 10) % 9000) + 1000;
  return `@${base}-${sufijo}`;
}

function desde(iso?: string | null) {
  if (!iso) return null;
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 5) return "online";
  if (min < 60) return `Activo hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Activo hace ${h}h`;
  const d = Math.floor(h / 24);
  return `Activo hace ${d}d`;
}

function Page() {
  const navigate = useNavigate();
  const [perfiles, setPerfiles] = useState<PerfilPublico[]>([]);
  const [staff, setStaff] = useState<Set<string>>(new Set());
  const [actividad, setActividad] = useState<Record<string, string>>({});
  const [yo, setYo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setYo(auth.user?.id ?? null);

      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string, args?: Record<string, unknown>,
      ) => Promise<{ data: unknown }>;

      const [lista, profes, act] = await Promise.all([
        fetchPerfiles(),
        rpc("listar_profesores"),
        rpc("actividad_miembros"),
      ]);

      setPerfiles(lista);
      setStaff(new Set(((profes.data as { id: string }[]) ?? []).map((p) => p.id)));
      const map: Record<string, string> = {};
      ((act.data as { user_id: string; ultima_actividad: string }[]) ?? []).forEach((a) => {
        map[a.user_id] = a.ultima_actividad;
      });
      setActividad(map);
    })();
  }, []);

  const conEstado = useMemo(
    () => perfiles.map((p) => {
      const estado = desde(actividad[p.id]);
      return { p, estado, online: estado === "online", admin: staff.has(p.id) };
    }),
    [perfiles, actividad, staff],
  );

  const nAdmins = conEstado.filter((m) => m.admin).length;
  const nOnline = conEstado.filter((m) => m.online).length;

  const filtrados = conEstado.filter((m) => {
    if (filtro === "admins" && !m.admin) return false;
    if (filtro === "online" && !m.online) return false;
    const texto = `${m.p.nombre_completo ?? ""} ${m.p.biografia ?? ""} ${m.p.actividad ?? ""}`.toLowerCase();
    return texto.includes(q.toLowerCase());
  });

  const chips: { k: Filtro; label: string; n: number }[] = [
    { k: "todos", label: "Miembros", n: conEstado.length },
    { k: "admins", label: "Administradores", n: nAdmins },
    { k: "online", label: "En línea", n: nOnline },
  ];

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <input
          placeholder="Buscar miembros"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-9 pr-3 py-3 rounded-xl border bg-muted/40 outline-none focus:bg-background transition"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {chips.map((c) => (
          <button
            key={c.k}
            onClick={() => setFiltro(c.k)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              filtro === c.k ? "bg-foreground text-background border-transparent" : "bg-background hover:bg-muted"
            }`}
          >
            {c.label} <span className="opacity-70">{c.n}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card divide-y">
        {filtrados.map(({ p, estado, online, admin }) => (
          <div key={p.id} className="p-4 flex gap-4 items-start hover:bg-muted/30 transition">
            <Link to="/miembro/$userId" params={{ userId: p.id }} className="shrink-0">
              <Avatar url={p.avatar_url} nombre={p.nombre_completo} size={48} nivel={p.nivel ?? 1} />
            </Link>

            <div className="min-w-0 flex-1">
              <Link to="/miembro/$userId" params={{ userId: p.id }} className="font-semibold hover:underline">
                {p.nombre_completo || "Miembro"}
              </Link>
              {admin && (
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-muted align-middle">Administrador</span>
              )}
              <div className="text-xs opacity-60">{handleDe(p)}</div>
              {(p.biografia || p.actividad) && (
                <p className="text-sm mt-1 line-clamp-2">{p.biografia || p.actividad}</p>
              )}

              <div className="mt-2 space-y-1 text-sm opacity-80">
                {online ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    <span>En línea ahora</span>
                  </div>
                ) : estado ? (
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="opacity-60" />
                    <span>{estado}</span>
                  </div>
                ) : null}
                {p.created_at && (
                  <div className="flex items-center gap-2">
                    <CalendarDays size={14} className="opacity-60" />
                    <span>
                      Se unió el{" "}
                      {new Date(p.created_at).toLocaleDateString("es-EC", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {p.id !== yo && (
              <button
                onClick={() => navigate({ to: "/chats", search: { con: p.id } })}
                className="shrink-0 px-3 py-2 rounded-lg border text-xs font-semibold tracking-wide flex items-center gap-2 hover:bg-muted"
              >
                CHAT <MessageSquare size={14} />
              </button>
            )}
          </div>
        ))}
        {!filtrados.length && (
          <div className="p-8 text-center text-sm opacity-60">No hay miembros que coincidan.</div>
        )}
      </div>
    </div>
  );
}
