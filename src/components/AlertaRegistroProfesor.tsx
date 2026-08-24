import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle, BadgeDollarSign, Clock3, ImagePlus,
  Landmark, Loader2, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { subirImagenBancoProfesor } from "@/lib/bank-images";

interface DatosPago {
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular_cuenta: string;
  banco_logo_url: string | null;
}

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

const VACIO: DatosPago = {
  banco: "",
  tipo_cuenta: "ahorros",
  numero_cuenta: "",
  titular_cuenta: "",
  banco_logo_url: null,
};

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

function completa(d: DatosPago) {
  return Boolean(
    d.banco.trim()
    && d.tipo_cuenta.trim()
    && d.numero_cuenta.trim()
    && d.titular_cuenta.trim()
    && d.banco_logo_url,
  );
}

function fechaEC(fecha: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

function hora(v: string | null) {
  return v ? v.slice(0, 5) : "—";
}

export function AlertaRegistroProfesor() {
  const { session, role, roles, profile } = useAuth();
  const uid = session?.user.id;
  const isProfesor = roles.includes("soporte") || role === "soporte";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [datos, setDatos] = useState<DatosPago>(VACIO);
  const [datosCompletos, setDatosCompletos] = useState(true);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [descuento, setDescuento] = useState<NotificacionDescuento | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [forzarEdicionDatos, setForzarEdicionDatos] = useState(false);

  const cargar = async () => {
    if (!uid || !isProfesor) {
      setDatos(VACIO);
      setDatosCompletos(true);
      setPendientes([]);
      setDescuento(null);
      setLoading(false);
      return;
    }

    const hoy = fechaLocal();
    const [perfilRes, clasesRes, sesionesRes, descuentoRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("banco,tipo_cuenta,numero_cuenta,titular_cuenta,banco_logo_url")
        .eq("id", uid)
        .maybeSingle(),
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

    if (perfilRes.error) {
      setDatos({ ...VACIO, titular_cuenta: profile?.nombre_completo ?? "" });
      setDatosCompletos(false);
      toast.error(`Datos de pago: ${perfilRes.error.message}`);
    } else {
      const raw = perfilRes.data as Partial<DatosPago> | null;
      const siguiente: DatosPago = {
        banco: raw?.banco ?? "",
        tipo_cuenta: raw?.tipo_cuenta ?? "ahorros",
        numero_cuenta: raw?.numero_cuenta ?? "",
        titular_cuenta: raw?.titular_cuenta ?? profile?.nombre_completo ?? "",
        banco_logo_url: raw?.banco_logo_url ?? null,
      };
      setDatos(siguiente);
      setDatosCompletos(completa(siguiente));
    }

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

  // Al entrar a la plataforma, toda cuenta que tenga el rol soporte ve sus datos de pago.
  // Si ya están completos puede cerrar el formulario; si faltan datos queda obligatorio.
  useEffect(() => {
    if (uid && isProfesor) setForzarEdicionDatos(true);
  }, [uid, isProfesor]);

  useEffect(() => {
    setLoading(true);
    void cargar();
    if (!uid || !isProfesor) return;

    const refrescar = () => void cargar();
    const abrirDatos = () => setForzarEdicionDatos(true);
    const timer = window.setInterval(refrescar, 30_000);
    window.addEventListener("focus", refrescar);
    window.addEventListener("adn:horas-actualizadas", refrescar);
    window.addEventListener("adn:datos-pago-actualizados", refrescar);
    window.addEventListener("adn:abrir-datos-pago", abrirDatos);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refrescar);
      window.removeEventListener("adn:horas-actualizadas", refrescar);
      window.removeEventListener("adn:datos-pago-actualizados", refrescar);
      window.removeEventListener("adn:abrir-datos-pago", abrirDatos);
    };
    // Se vuelve a comprobar también al cambiar de pantalla.
  }, [uid, isProfesor, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const faltantes = useMemo(() => {
    const f: string[] = [];
    if (!datos.banco.trim()) f.push("banco o cooperativa");
    if (!datos.tipo_cuenta.trim()) f.push("tipo de cuenta");
    if (!datos.numero_cuenta.trim()) f.push("número de cuenta");
    if (!datos.titular_cuenta.trim()) f.push("titular");
    if (!datos.banco_logo_url) f.push("imagen o logo del banco");
    return f;
  }, [datos]);

  if (!isProfesor || !uid || loading) return null;

  const subirImagen = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await subirImagenBancoProfesor(file, uid);
      setDatos((d) => ({ ...d, banco_logo_url: url }));
      toast.success("Imagen bancaria cargada. Ahora guarda los datos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la imagen bancaria");
    } finally {
      setUploading(false);
    }
  };

  const guardarDatos = async () => {
    const banco = datos.banco.trim();
    const numero = datos.numero_cuenta.trim();
    const titular = datos.titular_cuenta.trim();

    if (banco.length < 2) return toast.error("Escribe el banco o cooperativa.");
    if (!datos.tipo_cuenta.trim()) return toast.error("Selecciona el tipo de cuenta.");
    if (numero.length < 5) return toast.error("Escribe un número de cuenta válido.");
    if (titular.length < 3) return toast.error("Escribe el titular de la cuenta.");
    if (!datos.banco_logo_url) return toast.error("La imagen o logo del banco es obligatorio.");

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        banco,
        tipo_cuenta: datos.tipo_cuenta,
        numero_cuenta: numero,
        titular_cuenta: titular,
        banco_logo_url: datos.banco_logo_url,
      })
      .eq("id", uid);
    setSaving(false);

    if (error) return toast.error(error.message);
    setDatosCompletos(true);
    setForzarEdicionDatos(false);
    window.dispatchEvent(new Event("adn:datos-pago-actualizados"));
    toast.success("Datos de pago completos y guardados.");
    await cargar();
  };

  const cerrarDescuento = async () => {
    if (!descuento) return;
    await supabase
      .from("notificaciones")
      .update({ leida: true })
      .eq("id", descuento.id)
      .eq("usuario_id", uid);
    setDescuento(null);
  };

  const mostrarFormulario = !datosCompletos || forzarEdicionDatos;

  if (mostrarFormulario) {
    return (
      <div className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
        <div className="w-full max-w-xl rounded-2xl border bg-card shadow-2xl overflow-hidden my-4">
          <div className="p-5 text-white relative" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
            {forzarEdicionDatos && datosCompletos && (
              <button onClick={() => setForzarEdicionDatos(false)} className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center mb-3"><Landmark className="w-6 h-6" /></div>
            <div className="text-xs uppercase tracking-wider opacity-80">Registro del Profesor</div>
            <h2 className="text-xl font-bold mt-1">Datos para recibir tus pagos</h2>
            <p className="text-sm opacity-90 mt-1">
              Revisa tu cuenta de pago. Si falta algún dato, debes completarlo al 100% para continuar usando la plataforma.
            </p>
          </div>

          <div className="p-5 space-y-4">
            {!datosCompletos && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                Falta: <strong className="text-foreground">{faltantes.join(", ") || "completar los datos"}</strong>. Este aviso seguirá apareciendo hasta guardar todo.
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Imagen o logo del banco *</div>
              <div className="flex items-center gap-4 rounded-xl border p-4 bg-muted/20">
                {datos.banco_logo_url ? (
                  <img src={datos.banco_logo_url} alt="Banco o cooperativa" className="w-16 h-16 rounded-xl object-cover border bg-background shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed grid place-items-center text-muted-foreground bg-background shrink-0">
                    <Landmark className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-background cursor-pointer text-sm font-semibold hover:bg-muted">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {uploading ? "Subiendo…" : datos.banco_logo_url ? "Cambiar imagen" : "Subir imagen"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(e) => void subirImagen(e.target.files?.[0])} />
                  </label>
                  <div className="text-[11px] text-muted-foreground mt-1">JPG, PNG o WEBP · máximo 5 MB.</div>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Banco o cooperativa *</label>
                <input value={datos.banco} onChange={(e) => setDatos((d) => ({ ...d, banco: e.target.value }))} placeholder="Ej. Banco Pichincha" className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo de cuenta *</label>
                <select value={datos.tipo_cuenta} onChange={(e) => setDatos((d) => ({ ...d, tipo_cuenta: e.target.value }))} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background">
                  <option value="ahorros">Ahorros</option>
                  <option value="corriente">Corriente</option>
                  <option value="cooperativa">Cooperativa</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Número de cuenta *</label>
                <input value={datos.numero_cuenta} onChange={(e) => setDatos((d) => ({ ...d, numero_cuenta: e.target.value }))} placeholder="Número de cuenta" className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Titular de la cuenta *</label>
                <input value={datos.titular_cuenta} onChange={(e) => setDatos((d) => ({ ...d, titular_cuenta: e.target.value }))} placeholder="Nombres y apellidos del titular" className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background" />
              </div>
            </div>

            <button onClick={() => void guardarDatos()} disabled={saving || uploading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-gradient text-white font-semibold disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Guardando…" : "Guardar datos de pago"}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                Te {pendientes.length === 1 ? "queda" : "quedan"} {pendientes.length} {pendientes.length === 1 ? "registro" : "registros"} sin duración. El aviso desaparecerá cuando estén completos.
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
