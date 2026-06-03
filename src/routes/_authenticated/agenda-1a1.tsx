import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createZoomMeeting } from "@/lib/zoom.functions";
import { ChevronLeft, ChevronRight, Video, X as XIcon, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda-1a1")({ component: Page });

interface Sesion { id: string; fecha: string; hora_inicio: string; hora_fin: string; profesor_id: string; alumna_id: string; zoom_link: string | null; estado: string }
interface Profile { id: string; nombre_completo: string; email: string; avatar_url?: string | null; actividad?: string | null }

// Slots cada HORA PUNTUAL · sesiones de 30 minutos
const HORAS = ["09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00","19:00"];
const DURACION_MIN = 30;
const DIAS = ["Lun","Mar","Mié","Jue","Vie"];

// Descripciones por profesor (match por nombre / email)
const TEMAS: { match: string; tema: string }[] = [
  { match: "jennyfer", tema: "Marketing general" },
  { match: "jaime",    tema: "Landing pages, web y sistemas" },
  { match: "karen",    tema: "Ventas" },
  { match: "henry",    tema: "Meta Ads" },
  { match: "erick",    tema: "IA y generación de imágenes" },
];
function temaDe(p: Profile) {
  if (p.actividad && p.actividad.trim()) return p.actividad.trim();
  const k = (p.nombre_completo + " " + p.email).toLowerCase();
  return TEMAS.find((t) => k.includes(t.match))?.tema ?? "Mentoría general";
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day; // monday
  x.setDate(x.getDate() + diff); x.setHours(0,0,0,0);
  return x;
}

function fmt(d: Date) { return d.toISOString().slice(0,10); }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const createZoom = useServerFn(createZoomMeeting);

  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [profesores, setProfesores] = useState<Profile[]>([]);
  const [profesorId, setProfesorId] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [booking, setBooking] = useState<{ fecha: string; hora: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [now, setNow] = useState(new Date());
  // Mis próximas sesiones (alumna o profesor)
  const [proximas, setProximas] = useState<Sesion[]>([]);

  // tick para recalcular slots pasados
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    // profesores = admin + soporte
    (async () => {
      const { data: roles } = await supabase.from("user_roles")
        .select("user_id, role").in("role", ["admin", "soporte"]);
      const ids = Array.from(new Set(((roles ?? []) as { user_id: string }[]).map((r) => r.user_id)));
      if (!ids.length) return;
      const { data: profs } = await supabase.from("profiles")
        .select("id,nombre_completo,email,avatar_url,actividad").in("id", ids);
      const list = (profs ?? []) as Profile[];
      // Orden alfabético
      list.sort((a, b) => (a.nombre_completo || a.email).localeCompare(b.nombre_completo || b.email));
      setProfesores(list);
      if (list.length && !profesorId) setProfesorId(list[0].id);

      // Calificaciones promedio por profesor
      const { data: califs } = await supabase
        .from("calificaciones_mensuales")
        .select("profesor_id, claridad, didactica, practico, desenvolvimiento")
        .in("profesor_id", ids);
      const map: Record<string, { sum: number; n: number }> = {};
      ((califs ?? []) as { profesor_id: string; claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null }[]).forEach((c) => {
        const vals = [c.claridad, c.didactica, c.practico, c.desenvolvimiento].filter((v): v is number => typeof v === "number");
        if (!vals.length) return;
        const a = vals.reduce((s, v) => s + v, 0) / vals.length;
        map[c.profesor_id] = map[c.profesor_id] || { sum: 0, n: 0 };
        map[c.profesor_id].sum += a;
        map[c.profesor_id].n += 1;
      });
      const out: Record<string, { avg: number; count: number }> = {};
      Object.entries(map).forEach(([k, v]) => { out[k] = { avg: v.sum / v.n, count: v.n }; });
      setRatings(out);
    })();
  }, []); // eslint-disable-line

  // Cargar próximas sesiones del usuario (como alumna o como profesor)
  useEffect(() => {
    if (!uid) return;
    const hoy = fmt(new Date());
    (async () => {
      const { data } = await supabase
        .from("sesiones_1a1")
        .select("*")
        .or(`alumna_id.eq.${uid},profesor_id.eq.${uid}`)
        .gte("fecha", hoy)
        .order("fecha").order("hora_inicio");
      setProximas((data as Sesion[]) ?? []);
    })();
  }, [uid, sesiones]);

  useEffect(() => {
    if (!profesorId) return;
    const ini = fmt(weekStart);
    const fin = new Date(weekStart); fin.setDate(fin.getDate() + 4);
    supabase.from("sesiones_1a1")
      .select("*")
      .eq("profesor_id", profesorId)
      .gte("fecha", ini).lte("fecha", fmt(fin))
      .then(({ data }) => setSesiones((data as Sesion[]) ?? []));
  }, [profesorId, weekStart]);

  const dias = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);

  const ocupado = (fecha: string, hora: string) => sesiones.some((s) => s.fecha === fecha && s.hora_inicio.slice(0,5) === hora);
  const miSesion = (fecha: string, hora: string) => sesiones.find((s) => s.fecha === fecha && s.hora_inicio.slice(0,5) === hora && (s.alumna_id === uid || s.profesor_id === uid));

  const profesorActual = profesores.find((p) => p.id === profesorId);
  const ratingActual = profesorId ? ratings[profesorId] : undefined;
  const startToday = new Date(now); startToday.setHours(0,0,0,0);
  const startTomorrow = new Date(startToday); startTomorrow.setDate(startTomorrow.getDate() + 1);

  function slotPasado(fecha: string, hora: string) {
    const d = new Date(fecha + "T" + hora + ":00");
    return d.getTime() <= now.getTime();
  }

  // Reglas: solo se puede reservar con al menos 1 día de anticipación
  function requiereAnticipacion(fecha: string) {
    const d = new Date(fecha + "T00:00:00");
    return d.getTime() < startTomorrow.getTime();
  }

  const reservar = async () => {
    if (!booking || !uid || !profesorId || saving) return;
    if (requiereAnticipacion(booking.fecha)) {
      toast.error("Debes reservar con al menos 1 día de anticipación.");
      return;
    }
    setSaving(true);
    const { fecha, hora } = booking;

    try {
      // Límites: máx 3 reservas por día (con cualquier profesor), máx 1 por profesor/día
      const { data: misDelDia } = await supabase
        .from("sesiones_1a1").select("id, profesor_id")
        .eq("alumna_id", uid).eq("fecha", fecha);
      const total = misDelDia?.length ?? 0;
      if (total >= 3) { toast.error("Máximo 3 reservas por día."); setSaving(false); return; }
      if (misDelDia?.some((s) => s.profesor_id === profesorId)) {
        toast.error("Ya reservaste con este profesor hoy."); setSaving(false); return;
      }

      // Verificación final: que el slot no esté tomado por nadie más
      const { data: existe } = await supabase
        .from("sesiones_1a1").select("id")
        .eq("profesor_id", profesorId).eq("fecha", fecha).eq("hora_inicio", hora + ":00").limit(1);
      if (existe && existe.length) { toast.error("Ese horario acaba de ser reservado."); setSaving(false); return; }

      const [hh] = hora.split(":").map(Number);
      const totalMin = hh * 60 + DURACION_MIN;
      const fin = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
      const start_time = `${fecha}T${hora}:00`;
      const profActual = profesores.find((p) => p.id === profesorId);
      const nombreProf = profActual?.nombre_completo || profActual?.email || "Profesor";
      const tema = profActual ? temaDe(profActual) : "Mentoría 1 a 1";
      const topic = `${nombreProf} – ${tema}`;
      const agenda = `Sesión 1 a 1 con ${nombreProf}\nTema: ${tema}`;
      const zoom = await createZoom({ data: { topic, start_time, duration: DURACION_MIN, agenda } });
      const { data, error } = await supabase.from("sesiones_1a1").insert({
        profesor_id: profesorId, alumna_id: uid, fecha, hora_inicio: hora + ":00", hora_fin: fin + ":00",
        zoom_meeting_id: zoom.meeting_id, zoom_link: zoom.join_url, estado: "confirmada",
      }).select().single();
      if (error) throw error;
      setSesiones((s) => [...s, data as Sesion]);
      setBooking(null);
      toast.success("Sesión agendada. Revisa tu Zoom en la celda.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async (id: string) => {
    if (!confirm("¿Cancelar esta sesión?")) return;
    const { error } = await supabase.from("sesiones_1a1").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSesiones((s) => s.filter((x) => x.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div aria-hidden className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Sesiones privadas</div>
            <h1 className="text-3xl font-bold mt-1">Agenda 1 a 1</h1>
            <p className="text-sm opacity-90 mt-1">Lunes a viernes · 30 minutos por sesión · Zoom automático.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronLeft className="w-4 h-4"/></button>
            <div className="text-sm font-semibold px-2">{weekStart.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} – {new Date(weekStart.getTime() + 4*86400000).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}</div>
            <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      </div>

      {/* Selector de profesores con tarjetas */}
      {profesores.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-60 mb-3 px-1">Elige tu mentor</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {profesores.map((p) => {
              const r = ratings[p.id];
              const active = p.id === profesorId;
              return (
                <button
                  key={p.id}
                  onClick={() => setProfesorId(p.id)}
                  className="text-left rounded-2xl p-3 border transition-all"
                  style={
                    active
                      ? { background: "linear-gradient(135deg, oklch(0.65 0.18 285), oklch(0.56 0.20 285))", color: "white", borderColor: "transparent", boxShadow: "0 8px 24px rgba(124,107,255,.35)" }
                      : { background: "var(--card)", borderColor: "var(--border)" }
                  }
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-full grid place-items-center text-sm font-bold"
                      style={active
                        ? { background: "rgba(255,255,255,.22)", color: "white" }
                        : { background: "linear-gradient(135deg,var(--violet),var(--violet-2))", color: "white" }}>
                      {(p.nombre_completo || p.email).slice(0,1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={active ? { color: "white" } : undefined}>
                        {p.nombre_completo || p.email}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] leading-tight mb-2" style={active ? { color: "rgba(255,255,255,.92)" } : { color: "var(--muted-foreground)" }}>
                    {temaDe(p)}
                  </div>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((i) => (
                      <Star key={i} className="w-3 h-3" fill={r && r.avg >= i - 0.5 ? (active ? "#FCD34D" : "#FBBF24") : "transparent"} stroke={active ? "rgba(255,255,255,.6)" : "#D4D4D8"} strokeWidth={1.5} />
                    ))}
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
          Mostrando agenda de <span className="font-semibold text-foreground">{profesorActual.nombre_completo || profesorActual.email}</span> · {temaDe(profesorActual)}
          {ratingActual && <> · <Star className="inline w-3 h-3 -mt-0.5" fill="#FBBF24" stroke="#FBBF24" /> {ratingActual.avg.toFixed(1)} ({ratingActual.count})</>}
        </div>
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
                  const pasado = d < startToday;
                  return (
                    <th key={i} className="px-3 py-3 text-left" style={pasado ? { opacity: 0.45 } : undefined}>
                      <div className="text-[11px] uppercase tracking-wider opacity-70">{DIAS[i]}</div>
                      <div className="text-base font-semibold">{d.getDate()}/{d.getMonth() + 1}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HORAS.map((h) => (
                <tr key={h} className="border-t">
                  <td className="px-3 py-3 font-mono text-xs font-semibold opacity-80">
                    {h}<span className="opacity-50"> – {h.slice(0,2)}:30</span>
                  </td>
                  {dias.map((d, i) => {
                    const fecha = fmt(d);
                    const ses = miSesion(fecha, h);
                    const taken = ocupado(fecha, h);
                    const diaPasado = d < startToday;
                    const horaPasada = slotPasado(fecha, h);
                    const sinAnticipacion = !diaPasado && requiereAnticipacion(fecha);
                    if (ses) {
                      return (
                        <td key={i} className="px-2 py-2">
                          <div className="rounded-xl bg-violet-gradient text-white p-2.5 text-xs shadow-md">
                            <div className="font-semibold flex items-center gap-1"><Video className="w-3 h-3"/> Reservada</div>
                            {ses.zoom_link && <a href={ses.zoom_link} target="_blank" rel="noreferrer" className="underline opacity-95">Entrar a Zoom →</a>}
                            {(ses.alumna_id === uid || role === "admin") && (
                              <button onClick={() => cancelar(ses.id)} className="block underline mt-0.5 opacity-80">Cancelar</button>
                            )}
                          </div>
                        </td>
                      );
                    }
                    if (taken) {
                      // Reservada por otro: no disponible, marcar con X
                      return (
                        <td key={i} className="px-2 py-2">
                          <div className="w-full py-2.5 rounded-xl border border-dashed flex items-center justify-center gap-1 text-xs font-medium"
                            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)", background: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,.04) 6px, rgba(0,0,0,.04) 8px)" }}>
                            <XIcon className="w-3.5 h-3.5" /> Ocupado
                          </div>
                        </td>
                      );
                    }
                    if (diaPasado || horaPasada) {
                      // Horarios pasados: tachados
                      return (
                        <td key={i} className="px-2 py-2">
                          <div className="w-full py-2.5 rounded-xl text-xs font-medium text-center"
                            style={{ color: "var(--muted-foreground)", opacity: 0.45, textDecoration: "line-through" }}>
                            No disponible
                          </div>
                        </td>
                      );
                    }
                    if (sinAnticipacion) {
                      return (
                        <td key={i} className="px-2 py-2">
                          <div className="w-full py-2.5 rounded-xl text-[10.5px] font-medium text-center leading-tight px-1"
                            style={{ color: "var(--muted-foreground)", background: "rgba(0,0,0,.03)", border: "1px dashed var(--border)" }}>
                            Reserva con 1 día de<br/>anticipación
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={i} className="px-2 py-2">
                        <button
                          onClick={() => setBooking({ fecha, hora: h })}
                          className="w-full py-2.5 rounded-xl border border-dashed text-xs font-semibold transition"
                          style={{ borderColor: "color-mix(in oklab, var(--violet) 45%, transparent)", color: "var(--violet)" }}
                        >
                          + Reservar
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {booking && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setBooking(null)}>
          <div className="bg-card p-6 rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Confirmar reserva</h3>
            {profesorActual && (
              <p className="text-xs text-muted-foreground mb-3">
                Con <span className="font-semibold text-foreground">{profesorActual.nombre_completo || profesorActual.email}</span> · {temaDe(profesorActual)}
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-4">
              {new Date(booking.fecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} a las {booking.hora} (30 minutos).
              <br />Se creará una reunión de Zoom automáticamente.
            </p>
            <div className="flex gap-2 justify-end">
              <button disabled={saving} onClick={() => setBooking(null)} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button disabled={saving} onClick={reservar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-60">
                {saving ? "Reservando…" : "Reservar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {proximas.length > 0 && (
        <div className="mt-8">
          <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-60 mb-3 px-1">Tus próximas sesiones</div>
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Fecha</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Hora</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">{role === "admin" || role === "soporte" ? "Alumna / Mentor" : "Mentor"}</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider opacity-70">Acción</th>
                </tr>
              </thead>
              <tbody>
                {proximas.map((s) => {
                  const esMia = s.alumna_id === uid;
                  const otroId = esMia ? s.profesor_id : s.alumna_id;
                  const otro = profesores.find((p) => p.id === otroId);
                  const fechaTxt = new Date(s.fecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2 capitalize">{fechaTxt}</td>
                      <td className="px-3 py-2 font-mono">{s.hora_inicio.slice(0,5)}</td>
                      <td className="px-3 py-2">{otro?.nombre_completo || otro?.email || (esMia ? "Mentor" : "Alumna")}</td>
                      <td className="px-3 py-2 text-right">
                        {s.zoom_link ? (
                          <a href={s.zoom_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-gradient text-white">
                            <Video className="w-3.5 h-3.5" /> Entrar a Zoom
                          </a>
                        ) : <span className="opacity-50 text-xs">sin link</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
