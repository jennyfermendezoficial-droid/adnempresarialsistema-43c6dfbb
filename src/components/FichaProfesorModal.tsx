import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { subirImagen } from "@/lib/cloudinary";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
}

const VACIA: Ficha = {
  nombre_completo: "", cedula: "", fecha_nacimiento: "", whatsapp: "", direccion: "",
  banco: "", tipo_cuenta: "ahorros", numero_cuenta: "", titular_cuenta: "",
};

function nombreValido(nombre: string) {
  return nombre.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 4;
}

/** Ficha obligatoria para profesores: se muestra una sola vez hasta completarla. */
export function FichaProfesorModal() {
  const { session, role, profile, refresh } = useAuth();
  const uid = session?.user.id;
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState<Ficha>(VACIA);
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!uid || role !== "soporte") return;
    let cancel = false;
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("nombre_completo,cedula,fecha_nacimiento,whatsapp,direccion,banco,tipo_cuenta,numero_cuenta,titular_cuenta,avatar_url,ficha_completa")
        .eq("id", uid).maybeSingle();
      if (cancel || !data) return;
      const d = data as Record<string, string | boolean | null>;
      if (d.ficha_completa === true && d.avatar_url) return;
      const nombre = (d.nombre_completo as string) ?? "";
      setF({
        nombre_completo: nombre,
        cedula: (d.cedula as string) ?? "",
        fecha_nacimiento: (d.fecha_nacimiento as string) ?? "",
        whatsapp: (d.whatsapp as string) ?? "",
        direccion: (d.direccion as string) ?? "",
        banco: (d.banco as string) ?? "",
        tipo_cuenta: (d.tipo_cuenta as string) ?? "ahorros",
        numero_cuenta: (d.numero_cuenta as string) ?? "",
        titular_cuenta: (d.titular_cuenta as string) || nombre,
      });
      setFoto((d.avatar_url as string) ?? null);
      setAbierto(true);
    })();
    return () => { cancel = true; };
  }, [uid, role]);

  if (!abierto || role !== "soporte") return null;

  const set = (k: keyof Ficha) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setF((p) => {
      if (k === "nombre_completo" && (!p.titular_cuenta || p.titular_cuenta === p.nombre_completo)) {
        return { ...p, nombre_completo: value, titular_cuenta: value };
      }
      return { ...p, [k]: value };
    });
  };

  const subirFoto = async (file: File) => {
    setSubiendo(true);
    try {
      const url = await subirImagen(file, "adn/avatares");
      setFoto(url);
    } catch (err) { toast.error((err as Error).message); }
    setSubiendo(false);
  };

  const guardar = async () => {
    if (!uid) return;
    const faltan: string[] = [];
    if (!foto) faltan.push("foto");
    if (!nombreValido(f.nombre_completo)) faltan.push("dos nombres y dos apellidos");
    if (!/^\d{10}$/.test(f.cedula.trim())) faltan.push("cédula de 10 dígitos");
    if (f.whatsapp.trim().length < 7) faltan.push("WhatsApp");
    if (f.direccion.trim().length < 4) faltan.push("dirección");
    if (f.banco.trim().length < 2) faltan.push("banco/cooperativa");
    if (f.numero_cuenta.trim().length < 5) faltan.push("número de cuenta");
    if (f.titular_cuenta.trim().length < 3) faltan.push("titular de la cuenta");
    if (faltan.length) return toast.error(`Completa correctamente: ${faltan.join(", ")}`);

    setGuardando(true);
    const { error } = await supabase.from("profiles").update({
      nombre_completo: f.nombre_completo.trim(),
      cedula: f.cedula.trim(),
      fecha_nacimiento: f.fecha_nacimiento || null,
      whatsapp: f.whatsapp.trim(),
      direccion: f.direccion.trim(),
      banco: f.banco.trim(),
      tipo_cuenta: f.tipo_cuenta,
      numero_cuenta: f.numero_cuenta.trim(),
      titular_cuenta: f.titular_cuenta.trim() || f.nombre_completo.trim(),
      avatar_url: foto,
      ficha_completa: true,
    }).eq("id", uid);
    setGuardando(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Ficha guardada");
    setAbierto(false);
  };

  const inp = "w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm";
  const lbl = "text-xs font-semibold text-muted-foreground";

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Completa tu ficha de profesor</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-5">
          Se llena una sola vez. Estos datos se usan para tus pagos e informes; luego puedes editarlos desde tu perfil.
        </p>

        <div className="flex items-center gap-4 mb-5">
          {foto
            ? <img src={foto} alt="Foto del profesor" className="w-20 h-20 rounded-full object-cover" />
            : <div className="w-20 h-20 rounded-full grid place-items-center text-white text-2xl font-semibold" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
                {(f.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase()}
              </div>}
          <div>
            <label className="px-3 py-2 rounded-lg border cursor-pointer text-sm hover:bg-muted inline-block">
              {subiendo ? "Subiendo…" : "Subir foto obligatoria"}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
            </label>
            {!foto && <div className="text-[11px] text-amber-600 mt-1">Debes registrar tu foto para continuar.</div>}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={lbl}>Dos nombres y dos apellidos *</label>
            <input value={f.nombre_completo} onChange={set("nombre_completo")} placeholder="Ej. Jaime Andrés Zambrano López" className={inp} />
          </div>
          <div>
            <label className={lbl}>Cédula *</label>
            <input inputMode="numeric" maxLength={10} value={f.cedula} onChange={(e) => setF((p) => ({ ...p, cedula: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="10 dígitos" className={inp} />
          </div>
          <div>
            <label className={lbl}>Fecha de nacimiento (opcional)</label>
            <input type="date" value={f.fecha_nacimiento} onChange={set("fecha_nacimiento")} className={inp} />
          </div>
          <div>
            <label className={lbl}>Correo</label>
            <input value={profile?.email ?? ""} disabled className={`${inp} bg-muted`} />
          </div>
          <div>
            <label className={lbl}>WhatsApp / celular *</label>
            <input value={f.whatsapp} onChange={set("whatsapp")} placeholder="09xxxxxxxx" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Dirección *</label>
            <input value={f.direccion} onChange={set("direccion")} className={inp} />
          </div>
          <div>
            <label className={lbl}>Banco o cooperativa *</label>
            <input value={f.banco} onChange={set("banco")} placeholder="Ej. Banco Pichincha" className={inp} />
          </div>
          <div>
            <label className={lbl}>Tipo de cuenta *</label>
            <select value={f.tipo_cuenta} onChange={set("tipo_cuenta")} className={inp}>
              <option value="ahorros">Ahorros</option>
              <option value="corriente">Corriente</option>
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

        <button onClick={guardar} disabled={guardando || subiendo}
          className="mt-5 w-full px-4 py-2.5 rounded-xl bg-violet-gradient text-white font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar ficha
        </button>
      </div>
    </div>
  );
}
