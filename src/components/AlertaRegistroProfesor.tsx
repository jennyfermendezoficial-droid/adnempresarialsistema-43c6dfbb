import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, BadgeDollarSign, Clock3, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

interface ClasePendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  titulo: string | null;
  duracion_min: number | null;
}

interface SesionPendiente {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  estado: string | null;
  duracion_min: number | null;
}

interface Pendiente {
  tipo: "clase" | "1a1";
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string | null;
  contexto: string;
}

interface NotificacionDescuento {
  id: string;
  titulo: string;
  cuerpo: string;
}

function fechaLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function horaLocal(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function yaTermino(fecha: string, horaFin: string | null, horaInicio: string) {
  const hoy = fechaLocal();
  if (fecha < hoy) return true;
  if (fecha > hoy) return false;
  const limite = (horaFin || horaInicio || "23:59").slice(0, 5);
  return limite <= horaLocal();
}

function fechaEC(fecha: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

function hora(v: string | null) {
  return v ? v.slice(0, 5) : "—";
}

/**
 * Este componente se ocupa únicamente de horas pendientes y descuentos.
 * Los datos personales/bancarios se gestionan exclusivamente en FichaProfesorModal.
 */
export function AlertaRegistroProfesor() {
  const { session, role, roles } = useAuth();
  const uid = session?.user.id;
  const isProfesor = roles.includes("soporte") || role === "soporte";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [descuento, setDescuento] = useState<NotificacionDescuento | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    if (!uid || !isProfesor) {
      setPendientes([]);
      setDescuento(null);
      setLoading(false);
      return;
    }

    const hoy = fechaLocal();
    const [clasesRes, sesionesRes, descuentoRes] = await Promise.all([
      supabase
        .from("clases_en_vivo")
        .select("id,fecha,hora_inicio,hora_fin,titulo,duracion_min")
        .eq("profesor_id", uid)
        .lte("fecha", hoy)
        .order("fecha", { ascending: true }),
      supabase
        .from("sesiones_1a1")
        .select("id,fecha,hora_inicio,hora_fin,estado,duracion_min")
        .eq("profesor_id", uid)
        .lte("fecha", hoy)
        .order("fecha", { ascending: true }),
      supabase
        .from("notificaciones")
        .select("id,titulo,cuerpo")
        .eq("usuario_id", uid)
        .eq("leida", false)
        .eq("tipo", "descuento_horas")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const clases = ((clasesRes.data ?? []) as ClasePendiente[])
      .filter((c) => Number(c.duracion_min ?? 0) <= 0 && yaTermino(c.fecha, c.hora_fin, c.hora_inicio))
      .map<Pendiente>((c) => ({
        tipo: "clase",
        id: c.id,
        fecha: c.fecha,
        horaInicio: c.hora_inicio,
        horaFin: c.hora_fin,
        contexto: c.titulo?.trim() || "Clase en vivo",
      }));

    const sesiones = ((sesionesRes.data ?? []) as SesionPendiente[])
      .filter((s) => {
        const estado = (s.estado || "confirmada").toLowerCase();
        return Number(s.duracion_min ?? 0) <= 0
          && !["cancelada", "cancelado", "anulada"].includes(estado)
          && yaTermino(s.fecha, s.hora_fin, s.hora_inicio);
      })
      .map<Pendiente>((s) => ({
        tipo: "1a1",
        id: s.id,
        fecha: s.fecha,
        horaInicio: s.hora_inicio,
        horaFin: s.hora_fin,
        contexto: "Sesión 1 a 1",
      }));

    setPendientes([...clases, ...sesiones].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio)));
    setDescuento((descuentoRes.data as NotificacionDescuento | null) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void cargar();
    if (!uid || !isProfesor) return;

    const refrescar = () => void cargar();
    const timer = window.setInterval(refrescar, 30_000);
    window.addEventListener("focus", refrescar);
    window.addEventListener("adn:horas-actualizadas", refrescar);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refrescar);
      window.removeEventListener("adn:horas-actualizadas", refrescar);
    };
    // Se vuelve a comprobar también al cambiar de pantalla.
  }, [uid, isProfesor, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const cerrarDescuento = async () => {
    if (!descuento || !uid) return;
    await supabase
      .from("notificaciones")
      .update({ leida: true })
      .eq("id", descuento.id)
      .eq("usuario_id", uid);
    setDescuento(null);
  };

  if (!isProfesor || !uid || loading) return null;

  if (pendientes.length > 0) {
    const enPantallaRegistro = pathname.startsWith("/mis-clases-asignadas");

    if (enPantallaRegistro) {
      return (
        <div className="fixed right-4 bottom-4 z-[105] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-amber-500/40 bg-card shadow-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Registro de horas obligatorio</div>
              <div className="text-xs text-muted-foreground mt-1">
                Te {pendientes.length === 1 ? "queda" : "quedan"} {pendientes.length} {pendientes.length === 1 ? "registro" : "registros"} sin duración.
              </div>
              <div className="mt-2 text-xs font-medium">
                {pendientes[0].tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1"} · {fechaEC(pendientes[0].fecha)} · {hora(pendientes[0].horaInicio)}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm grid place-items-center p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden">
          <div className="p-5 text-white" style={{ background: "linear-gradient(135deg,#78350f,#d97706)" }}>
            <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center mb-3"><Clock3 className="w-6 h-6" /></div>
            <div className="text-xs uppercase tracking-wider opacity-80">Obligación del Profesor</div>
            <h2 className="text-xl font-bold mt-1">Tienes horas pendientes de registrar</h2>
            <p className="text-sm opacity-90 mt-1">Debes completar la duración real de tus clases y sesiones terminadas.</p>
          </div>

          <div className="p-5">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendientes.slice(0, 6).map((p) => (
                <div key={`${p.tipo}:${p.id}`} className="rounded-xl border p-3">
                  <div className="font-semibold text-sm">{p.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1"} · {p.contexto}</div>
                  <div className="text-xs text-muted-foreground mt-1">{fechaEC(p.fecha)} · {hora(p.horaInicio)}{p.horaFin ? ` – ${hora(p.horaFin)}` : ""} · duración sin registrar</div>
                </div>
              ))}
              {pendientes.length > 6 && <div className="text-xs text-center text-muted-foreground">+ {pendientes.length - 6} pendientes adicionales</div>}
            </div>

            <button onClick={() => navigate({ to: "/mis-clases-asignadas" })} className="mt-4 w-full px-4 py-3 rounded-xl bg-violet-gradient text-white text-sm font-semibold">
              Registrar horas ahora
            </button>
            <p className="text-[11px] text-center text-muted-foreground mt-2">Este aviso seguirá apareciendo mientras exista al menos una clase o sesión terminada sin duración.</p>
          </div>
        </div>
      </div>
    );
  }

  if (descuento) {
    return (
      <div className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden">
          <div className="p-5 text-white relative" style={{ background: "linear-gradient(135deg,#7f1d1d,#b91c1c)" }}>
            <button onClick={() => void cerrarDescuento()} className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20" aria-label="Cerrar alerta">
              <X className="w-4 h-4" />
            </button>
            <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center mb-3"><BadgeDollarSign className="w-6 h-6" /></div>
            <div className="text-xs uppercase tracking-wider opacity-80">Aviso de Pagos e informes</div>
            <h2 className="text-xl font-bold mt-1">{descuento.titulo}</h2>
          </div>
          <div className="p-5">
            <div className="rounded-xl border p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{descuento.cuerpo}</p>
            </div>
            <button onClick={() => void cerrarDescuento()} className="mt-4 w-full px-4 py-2.5 rounded-xl bg-violet-gradient text-white text-sm font-semibold">Entendido</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
