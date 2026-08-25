import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { subirImagen } from "@/lib/cloudinary";
import { subirImagenBancoProfesor } from "@/lib/bank-images";
import { debeMostrarAccesoFicha } from "@/lib/ficha-profesor";
import { toast } from "sonner";
import { ImagePlus, Landmark, Loader2, X } from "lucide-react";

interface Ficha {
  nombre_completo: string;
  cedula: string;
  fecha_nacimiento: string;
  whatsapp: string;
  direccion: string;
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular_cuenta: string;
  banco_logo_url: string | null;
  observacion_ficha: string;
}

const VACIA: Ficha = {
  nombre_completo: "",
  cedula: "",
  fecha_nacimiento: "",
  whatsapp: "",
  direccion: "",
  banco: "",
  tipo_cuenta: "ahorros",
  numero_cuenta: "",
  titular_cuenta: "",
  banco_logo_url: null,
  observacion_ficha: "",
};

const POSPONER_MS = 10 * 60 * 1000;

function fichaCompleta(f: Ficha) {
  return Boolean(
    f.nombre_completo.trim().length >= 3
    && f.cedula.trim().length >= 5
    && f.fecha_nacimiento
    && f.whatsapp.trim().length >= 7
    && f.direccion.trim().length >= 4
    && f.banco.trim().length >= 2
    && f.tipo_cuenta
    && f.numero_cuenta.trim().length >= 5
    && f.titular_cuenta.trim().length >= 3
    && f.banco_logo_url,
  );
}

function clavePospuesto(uid: string) {
  return `adn:ficha-profesor-pospuesta:${uid}`;
}

function leerPospuesto(uid: string): number {
  try {
    return Number(localStorage.getItem(clavePospuesto(uid)) || 0);
  } catch {
    return 0;
  }
}

function limpiarPospuesto(uid: string) {
  try { localStorage.removeItem(clavePospuesto(uid)); } catch { /* noop */ }
}

type ModoCarga = "auto" | "manual" | "silencioso";

/**
 * Ficha de datos personales + pago.
 * Aplica a cualquier cuenta soporte y también a Erick Troya / Jaime Zambrano.
 * Si está incompleta aparece al entrar; puede posponerse 10 minutos.
 * Una vez completa deja de aparecer automáticamente.
 */
