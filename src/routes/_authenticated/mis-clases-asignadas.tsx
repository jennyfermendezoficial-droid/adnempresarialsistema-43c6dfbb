import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Video, Calendar, AlertCircle, Clock, Trash2, UserPlus, FileText, List, CalendarDays, Compass } from "lucide-react";
import { RegistrarDuracionModal } from "@/components/RegistrarDuracionModal";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfiles } from "@/lib/perfiles";
import { horaFinProgramada1a1, sesion1a1Terminada } from "@/lib/sesion-1a1-tiempo";
import { toast } from "sonner";
import { listaMeses, generarInformeProfesorPDF, type InformeItem, type InformeReemplazo } from "@/lib/pagos-export";
import { listarCoachPropio, type CoachRegistro } from "@/lib/coach.functions";
import { segmentarHorarioLaboral, refTarifa1a1Fuera, refTarifaCoach } from "@/lib/pagos-horario";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/mis-clases-asignadas")({ component: Page });

interface Clase { id: string; fecha: string; hora_inicio: string; hora_fin: string; titulo: string; descripcion: string | null; zoom_link: string | null; profesor_id: string | null; duracion_min: number | null }
interface Sesion { id: string; fecha: string; hora_inicio: string; hora_fin: string | null; profesor_id: string; alumna_id: string; zoom_link: string | null; estado: string; motivo: string | null; duracion_min: number | null }
interface Profile { id: string; nombre_completo: string; email?: string | null }
interface Reemplazo { id: string; tipo: string; referencia_id: string; profesor_reemplazado: string; fecha: string; nota: string | null }

type TipoItem = "clase" | "1a1" | "coach";
type FiltroTipo = "todo" | TipoItem;
type Item = {
  tipo: TipoItem; id: string; fecha: string; hora: string; titulo: string; sub: string; link: string | null;
  motivo?: string | null; soyProfe?: boolean; sesion?: Sesion; clase?: Clase; coach?: CoachRegistro;
};

