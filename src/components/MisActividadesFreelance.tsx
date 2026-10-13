import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

type Act = { id: string; fecha: string; titulo: string; descripcion: string | null; horas: number; archivo_path: string | null; archivo_nombre: string | null; archivo_tipo: string | null; hora_inicio: string | null; hora_fin: string | null; observacion_lider: string | null };
const cls = "w-full px-3 py-2 rounded-lg border bg-background text-sm";
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Fecha local (evita que salga el día de mañana por la zona horaria)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lunesDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const horasEntre = (a: string, b: string) => { const [h1, m1] = a.split(":").map(Number); const [h2, m2] = b.split(":").map(Number); return Math.round(((h2 * 60 + m2 - h1 * 60 - m1) / 60) * 100) / 100; };
const fechaLarga = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

export function MisActividadesFreelance() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const hoyStr = ymd(new Date());
  const [lunes, setLunes] = useState(() => lunesDe(new Date()));
  const [acts, setActs] = useState<Act[]>([]);
  const [esFree, setEsFree] = useState<boolean | null>(null);
  const [v, setV] = useState({ titulo: "", descripcion: "", inicio: "", fin: "" });
  const [esLider, setEsLider] = useState(false);
  const [frees, setFrees] = useState<{ id: string; nombre: string }[]>([]);
  const [verUid, setVerUid] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [finde, setFinde] = useState(false);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => ymd(addDays(lunes, i))), [lunes]);

  const cargar = useCallback(async () => {
    if (!uid) return;
    const { data: fr } = await supabase.rpc("es_freelance", { _uid: uid });
    setEsFree(!!fr);
    const { data: lp } = await supabase.rpc("puede_pagos", { _uid: uid });
    setEsLider(!!lp);
    if (lp) {
      const { data: us } = await supabase.rpc("listar_usuarios_freelance");
      setFrees(((us ?? []) as { id: string; nombre_completo: string | null; email: string | null; seleccionado: boolean }[]).filter((x) => x.seleccionado).map((x) => ({ id: x.id, nombre: x.nombre_completo || x.email || "" })));
    }
    const objetivo = verUid ?? uid;
    const { data } = await supabase.from("freelance_actividades").select("*").eq("usuario_id", objetivo).gte("fecha", dias[0]).lte("fecha", dias[6]).order("created_at", { ascending: true });
    setActs((data ?? []) as Act[]);
  }, [uid, dias, verUid]);
  useEffect(() => { void cargar(); }, [cargar]);

  const subir = async (f: File, fecha: string) => {
    const path = `${uid}/${fecha.slice(0, 7)}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const up = await supabase.storage.from("freelance").upload(path, f, { contentType: f.type });
    if (up.error) throw new Error(up.error.message);
    return path;
  };
  const tipoOk = (f: File) => f.type === "application/pdf" || f.type.startsWith("image/");

  const guardar = async () => {
    if (!uid) return;
    if (!v.titulo.trim()) return toast.error("Escribe el nombre de la actividad.");
    if (!v.inicio || !v.fin) return toast.error("Indica la hora de inicio y la hora de fin.");
    const h = horasEntre(v.inicio, v.fin);
    if (h <= 0) return toast.error("La hora de fin debe ser después de la hora de inicio.");
    if (h > 16) return toast.error("Revisa las horas: no parece normal más de 16 horas en una sola actividad.");
    if (!v.descripcion.trim()) return toast.error("Escribe un resumen de lo que realizaste.");
    if (file && !tipoOk(file)) return toast.error("Solo PDF o imágenes (no videos).");
    const totalDia = acts.filter((a) => a.fecha === hoyStr).reduce((s, a) => s + Number(a.horas), 0) + h;
    if (totalDia > 16) return toast.error(`Hoy sumarías ${totalDia} h. Revisa que las horas sean correctas.`);
    setBusy(true);
    try {
      const path = file ? await subir(file, hoyStr) : null;
      const { error } = await supabase.from("freelance_actividades").insert({
        usuario_id: uid, fecha: hoyStr, titulo: v.titulo.trim(), descripcion: v.descripcion.trim(),
        horas: h, hora_inicio: v.inicio, hora_fin: v.fin, archivo_path: path, archivo_nombre: file?.name ?? null, archivo_tipo: file?.type ?? null,
      });
      if (error) throw new Error(error.message);
      toast.success("Actividad guardada");
      setV({ titulo: "", descripcion: "", inicio: "", fin: "" }); setFile(null);
      await cargar();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const viendoOtro = false;
  if (esFree === false && !esLider) return <div className="p-8 text-center text-muted-foreground">Tu cuenta no está habilitada como freelance.</div>;
  const verFinde = finde || acts.some((a) => a.fecha === dias[5] || a.fecha === dias[6]) || hoyStr === dias[5] || hoyStr === dias[6];
  const horasSemana = acts.reduce((s, a) => s + Number(a.horas), 0);
  const rango = `${new Date(lunes).toLocaleDateString("es-EC", { day: "numeric", month: "short" })} – ${addDays(lunes, 6).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Informe diario · Mis actividades</h1>
        
      </div>

      {esFree && !viendoOtro && (
      <div className="border-b pb-5 grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-4 text-sm"><span className="text-muted-foreground">Fecha de la actividad: </span><b className="capitalize">{fechaLarga(hoyStr)}</b></div>
        <label className="sm:col-span-2"><span className="text-[11px] font-semibold text-muted-foreground">Actividad *</span><input placeholder="Ej: Grabación de pantalla para clase" value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} className={cls} /></label>
        <label><span className="text-[11px] font-semibold text-muted-foreground">Desde *</span><input type="time" value={v.inicio} onChange={(e) => setV({ ...v, inicio: e.target.value })} className={cls} /></label>
        <label><span className="text-[11px] font-semibold text-muted-foreground">Hasta *</span><input type="time" value={v.fin} onChange={(e) => setV({ ...v, fin: e.target.value })} className={cls} /></label>
        <div className="sm:col-span-4 text-xs text-muted-foreground">{v.inicio && v.fin && horasEntre(v.inicio, v.fin) > 0 ? `Tiempo trabajado: ${horasEntre(v.inicio, v.fin)} h` : "Ej: de 07:00 a 10:00 = 3 h"}</div>
        <label className="sm:col-span-4"><span className="text-[11px] font-semibold text-muted-foreground">Resumen de lo que realizaste *</span><textarea rows={3} placeholder="Ej: Erwin me pidió reemplazarlo y grabar la pantalla de la clase de Excel. Incluye también tareas extra." value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} className={cls} /></label>
        <div className="sm:col-span-4 flex flex-wrap justify-between gap-2">
          <Button variant="outline" type="button" onClick={() => ref.current?.click()} className="px-3 py-2 rounded-lg border text-sm inline-flex gap-2 items-center"><Upload className="w-4 h-4" />{file ? file.name : "Adjuntar PDF o imagen de esta actividad (opcional)"}</Button>
          <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="outline" disabled={busy} onClick={guardar} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex gap-2 items-center">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Guardar actividad</Button>
        </div>
      </div>
      )}

      {(esFree || viendoOtro) && (
      <div className="pb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setLunes(addDays(lunes, -7))} className="p-2 rounded-lg border" title="Semana anterior"><ChevronLeft className="w-4 h-4" /></Button>
            <b className="text-sm">{rango}</b>
            <Button variant="outline" onClick={() => setLunes(addDays(lunes, 7))} className="p-2 rounded-lg border" title="Semana siguiente"><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="outline" onClick={() => setLunes(lunesDe(new Date()))} className="px-3 py-1.5 rounded-lg border text-xs">Esta semana</Button>
            <label className="text-xs inline-flex gap-1 items-center ml-2"><input type="checkbox" checked={verFinde} onChange={(e) => setFinde(e.target.checked)} />Sábado y domingo (opcional)</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Total semana: <b>{horasSemana.toFixed(2)} h</b></span>
            <Button variant="outline" onClick={() => void descargarPdf(acts, `Semana ${rango}`, (viendoOtro ? frees.find((f) => f.id === verUid)?.nombre ?? "" : session?.user.user_metadata?.full_name ?? session?.user.email ?? ""))} className="px-3 py-1.5 rounded-lg border text-xs inline-flex gap-1 items-center"><Download className="w-3.5 h-3.5" />PDF semana</Button>
          </div>
        </div>
        <div className={`grid grid-cols-2 sm:grid-cols-4 ${verFinde ? "lg:grid-cols-7" : "lg:grid-cols-5"} gap-2`}>
          {dias.map((d, i) => {
            if (i >= 5 && !verFinde) return null;
            const del = acts.filter((a) => a.fecha === d);
            const h = del.reduce((s, a) => s + Number(a.horas), 0);
            return (
              <Button variant="outline" key={d} onClick={() => setDiaAbierto(d)} className={`h-auto whitespace-normal flex flex-col items-start text-left rounded-lg border p-3 min-h-28 hover:bg-muted/50 transition ${d === hoyStr ? "border-primary ring-1 ring-primary" : ""}`}>
                <div className="text-xs text-muted-foreground">{DIAS[i]} {Number(d.slice(8))}</div>
                <div className="text-lg font-bold">{h ? `${h} h` : "—"}</div>
                <div className="text-xs text-muted-foreground">{del.length} actividad{del.length === 1 ? "" : "es"}</div>
                {del.slice(0, 2).map((a) => <div key={a.id} className="text-[11px] truncate mt-1">• {a.titulo}</div>)}
                <div className="text-[11px] text-primary mt-1">Abrir</div>
              </Button>
            );
          })}
        </div>
      </div>

      )}


      {diaAbierto && uid && (
        <DiaModal fecha={diaAbierto} acts={acts.filter((a) => a.fecha === diaAbierto)} uid={uid} soloLectura={viendoOtro} nombre={(viendoOtro ? frees.find((f) => f.id === verUid)?.nombre ?? "" : session?.user.user_metadata?.full_name ?? session?.user.email ?? "")}
          subir={subir} onClose={() => setDiaAbierto(null)} onChange={cargar} />
      )}
    </div>
  );
}

