import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfilesMap, type PerfilPublico } from "@/lib/perfiles";
import { fetchMisLikes, toggleLike, tiempoRelativo, type Comentario, type Post } from "@/lib/comunidad";
import { Avatar } from "@/components/NivelBadge";
import { ArrowLeft, Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/comunidad/$postId")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Publicación · Comunidad ADN Empresarial" },
      { name: "description", content: "Lee la publicación completa y participa con tus comentarios en la comunidad ADN Empresarial." },
      { property: "og:title", content: "Publicación · Comunidad ADN Empresarial" },
      { property: "og:description", content: "Lee la publicación completa y participa con tus comentarios." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Page() {
  const { postId } = Route.useParams();
  const { session, role } = useAuth();
  const uid = session?.user.id ?? "";
  const isStaff = role === "admin" || role === "soporte";
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [coms, setComs] = useState<Comentario[]>([]);
  const [perfiles, setPerfiles] = useState<Record<string, PerfilPublico>>({});
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState("");
  const [respondiendo, setRespondiendo] = useState<string | null>(null);

  const cargar = async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("comunidad_posts").select("*").eq("id", postId).maybeSingle(),
      supabase.from("comunidad_comentarios").select("*").eq("post_id", postId).order("created_at"),
    ]);
    setPost((p as Post) ?? null);
    const lista = (c as Comentario[]) ?? [];
    setComs(lista);
    const ids = Array.from(new Set([...(p ? [(p as Post).autor_id] : []), ...lista.map((x) => x.autor_id)]));
    if (ids.length) setPerfiles(await fetchPerfilesMap(ids));
    if (uid) setLikes(await fetchMisLikes(uid));
  };

  useEffect(() => { if (uid) cargar(); }, [postId, uid]); // eslint-disable-line

  const enviar = async () => {
    if (!texto.trim() || !uid) return;
    const { error } = await supabase.from("comunidad_comentarios").insert({
      post_id: postId, autor_id: uid, contenido: texto.trim(), parent_id: respondiendo,
    });
    if (error) return toast.error(error.message);
    setTexto(""); setRespondiendo(null);
    cargar();
  };

  const likePost = async () => {
    if (!post) return;
    const liked = likes.has(post.id);
    setLikes((s) => { const n = new Set(s); liked ? n.delete(post.id) : n.add(post.id); return n; });
    setPost({ ...post, likes_count: post.likes_count + (liked ? -1 : 1) });
    await toggleLike(uid, { post_id: post.id }, liked);
  };

  const likeCom = async (c: Comentario) => {
    const liked = likes.has(c.id);
    setLikes((s) => { const n = new Set(s); liked ? n.delete(c.id) : n.add(c.id); return n; });
    setComs((xs) => xs.map((x) => x.id === c.id ? { ...x, likes_count: x.likes_count + (liked ? -1 : 1) } : x));
    await toggleLike(uid, { comentario_id: c.id }, liked);
  };

  const borrarComentario = async (c: Comentario) => {
    if (!confirm("¿Borrar comentario?")) return;
    await supabase.from("comunidad_comentarios").delete().eq("id", c.id);
    cargar();
  };

  if (!post) {
    return <div className="p-8 text-sm text-muted-foreground">Cargando…</div>;
  }

  const autor = perfiles[post.autor_id];
  const raiz = coms.filter((c) => !c.parent_id);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <button onClick={() => navigate({ to: "/comunidad" })} className="flex items-center gap-2 text-sm mb-4 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Volver a la comunidad
      </button>

      <article className="p-5 rounded-2xl border bg-card">
        <div className="flex items-center gap-3">
          <Link to="/miembro/$userId" params={{ userId: post.autor_id }}>
            <Avatar url={autor?.avatar_url} nombre={formatNombre(autor?.nombre_completo)} size={44} nivel={autor?.nivel ?? 1} />
          </Link>
          <div>
            <Link to="/miembro/$userId" params={{ userId: post.autor_id }} className="font-semibold hover:underline">
              {formatNombre(autor?.nombre_completo) || "Usuario"}
            </Link>
            <div className="text-xs text-muted-foreground">{tiempoRelativo(post.created_at)}</div>
          </div>
        </div>

        <h1 className="text-2xl font-semibold mt-4">{post.titulo}</h1>
        {post.contenido && <p className="mt-2 whitespace-pre-wrap">{post.contenido}</p>}
        {post.media_url && post.media_tipo === "video" && <video src={post.media_url} controls className="mt-4 w-full rounded-xl" />}
        {post.media_url && post.media_tipo !== "video" && <img src={post.media_url} alt="" className="mt-4 w-full rounded-xl object-cover" />}

        <button onClick={likePost} className="mt-4 flex items-center gap-2 text-sm">
          <Heart className="w-4 h-4" fill={likes.has(post.id) ? "currentColor" : "none"}
            style={likes.has(post.id) ? { color: "var(--violet)" } : undefined} />
          {post.likes_count} me gusta
        </button>
      </article>

      <div className="mt-5 rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold mb-3">{post.comentarios_count} comentarios</div>

        {respondiendo && (
          <div className="text-xs text-muted-foreground mb-2">
            Respondiendo a un comentario · <button className="underline" onClick={() => setRespondiendo(null)}>cancelar</button>
          </div>
        )}
        <div className="flex gap-2 mb-4">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
            placeholder="Escribe un comentario…"
            className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <button onClick={enviar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold">Enviar</button>
        </div>

        <div className="space-y-4">
          {raiz.map((c) => (
            <ComentarioItem
              key={c.id} c={c} perfiles={perfiles} likes={likes}
              onLike={likeCom} onResponder={setRespondiendo}
              onBorrar={borrarComentario} puedeBorrar={(x) => x.autor_id === uid || isStaff}
              respuestas={coms.filter((r) => r.parent_id === c.id)}
            />
          ))}
          {!raiz.length && <div className="text-sm text-muted-foreground">Sé la primera persona en comentar.</div>}
        </div>
      </div>
    </div>
  );
}

