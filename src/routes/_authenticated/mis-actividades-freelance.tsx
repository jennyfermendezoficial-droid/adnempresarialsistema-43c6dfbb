import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { listaMeses } from "@/lib/pagos-export";

export const Route = createFileRoute("/_authenticated/mis-actividades-freelance")({
  head: () => ({ meta: [
    { title: "Mis actividades freelance · ADN Empresarial" },
    { name: "description", content: "Sube tus informes y actividades mensuales como freelance." },
    { property: "og:title", content: "Mis actividades freelance · ADN Empresarial" },
    { property: "og:description", content: "Sube tus informes y actividades mensuales como freelance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type Act = { id: string; fecha: string; titulo: string; descripcion: string | null; horas: number; archivo_path: string | null; archivo_nombre: string | null };
const cls = "w-full px-3 py-2 rounded-lg border bg-background text-sm";

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [acts, setActs] = useState<Act[]>([]);
  const [esFree, setEsFree] = useState<boolean | null>(null);
  const [v, setV] = useState({ fecha: hoy.toISOString().slice(0, 10), titulo: "", descripcion: "", horas: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    if (!uid) return;
    const { data: fr } = await supabase.rpc("es_freelance", { _uid: uid });
    setEsFree(!!fr);
    const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const fin = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const { data } = await supabase.from("freelance_actividades").select("*").eq("usuario_id", uid).gte("fecha", ini).lte("fecha", fin).order("fecha", { ascending: false });
    setActs((data ?? []) as Act[]);
  }, [uid, mes, anio]);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    if (!uid) return;
    if (!v.titulo.trim()) return toast.error("Escribe el título de la actividad.");
    if (file && !(file.type === "application/pdf" || file.type.startsWith("image/"))) return toast.error("Solo PDF o imágenes (no videos).");
    setBusy(true);
    let path: string | null = null;
    if (file) {
      path = `${uid}/${v.fecha.slice(0, 7)}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
      const up = await supabase.storage.from("freelance").upload(path, file, { contentType: file.type });
      if (up.error) { setBusy(false); return toast.error(up.error.message); }
    }
    const { error } = await supabase.from("freelance_actividades").insert({
      usuario_id: uid, fecha: v.fecha, titulo: v.titulo.trim(), descripcion: v.descripcion.trim() || null,
      horas: Number(v.horas || 0), archivo_path: path, archivo_nombre: file?.name ?? null, archivo_tipo: file?.type ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Actividad guardada");
    setV({ ...v, titulo: "", descripcion: "", horas: "" }); setFile(null);
    await cargar();
  };

  const ver = async (a: Act) => {
    if (!a.archivo_path) return;
    const { data } = await supabase.storage.from("freelance").createSignedUrl(a.archivo_path, 3600);
    if (data) window.open(data.signedUrl, "_blank", "noreferrer");
  };
  const borrar = async (a: Act) => {
    if (!confirm("¿Borrar esta actividad?")) return;
    if (a.archivo_path) await supabase.storage.from("freelance").remove([a.archivo_path]);
    await supabase.from("freelance_actividades").delete().eq("id", a.id);
    await cargar();
  };

  if (esFree === false) return <div className="p-8 text-center text-muted-foreground">Tu cuenta no está habilitada como freelance.</div>;
  const horas = acts.reduce((s, a) => s + Number(a.horas), 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-2xl font-bold">Mis actividades</h1><p className="text-sm text-muted-foreground">Sube tus informes en PDF o imágenes. Quedan guardados por mes.</p></div>
        <select value={`${anio}-${mes}`} onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); setAnio(a); setMes(m); }} className="px-3 py-2 rounded-lg border bg-card text-sm">
          {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="rounded-2xl border bg-card p-5 grid sm:grid-cols-2 gap-3">
        <label><span className="text-[11px] font-semibold text-muted-foreground">Fecha</span><input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} className={cls} /></label>
        <label><span className="text-[11px] font-semibold text-muted-foreground">Horas trabajadas</span><input type="number" min="0" step="0.25" value={v.horas} onChange={(e) => setV({ ...v, horas: e.target.value })} className={cls} /></label>
        <label className="sm:col-span-2"><span className="text-[11px] font-semibold text-muted-foreground">Actividad</span><input value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} className={cls} /></label>
        <label className="sm:col-span-2"><span className="text-[11px] font-semibold text-muted-foreground">Descripción</span><textarea rows={3} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} className={cls} /></label>
        <div className="sm:col-span-2 flex flex-wrap justify-between gap-2">
          <button type="button" onClick={() => ref.current?.click()} className="px-3 py-2 rounded-lg border text-sm inline-flex gap-2 items-center"><Upload className="w-4 h-4" />{file ? file.name : "Subir PDF o imagen"}</button>
          <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button disabled={busy} onClick={guardar} className="px-5 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex gap-2 items-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Guardar actividad</button>
        </div>
      </div>
      <div className="rounded-2xl border bg-card">
        <div className="px-5 py-3 border-b flex justify-between text-sm"><b>Actividades del mes</b><span>{horas.toFixed(2)} h</span></div>
        {acts.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Aún no hay actividades este mes.</div> : acts.map((a) => (
          <div key={a.id} className="px-5 py-3 border-t flex items-start justify-between gap-3 text-sm">
            <div><div className="font-semibold">{a.titulo} · {a.horas} h</div><div className="text-xs text-muted-foreground">{a.fecha} {a.descripcion ? `· ${a.descripcion}` : ""}</div></div>
            <div className="flex gap-2 shrink-0">
              {a.archivo_path && <button onClick={() => ver(a)} className="p-2 rounded-lg border" title="Ver archivo"><FileText className="w-4 h-4" /></button>}
              <button onClick={() => borrar(a)} className="p-2 rounded-lg border" title="Borrar"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
