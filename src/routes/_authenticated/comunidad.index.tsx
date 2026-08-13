import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfilesMap, type PerfilPublico } from "@/lib/perfiles";
import {
  fetchCategorias, fetchPosts, fetchMisLikes, toggleLike, tiempoRelativo,
  type Categoria, type Post,
} from "@/lib/comunidad";
import { Avatar } from "@/components/NivelBadge";
import { PostEditor } from "@/components/comunidad/PostEditor";
import { Heart, MessageCircle, Pin, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comunidad/")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Comunidad · ADN Empresarial" },
      { name: "description", content: "Muro de la comunidad ADN Empresarial: publica, comenta y sube de nivel junto a otros emprendedores." },
      { property: "og:title", content: "Comunidad · ADN Empresarial" },
      { property: "og:description", content: "Publica, comenta y sube de nivel junto a otros emprendedores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Page() {
  const { session, role, profile } = useAuth();
  const uid = session?.user.id ?? "";
  const isStaff = role === "admin" || role === "soporte";

  const [cats, setCats] = useState<Categoria[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, PerfilPublico>>({});
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<string>("");
  const [editor, setEditor] = useState<{ open: boolean; post?: Post | null }>({ open: false });
  const [miembros, setMiembros] = useState(0);

  const cargar = async () => {
    const [c, p] = await Promise.all([fetchCategorias(), fetchPosts()]);
    setCats(c);
    setPosts(p);
    const ids = Array.from(new Set(p.map((x) => x.autor_id)));
    if (ids.length) setPerfiles(await fetchPerfilesMap(ids));
    if (uid) setLikes(await fetchMisLikes(uid));
  };

  useEffect(() => {
    if (!uid) return;
    cargar();
    supabase.from("profiles").select("id", { count: "exact", head: true })
      .then(({ count }) => setMiembros(count ?? 0));
  }, [uid]); // eslint-disable-line

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const visibles = filtro ? posts.filter((p) => p.categoria_id === filtro) : posts;

  const like = async (p: Post) => {
    const liked = likes.has(p.id);
    setLikes((s) => { const n = new Set(s); liked ? n.delete(p.id) : n.add(p.id); return n; });
    setPosts((ps) => ps.map((x) => x.id === p.id ? { ...x, likes_count: x.likes_count + (liked ? -1 : 1) } : x));
    await toggleLike(uid, { post_id: p.id }, liked);
  };

  const fijar = async (p: Post) => {
    await supabase.from("comunidad_posts").update({ fijado: !p.fijado }).eq("id", p.id);
    cargar();
  };

  const borrar = async (p: Post) => {
    if (!confirm("¿Borrar esta publicación?")) return;
    const { error } = await supabase.from("comunidad_posts").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Publicación eliminada");
    cargar();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold mb-4">Comunidad</h1>

        {/* Caja crear */}
        <button
          onClick={() => setEditor({ open: true })}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border bg-card text-left hover:bg-muted/40 transition"
        >
          <Avatar url={profile?.avatar_url} nombre={formatNombre(profile?.nombre_completo)} size={40} />
          <span className="text-muted-foreground">Escribe algo…</span>
        </button>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 my-4">
          <Chip active={!filtro} onClick={() => setFiltro("")} label="Todos" />
          {cats.map((c) => (
            <Chip key={c.id} active={filtro === c.id} onClick={() => setFiltro(c.id)}
              label={`${c.emoji ?? ""} ${c.nombre}`.trim()} color={c.color} />
          ))}
        </div>

        <div className="space-y-3">
          {visibles.map((p) => {
            const autor = perfiles[p.autor_id];
            const cat = p.categoria_id ? catMap[p.categoria_id] : null;
            const puedeEditar = p.autor_id === uid || isStaff;
            return (
              <article key={p.id} className="p-4 rounded-2xl border bg-card">
                <div className="flex items-start gap-3">
                  <Link to="/miembro/$userId" params={{ userId: p.autor_id }}>
                    <Avatar url={autor?.avatar_url} nombre={formatNombre(autor?.nombre_completo)} size={44} nivel={autor?.nivel ?? 1} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to="/miembro/$userId" params={{ userId: p.autor_id }} className="font-semibold hover:underline">
                        {formatNombre(autor?.nombre_completo) || "Usuario"}
                      </Link>
                      <span className="text-xs text-muted-foreground">{tiempoRelativo(p.created_at)}</span>
                      {cat && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: `${cat.color}22`, color: cat.color }}>
                          {cat.emoji} {cat.nombre}
                        </span>
                      )}
                      {p.fijado && <Pin className="w-3.5 h-3.5" style={{ color: "var(--violet)" }} />}
                    </div>

                    <Link to="/comunidad/$postId" params={{ postId: p.id }} className="block mt-1.5">
                      <h2 className="text-lg font-semibold leading-snug">{p.titulo}</h2>
                      {p.contenido && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{p.contenido}</p>
                      )}
                      {p.media_url && p.media_tipo !== "video" && (
                        <img src={p.media_url} alt="" className="mt-3 rounded-xl max-h-80 w-full object-cover" />
                      )}
                      {p.media_url && p.media_tipo === "video" && (
                        <video src={p.media_url} controls className="mt-3 rounded-xl max-h-80 w-full" />
                      )}
                    </Link>

                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <button onClick={() => like(p)} className="flex items-center gap-1.5 hover:text-foreground">
                        <Heart className="w-4 h-4" fill={likes.has(p.id) ? "currentColor" : "none"}
                          style={likes.has(p.id) ? { color: "var(--violet)" } : undefined} />
                        {p.likes_count}
                      </button>
                      <Link to="/comunidad/$postId" params={{ postId: p.id }} className="flex items-center gap-1.5 hover:text-foreground">
                        <MessageCircle className="w-4 h-4" /> {p.comentarios_count}
                      </Link>
                      {p.ultimo_comentario_at && (
                        <span className="text-xs">Último comentario {tiempoRelativo(p.ultimo_comentario_at)}</span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {isStaff && (
                          <button onClick={() => fijar(p)} title="Fijar" className="p-1.5 rounded hover:bg-muted"><Pin className="w-4 h-4" /></button>
                        )}
                        {puedeEditar && (
                          <>
                            <button onClick={() => setEditor({ open: true, post: p })} title="Editar" className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => borrar(p)} title="Borrar" className="p-1.5 rounded hover:bg-muted text-red-500"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {!visibles.length && (
            <div className="p-10 rounded-2xl border bg-card text-center text-sm text-muted-foreground">
              Aún no hay publicaciones. ¡Sé la primera persona en escribir!
            </div>
          )}
        </div>
      </div>

      {/* Lateral */}
      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="h-24" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }} />
          <div className="p-4">
            <div className="font-semibold">ADN Empresarial</div>
            <p className="text-xs text-muted-foreground mt-1">
              Comparte tus avances, resuelve dudas y crece junto a la comunidad.
            </p>
            <div className="mt-3 text-sm"><b>{miembros}</b> <span className="text-muted-foreground">miembros</span></div>
            <Link to="/miembros" className="mt-3 block text-center text-sm font-semibold px-3 py-2 rounded-lg border hover:bg-muted">
              Ver miembros
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-sm font-semibold mb-2">Cómo subes de nivel</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>Completar una clase: +2 puntos</li>
            <li>Publicar en la comunidad: +3 puntos</li>
            <li>Comentar: +1 punto</li>
            <li>Recibir un me gusta: +1 punto</li>
          </ul>
        </div>
      </aside>

      {editor.open && uid && (
        <PostEditor
          uid={uid}
          categorias={cats}
          post={editor.post}
          onClose={() => setEditor({ open: false })}
          onSaved={cargar}
        />
      )}
    </div>
  );
}

function Chip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-sm border transition"
      style={active
        ? { background: color ?? "var(--violet)", color: "#fff", borderColor: "transparent" }
        : undefined}
    >
      {label}
    </button>
  );
}