const hoyDate = new Date();
function sumarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function red2(n: number) { return Math.round(n * 100) / 100; }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";
  const listarCoach = useServerFn(listarCoachPropio);
  const meses = listaMeses();
  const [periodo, setPeriodo] = useState(`${hoyDate.getFullYear()}-${String(hoyDate.getMonth() + 1).padStart(2, "0")}`);
  const [anioSel, mesSel] = [Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7))];
  const [clases, setClases] = useState<Clase[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [coach, setCoach] = useState<CoachRegistro[]>([]);
  const [personas, setPersonas] = useState<Record<string, Profile>>({});
  const [profesores, setProfesores] = useState<Profile[]>([]);
  const [reemplazos, setReemplazos] = useState<Reemplazo[]>([]);
  const [reemplazoModal, setReemplazoModal] = useState<{ tipo: "clase" | "1a1"; id: string; fecha: string; titulo: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"lista" | "calendario">("lista");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todo");
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [duracionModal, setDuracionModal] = useState<Sesion | null>(null);
  const [claseModal, setClaseModal] = useState<Clase | null>(null);
  const [borrarSesion, setBorrarSesion] = useState<Sesion | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [razon, setRazon] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const eliminarSesion = async () => {
    if (!borrarSesion) return;
    if (razon.trim().length < 5) return toast.error("Escribe la razón (mínimo 5 caracteres)");
    setBorrando(true);
    const { error } = await supabase.rpc("cancelar_sesion_1a1", { _id: borrarSesion.id, _razon: razon.trim() });
    setBorrando(false);
    if (error) return toast.error(error.message || "No se pudo eliminar la sesión");
    setSesiones((arr) => arr.filter((x) => x.id !== borrarSesion.id));
    setBorrarSesion(null); setRazon("");
    toast.success("Sesión eliminada · queda registrada en informes");
  };

  useEffect(() => {
    const refresh = () => setRefreshKey((n) => n + 1);
    window.addEventListener("adn:horas-actualizadas", refresh);
    window.addEventListener("adn:clase-historica-registrada", refresh);
    return () => {
      window.removeEventListener("adn:horas-actualizadas", refresh);
      window.removeEventListener("adn:clase-historica-registrada", refresh);
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelado = false;
    setLoading(true);
    void (async () => {
      const desde = `${anioSel}-${String(mesSel).padStart(2, "0")}-01`;
      const ultimo = new Date(anioSel, mesSel, 0).getDate();
      const hasta = `${anioSel}-${String(mesSel).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
      const coachPromise = isStaff ? listarCoach({ data: { mes: mesSel, anio: anioSel } }).catch(() => [] as CoachRegistro[]) : Promise.resolve([] as CoachRegistro[]);
      const [{ data: c }, { data: s }, { data: r }, coachRows] = await Promise.all([
        supabase.from("clases_en_vivo").select("*").gte("fecha", desde).lte("fecha", hasta).eq("profesor_id", uid).order("fecha").order("hora_inicio"),
        supabase.from("sesiones_1a1").select("*").gte("fecha", desde).lte("fecha", hasta).or(`alumna_id.eq.${uid},profesor_id.eq.${uid}`).order("fecha", { ascending: false }).order("hora_inicio"),
        supabase.from("reemplazos_clase").select("*").eq("profesor_reporta", uid).gte("fecha", desde).lte("fecha", hasta),
        coachPromise,
      ]);
      if (cancelado) return;
      const cl = ((c as Clase[]) ?? []).filter((x) => x.profesor_id === uid);
      const se = ((s as Sesion[]) ?? []).filter((x) => x.profesor_id === uid || x.alumna_id === uid);
      setClases(cl); setSesiones(se); setReemplazos(((r as Reemplazo[]) ?? [])); setCoach(coachRows);
      const ids = Array.from(new Set(se.flatMap((x) => [x.alumna_id, x.profesor_id]).filter((id) => id !== uid)));
      if (ids.length) {
        const ps = await fetchPerfiles(ids);
        if (cancelado) return;
        const map: Record<string, Profile> = {};
        ((ps as Profile[]) ?? []).forEach((p) => { map[p.id] = p; });
        setPersonas(map);
      } else setPersonas({});
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [uid, isStaff, anioSel, mesSel, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.rpc("listar_profesores").then(({ data }) => setProfesores(((data ?? []) as Profile[]).filter((p) => p.id !== uid)));
  }, [uid]);

  const descargarInforme = async () => {
    if (!uid) return;
    const [{ data: precios }, { data: tarifas }, { data: aj }, { data: bonos }, { data: descuentos }, { data: abonos }] = await Promise.all([
      supabase.from("pagos_items_precio").select("tipo,referencia_id,monto").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel),
      supabase.from("pagos_tarifas_mes").select("valor_hora_clase,valor_hora_sesion").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel).maybeSingle(),
      supabase.from("pagos_ajustes").select("minutos").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel).maybeSingle(),
      supabase.from("bonos").select("monto,motivo").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel),
      supabase.from("pagos_descuentos").select("monto,motivo").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel),
      supabase.from("pagos_comprobantes").select("fecha_pago,monto,tipo_pago,banco_texto,numero_comprobante,observacion").eq("profesor_id", uid).eq("mes", mesSel).eq("anio", anioSel),
    ]);
    const precioMap = new Map(((precios ?? []) as { tipo: string; referencia_id: string; monto: number }[]).map((p) => [`${p.tipo}:${p.referencia_id}`, Number(p.monto)]));
    const tarifaClase = Number((tarifas as { valor_hora_clase?: number } | null)?.valor_hora_clase ?? 0);
    const tarifaSesion = Number((tarifas as { valor_hora_sesion?: number } | null)?.valor_hora_sesion ?? 0);
    const tarifaFuera = precioMap.get(`1a1:${refTarifa1a1Fuera(uid, mesSel, anioSel)}`) ?? tarifaSesion;
    const tarifaCoach = precioMap.get(`clase:${refTarifaCoach(uid, mesSel, anioSel)}`) ?? 0;

    const items: InformeItem[] = [];
    clases.filter((c) => c.profesor_id === uid).forEach((c) => {
      const min = Number(c.duracion_min ?? 0);
      const manual = precioMap.get(`clase:${c.id}`);
      items.push({ fecha: c.fecha, tipo: "Clase en vivo", categoria: min > 0 ? "clase" : "pendiente", detalle: "Clase en vivo", tema: c.titulo, horaInicio: c.hora_inicio.slice(0,5), horaFin: (c.hora_fin ?? "").slice(0,5), minutos: min, monto: min > 0 ? (manual != null && manual > 0 ? manual : red2(tarifaClase * min / 60)) : 0 });
    });
    sesiones.filter((s) => s.profesor_id === uid).forEach((s) => {
      const min = Number(s.duracion_min ?? 0);
      const persona = formatNombre(personas[s.alumna_id]?.nombre_completo) || personas[s.alumna_id]?.email || "Estudiante";
      const segmentos = segmentarHorarioLaboral(s.hora_inicio, min);
      const manual = precioMap.get(`1a1:${s.id}`);
      const totalCalc = segmentos.reduce((a, seg) => a + (seg.laboral ? tarifaSesion : tarifaFuera) * seg.minutos / 60, 0);
      const total = min > 0 ? (manual != null && manual > 0 ? manual : red2(totalCalc)) : 0;
      if (!segmentos.length) {
        items.push({ fecha: s.fecha, tipo: "Sesión 1 a 1", categoria: "pendiente", detalle: persona, tema: s.motivo || "", horaInicio: s.hora_inicio.slice(0,5), horaFin: (s.hora_fin ?? "").slice(0,5), minutos: 0, monto: 0 });
      } else {
        let usado = 0;
        segmentos.forEach((seg, idx) => {
          const monto = manual != null && manual > 0
            ? (idx === segmentos.length - 1 ? red2(total - usado) : red2(total * seg.minutos / min))
            : red2((seg.laboral ? tarifaSesion : tarifaFuera) * seg.minutos / 60);
          usado = red2(usado + monto);
          items.push({ fecha: s.fecha, tipo: seg.laboral ? "Sesión 1 a 1 · horario laboral" : "Sesión 1 a 1 · fuera de horario laboral", categoria: seg.laboral ? "1a1_laboral" : "1a1_fuera", detalle: persona, tema: s.motivo || "", horaInicio: seg.horaInicio, horaFin: seg.horaFin, minutos: seg.minutos, monto });
        });
      }
    });
    coach.forEach((c) => {
      const manual = precioMap.get(`clase:${c.id}`);
      items.push({ fecha: c.fecha, tipo: "Coach", categoria: "coach", detalle: "Coach", tema: c.tema, horaInicio: c.hora_inicio.slice(0,5), horaFin: sumarMinutos(c.hora_inicio, c.duracion_min), minutos: c.duracion_min, monto: manual != null && manual > 0 ? manual : red2(tarifaCoach * c.duracion_min / 60) });
    });
    items.sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));

    const reps: InformeReemplazo[] = reemplazos.map((r) => ({
      fecha: r.fecha, detalle: r.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1",
      profesor: formatNombre(profesores.find((p) => p.id === r.profesor_reemplazado)?.nombre_completo) || "otro profesor", nota: r.nota ?? "",
    }));
    const bonosDetalle = ((bonos ?? []) as { monto: number; motivo: string | null }[]).map((b) => ({ motivo: b.motivo || "Bono", monto: Number(b.monto) }));
    const descuentosDetalle = ((descuentos ?? []) as { monto: number; motivo: string }[]).map((d) => ({ motivo: d.motivo, monto: Number(d.monto) }));
    const totalBonos = bonosDetalle.reduce((a, b) => a + b.monto, 0);
    const totalDescuentos = descuentosDetalle.reduce((a, d) => a + d.monto, 0);
    const total = Math.max(0, red2(items.reduce((a, i) => a + i.monto, 0) + totalBonos - totalDescuentos));
    const abonosPDF = ((abonos ?? []) as Array<{ fecha_pago: string; monto: number; tipo_pago: string; banco_texto: string | null; numero_comprobante: string | null; observacion: string | null }>).map((a) => ({ fecha: a.fecha_pago, profesor: "", monto: Number(a.monto), tipo: a.tipo_pago, banco: a.banco_texto || "", numero: a.numero_comprobante || "", observacion: a.observacion || "" }));
    const abonado = abonosPDF.reduce((a, b) => a + b.monto, 0);

    generarInformeProfesorPDF({
      nombre: formatNombre(session?.user.user_metadata?.nombre_completo as string | undefined) || session?.user.email || "Profesor",
      tema: "", mes: mesSel, anio: anioSel, items, reemplazos: reps, abonos: abonosPDF,
      bonos: totalBonos, bonosDetalle, descuentos: totalDescuentos, descuentosDetalle,
      ajusteMin: Number((aj as { minutos: number } | null)?.minutos ?? 0), total,
      estadoPago: abonado > 0 && abonado + 0.009 >= total ? "pagado" : abonado > 0 ? "parcial" : "por_pagar",
      califPromedio: 0, califCount: 0,
    });
  };

  const guardarReemplazo = async (profesorId: string, nota: string) => {
    if (!reemplazoModal || !uid) return;
    const { error } = await supabase.from("reemplazos_clase").insert({ tipo: reemplazoModal.tipo, referencia_id: reemplazoModal.id, profesor_reporta: uid, profesor_reemplazado: profesorId, fecha: reemplazoModal.fecha, nota: nota.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Reemplazo reportado"); setReemplazoModal(null);
    const { data: r } = await supabase.from("reemplazos_clase").select("*").eq("profesor_reporta", uid);
    setReemplazos(((r as Reemplazo[]) ?? []));
  };

  const ahora = new Date();
  const dentroDe24h = (fecha: string, hora: string) => { const d = new Date(`${fecha}T${hora}`); const diff = d.getTime() - ahora.getTime(); return diff > 0 && diff < 24 * 60 * 60 * 1000; };

  const items: Item[] = [
    ...clases.map<Item>((c) => ({ tipo: "clase", id: c.id, fecha: c.fecha, hora: c.hora_inicio, titulo: c.titulo, sub: c.duracion_min ? `${c.descripcion || "Clase en vivo"} · ${c.hora_inicio.slice(0,5)} – ${c.hora_fin?.slice(0,5)} · ${c.duracion_min} min` : (c.descripcion || "Clase en vivo"), link: c.zoom_link, soyProfe: c.profesor_id === uid, clase: c })),
    ...sesiones.map<Item>((s) => {
      const soyAlumna = s.alumna_id === uid; const soyProfesor = s.profesor_id === uid; const persona = personas[soyAlumna ? s.profesor_id : s.alumna_id];
      const nombre = formatNombre(persona?.nombre_completo) || persona?.email || (soyAlumna ? "mentor" : "estudiante");
      const termino = sesion1a1Terminada(s.fecha, s.hora_inicio, s.hora_fin, ahora); const finProgramado = horaFinProgramada1a1(s.hora_inicio, s.hora_fin);
      return { tipo: "1a1", id: s.id, fecha: s.fecha, hora: s.hora_inicio, titulo: soyAlumna ? `1 a 1 con ${nombre}` : `1 a 1 · ${nombre}`, sub: s.duracion_min ? `Sesión privada · Realizada · ${s.hora_inicio.slice(0,5)} – ${s.hora_fin?.slice(0,5)} · ${s.duracion_min} min` : termino ? "Sesión privada · Pendiente de registrar duración" : `Sesión privada · Reservado · ${s.hora_inicio.slice(0,5)} – ${finProgramado}`, link: s.zoom_link, motivo: s.motivo, soyProfe: soyProfesor, sesion: s };
    }),
    ...coach.map<Item>((c) => ({ tipo: "coach", id: c.id, fecha: c.fecha, hora: c.hora_inicio, titulo: `Coach · ${c.tema}`, sub: `Coach · ${c.hora_inicio.slice(0,5)} – ${sumarMinutos(c.hora_inicio, c.duracion_min)} · ${c.duracion_min} min`, link: null, soyProfe: true, coach: c })),
  ].sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  const filtrados = items.filter((it) => filtroTipo === "todo" || it.tipo === filtroTipo);
  const visibles = vista === "calendario" ? filtrados.filter((it) => !diaSel || it.fecha === diaSel) : filtrados;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Agenda personal</div><h1 className="text-3xl font-bold mt-1">Mis clases asignadas</h1><p className="text-sm opacity-90 mt-1">Aquí ves tus clases en vivo, sesiones 1 a 1 y Coach del período seleccionado.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setDiaSel(null); }} className="px-3 py-2 rounded-lg border bg-background text-sm">{meses.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        <div className="flex gap-1 p-1 rounded-lg border bg-card"><button onClick={() => setVista("lista")} className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${vista === "lista" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}><List className="w-3.5 h-3.5" /> Lista</button><button onClick={() => setVista("calendario")} className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${vista === "calendario" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}><CalendarDays className="w-3.5 h-3.5" /> Calendario</button></div>
        {isStaff && <div className="flex gap-1 p-1 rounded-lg border bg-card">{(["todo","clase","1a1","coach"] as FiltroTipo[]).map((f) => <button key={f} onClick={() => { setFiltroTipo(f); setDiaSel(null); }} className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${filtroTipo === f ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>{f === "todo" ? "Todo" : f === "clase" ? "Clases" : f === "1a1" ? "1 a 1" : "Coach"}</button>)}</div>}
        <button onClick={() => void descargarInforme()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold"><FileText className="w-4 h-4" /> Descargar mi informe PDF</button>
      </div>

      {vista === "calendario" && !loading && <CalendarioMes anio={anioSel} mes={mesSel} items={filtrados} diaSel={diaSel} onDia={(d) => setDiaSel(d === diaSel ? null : d)} />}
      {vista === "calendario" && !loading && reemplazos.length > 0 && <div className="rounded-2xl border bg-card p-4 mb-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Reemplazos que reportaste este mes</div><div className="space-y-1.5">{reemplazos.map((r) => <div key={r.id} className="text-sm flex gap-2 items-start"><span className="text-[11px] uppercase opacity-60 w-14 pt-0.5">{new Date(r.fecha + "T00:00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</span><span className="flex-1">{r.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1"} · <span className="text-muted-foreground">reemplazaste a {formatNombre(profesores.find((p) => p.id === r.profesor_reemplazado)?.nombre_completo) || "otro profesor"}</span>{r.nota && <span className="block text-xs text-muted-foreground">{r.nota}</span>}</span></div>)}</div></div>}

      {loading ? <p className="text-center text-muted-foreground py-12">Cargando…</p> : visibles.length === 0 ? <div className="p-8 text-center text-muted-foreground border rounded-2xl">No tienes actividad de este tipo en el período seleccionado.</div> : <div className="space-y-2">{visibles.map((it) => {
        const proximo = dentroDe24h(it.fecha, it.hora); const termino1a1 = it.tipo === "1a1" && it.sesion ? sesion1a1Terminada(it.sesion.fecha, it.sesion.hora_inicio, it.sesion.hora_fin, ahora) : false;
        const color = it.tipo === "coach" ? "#0284c7" : it.tipo === "clase" ? "var(--violet)" : "#16a34a";
        return <div key={`${it.tipo}-${it.id}`} className="rounded-2xl border bg-card p-4 flex items-center gap-3 flex-wrap shadow-sm" style={proximo ? { borderColor: "var(--violet)", boxShadow: "0 4px 16px rgba(124,107,255,.15)" } : undefined}>
          <div className="w-12 h-12 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: color }}>{it.tipo === "clase" ? <Calendar className="w-5 h-5" /> : it.tipo === "coach" ? <Compass className="w-5 h-5" /> : <Video className="w-5 h-5" />}</div>
          <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold truncate">{it.titulo}</h3><span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${color}18`, color }}>{it.tipo === "clase" ? "Clase en vivo" : it.tipo === "coach" ? "Coach" : "1 a 1"}</span>{proximo && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "rgba(245,158,11,.15)", color: "#d97706" }}><AlertCircle className="w-3 h-3" /> En menos de 24h</span>}</div><p className="text-xs text-muted-foreground mt-0.5 capitalize">{new Date(it.fecha + "T00:00:00").toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })} · {it.hora.slice(0,5)}</p>{it.sub && <p className="text-xs mt-1 opacity-80 line-clamp-2">{it.sub}</p>}{it.tipo === "1a1" && it.motivo && <div className="mt-2 p-2 rounded-lg border-l-2 text-xs" style={{ borderColor: "var(--violet)", background: "rgba(124,107,255,.06)" }}><div className="text-[10px] uppercase tracking-wider font-bold opacity-70 mb-0.5">{it.soyProfe ? "Duda de la alumna" : "Tu duda / inquietud"}</div><div className="opacity-90">{it.motivo}</div></div>}</div>
          {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-violet-gradient text-white"><Video className="w-3.5 h-3.5" /> Entrar a Zoom</a>}
          {it.tipo === "1a1" && it.soyProfe && it.sesion && termino1a1 && <button onClick={() => setDuracionModal(it.sesion!)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border"><Clock className="w-3.5 h-3.5" /> {it.sesion.duracion_min ? "Editar duración" : "Registrar duración"}</button>}
          {it.tipo === "1a1" && it.sesion && it.sesion.estado !== "finalizada" && it.soyProfe && <button onClick={() => { setBorrarSesion(it.sesion!); setRazon(""); }} title="Eliminar sesión" className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border text-destructive border-destructive/40 hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /> Eliminar</button>}
          {it.tipo === "clase" && it.clase && it.clase.profesor_id === uid && new Date(`${it.fecha}T${it.hora}`) <= ahora && <button onClick={() => setClaseModal(it.clase!)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border"><Clock className="w-3.5 h-3.5" /> {it.clase.duracion_min ? "Editar duración" : "Registrar duración"}</button>}
          {it.soyProfe && it.tipo !== "coach" && <button onClick={() => setReemplazoModal({ tipo: it.tipo as "clase" | "1a1", id: it.id, fecha: it.fecha, titulo: it.titulo })} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border"><UserPlus className="w-3.5 h-3.5" /> Reportar reemplazo</button>}
        </div>;
      })}</div>}

      {reemplazoModal && <ReemplazoModal titulo={reemplazoModal.titulo} profesores={profesores} onClose={() => setReemplazoModal(null)} onSave={guardarReemplazo} />}
      {duracionModal && <RegistrarDuracionModal sesionId={duracionModal.id} horaInicio={duracionModal.hora_inicio} onClose={() => setDuracionModal(null)} onSaved={(min, fin, ini) => setSesiones((arr) => arr.map((x) => x.id === duracionModal.id ? { ...x, duracion_min: min, hora_inicio: ini + ":00", hora_fin: fin + ":00", estado: "finalizada" } : x))} />}
      {claseModal && <RegistrarDuracionModal tipo="clase" sesionId={claseModal.id} horaInicio={claseModal.hora_inicio} duracionInicial={claseModal.duracion_min} onClose={() => setClaseModal(null)} onSaved={(min, fin, ini) => setClases((arr) => arr.map((x) => x.id === claseModal.id ? { ...x, duracion_min: min, hora_inicio: ini + ":00", hora_fin: fin + ":00" } : x))} />}
      <AlertDialog open={!!borrarSesion} onOpenChange={(o) => { if (!o) { setBorrarSesion(null); setRazon(""); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle><AlertDialogDescription>La alumna dejará de verla en su agenda. Escribe la razón; quedará registrada en Pagos e informes y no cuenta horas.</AlertDialogDescription></AlertDialogHeader><textarea value={razon} onChange={(e) => setRazon(e.target.value.slice(0, 300))} rows={3} maxLength={300} placeholder="Razón…" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /><AlertDialogFooter><AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); void eliminarSesion(); }} disabled={borrando || razon.trim().length < 5}>{borrando ? "Eliminando…" : "Eliminar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

interface CalItem { tipo: TipoItem; id: string; fecha: string; hora: string; titulo: string }
function CalendarioMes({ anio, mes, items, diaSel, onDia }: { anio: number; mes: number; items: CalItem[]; diaSel: string | null; onDia: (fecha: string) => void }) {
  const primero = new Date(anio, mes - 1, 1); const offset = primero.getDay(); const dias = new Date(anio, mes, 0).getDate();
  const celdas: (string | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: dias }, (_, i) => `${anio}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  const hoy = new Date().toISOString().slice(0, 10);
  return <div className="rounded-2xl border bg-card p-4 mb-4"><div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((d) => <div key={d} className="text-center py-1">{d}</div>)}</div><div className="grid grid-cols-7 gap-1">{celdas.map((fecha, i) => { if (!fecha) return <div key={`v${i}`} />; const delDia = items.filter((x) => x.fecha === fecha); const activo = diaSel === fecha; return <button key={fecha} onClick={() => onDia(fecha)} className={`min-h-[64px] rounded-xl border p-1.5 text-left transition ${activo ? "border-violet bg-violet/10" : "hover:bg-muted/40"}`} style={activo ? { borderColor: "var(--violet)" } : undefined}><div className={`text-[11px] font-semibold ${fecha === hoy ? "text-violet" : ""}`} style={fecha === hoy ? { color: "var(--violet)" } : undefined}>{Number(fecha.slice(8))}</div><div className="space-y-0.5 mt-0.5">{delDia.slice(0,2).map((x) => <div key={`${x.tipo}-${x.id}`} className="text-[9px] leading-tight truncate rounded px-1 py-0.5 text-white" style={{ background: x.tipo === "clase" ? "var(--violet)" : x.tipo === "coach" ? "#0284c7" : "#16a34a" }}>{x.hora.slice(0,5)} {x.titulo}</div>)}{delDia.length > 2 && <div className="text-[9px] text-muted-foreground">+{delDia.length - 2} más</div>}</div></button>; })}</div><p className="text-xs text-muted-foreground mt-3">Toca un día para ver solo sus actividades abajo. Coach aparece en azul.</p></div>;
}

function ReemplazoModal({ titulo, profesores, onClose, onSave }: { titulo: string; profesores: Profile[]; onClose: () => void; onSave: (profesorId: string, nota: string) => Promise<void> }) {
  const [profesorId, setProfesorId] = useState(""); const [nota, setNota] = useState(""); const [guardando, setGuardando] = useState(false);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}><div className="w-full max-w-md rounded-2xl bg-card border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}><h3 className="text-lg font-semibold">Reportar reemplazo</h3><p className="text-xs text-muted-foreground mt-1">{titulo}</p><label className="block text-xs font-semibold mt-4 mb-1">¿A qué profesor reemplazaste?</label><select value={profesorId} onChange={(e) => setProfesorId(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm"><option value="">Selecciona…</option>{profesores.map((p) => <option key={p.id} value={p.id}>{formatNombre(p.nombre_completo) || p.email}</option>)}</select><label className="block text-xs font-semibold mt-3 mb-1">Nota (opcional)</label><textarea value={nota} onChange={(e) => setNota(e.target.value.slice(0,300))} rows={3} placeholder="Ej: cubrí la clase por viaje del profe" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /><div className="flex justify-end gap-2 mt-4"><button onClick={onClose} disabled={guardando} className="px-3 py-2 rounded-lg border text-sm">Cancelar</button><button disabled={!profesorId || guardando} onClick={async () => { setGuardando(true); await onSave(profesorId, nota); setGuardando(false); }} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-50">{guardando ? "Guardando…" : "Reportar"}</button></div></div></div>;
}
