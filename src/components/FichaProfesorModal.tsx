import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { subirImagen } from "@/lib/cloudinary";
import { subirImagenBancoProfesor } from "@/lib/bank-images";
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

/**
 * Ficha global del Profesor.
 * Todo usuario que tenga el rol soporte la ve al entrar/recargar/reabrir la app.
 * Si está incompleta no se puede cerrar; si ya está al 100% puede revisarla y cerrar.
 */
export function FichaProfesorModal() {
  const { session, role, roles, profile, refresh } = useAuth();
  const uid = session?.user.id;
  const contextoProfesor = role === "soporte" || roles.includes("soporte");

  const [esProfesor, setEsProfesor] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [completo, setCompleto] = useState(false);
  const [f, setF] = useState<Ficha>(VACIA);
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoBanco, setSubiendoBanco] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(false);

  // La fuente principal es has_role. El contexto y user_roles quedan como respaldo
  // para que una demora del AuthProvider nunca oculte esta ficha.
  useEffect(() => {
    if (!uid) {
      setEsProfesor(false);
      setAbierto(false);
      return;
    }

    let vivo = true;
    void (async () => {
      let real = contextoProfesor;
      try {
        const [{ data: tieneRol }, { data: filas }] = await Promise.all([
          supabase.rpc("has_role", { _user_id: uid, _role: "soporte" }),
          supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "soporte").limit(1),
        ]);
        real = real || tieneRol === true || (filas?.length ?? 0) > 0;
      } catch {
        // Si una consulta falla, conserva la detección que ya entregó AuthProvider.
      }
      if (vivo) setEsProfesor(real);
    })();

    return () => { vivo = false; };
  }, [uid, contextoProfesor]);

  const cargar = useCallback(async (mostrar = true) => {
    if (!uid || !esProfesor) return;

    setCargando(true);
    const { data, error } = await supabase.from("profiles")
      .select("nombre_completo,cedula,fecha_nacimiento,whatsapp,direccion,banco,tipo_cuenta,numero_cuenta,titular_cuenta,banco_logo_url,observacion_ficha,avatar_url,ficha_completa")
      .eq("id", uid)
      .maybeSingle();
    setCargando(false);

    if (error) {
      // Un error de lectura jamás debe ocultar el formulario obligatorio.
      setF((prev) => ({
        ...prev,
        nombre_completo: prev.nombre_completo || profile?.nombre_completo || "",
        titular_cuenta: prev.titular_cuenta || profile?.nombre_completo || "",
      }));
      setFoto((prev) => prev || profile?.avatar_url || null);
      setCompleto(false);
      if (mostrar) setAbierto(true);
      toast.error(`No se pudieron cargar todos tus datos de Profesor: ${error.message}`);
      return;
    }

    if (!data) {
      const siguiente = {
        ...VACIA,
        nombre_completo: profile?.nombre_completo ?? "",
        titular_cuenta: profile?.nombre_completo ?? "",
      };
      setF(siguiente);
      setFoto(profile?.avatar_url ?? null);
      setCompleto(false);
      if (mostrar) setAbierto(true);
      return;
    }

    const d = data as Record<string, string | boolean | null>;
    const siguiente: Ficha = {
      nombre_completo: (d.nombre_completo as string) ?? "",
      cedula: (d.cedula as string) ?? "",
      fecha_nacimiento: (d.fecha_nacimiento as string) ?? "",
      whatsapp: (d.whatsapp as string) ?? "",
      direccion: (d.direccion as string) ?? "",
      banco: (d.banco as string) ?? "",
      tipo_cuenta: (d.tipo_cuenta as string) ?? "ahorros",
      numero_cuenta: (d.numero_cuenta as string) ?? "",
      titular_cuenta: (d.titular_cuenta as string) ?? (d.nombre_completo as string) ?? "",
      banco_logo_url: (d.banco_logo_url as string) ?? null,
      observacion_ficha: (d.observacion_ficha as string) ?? "",
    };

    const estaCompleta = fichaCompleta(siguiente);
    setF(siguiente);
    setFoto((d.avatar_url as string) ?? null);
    setCompleto(estaCompleta);
    if (mostrar) setAbierto(true);
  }, [uid, esProfesor, profile?.nombre_completo, profile?.avatar_url]);

  useEffect(() => {
    if (!uid || !esProfesor) return;

    // Primera entrada / recarga: se muestra siempre a un Profesor.
    void cargar(true);

    const mostrarFicha = () => void cargar(true);
    const visible = () => {
      if (document.visibilityState === "visible") void cargar(true);
    };
    const refrescarSinAbrir = () => void cargar(false);

    window.addEventListener("pageshow", mostrarFicha);
    window.addEventListener("adn:abrir-datos-pago", mostrarFicha);
    window.addEventListener("adn:datos-pago-actualizados", refrescarSinAbrir);
    document.addEventListener("visibilitychange", visible);

    return () => {
      window.removeEventListener("pageshow", mostrarFicha);
      window.removeEventListener("adn:abrir-datos-pago", mostrarFicha);
      window.removeEventListener("adn:datos-pago-actualizados", refrescarSinAbrir);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [uid, esProfesor, cargar]);

  if (!abierto || !esProfesor) return null;

  const set = (k: keyof Ficha) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setCompleto(false);
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
      toast.success("Imagen bancaria cargada. Guarda tu ficha para finalizar.");
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
    const { error } = await supabase.from("profiles").update({
      nombre_completo: f.nombre_completo.trim(),
      cedula: f.cedula.trim(),
      fecha_nacimiento: f.fecha_nacimiento,
      whatsapp: f.whatsapp.trim(),
      direccion: f.direccion.trim(),
      banco: f.banco.trim(),
      tipo_cuenta: f.tipo_cuenta,
      numero_cuenta: f.numero_cuenta.trim(),
      titular_cuenta: f.titular_cuenta.trim(),
      banco_logo_url: f.banco_logo_url,
      observacion_ficha: f.observacion_ficha.trim() || null,
      avatar_url: foto,
      ficha_completa: true,
    }).eq("id", uid);
    setGuardando(false);

    if (error) return toast.error(error.message);

    setCompleto(true);
    await refresh();
    window.dispatchEvent(new Event("adn:datos-pago-actualizados"));
    toast.success("Datos del Profesor registrados al 100%.");
    setAbierto(false);
  };

  const inp = "w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm";
  const lbl = "text-xs font-semibold text-muted-foreground";

  return (
    <div className="fixed inset-0 z-[160] bg-black/75 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl my-4">
        <div className="p-6 text-white relative" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
          {completo && (
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20"
              aria-label="Cerrar ficha"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Registro del Profesor</div>
          <h2 className="text-2xl font-semibold mt-1">{completo ? "Revisa tus datos" : "Completa tus datos al 100%"}</h2>
          <p className="text-sm opacity-90 mt-1 pr-10">
            {completo
              ? "Tus datos ya están completos. Puedes revisarlos o actualizarlos antes de continuar."
              : "Esta ventana seguirá apareciendo al entrar, recargar o abrir la app mientras falte algún dato necesario para tus pagos e informes."}
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
              ? "Tus datos están completos. Puedes cerrar con la X o guardar cualquier cambio."
              : "No se puede cerrar esta ventana mientras falte algún dato obligatorio."}
          </p>
        </div>
      </div>
    </div>
  );
}
