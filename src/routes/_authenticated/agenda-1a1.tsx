import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createZoomMeeting } from "@/lib/zoom.functions";
import { ChevronLeft, ChevronRight, Video, X as XIcon, Star, Clock, Ban } from "lucide-react";
import { toast } from "sonner";
import { RegistrarDuracionModal } from "@/components/RegistrarDuracionModal";
import {
  SesionPendienteAlumnoPanel,
  useSesionesPendientesAlumno,
} from "@/components/SesionPendienteAlumno";
import {
  CancelarSesion1a1ProfesorModal,
  type SesionCancelableProfesor,
} from "@/components/CancelarSesion1a1ProfesorModal";
import { formatNombre } from "@/lib/nombres";
import { fetchPerfiles } from "@/lib/perfiles";
import {
  fechaHoyEcuador,
  horaFinProgramada1a1,
  horarios1a1SeSolapan,
  sesion1a1Terminada,
  slot1a1Pasado,
  tieneUnDiaAnticipacion,
} from "@/lib/sesion-1a1-tiempo";

export const Route = createFileRoute("/_authenticated/agenda-1a1")({ component: Page });

interface Sesion {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  profesor_id: string;
  alumna_id: string;
  zoom_link: string | null;
  estado: string;
  duracion_min?: number | null;
  motivo?: string | null;
}
interface Profile {
  id: string;
  nombre_completo: string;
  email?: string | null;
  avatar_url?: string | null;
  actividad?: string | null;
}

const HORAS = ["15:00", "16:00", "17:00", "18:00"];
const ZOOM_DURACION_MIN = 60;
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const ESTADOS_RESUELTOS = new Set(["cancelada", "cancelado", "anulada", "anulado", "no_realizada", "no realizado"]);
const TEMAS: { match: string; tema: string }[] = [
  { match: "jennyfer", tema: "Marketing general" },
  { match: "jaime", tema: "Landing pages, web y sistemas" },
  { match: "karen", tema: "Ventas" },
  { match: "henry", tema: "Meta Ads" },
  { match: "erick", tema: "IA y generación de imágenes" },
];