function DiaModal({ fecha, acts, uid, nombre, subir, onClose, onChange, soloLectura }: { soloLectura: boolean; fecha: string; acts: Act[]; uid: string; nombre: string; subir: (f: File, fecha: string) => Promise<string>; onClose: () => void; onChange: () => Promise<void> }) {
  const imgRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const total = acts.reduce((s, a) => s + Number(a.horas), 0);

  const ver = async (a: Act) => {
    if (!a.archivo_path) return;
    const { data } = await supabase.storage.from("freelance").createSignedUrl(a.archivo_path, 3600);
    if (data) window.open(data.signedUrl, "_blank", "noreferrer");
  };
  const borrar = async (a: Act) => {
    if (!confirm("¿Borrar esta actividad?")) return;
    if (a.archivo_path) await supabase.storage.from("freelance").remove([a.archivo_path]);
    await supabase.from("freelance_actividades").delete().eq("id", a.id);
    await onChange();
  };
  const agregarImgs = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) { toast.error(`${f.name}: solo imágenes`); continue; }
        const path = await subir(f, fecha);
        await supabase.from("freelance_actividades").insert({ usuario_id: uid, fecha, titulo: "Imagen de evidencia", descripcion: f.name, horas: 0, archivo_path: path, archivo_nombre: f.name, archivo_tipo: f.type });
      }
      toast.success("Imágenes agregadas"); await onChange();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <div><b className="capitalize">{fechaLarga(fecha)}</b><div className="text-xs text-muted-foreground">{acts.length} registros · {total.toFixed(2)} h trabajadas</div></div>
          <Button variant="outline" onClick={onClose} className="p-2 rounded-lg border"><X className="w-4 h-4" /></Button>
        </div>
        {acts.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No hay actividades este día.</div> : acts.map((a) => (
          <div key={a.id} className="px-5 py-3 border-b flex items-start justify-between gap-3 text-sm">
            <div><div className="font-semibold">{a.titulo}{a.hora_inicio && a.hora_fin && ` · ${a.hora_inicio.slice(0, 5)}–${a.hora_fin.slice(0, 5)}`}{Number(a.horas) > 0 && ` · ${a.horas} h`}</div>{a.descripcion && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{a.descripcion}</div>}{a.archivo_nombre && <div className="text-[11px] mt-1">Archivo de esta actividad: {a.archivo_nombre}</div>}{a.observacion_lider && <div className="text-xs rounded-lg bg-muted p-2 mt-1"><b>Observación del líder:</b> {a.observacion_lider}</div>}</div>
            <div className="flex gap-2 shrink-0">
              {a.archivo_path && <Button variant="outline" onClick={() => ver(a)} className="p-2 rounded-lg border" title="Ver archivo"><FileText className="w-4 h-4" /></Button>}
              {!soloLectura && <Button variant="outline" onClick={() => borrar(a)} className="p-2 rounded-lg border" title="Borrar"><Trash2 className="w-4 h-4" /></Button>}
            </div>
          </div>
        ))}
        <div className="px-5 py-4 flex flex-wrap justify-end gap-2">
          <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void agregarImgs(e.target.files)} />
          {!soloLectura && <Button variant="outline" disabled={busy} onClick={() => imgRef.current?.click()} className="px-3 py-2 rounded-lg border text-sm inline-flex gap-2 items-center">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}Agregar imágenes</Button>}
          <Button variant="outline" disabled={!acts.length} onClick={() => void descargarPdf(acts, fechaLarga(fecha), nombre)} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm inline-flex gap-2 items-center"><Download className="w-4 h-4" />Descargar PDF</Button>
        </div>
      </div>
    </div>
  );
}

