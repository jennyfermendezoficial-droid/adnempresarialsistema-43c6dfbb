import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, BadgeDollarSign, Clock3, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fechaHoyEcuador, sesion1a1Terminada } from "@/lib/sesion-1a1-tiempo";

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

function finEstimado(fecha: string, horaInicio: string, horaFin: string | null) {
  const inicio = new Date(`${fecha}T${horaInicio.slice(0, 5)}:00`);
  return horaFin
    ? new Date(`${fecha}T${horaFin.slice(0, 5)}:00`)
    : new Date(inicio.getTime() + 60 * 60_000);
}

function yaTermino(fecha: string, horaFin: string | null, horaInicio: string) {
  return finEstimado(fecha, horaInicio, horaFin).getTime() <= Date.now();
}

function fechaEC(fecha: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

function hora(v: string | null) {
  return v ? v.slice(0, 5) : "—";
}

function claveOculta(uid: string) {
  return `adn:alerta-horas-oculta:${uid}`;
}

function leerFirmaOculta(uid: string) {
  try { return localStorage.getItem(claveOculta(uid)) || ""; } catch { return ""; }
}

export function AlertaRegistroProfesor() {
  const { session, role, roles } = useAuth();
  const uid = session?.user.id;
  const isProfesor = roles.includes("soporte") || role === "soporte";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [descuento, setDescuento] = useState<NotificacionDescuento | null>(null);
  const [loading, setLoading] = useState(true);
  const [firmaOculta, setFirmaOculta] = useState("");

  const idsActuales = useMemo(
    () => pendientes
      .map((p) => `${p.tipo}:${p.id}`)
      .sort(),
    [pendientes],
  );
  const idsOcultos = useMemo(
    () => new Set(firmaOculta.split("|").filter(Boolean)),
    [firmaOculta],
  );
  const hayPendienteNueva = idsActuales.some((id) => !idsOcultos.has(id));

  const cargar = async () => {
    if (!uid || !isProfesor) {
      setPendientes([]);
      setDescuento(null);
      setLoading(false);
      return;
    }

    const hoy = fechaLocal();
    const hoyEcuador = fechaHoyEcuador();
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
        .lte("fecha", hoyEcuador)
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
          && !["cancelada", "cancelado", "anulada", "anulado", "finalizada", "no_realizada", "no realizado"].includes(estado)
          && sesion1a1Terminada(s.fecha, s.hora_inicio, s.hora_fin);
      })
      .map<Pendiente>((s) => ({
        tipo: "1a1",
        id: s.id,
        fecha: s.fecha,
        horaInicio: s.hora_inicio,
        horaFin: s.hora_fin,
        contexto: "Sesión 1 a 1",
      }));

    const todos = [...clases, ...sesiones].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
    setPendientes(todos);
    setDescuento((descuentoRes.data as NotificacionDescuento | null) ?? null);
    setLoading(false);

    // Guardar también el aviso en la campana, una sola vez por registro pendiente.
    for (const p of todos) {
      const { data: existente } = await supabase
        .from("notificaciones")
        .select("id")
        .eq("usuario_id", uid)
        .eq("tipo", "sesion_pendiente_registro")
        .eq("referencia_id", p.id)
        .limit(1);
      if ((existente?.length ?? 0) === 0) {
        await supabase.rpc("notificar", {
          _actor: uid,
          _cuerpo: `${p.tipo === "clase" ? "La clase" : "La sesión 1 a 1"} del ${p.fecha} a las ${hora(p.horaInicio)} terminó y todavía no tiene duración real registrada.`,
          _referencia: p.id,
          _tipo: "sesion_pendiente_registro",
          _titulo: "Tienes un registro pendiente",
          _url: "/mis-clases-asignadas",
          _usuarios: [uid],
        });
      }
    }
  };

  useEffect(() => {
    if (uid) setFirmaOculta(leerFirmaOculta(uid));
  }, [uid]);

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
  }, [uid, isProfesor, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!uid || loading) return;
    const actuales = new Set(idsActuales);
    const firmaVigente = firmaOculta
      .split("|")
      .filter(Boolean)
      .filter((id) => actuales.has(id))
      .sort()
      .join("|");
    if (firmaVigente === firmaOculta) return;
    try {
      if (firmaVigente) localStorage.setItem(claveOculta(uid), firmaVigente);
      else localStorage.removeItem(claveOculta(uid));
    } catch { /* noop */ }
    setFirmaOculta(firmaVigente);
  }, [uid, loading, idsActuales, firmaOculta]);

  const cerrarPendientes = () => {
    if (!uid || idsActuales.length === 0) return;
    const firmaActual = idsActuales.join("|");
    try { localStorage.setItem(claveOculta(uid), firmaActual); } catch { /* noop */ }
    setFirmaOculta(firmaActual);
  };

  const irAPendientes = () => {
    navigate({ to: "/mis-clases-asignadas" });
  };

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

  if (pathname.startsWith("/mis-clases-asignadas")) return null;

  if (pendientes.length > 0 && hayPendienteNueva) {
    return (
      <div className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm grid place-items-center p-4">
        <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden">
          <div className="p-5 text-white relative" style={{ background: "linear-gradient(135deg,#78350f,#d97706)" }}>
            <button
              type="button"
              onClick={cerrarPendientes}
              className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20"
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center mb-3"><Clock3 className="w-6 h-6" /></div>
            <div className="text-xs uppercase tracking-wider opacity-80">Registro pendiente</div>
            <h2 className="text-xl font-bold mt-1">Tienes clases o sesiones sin registrar</h2>
            <p className="text-sm opacity-90 mt-1 pr-8">Puedes cerrar este aviso y seguir trabajando. Volverá a aparecer únicamente si llega una pendiente nueva. En Mis clases asignadas seguirás viendo todas las pendientes hasta resolverlas.</p>
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

            <button onClick={irAPendientes} className="mt-4 w-full px-4 py-3 rounded-xl bg-violet-gradient text-white text-sm font-semibold">
              Ver pendientes en Mis clases asignadas
            </button>
            <p className="text-[11px] text-center text-muted-foreground mt-2">La X guarda las pendientes actuales como vistas. Solo una pendiente nueva volverá a mostrar este aviso.</p>
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