function temaDe(p: Profile) {
  if (p.actividad?.trim()) return p.actividad.trim();
  const k = `${p.nombre_completo ?? ""} ${p.email ?? ""}`.toLowerCase();
  return TEMAS.find((t) => k.includes(t.match))?.tema ?? "Mentoría general";
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sesionActiva(s: Pick<Sesion, "estado">) {
  return !ESTADOS_RESUELTOS.has((s.estado || "confirmada").toLowerCase());
}

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const createZoom = useServerFn(createZoomMeeting);
  const isStaff = role === "admin" || role === "soporte";
  const esAlumna = role === "usuario";

  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [profesores, setProfesores] = useState<Profile[]>([]);
  const [profesorId, setProfesorId] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [booking, setBooking] = useState<{ fecha: string; hora: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [now, setNow] = useState(new Date());
  const [personas, setPersonas] = useState<Record<string, Profile>>({});
  const [duracionModal, setDuracionModal] = useState<Sesion | null>(null);
  const [cancelarModal, setCancelarModal] = useState<Sesion | null>(null);
  const [proximas, setProximas] = useState<Sesion[]>([]);
  const [disponibilidad, setDisponibilidad] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true, 3: true, 4: true });

  const {
    pendientes: pendientesAlumno,
    recargar: recargarPendientes,
  } = useSesionesPendientesAlumno(uid, esAlumna);

  const pendientesProfesorActual = useMemo(
    () => profesorId ? pendientesAlumno.filter((s) => s.profesor_id === profesorId) : [],
    [pendientesAlumno, profesorId],
  );
  const bloqueadoProfesorActual = esAlumna && pendientesProfesorActual.length > 0;

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data: staffRows } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: Profile[] | null }>)("listar_profesores");
      const list = ((staffRows ?? []) as Profile[]).filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
      const ids = list.map((p) => p.id);
      if (!ids.length) return;
      list.sort((a, b) => (a.nombre_completo || a.email || "").localeCompare(b.nombre_completo || b.email || ""));
      setProfesores(list);
      setProfesorId((actual) => actual ?? list[0].id);

      const { data: califs } = await supabase
        .from("calificaciones_mensuales")
        .select("profesor_id, claridad, didactica, practico, desenvolvimiento")
        .in("profesor_id", ids);
      const map: Record<string, { sum: number; n: number }> = {};
      ((califs ?? []) as { profesor_id: string; claridad: number | null; didactica: number | null; practico: number | null; desenvolvimiento: number | null }[]).forEach((c) => {
        const vals = [c.claridad, c.didactica, c.practico, c.desenvolvimiento].filter((v): v is number => typeof v === "number");
        if (!vals.length) return;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        map[c.profesor_id] = map[c.profesor_id] || { sum: 0, n: 0 };
        map[c.profesor_id].sum += avg;
        map[c.profesor_id].n += 1;
      });
      const out: Record<string, { avg: number; count: number }> = {};
      Object.entries(map).forEach(([k, v]) => { out[k] = { avg: v.sum / v.n, count: v.n }; });
      setRatings(out);
    })();
  }, []);

  useEffect(() => {
    if (!profesorId) return;
    void (async () => {
      const { data } = await supabase.from("disponibilidad").select("dia_semana,activo").eq("profesor_id", profesorId);
      const next: Record<number, boolean> = { 0: true, 1: true, 2: true, 3: true, 4: true };
      (data as { dia_semana: number; activo: boolean }[] | null)?.forEach((r) => { next[r.dia_semana] = r.activo; });
      setDisponibilidad(next);
    })();
  }, [profesorId]);

  useEffect(() => {
    if (!uid) return;
    const hoy = fechaHoyEcuador();
    void (async () => {
      let data: Sesion[] = [];
      if (isStaff) {
        const { data: staffRows } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: Profile[] | null }>)("listar_profesores");
        const staffIds = ((staffRows ?? []) as Profile[]).map((p) => p.id);
        if (staffIds.length) {
          const r = await supabase
            .from("sesiones_1a1")
            .select("*")
            .in("profesor_id", staffIds)
            .gte("fecha", hoy)
            .order("fecha")
            .order("hora_inicio");
          data = ((r.data as Sesion[]) ?? []).filter(sesionActiva);
        }
      } else {
        const r = await supabase
          .from("sesiones_1a1")
          .select("*")
          .or(`alumna_id.eq.${uid},profesor_id.eq.${uid}`)
          .gte("fecha", hoy)
          .order("fecha")
          .order("hora_inicio");
        data = ((r.data as Sesion[]) ?? []).filter(sesionActiva);
      }
      setProximas(data);
    })();
  }, [uid, sesiones, role, isStaff]);

  useEffect(() => {
    if (!uid) return;
    const ids = Array.from(new Set([...sesiones, ...proximas].flatMap((s) => [s.alumna_id, s.profesor_id])));
    const faltan = ids.filter((id) => id && !personas[id]);
    if (!faltan.length) return;
    void (async () => {
      const data = await fetchPerfiles(faltan);
      if (!data.length) return;
      setPersonas((prev) => {
        const next = { ...prev };
        (data as Profile[]).forEach((p) => { next[p.id] = p; });
        return next;
      });
    })();
  }, [uid, sesiones, proximas]); // eslint-disable-line react-hooks/exhaustive-deps

  const nombreDe = (id: string) => {
    const p = personas[id] ?? profesores.find((x) => x.id === id);
    return formatNombre(p?.nombre_completo) || p?.email || null;
  };

  useEffect(() => {
    if (!profesorId) return;
    const ini = fmt(weekStart);
    const fin = new Date(weekStart);
    fin.setDate(fin.getDate() + 4);
    supabase
      .from("sesiones_1a1")
      .select("*")
      .eq("profesor_id", profesorId)
      .gte("fecha", ini)
      .lte("fecha", fmt(fin))
      .then(({ data }) => setSesiones(((data as Sesion[]) ?? []).filter(sesionActiva)));
  }, [profesorId, weekStart]);

  const dias = useMemo(
    () => Array.from({ length: 5 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const ocupado = (fecha: string, hora: string) => sesiones.some((s) => sesionActiva(s) && s.fecha === fecha && s.hora_inicio.slice(0, 5) === hora);
  const miSesion = (fecha: string, hora: string) => sesiones.find((s) => sesionActiva(s) && s.fecha === fecha && s.hora_inicio.slice(0, 5) === hora && (s.alumna_id === uid || s.profesor_id === uid));
  const profesorActual = profesores.find((p) => p.id === profesorId);
  const ratingActual = profesorId ? ratings[profesorId] : undefined;
  const hoyEcuador = fechaHoyEcuador(now);
  const slotPasado = (fecha: string, hora: string) => slot1a1Pasado(fecha, hora, now);
  const cumpleAnticipacion = (fecha: string) => tieneUnDiaAnticipacion(fecha, now);

  const reservar = async () => {
    if (!booking || !uid || !profesorId || saving) return;
    if (bloqueadoProfesorActual) {
      toast.error("Primero resuelve tu sesión pendiente con este profesor. Puedes reservar normalmente con los demás profesores.");
      return;
    }
    if (!cumpleAnticipacion(booking.fecha)) {
      toast.error("Debes reservar con al menos 1 día de anticipación.");
      return;
    }
    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) {
      toast.error("Cuéntale al profesor tu duda o inquietud.");
      return;
    }
    if (motivoLimpio.length > 100) {
      toast.error("El motivo no puede superar los 100 caracteres.");
      return;
    }

    setSaving(true);
    const { fecha, hora } = booking;
    try {
      const { data: misRows } = await supabase
        .from("sesiones_1a1")
        .select("id,profesor_id,estado,hora_inicio,hora_fin")
        .eq("alumna_id", uid)
        .eq("fecha", fecha);
      const misDelDia = ((misRows ?? []) as Array<{ id: string; profesor_id: string; estado: string; hora_inicio: string; hora_fin: string | null }>).filter(sesionActiva);
      if (misDelDia.length >= 2) {
        toast.error("Máximo 2 reservas activas por día.");
        return;
      }
      if (misDelDia.some((s) => horarios1a1SeSolapan(s.hora_inicio, hora))) {
        toast.error("Ya tienes otra sesión 1 a 1 en ese horario. Elige otra hora.");
        return;
      }
      if (misDelDia.some((s) => s.profesor_id === profesorId)) {
        toast.error("Ya tienes una reserva activa con este profesor ese día.");
        return;
      }

      const { data: existeRows } = await supabase
        .from("sesiones_1a1")
        .select("id,estado")
        .eq("profesor_id", profesorId)
        .eq("fecha", fecha)
        .eq("hora_inicio", `${hora}:00`);
      if (((existeRows ?? []) as Array<{ id: string; estado: string }>).some(sesionActiva)) {
        toast.error("Ese horario acaba de ser reservado.");
        return;
      }

      const profActual = profesores.find((p) => p.id === profesorId);
      const nombreProf = formatNombre(profActual?.nombre_completo) || profActual?.email || "Profesor";
      const tema = profActual ? temaDe(profActual) : "Mentoría 1 a 1";
      const zoom = await createZoom({
        data: {
          topic: `${nombreProf} – ${tema}`,
          start_time: `${fecha}T${hora}:00`,
          duration: ZOOM_DURACION_MIN,
          agenda: `Sesión 1 a 1 con ${nombreProf}\nTema: ${tema}`,
        },
      });
      const { data, error } = await supabase
        .from("sesiones_1a1")
        .insert({
          profesor_id: profesorId,
          alumna_id: uid,
          fecha,
          hora_inicio: `${hora}:00`,
          hora_fin: null,
          zoom_meeting_id: zoom.meeting_id,
          zoom_link: zoom.join_url,
          estado: "confirmada",
          motivo: motivoLimpio,
        })
        .select()
        .single();
      if (error) throw error;
      setSesiones((s) => [...s, data as Sesion]);
      setBooking(null);
      setMotivo("");
      toast.success("Sesión agendada. Revisa tu Zoom en la celda.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resolverCancelacion = async (id: string) => {
    setSesiones((arr) => arr.filter((s) => s.id !== id));
    setProximas((arr) => arr.filter((s) => s.id !== id));
    await recargarPendientes();
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div aria-hidden className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Sesiones privadas</div>
            <h1 className="text-3xl font-bold mt-1">Agenda 1 a 1</h1>
            <p className="text-sm opacity-90 mt-1">Lunes a viernes · disponibilidad 15:00–19:00 · máximo 60 min por sesión · máximo 2 sesiones por día · Zoom automático.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronLeft className="w-4 h-4" /></button>
            <div className="text-sm font-semibold px-2">{weekStart.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} – {new Date(weekStart.getTime() + 4 * 86400000).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}</div>
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {profesores.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-60 mb-3 px-1">Elige tu mentor</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {profesores.map((p) => {
              const r = ratings[p.id];
              const active = p.id === profesorId;
              return (
                <button key={p.id} onClick={() => { setProfesorId(p.id); setBooking(null); setMotivo(""); }} className="text-left rounded-2xl p-3 border transition-all" style={active ? { background: "linear-gradient(135deg, oklch(0.65 0.18 285), oklch(0.56 0.20 285))", color: "white", borderColor: "transparent", boxShadow: "0 8px 24px rgba(124,107,255,.35)" } : { background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-full grid place-items-center text-sm font-bold" style={active ? { background: "rgba(255,255,255,.22)", color: "white" } : { background: "linear-gradient(135deg,var(--violet),var(--violet-2))", color: "white" }}>
                      {(formatNombre(p.nombre_completo) || p.email || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0"><div className="text-sm font-semibold truncate" style={active ? { color: "white" } : undefined}>{formatNombre(p.nombre_completo) || p.email || "Mentor"}</div></div>
                  </div>
                  <div className="text-[11px] leading-tight mb-2" style={active ? { color: "rgba(255,255,255,.92)" } : { color: "var(--muted-foreground)" }}>{temaDe(p)}</div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => <Star key={i} className="w-3 h-3" fill={r && r.avg >= i - 0.5 ? (active ? "#FCD34D" : "#FBBF24") : "transparent"} stroke={active ? "rgba(255,255,255,.6)" : "#D4D4D8"} strokeWidth={1.5} />)}
                    <span className="text-[10px] ml-1 opacity-80">{r ? `${r.avg.toFixed(1)} (${r.count})` : "Sin reseñas"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {profesorActual && (
        <div className="mb-4 px-1 text-sm text-muted-foreground">
          Mostrando agenda de <span className="font-semibold text-foreground">{formatNombre(profesorActual.nombre_completo) || profesorActual.email}</span> · {temaDe(profesorActual)}
          {ratingActual && <> · <Star className="inline w-3 h-3 -mt-0.5" fill="#FBBF24" stroke="#FBBF24" /> {ratingActual.avg.toFixed(1)} ({ratingActual.count})</>}
        </div>
      )}

      {esAlumna && pendientesProfesorActual.length > 0 && (
        <SesionPendienteAlumnoPanel
          pendientes={pendientesProfesorActual}
          onReprogramada={async () => {
            await recargarPendientes();
            window.setTimeout(() => window.location.reload(), 150);
          }}
        />
      )}

      {!profesorId ? (
        <div className="p-8 text-center text-muted-foreground border rounded-2xl">Aún no hay mentores configurados.</div>
      ) : (
        <div className="overflow-auto rounded-3xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 backdrop-blur">
                <th className="px-3 py-3 text-left w-24 text-[11px] uppercase tracking-wider opacity-70">Hora</th>
                {dias.map((d, i) => {
                  const disabled = !disponibilidad[i];
                  const fecha = fmt(d);
                  return (
                    <th key={i} className="px-3 py-3 text-left" style={fecha < hoyEcuador || disabled ? { opacity: 0.45 } : undefined}>
                      <div className="text-[11px] uppercase tracking-wider opacity-70">{DIAS[i]}</div>
                      <div className="text-base font-semibold">{d.getDate()}/{d.getMonth() + 1}</div>
                      {disabled && fecha >= hoyEcuador && <div className="text-[10px]">No disponible</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HORAS.map((h) => (
                <tr key={h} className="border-t">
                  <td className="px-3 py-3 font-mono text-xs font-semibold opacity-80">{h}</td>
                  {dias.map((d, i) => {
                    const fecha = fmt(d);
                    const ses = miSesion(fecha, h);
                    const taken = ocupado(fecha, h);
                    const diaPasado = fecha < hoyEcuador;
                    const horaPasada = slotPasado(fecha, h);
                    const noDisponible = !disponibilidad[i];
                    const sinAnticipacion = !diaPasado && !cumpleAnticipacion(fecha);
                    const misSesionesDia = esAlumna ? proximas.filter((s) => s.alumna_id === uid && s.fecha === fecha && sesionActiva(s)) : [];
                    const ocupadoPorMi = misSesionesDia.some((s) => horarios1a1SeSolapan(s.hora_inicio, h));
                    const limiteDiario = misSesionesDia.length >= 2;

                    if (ses) {
                      const termino = sesion1a1Terminada(ses.fecha, ses.hora_inicio, ses.hora_fin, now);
                      const finProgramado = horaFinProgramada1a1(ses.hora_inicio, ses.hora_fin);
                      return (
                        <td key={i} className="px-2 py-2">
                          <div className="rounded-xl bg-violet-gradient text-white p-2.5 text-xs shadow-md">
                            <div className="font-semibold flex items-center gap-1"><Video className="w-3 h-3" /><span className="truncate">{ses.profesor_id === uid ? (nombreDe(ses.alumna_id) || "Reservada") : "Reservada"}</span></div>
                            {ses.duracion_min ? <div className="opacity-90">Realizada · {ses.hora_inicio.slice(0, 5)} – {ses.hora_fin?.slice(0, 5)} · {Math.min(Number(ses.duracion_min), 60)} min</div> : termino ? <div className="opacity-90 font-semibold">Pendiente de registrar duración</div> : <div className="opacity-90 font-semibold">Reservado · {ses.hora_inicio.slice(0, 5)} – {finProgramado}</div>}
                            {ses.zoom_link && <a href={ses.zoom_link} target="_blank" rel="noreferrer" className="underline opacity-95">Entrar a Zoom →</a>}
                            {(ses.profesor_id === uid || role === "admin") && termino && <button onClick={() => setDuracionModal(ses)} className="block underline mt-0.5 opacity-90">{ses.duracion_min ? "Editar duración" : "Registrar duración"}</button>}
                            {(ses.profesor_id === uid || role === "admin") && !ses.duracion_min && <button onClick={() => setCancelarModal(ses)} className="block underline mt-0.5 opacity-90">No se realizará</button>}
                          </div>
                        </td>
                      );
                    }
                    if (taken) {
                      return <td key={i} className="px-2 py-2"><div className="w-full py-2.5 rounded-xl border border-dashed flex items-center justify-center gap-1 text-xs font-medium"><XIcon className="w-3.5 h-3.5" /> Ocupado</div></td>;
                    }
                    if (ocupadoPorMi) {
                      return <td key={i} className="px-2 py-2"><div className="w-full py-2.5 rounded-xl border border-dashed text-center text-[10.5px] font-semibold">Ya tienes sesión</div></td>;
                    }
                    if (limiteDiario) {
                      return <td key={i} className="px-2 py-2"><div className="w-full py-2.5 rounded-xl border border-dashed text-center text-[10.5px] font-semibold">Máximo 2 sesiones</div></td>;
                    }
                    if (diaPasado || horaPasada || noDisponible) {
                      return <td key={i} className="px-2 py-2"><div className="w-full py-2.5 rounded-xl text-xs font-medium text-center" style={{ color: "var(--muted-foreground)", opacity: 0.45, textDecoration: diaPasado || horaPasada ? "line-through" : undefined }}>No disponible</div></td>;
                    }
                    if (sinAnticipacion) {
                      return <td key={i} className="px-2 py-2"><div className="w-full py-2.5 rounded-xl text-[10.5px] font-medium text-center leading-tight px-1" style={{ color: "var(--muted-foreground)", background: "rgba(0,0,0,.03)", border: "1px dashed var(--border)" }}>Reserva con 1 día de<br />anticipación</div></td>;
                    }
                    if (bloqueadoProfesorActual) {
                      return <td key={i} className="px-2 py-2"><button onClick={() => toast.error("Tienes una sesión pendiente con este profesor. Resuélvela arriba o elige otro profesor.")} className="w-full py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300">Pendiente por resolver</button></td>;
                    }
                    return <td key={i} className="px-2 py-2"><button onClick={() => setBooking({ fecha, hora: h })} className="w-full py-2.5 rounded-xl border border-dashed text-xs font-semibold transition" style={{ borderColor: "color-mix(in oklab, var(--violet) 45%, transparent)", color: "var(--violet)" }}>+ Reservar</button></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {booking && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => { setBooking(null); setMotivo(""); }}>
          <div className="bg-card p-6 rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Confirmar reserva</h3>
            {profesorActual && <p className="text-xs text-muted-foreground mb-3">Con <span className="font-semibold text-foreground">{formatNombre(profesorActual.nombre_completo) || profesorActual.email}</span> · {temaDe(profesorActual)}</p>}
            <p className="text-sm text-muted-foreground mb-4">{new Date(`${booking.fecha}T00:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} a las {booking.hora}.<br />La duración real la registrará tu mentor al terminar, con un máximo de 60 minutos. Se creará una reunión de Zoom automáticamente.</p>
            <label className="block text-xs font-medium mb-1">¿Cuál es tu duda o inquietud? <span className="text-muted-foreground">(máx. 100 caracteres)</span></label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 100))} rows={3} maxLength={100} placeholder="Ej. Necesito ayuda con la estructura de mi landing page…" className="w-full px-3 py-2 rounded-lg border bg-background text-sm mb-1" />
            <div className="text-[10px] text-muted-foreground text-right mb-3">{motivo.length}/100</div>
            <div className="flex gap-2 justify-end">
              <button disabled={saving} onClick={() => { setBooking(null); setMotivo(""); }} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button disabled={saving} onClick={reservar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-60">{saving ? "Reservando…" : "Reservar"}</button>
            </div>
          </div>
        </div>
      )}

      {proximas.length > 0 && (
        <div className="mt-8">
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-60 mb-3 px-1">{isStaff ? "Sesiones de soporte" : "Tus próximas sesiones"}</div>
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Fecha</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Hora</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Estado / duración</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">{isStaff ? "Alumna / Profesor" : "Mentor"}</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Acción</th>
                </tr>
              </thead>
              <tbody>
                {proximas.map((s) => {
                  const esMia = s.alumna_id === uid;
                  const otroId = esMia ? s.profesor_id : s.alumna_id;
                  const otroNombre = nombreDe(otroId);
                  const profesorNombre = nombreDe(s.profesor_id);
                  const fechaTxt = new Date(`${s.fecha}T00:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
                  const termino = sesion1a1Terminada(s.fecha, s.hora_inicio, s.hora_fin, now);
                  const finProgramado = horaFinProgramada1a1(s.hora_inicio, s.hora_fin);
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2 capitalize">{fechaTxt}</td>
                      <td className="px-3 py-2 font-mono">{s.hora_inicio.slice(0, 5)}</td>
                      <td className="px-3 py-2 text-xs">{s.duracion_min ? `Realizada · ${Math.min(Number(s.duracion_min), 60)} min` : termino ? <span className="font-semibold">Pendiente de registrar duración</span> : <span className="font-semibold">Reservado · {s.hora_inicio.slice(0, 5)}–{finProgramado}</span>}</td>
                      <td className="px-3 py-2">{isStaff ? <><div>{otroNombre || "Alumna"}</div><div className="text-[11px] opacity-60">Profesor: {profesorNombre || "—"}</div></> : otroNombre || (esMia ? "Mentor" : "Alumna")}</td>
                      <td className="px-3 py-2 text-right">
                        {(s.profesor_id === uid || role === "admin") && termino && <button onClick={() => setDuracionModal(s)} className="inline-flex items-center gap-1 px-3 py-1.5 mr-2 rounded-lg text-xs font-semibold border"><Clock className="w-3.5 h-3.5" />{s.duracion_min ? "Editar duración" : "Registrar duración"}</button>}
                        {(s.profesor_id === uid || role === "admin") && !s.duracion_min && <button onClick={() => setCancelarModal(s)} className="inline-flex items-center gap-1 px-3 py-1.5 mr-2 rounded-lg text-xs font-semibold border border-red-500/30 text-red-600"><Ban className="w-3.5 h-3.5" />No se realizará</button>}
                        {s.zoom_link ? <a href={s.zoom_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-gradient text-white"><Video className="w-3.5 h-3.5" /> Entrar a Zoom</a> : <span className="opacity-50 text-xs">sin link</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {duracionModal && (
        <RegistrarDuracionModal
          sesionId={duracionModal.id}
          horaInicio={duracionModal.hora_inicio}
          duracionInicial={duracionModal.duracion_min ?? null}
          onClose={() => setDuracionModal(null)}
          onSaved={(min, fin, ini) => {
            const upd = (arr: Sesion[]) => arr.map((x) => x.id === duracionModal.id ? { ...x, duracion_min: min, hora_inicio: `${ini}:00`, hora_fin: `${fin}:00`, estado: "finalizada" } : x);
            setSesiones(upd);
            setProximas(upd);
            void recargarPendientes();
          }}
        />
      )}

      {cancelarModal && (
        <CancelarSesion1a1ProfesorModal
          sesion={cancelarModal as SesionCancelableProfesor}
          alumnaNombre={nombreDe(cancelarModal.alumna_id)}
          onClose={() => setCancelarModal(null)}
          onResolved={() => resolverCancelacion(cancelarModal.id)}
        />
      )}
    </div>
  );
}