export function FichaProfesorModal() {
  const { session, role, roles, profile, refresh } = useAuth();
  const uid = session?.user.id;

  const [esObjetivo, setEsObjetivo] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [completo, setCompleto] = useState(false);
  const [f, setF] = useState<Ficha>(VACIA);
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoBanco, setSubiendoBanco] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [pospuestoHasta, setPospuestoHasta] = useState(0);

  useEffect(() => {
    if (!uid) {
      setEsObjetivo(false);
      setAbierto(false);
      return;
    }

    let vivo = true;
    void (async () => {
      const respaldo = debeMostrarAccesoFicha({
        nombre: profile?.nombre_completo,
        role,
        roles,
      });

      try {
        const { data, error } = await (supabase as any).rpc("debe_completar_ficha_profesor");
        if (!vivo) return;
        setEsObjetivo(!error ? Boolean(data) || respaldo : respaldo);
      } catch {
        if (vivo) setEsObjetivo(respaldo);
      }
    })();

    return () => { vivo = false; };
  }, [uid, role, roles, profile?.nombre_completo]);

  const cargar = useCallback(async (modo: ModoCarga = "auto") => {
    if (!uid || !esObjetivo) return;

    setCargando(true);
    let data: any = null;
    let error: any = null;

    try {
      const respuesta = await (supabase as any).rpc("obtener_mi_ficha_profesor");
      data = respuesta.data;
      error = respuesta.error;
    } catch (err) {
      error = err;
    }

    // Compatibilidad temporal si la migración aún no ha sido aplicada en una preview.
    if (error) {
      const respaldo = await supabase
        .from("profiles")
        .select("nombre_completo,cedula,fecha_nacimiento,whatsapp,direccion,banco,tipo_cuenta,numero_cuenta,titular_cuenta,banco_logo_url,observacion_ficha,avatar_url,ficha_completa")
        .eq("id", uid)
        .maybeSingle();
      data = respaldo.data;
      error = respaldo.error;
    }

    setCargando(false);

    if (error) {
      setF((prev) => ({
        ...prev,
        nombre_completo: prev.nombre_completo || profile?.nombre_completo || "",
        titular_cuenta: prev.titular_cuenta || profile?.nombre_completo || "",
      }));
      setFoto((prev) => prev || profile?.avatar_url || null);
      setCompleto(false);
      if (modo === "manual" || Date.now() >= leerPospuesto(uid)) setAbierto(true);
      toast.error(`No se pudieron cargar tus datos: ${error.message || "error de permisos"}`);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      const siguiente = {
        ...VACIA,
        nombre_completo: profile?.nombre_completo ?? "",
        titular_cuenta: profile?.nombre_completo ?? "",
      };
      setF(siguiente);
      setFoto(profile?.avatar_url ?? null);
      setCompleto(false);
      if (modo === "manual" || Date.now() >= leerPospuesto(uid)) setAbierto(true);
      return;
    }

    const siguiente: Ficha = {
      nombre_completo: row.nombre_completo ?? "",
      cedula: row.cedula ?? "",
      fecha_nacimiento: row.fecha_nacimiento ?? "",
      whatsapp: row.whatsapp ?? "",
      direccion: row.direccion ?? "",
      banco: row.banco ?? "",
      tipo_cuenta: row.tipo_cuenta ?? "ahorros",
      numero_cuenta: row.numero_cuenta ?? "",
      titular_cuenta: row.titular_cuenta ?? row.nombre_completo ?? "",
      banco_logo_url: row.banco_logo_url ?? null,
      observacion_ficha: row.observacion_ficha ?? "",
    };

    const estaCompleta = fichaCompleta(siguiente);
    setF(siguiente);
    setFoto(row.avatar_url ?? null);
    setCompleto(estaCompleta);

    if (estaCompleta) {
      limpiarPospuesto(uid);
      setPospuestoHasta(0);
      setAbierto(modo === "manual");
      return;
    }

    if (modo === "manual") {
      setAbierto(true);
      return;
    }

    if (modo === "silencioso") return;

    const hasta = leerPospuesto(uid);
    setPospuestoHasta(hasta);
    setAbierto(Date.now() >= hasta);
  }, [uid, esObjetivo, profile?.nombre_completo, profile?.avatar_url]);

  useEffect(() => {
    if (!uid || !esObjetivo) return;

    void cargar("auto");

    const auto = () => void cargar("auto");
    const manual = () => void cargar("manual");
    const silencioso = () => void cargar("silencioso");
    const visible = () => {
      if (document.visibilityState === "visible") void cargar("auto");
    };

    window.addEventListener("pageshow", auto);
    window.addEventListener("adn:abrir-datos-pago", manual);
    window.addEventListener("adn:datos-pago-actualizados", silencioso);
    document.addEventListener("visibilitychange", visible);

    return () => {
      window.removeEventListener("pageshow", auto);
      window.removeEventListener("adn:abrir-datos-pago", manual);
      window.removeEventListener("adn:datos-pago-actualizados", silencioso);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [uid, esObjetivo, cargar]);

  useEffect(() => {
    if (!uid || !esObjetivo || completo || !pospuestoHasta) return;
    const restante = pospuestoHasta - Date.now();
    if (restante <= 0) {
      limpiarPospuesto(uid);
      setPospuestoHasta(0);
      void cargar("auto");
      return;
    }

    const timer = window.setTimeout(() => {
      limpiarPospuesto(uid);
      setPospuestoHasta(0);
      void cargar("auto");
    }, restante);

    return () => window.clearTimeout(timer);
  }, [uid, esObjetivo, completo, pospuestoHasta, cargar]);

  if (!abierto || !esObjetivo) return null;

  const set = (k: keyof Ficha) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setCompleto(false);
  };

  const posponer = () => {
    if (!uid) return;
    if (completo) {
      setAbierto(false);
      return;
    }
    const hasta = Date.now() + POSPONER_MS;
    try { localStorage.setItem(clavePospuesto(uid), String(hasta)); } catch { /* noop */ }
    setPospuestoHasta(hasta);
    setAbierto(false);
    toast.info("Te lo recordaremos nuevamente en 10 minutos.");
  };

  const subirFoto = async (file: File) => {
    setSubiendo(true);
    try {
      const url = await subirImagen(file, "adn/avatares");
      setFoto(url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubiendo(false);
    }
  };

  const subirBanco = async (file: File) => {
    if (!uid) return;
    setSubiendoBanco(true);
    try {
      const url = await subirImagenBancoProfesor(file, uid);
      setF((p) => ({ ...p, banco_logo_url: url }));
      setCompleto(false);
      toast.success("Imagen bancaria cargada. Guarda la ficha para finalizar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cargar la imagen bancaria");
    } finally {
      setSubiendoBanco(false);
    }
  };

  const guardar = async () => {
    if (!uid) return;

    const faltan: string[] = [];
    if (f.nombre_completo.trim().length < 3) faltan.push("nombre completo");
    if (f.cedula.trim().length < 5) faltan.push("cédula");
    if (!f.fecha_nacimiento) faltan.push("fecha de nacimiento");
    if (f.whatsapp.trim().length < 7) faltan.push("WhatsApp");
    if (f.direccion.trim().length < 4) faltan.push("dirección");
    if (f.banco.trim().length < 2) faltan.push("banco o cooperativa");
    if (!f.tipo_cuenta) faltan.push("tipo de cuenta");
    if (f.numero_cuenta.trim().length < 5) faltan.push("número de cuenta");
    if (f.titular_cuenta.trim().length < 3) faltan.push("titular de la cuenta");
    if (!f.banco_logo_url) faltan.push("imagen o logo bancario");
    if (faltan.length) return toast.error(`Completa: ${faltan.join(", ")}`);

    setGuardando(true);
    const { data, error } = await (supabase as any).rpc("guardar_mi_ficha_profesor", {
      _nombre_completo: f.nombre_completo.trim(),
      _cedula: f.cedula.trim(),
      _fecha_nacimiento: f.fecha_nacimiento,
      _whatsapp: f.whatsapp.trim(),
      _direccion: f.direccion.trim(),
      _banco: f.banco.trim(),
      _tipo_cuenta: f.tipo_cuenta,
      _numero_cuenta: f.numero_cuenta.trim(),
      _titular_cuenta: f.titular_cuenta.trim(),
      _banco_logo_url: f.banco_logo_url,
      _observacion_ficha: f.observacion_ficha.trim() || null,
      _avatar_url: foto,
    });
    setGuardando(false);

    if (error || data !== true) {
      return toast.error(`No se pudo guardar la ficha: ${error?.message || "respuesta inválida"}`);
    }

    setCompleto(true);
    limpiarPospuesto(uid);
    setPospuestoHasta(0);
    await refresh();
    window.dispatchEvent(new Event("adn:datos-pago-actualizados"));
    toast.success("Datos guardados correctamente para tu cuenta.");
    setAbierto(false);
  };

  const inp = "w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm";
  const lbl = "text-xs font-semibold text-muted-foreground";

  return (
    <div className="fixed inset-0 z-[160] bg-black/75 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl my-4">
        <div className="p-6 text-white relative" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
          <button
            type="button"
            onClick={posponer}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20"
            aria-label={completo ? "Cerrar ficha" : "Recordarme en 10 minutos"}
            title={completo ? "Cerrar" : "Recordarme en 10 minutos"}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Datos del Profesor</div>
          <h2 className="text-2xl font-semibold mt-1">{completo ? "Editar tus datos" : "Completa tus datos al 100%"}</h2>
          <p className="text-sm opacity-90 mt-1 pr-10">
            {completo
              ? "Tus datos ya están registrados. Puedes actualizar cualquier cambio cuando lo necesites."
              : "Si necesitas entrar de urgencia, cierra con la X y volverá a aparecer en 10 minutos mientras siga incompleto."}
          </p>
        </div>

        <div className="p-6">
          {cargando && (
            <div className="mb-4 text-xs text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Verificando información…
            </div>
          )}

          <div className="flex items-center gap-4 mb-5">
            {foto
              ? <img src={foto} alt="Foto de perfil" className="w-20 h-20 rounded-full object-cover border" />
              : <div className="w-20 h-20 rounded-full grid place-items-center text-white text-2xl font-semibold" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
                  {(f.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase()}
                </div>}
            <label className="px-3 py-2 rounded-lg border cursor-pointer text-sm hover:bg-muted inline-flex items-center gap-2">
              {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {subiendo ? "Subiendo…" : "Foto de perfil (opcional)"}
              <input type="file" accept="image/*" hidden disabled={subiendo} onChange={(e) => e.target.files?.[0] && void subirFoto(e.target.files[0])} />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={lbl}>Nombres y apellidos *</label>
              <input value={f.nombre_completo} onChange={set("nombre_completo")} className={inp} />
            </div>
            <div>
              <label className={lbl}>Cédula *</label>
              <input value={f.cedula} onChange={set("cedula")} className={inp} />
            </div>
            <div>
              <label className={lbl}>Fecha de nacimiento *</label>
              <input type="date" value={f.fecha_nacimiento} onChange={set("fecha_nacimiento")} className={inp} />
            </div>
            <div>
              <label className={lbl}>Correo</label>
              <input value={profile?.email ?? ""} disabled className={`${inp} bg-muted`} />
            </div>
            <div>
              <label className={lbl}>WhatsApp *</label>
              <input value={f.whatsapp} onChange={set("whatsapp")} placeholder="09xxxxxxxx" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className={lbl}>Dirección *</label>
              <input value={f.direccion} onChange={set("direccion")} className={inp} />
            </div>

            <div className="sm:col-span-2 mt-2 rounded-xl border p-4 bg-muted/20">
              <div className="flex items-center gap-2 font-semibold mb-3">
                <Landmark className="w-4 h-4 text-violet" /> Datos para recibir pagos
              </div>
              <div className="flex items-center gap-4 mb-4">
                {f.banco_logo_url ? (
                  <img src={f.banco_logo_url} alt="Banco" className="w-16 h-16 rounded-xl object-cover border bg-background" />
                ) : (
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed grid place-items-center bg-background text-muted-foreground">
                    <Landmark className="w-7 h-7" />
                  </div>
                )}
                <label className="px-3 py-2 rounded-lg border bg-background cursor-pointer text-sm font-semibold inline-flex items-center gap-2">
                  {subiendoBanco ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {subiendoBanco ? "Subiendo…" : f.banco_logo_url ? "Cambiar imagen bancaria" : "Subir imagen bancaria *"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subiendoBanco} onChange={(e) => e.target.files?.[0] && void subirBanco(e.target.files[0])} />
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Banco o cooperativa *</label>
                  <input value={f.banco} onChange={set("banco")} placeholder="Ej. Banco Pichincha" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Tipo de cuenta *</label>
                  <select value={f.tipo_cuenta} onChange={set("tipo_cuenta")} className={inp}>
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                    <option value="cooperativa">Cooperativa</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Número de cuenta *</label>
                  <input value={f.numero_cuenta} onChange={set("numero_cuenta")} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Titular de la cuenta *</label>
                  <input value={f.titular_cuenta} onChange={set("titular_cuenta")} className={inp} />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className={lbl}>Observación (opcional)</label>
              <textarea value={f.observacion_ficha} onChange={set("observacion_ficha")} rows={2} className={`${inp} resize-y`} />
            </div>
          </div>

          <button
            onClick={() => void guardar()}
            disabled={guardando || subiendoBanco}
            className="mt-5 w-full px-4 py-3 rounded-xl bg-violet-gradient text-white font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            {guardando ? "Guardando…" : completo ? "Guardar cambios" : "Guardar y completar registro"}
          </button>
          <p className="text-[11px] text-center text-muted-foreground mt-2">
            {completo
              ? "Al estar completo, este formulario ya no vuelve a abrirse automáticamente."
              : "Puedes posponerlo 10 minutos con la X; después volverá a aparecer si sigue incompleto."}
          </p>
        </div>
      </div>
    </div>
  );
}