function ComentarioItem({
  c, perfiles, likes, onLike, onResponder, onBorrar, puedeBorrar, respuestas = [],
}: {
  c: Comentario;
  perfiles: Record<string, PerfilPublico>;
  likes: Set<string>;
  onLike: (c: Comentario) => void;
  onResponder: (id: string) => void;
  onBorrar: (c: Comentario) => void;
  puedeBorrar: (c: Comentario) => boolean;
  respuestas?: Comentario[];
}) {
  const a = perfiles[c.autor_id];
  return (
    <div className="flex gap-3">
      <Link to="/miembro/$userId" params={{ userId: c.autor_id }}>
        <Avatar url={a?.avatar_url} nombre={formatNombre(a?.nombre_completo)} size={34} nivel={a?.nivel ?? 1} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Link to="/miembro/$userId" params={{ userId: c.autor_id }} className="text-sm font-semibold hover:underline">
              {formatNombre(a?.nombre_completo) || "Usuario"}
            </Link>
            <span className="text-[11px] text-muted-foreground">{tiempoRelativo(c.created_at)}</span>
          </div>
          <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.contenido}</p>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <button onClick={() => onLike(c)} className="flex items-center gap-1 hover:text-foreground">
            <Heart className="w-3.5 h-3.5" fill={likes.has(c.id) ? "currentColor" : "none"} /> {c.likes_count}
          </button>
          {!c.parent_id && <button onClick={() => onResponder(c.id)} className="hover:text-foreground">Responder</button>}
          {puedeBorrar(c) && (
            <button onClick={() => onBorrar(c)} className="hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>

        {respuestas.length > 0 && (
          <div className="mt-3 space-y-3 pl-4 border-l">
            {respuestas.map((r) => (
              <ComentarioItem key={r.id} c={r} perfiles={perfiles} likes={likes}
                onLike={onLike} onResponder={onResponder} onBorrar={onBorrar} puedeBorrar={puedeBorrar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
