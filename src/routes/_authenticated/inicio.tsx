import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Pencil, Save, X, Play, TrendingUp, CalendarClock, MessageSquare, Radio } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inicio")({ component: Page });

interface Cfg { inicio_video_url: string | null; inicio_titulo: string | null; inicio_mensaje: string | null }

function Page() {
  const { profile, role, session } = useAuth();
  const uid = session?.user.id;
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Cfg>({ inicio_video_url: "", inicio_titulo: "", inicio_mensaje: "" });
  const [progreso, setProgreso] = useState<{ pct: number; vistas: number; total: number } | null>(null);
  const [proxSesion, setProxSesion] = useState<{ fecha: string; hora_inicio: string; zoom_link: string | null; otroNombre: string } | null>(null);
  const [sinLeer, setSinLeer] = useState<number>(0);
  const [clasesSemana, setClasesSemana] = useState<number>(0);

  useEffect(() => {
    supabase.from("app_config").select("inicio_video_url,inicio_titulo,inicio_mensaje").eq("id", true).maybeSingle()
      .then(({ data }) => {
        const c = (data as Cfg) ?? { inicio_video_url: null, inicio_titulo: "Bienvenidos a ADN Empresarial", inicio_mensaje: "Tu transformación empresarial comienza aquí." };
        setCfg(c);
        setDraft(c);
      });
  }, []);

  // KPIs
  useEffect(() => {
    if (!uid) return;
    (async () => {
      // Progreso general: lecciones completadas / total de lecciones de mis cursos
      const { data: perms } = await supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid);
      const cursoIds = (perms ?? []).map((p: { curso_id: string }) => p.curso_id);
      let total = 0; let vistas = 0;
      if (cursoIds.length) {
        const { data: mods } = await supabase.from("modulos_curso").select("id").in("curso_id", cursoIds);
        const modIds = (mods ?? []).map((m: { id: string }) => m.id);
        if (modIds.length) {
          const { data: lecs } = await supabase.from("lecciones").select("id").in("modulo_id", modIds);
          const lecIds = (lecs ?? []).map((l: { id: string }) => l.id);
          total = lecIds.length;
          if (lecIds.length) {
            const { data: prog } = await supabase.from("progreso_lecciones")
              .select("leccion_id, completada").eq("usuario_id", uid).in("leccion_id", lecIds);
            vistas = ((prog ?? []) as { completada: boolean }[]).filter((p) => p.completada).length;
          }
        }
      }
      setProgreso({ pct: total ? Math.round((vistas / total) * 100) : 0, vistas, total });

      // Próxima sesión 1a1
      const today = new Date().toISOString().slice(0, 10);
      const filterCol = role === "usuario" ? "alumna_id" : "profesor_id";
      const { data: ses } = await supabase.from("sesiones_1a1")
        .select("fecha, hora_inicio, zoom_link, profesor_id, alumna_id, estado")
        .eq(filterCol, uid).gte("fecha", today).neq("estado", "cancelada")
        .order("fecha", { ascending: true }).order("hora_inicio", { ascending: true }).limit(1);
      if (ses && ses.length) {
        const s = ses[0] as { fecha: string; hora_inicio: string; zoom_link: string | null; profesor_id: string; alumna_id: string };
        const otroId = s.profesor_id === uid ? s.alumna_id : s.profesor_id;
        const { data: prof } = await supabase.from("profiles").select("nombre_completo,email").eq("id", otroId).maybeSingle();
        setProxSesion({ fecha: s.fecha, hora_inicio: s.hora_inicio, zoom_link: s.zoom_link, otroNombre: prof?.nombre_completo || prof?.email || "—" });
      }

      // Mensajes sin leer (1a1 + soporte)
      const { data: misChats } = await supabase.from("chats_1a1").select("id").or(`usuario_a_id.eq.${uid},usuario_b_id.eq.${uid}`);
      const chatIds = ((misChats ?? []) as { id: string }[]).map((c) => c.id);
      let unread = 0;
      if (chatIds.length) {
        const { count } = await supabase.from("mensajes_chat_1a1")
          .select("id", { count: "exact", head: true })
          .in("chat_id", chatIds).eq("leido", false).neq("autor_id", uid);
        unread += count ?? 0;
      }
      const { count: sopUnread } = await supabase.from("soporte_privado_mensajes")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", uid).eq("leido", false).neq("autor_id", uid);
      unread += sopUnread ?? 0;
      setSinLeer(unread);

      // Clases en vivo esta semana
      const w = new Date(); const d = w.getDay(); const offset = d === 0 ? -6 : 1 - d;
      const ini = new Date(w); ini.setDate(w.getDate() + offset); ini.setHours(0,0,0,0);
      const fin = new Date(ini); fin.setDate(ini.getDate() + 7);
      const { count: cls } = await supabase.from("clases_en_vivo")
        .select("id", { count: "exact", head: true })
        .gte("fecha", ini.toISOString().slice(0,10)).lt("fecha", fin.toISOString().slice(0,10));
      setClasesSemana(cls ?? 0);
    })();
  }, [uid, role]);

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

  const nombrePila = (profile?.nombre_completo || "").split(" ")[0] || "";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-60 mb-1">Inicio</div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-1">
            ¡Bienvenida{nombrePila ? `, ${nombrePila}` : ""}! <span aria-hidden>👋</span>
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">{cfg?.inicio_mensaje}</p>
        </div>
        {role === "admin" && !editing && (
          <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg border flex items-center gap-2 text-sm hover:bg-muted">
            <Pencil className="w-4 h-4" /> Editar
          </button>
        )}
      </div>

      <div className="rounded-3xl overflow-hidden border bg-card aspect-video grid place-items-center relative shadow-sm">
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-6">
        <Link
          to="/cursos"
          className="relative overflow-hidden rounded-2xl p-4 md:p-5 text-white shadow-md"
          style={{ background: "linear-gradient(135deg, oklch(0.30 0.10 285), oklch(0.22 0.07 285))" }}
        >
          <div className="text-[10px] uppercase tracking-[0.15em] opacity-80 font-bold flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Tu progreso general</div>
          <div className="text-3xl md:text-4xl font-bold mt-2">{progreso ? `${progreso.pct}%` : "—"}</div>
          <div className="text-[11px] opacity-80 mt-1">
            {progreso && progreso.total > 0 ? `${progreso.vistas} de ${progreso.total} clases` : "Empieza tu primer curso"}
          </div>
          {progreso && progreso.total > 0 && (
            <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${progreso.pct}%`, background: "linear-gradient(90deg, #C4B5FD, #FCD34D)" }} />
            </div>
          )}
        </Link>

        <Link to="/agenda-1a1" className="rounded-2xl p-4 md:p-5 border bg-card shadow-sm hover:shadow-md transition">
          <div className="text-[10px] uppercase tracking-[0.15em] opacity-60 font-bold flex items-center gap-1.5"><CalendarClock className="w-3 h-3" /> Próxima sesión 1:1</div>
          {proxSesion ? (
            <>
              <div className="text-lg md:text-xl font-bold mt-2 leading-tight">
                {new Date(proxSesion.fecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })}
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">{proxSesion.hora_inicio.slice(0,5)} · {proxSesion.otroNombre}</div>
            </>
          ) : (
            <>
              <div className="text-lg md:text-xl font-bold mt-2">Sin agendar</div>
              <div className="text-[11px] text-muted-foreground mt-1">Reserva tu hora</div>
            </>
          )}
        </Link>

        <Link to="/chats" className="rounded-2xl p-4 md:p-5 border bg-card shadow-sm hover:shadow-md transition">
          <div className="text-[10px] uppercase tracking-[0.15em] opacity-60 font-bold flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> Mensajes sin leer</div>
          <div className="text-3xl md:text-4xl font-bold mt-2" style={sinLeer > 0 ? { color: "var(--violet)" } : undefined}>{sinLeer}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{sinLeer === 0 ? "Estás al día ✨" : "Tienes mensajes nuevos"}</div>
        </Link>

        <Link to="/calendario-clases" className="rounded-2xl p-4 md:p-5 border bg-card shadow-sm hover:shadow-md transition">
          <div className="text-[10px] uppercase tracking-[0.15em] opacity-60 font-bold flex items-center gap-1.5"><Radio className="w-3 h-3" /> Clases en vivo</div>
          <div className="text-3xl md:text-4xl font-bold mt-2">{clasesSemana}</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--violet)" }}>Esta semana</div>
        </Link>
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
