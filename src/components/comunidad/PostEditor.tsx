import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subirImagen, esImagen } from "@/lib/cloudinary";
import { toast } from "sonner";
import { X, ImagePlus } from "lucide-react";
import type { Categoria, Post } from "@/lib/comunidad";

interface Props {
  uid: string;
  categorias: Categoria[];
  post?: Post | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PostEditor({ uid, categorias, post, onClose, onSaved }: Props) {
  const [titulo, setTitulo] = useState(post?.titulo ?? "");
  const [contenido, setContenido] = useState(post?.contenido ?? "");
  const [categoriaId, setCategoriaId] = useState<string>(post?.categoria_id ?? categorias[0]?.id ?? "");
  const [mediaUrl, setMediaUrl] = useState<string | null>(post?.media_url ?? null);
  const [mediaTipo, setMediaTipo] = useState<string | null>(post?.media_tipo ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const subir = async (file: File) => {
    setSubiendo(true);
    try {
      if (esImagen(file)) {
        const url = await subirImagen(file, "adn/comunidad");
        setMediaUrl(url);
        setMediaTipo("imagen");
      } else {
        const path = `${uid}/comunidad-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        setMediaUrl(data.publicUrl);
        setMediaTipo("video");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    if (!titulo.trim()) return toast.error("Ponle un título a tu publicación");
    setGuardando(true);
    const payload = {
      titulo: titulo.trim(),
      contenido: contenido.trim() || null,
      categoria_id: categoriaId || null,
      media_url: mediaUrl,
      media_tipo: mediaTipo,
    };
    const { error } = post
      ? await supabase.from("comunidad_posts").update(payload).eq("id", post.id)
      : await supabase.from("comunidad_posts").insert({ ...payload, autor_id: uid });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(post ? "Publicación actualizada" : "¡Publicado!");
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border bg-card p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">{post ? "Editar publicación" : "Crear publicación"}</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título"
          className="w-full px-3 py-2.5 rounded-lg border bg-background text-lg font-semibold mb-3"
        />
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="Escribe algo…"
          rows={6}
          className="w-full px-3 py-2.5 rounded-lg border bg-background mb-3 resize-y"
        />

        {mediaUrl && (
          <div className="relative mb-3">
            {mediaTipo === "video"
              ? <video src={mediaUrl} controls className="w-full rounded-xl max-h-72" />
              : <img src={mediaUrl} alt="" className="w-full rounded-xl object-cover max-h-72" />}
            <button
              onClick={() => { setMediaUrl(null); setMediaTipo(null); }}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white"
            ><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm hover:bg-muted">
            <ImagePlus className="w-4 h-4" />
            {subiendo ? "Subiendo…" : "Imagen o video"}
            <input type="file" accept="image/*,video/*" hidden onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
          </label>

          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-background text-sm"
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.nombre}</option>
            ))}
          </select>

          <button
            onClick={guardar}
            disabled={guardando || subiendo}
            className="ml-auto px-5 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-50"
          >
            {guardando ? "Guardando…" : post ? "Guardar" : "Publicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
