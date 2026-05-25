import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createZoomMeeting } from "@/lib/zoom.functions";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda-1a1")({ component: Page });

interface Sesion { id: string; fecha: string; hora_inicio: string; hora_fin: string; profesor_id: string; alumna_id: string; zoom_link: string | null; estado: string }
interface Profile { id: string; nombre_completo: string; email: string }

// Una reserva por hora (30 min cada una). 09:00, 10:00, 11:00, ...
const HORAS = ["09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00"];
const DIAS = ["Lun","Mar","Mié","Jue","Vie"];

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

  useEffect(() => {
    // profesores = admins
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const ids = (roles ?? []).map((r: { user_id: string }) => r.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", ids);
      const list = (profs ?? []) as Profile[];
      setProfesores(list);
      if (list.length && !profesorId) setProfesorId(list[0].id);
    })();
  }, []); // eslint-disable-line

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

  const reservar = async () => {
    if (!booking || !uid || !profesorId) return;
    const { fecha, hora } = booking;
    const [h] = hora.split(":").map(Number);
    const fin = `${String(h).padStart(2, "0")}:30`;
    const start_time = `${fecha}T${hora}:00`;
    try {
      const zoom = await createZoom({ data: { topic: `Sesión 1a1`, start_time, duration: 30 } });
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
    }
  };

  const cancelar = async (id: string) => {
    if (!confirm("¿Cancelar esta sesión?")) return;
    const { error } = await supabase.from("sesiones_1a1").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setSesiones((s) => s.filter((x) => x.id !== id));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div aria-hidden className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Sesiones privadas</div>
            <h1 className="text-3xl font-bold mt-1">Agenda 1 a 1</h1>
            <p className="text-sm opacity-90 mt-1">Lunes a viernes · Una reserva por hora · 30 min con Zoom automático.</p>
          </div>
        <div className="flex items-center gap-2">
          {profesores.length > 1 && (
            <select value={profesorId ?? ""} onChange={(e) => setProfesorId(e.target.value)} className="px-3 py-2 rounded-lg bg-white/15 backdrop-blur text-white text-sm border border-white/20">
              {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo || p.email}</option>)}
            </select>
          )}
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronLeft className="w-4 h-4"/></button>
          <div className="text-sm font-semibold px-2">{weekStart.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} – {new Date(weekStart.getTime() + 4*86400000).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}</div>
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><ChevronRight className="w-4 h-4"/></button>
        </div>
        </div>
      </div>

      {!profesorId ? (
        <div className="p-8 text-center text-muted-foreground border rounded-2xl">Aún no hay administradores configurados.</div>
      ) : (
        <div className="overflow-auto rounded-3xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 backdrop-blur">
                <th className="px-3 py-3 text-left w-24 text-[11px] uppercase tracking-wider opacity-70">Hora</th>
                {dias.map((d, i) => (
                  <th key={i} className="px-3 py-3 text-left">
                    <div className="text-[11px] uppercase tracking-wider opacity-70">{DIAS[i]}</div>
                    <div className="text-base font-semibold">{d.getDate()}/{d.getMonth() + 1}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HORAS.map((h) => (
                <tr key={h} className="border-t">
                  <td className="px-3 py-3 font-mono text-xs font-semibold opacity-80">{h}<span className="opacity-50"> – {String(parseInt(h)).padStart(2,"0")}:30</span></td>
                  {dias.map((d, i) => {
                    const fecha = fmt(d);
                    const ses = miSesion(fecha, h);
                    const taken = ocupado(fecha, h);
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
                    return (
                      <td key={i} className="px-2 py-2">
                        <button
                          disabled={taken || d < new Date(new Date().setHours(0,0,0,0))}
                          onClick={() => setBooking({ fecha, hora: h })}
                          className="w-full py-2.5 rounded-xl border border-dashed border-violet/40 text-xs font-medium text-violet hover:bg-violet/10 hover:border-violet transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          {taken ? "Ocupado" : "+ Reservar"}
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
            <p className="text-sm text-muted-foreground mb-4">
              {new Date(booking.fecha).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })} a las {booking.hora} (30 min).
              <br />Se creará una reunión de Zoom automáticamente.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBooking(null)} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button onClick={reservar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white">Reservar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
