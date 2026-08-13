import { supabase } from "@/integrations/supabase/client";

export interface Categoria { id: string; nombre: string; color: string; emoji: string | null; orden: number }

export interface Post {
  id: string;
  autor_id: string;
  categoria_id: string | null;
  titulo: string;
  contenido: string | null;
  media_url: string | null;
  media_tipo: string | null;
  fijado: boolean;
  likes_count: number;
  comentarios_count: number;
  ultimo_comentario_at: string | null;
  created_at: string;
}

export interface Comentario {
  id: string;
  post_id: string;
  autor_id: string;
  parent_id: string | null;
  contenido: string;
  likes_count: number;
  created_at: string;
}

export async function fetchCategorias(): Promise<Categoria[]> {
  const { data } = await supabase.from("comunidad_categorias").select("*").order("orden");
  return (data as Categoria[]) ?? [];
}

export async function fetchPosts(): Promise<Post[]> {
  const { data } = await supabase
    .from("comunidad_posts").select("*")
    .order("fijado", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Post[]) ?? [];
}

export async function fetchMisLikes(uid: string): Promise<Set<string>> {
  const { data } = await supabase.from("comunidad_likes").select("post_id,comentario_id").eq("usuario_id", uid);
  const s = new Set<string>();
  ((data ?? []) as { post_id: string | null; comentario_id: string | null }[]).forEach((l) => {
    if (l.post_id) s.add(l.post_id);
    if (l.comentario_id) s.add(l.comentario_id);
  });
  return s;
}

export async function toggleLike(uid: string, target: { post_id?: string; comentario_id?: string }, liked: boolean) {
  if (liked) {
    let q = supabase.from("comunidad_likes").delete().eq("usuario_id", uid);
    q = target.post_id ? q.eq("post_id", target.post_id) : q.eq("comentario_id", target.comentario_id!);
    await q;
  } else {
    await supabase.from("comunidad_likes").insert({ usuario_id: uid, ...target });
  }
}

export function tiempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short" });
}