async function aDataUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("freelance").download(path);
  if (!data) return null;
  return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => res(null); r.readAsDataURL(data); });
}

async function descargarPdf(acts: Act[], titulo: string, nombre: string) {
  if (!acts.length) return toast.error("No hay actividades para el informe.");
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const total = acts.reduce((s, a) => s + Number(a.horas), 0);
  doc.setFontSize(16); doc.text("Informe de actividades freelance", 14, 18);
  doc.setFontSize(10); doc.text(`${nombre}`, 14, 25); doc.text(titulo, 14, 31); doc.text(`Total de horas: ${total.toFixed(2)} h`, 14, 37);
  const filas = acts.filter((a) => Number(a.horas) > 0 || !a.archivo_tipo?.startsWith("image/"));
  autoTable(doc, { startY: 43, head: [["Fecha", "Horario", "Actividad", "Horas", "Resumen"]], body: filas.map((a) => [a.fecha, a.hora_inicio && a.hora_fin ? `${a.hora_inicio.slice(0, 5)}-${a.hora_fin.slice(0, 5)}` : "", a.titulo, String(a.horas), a.descripcion ?? ""]), styles: { fontSize: 9 }, columnStyles: { 4: { cellWidth: 90 } } });
  const imgs = acts.filter((a) => a.archivo_path && a.archivo_tipo?.startsWith("image/"));
  for (const a of imgs) {
    if (!a.archivo_path) continue;
    const url = await aDataUrl(a.archivo_path);
    if (!url) continue;
    doc.addPage(); doc.setFontSize(11); doc.text(`${a.fecha} · ${a.titulo}`, 14, 16);
    try { const p = doc.getImageProperties(url); const w = 180; const h = Math.min(250, (p.height * w) / p.width); doc.addImage(url, 14, 22, (p.width * h) / p.height > w ? w : (p.width * h) / p.height, h); } catch { /* imagen no compatible */ }
  }
  doc.save(`actividades-${titulo.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`);
}
