import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Pencil, Save, X, Play } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inicio")({ component: Page });

interface Cfg { inicio_video_url: string | null; inicio_titulo: string | null; inicio_mensaje: string | null }

function Page() {
  const { profile, role } = useAuth();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Cfg>({ inicio_video_url: "", inicio_titulo: "", inicio_mensaje: "" });

  useEffect(() => {
    supabase.from("app_config").select("inicio_video_url,inicio_titulo,inicio_mensaje").eq("id", true).maybeSingle()
      .then(({ data }) => {
        const c = (data as Cfg) ?? { inicio_video_url: null, inicio_titulo: "Bienvenidos a ADN Empresarial", inicio_mensaje: "Tu transformación empresarial comienza aquí." };
        setCfg(c);
        setDraft(c);
      });
  }, []);

  const save = async () => {
    const { error } = await supabase.from("app_config").update({
      inicio_video_url: draft.inicio_video_url || null,
      inicio_titulo: draft.inicio_titulo,
      inicio_mensaje: draft.inicio_mensaje,
    }).eq("id", true);
    if (error) return toast.error(error.message);
    setCfg(draft); setEditing(false); toast.success("Guardado");
  };

  const isYoutube = (u?: string | null) => !!u && /youtube\.com|youtu\.be/.test(u);
  const ytEmbed = (u: string) => {
    const m = u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : u;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold mb-1">
            {cfg?.inicio_titulo}{profile?.nombre_completo ? `, ${profile.nombre_completo.split(" ")[0]}` : ""}
          </h1>
          <p className="text-muted-foreground">{cfg?.inicio_mensaje}</p>
        </div>
        {role === "admin" && !editing && (
          <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg border flex items-center gap-2 text-sm hover:bg-muted">
            <Pencil className="w-4 h-4" /> Editar
          </button>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden border bg-card aspect-video grid place-items-center relative">
        {cfg?.inicio_video_url ? (
          isYoutube(cfg.inicio_video_url) ? (
            <iframe src={ytEmbed(cfg.inicio_video_url)} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
          ) : (
            <video src={cfg.inicio_video_url} controls className="w-full h-full" />
          )
        ) : (
          <div className="text-center text-muted-foreground p-8">
            <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Aún no hay video de bienvenida.</p>
            {role === "admin" && <p className="text-xs mt-1">Edita para agregar uno (YouTube o URL directa).</p>}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-6 p-5 rounded-2xl border bg-card space-y-3">
          <h3 className="font-semibold">Editar bienvenida</h3>
          <label className="block text-xs font-medium">Título</label>
          <input className="w-full px-3 py-2 rounded-lg border bg-background" value={draft.inicio_titulo ?? ""} onChange={e=>setDraft({...draft,inicio_titulo:e.target.value})}/>
          <label className="block text-xs font-medium">Mensaje</label>
          <textarea rows={3} className="w-full px-3 py-2 rounded-lg border bg-background" value={draft.inicio_mensaje ?? ""} onChange={e=>setDraft({...draft,inicio_mensaje:e.target.value})}/>
          <label className="block text-xs font-medium">URL del video (YouTube o MP4)</label>
          <input className="w-full px-3 py-2 rounded-lg border bg-background" placeholder="https://youtube.com/watch?v=..." value={draft.inicio_video_url ?? ""} onChange={e=>setDraft({...draft,inicio_video_url:e.target.value})}/>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-violet-gradient text-white flex items-center gap-2 text-sm"><Save className="w-4 h-4"/>Guardar</button>
            <button onClick={()=>{setEditing(false);setDraft(cfg!);}} className="px-4 py-2 rounded-lg border flex items-center gap-2 text-sm"><X className="w-4 h-4"/>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
