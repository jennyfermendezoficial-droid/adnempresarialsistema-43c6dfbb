import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfiles, type PerfilPublico } from "@/lib/perfiles";
import { progresoNivel } from "@/lib/niveles";
import { Avatar } from "@/components/NivelBadge";
import { tiempoRelativo, type Comentario, type Post } from "@/lib/comunidad";
import { ArrowLeft, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/miembro/$userId")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Perfil de miembro · ADN Empresarial" },
      { name: "description", content: "Mira el nivel, los cursos y las contribuciones de este miembro de la comunidad ADN Empresarial." },
      { property: "og:title", content: "Perfil de miembro · ADN Empresarial" },
      { property: "og:description", content: "Nivel, cursos y contribuciones del miembro." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface CursoProgreso { id: string; nombre: string; total: number; vistas: number }

function Page() {
  const { userId } = Route.useParams();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [cursos, setCursos] = useState<CursoProgreso[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [coms, setComs] = useState<Comentario[]>([]);

  useEffect(() => {
    (async () => {
      const [p] = await fetchPerfiles([userId]);
      setPerfil(p ?? null);

      const { data: perms } = await supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", userId);
      const cursoIds = ((perms ?? []) as { curso_id: string }[]).map((x) => x.curso_id);
      if (cursoIds.length) {
        const [{ data: cs }, { data: mods }] = await Promise.all([
          supabase.from("cursos").select("id,nombre").in("id", cursoIds),
          supabase.from("modulos_curso").select("id,curso_id").in("curso_id", cursoIds),
        ]);
        const modulos = (mods ?? []) as { id: string; curso_id: string }[];
        const { data: lecs } = modulos.length
          ? await supabase.from("lecciones").select("id,modulo_id").in("modulo_id", modulos.map((m) => m.id))
          : { data: [] as { id: string; modulo_id: string }[] };
        const lecciones = (lecs ?? []) as { id: string; modulo_id: string }[];
        const { data: prog } = lecciones.length
          ? await supabase.from("progreso_lecciones").select("leccion_id,completada")
              .eq("usuario_id", userId).in("leccion_id", lecciones.map((l) => l.id))
          : { data: [] as { leccion_id: string; completada: boolean }[] };
        const completadas = new Set(((prog ?? []) as { leccion_id: string; completada: boolean }[])
          .filter((x) => x.completada).map((x) => x.leccion_id));
        const modCurso = new Map(modulos.map((m) => [m.id, m.curso_id]));
        setCursos(((cs ?? []) as { id: string; nombre: string }[]).map((c) => {
          const propias = lecciones.filter((l) => modCurso.get(l.modulo_id) === c.id);
          return { id: c.id, nombre: c.nombre, total: propias.length, vistas: propias.filter((l) => completadas.has(l.id)).length };
        }));
      } else setCursos([]);

      const [{ data: ps }, { data: cms }] = await Promise.all([
        supabase.from("comunidad_posts").select("*").eq("autor_id", userId).order("created_at", { ascending: false }).limit(5),
        supabase.from("comunidad_comentarios").select("*").eq("autor_id", userId).order("created_at", { ascending: false }).limit(5),
      ]);
      setPosts((ps as Post[]) ?? []);
      setComs((cms as Comentario[]) ?? []);
    })();
  }, [userId]);

  const abrirChat = () => {
    if (!uid) return;
    window.dispatchEvent(new CustomEvent("adn:abrir-chat", { detail: { userId } }));
  };

  if (!perfil) return <div className="p-8 text-sm text-muted-foreground">Cargando…</div>;

  const puntos = perfil.puntos ?? 0;
  const { nivel, siguiente, pct, faltan } = progresoNivel(puntos);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <Link to="/comunidad" className="flex items-center gap-2 text-sm mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Volver
      </Link>

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <Avatar url={perfil.avatar_url} nombre={formatNombre(perfil.nombre_completo)} size={96} nivel={nivel} />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold">{formatNombre(perfil.nombre_completo) || "Usuario"}</h1>
            {perfil.actividad && <div className="text-sm text-muted-foreground">{perfil.actividad}</div>}
            {perfil.biografia && <p className="mt-2 text-sm whitespace-pre-wrap">{perfil.biografia}</p>}
            {perfil.created_at && (
              <div className="text-xs text-muted-foreground mt-2">
                Miembro desde {new Date(perfil.created_at).toLocaleDateString("es-EC", { month: "long", year: "numeric" })}
              </div>
            )}
          </div>
          {uid !== userId && (
            <button onClick={abrirChat}
              className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> CHAT
            </button>
          )}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Nivel {nivel}</span>
            <span className="text-muted-foreground">{puntos} puntos</span>
          </div>
          <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--violet),var(--violet-2))" }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {siguiente === null ? "Nivel máximo alcanzado" : `Faltan ${faltan} puntos para el nivel ${nivel + 1}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div className="rounded-2xl border bg-card p-5">
          <div className="font-semibold mb-3">Cursos</div>
          {cursos.length === 0 && <div className="text-sm text-muted-foreground">Sin cursos asignados.</div>}
          <div className="space-y-3">
            {cursos.map((c) => {
              const p = c.total ? Math.round((c.vistas / c.total) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="flex justify-between text-sm"><span className="truncate">{c.nombre}</span><span>{p}%</span></div>
                  <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                    <div className="h-full" style={{ width: `${p}%`, background: "var(--violet)" }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{c.vistas} de {c.total} clases</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="font-semibold mb-3">Contribuciones</div>
          {!posts.length && !coms.length && <div className="text-sm text-muted-foreground">Aún no participa en la comunidad.</div>}
          <div className="space-y-2">
            {posts.map((p) => (
              <Link key={p.id} to="/comunidad/$postId" params={{ postId: p.id }} className="block text-sm hover:underline">
                📝 {p.titulo} <span className="text-xs text-muted-foreground">· {tiempoRelativo(p.created_at)}</span>
              </Link>
            ))}
            {coms.map((c) => (
              <Link key={c.id} to="/comunidad/$postId" params={{ postId: c.post_id }} className="block text-sm hover:underline">
                💬 {c.contenido.slice(0, 60)} <span className="text-xs text-muted-foreground">· {tiempoRelativo(c.created_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
