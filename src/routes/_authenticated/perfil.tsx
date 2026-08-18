import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subirImagen } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { InstallAppButton } from "@/components/InstallAppButton";

export const Route = createFileRoute("/_authenticated/perfil")({ component: Page });

function nombreProfesorValido(nombre: string) {
  return nombre.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 4;
}

function Page() {
  const { profile, session, refresh, role } = useAuth();
  const uid = session?.user.id;
  const esProfesor = role === "soporte";
  const [nombre, setNombre] = useState("");
  const [actividad, setActividad] = useState("");
  const [biografia, setBiografia] = useState("");
  const [negocioNombre, setNegocioNombre] = useState("");
  const [negocioFoto, setNegocioFoto] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [direccion, setDireccion] = useState("");
  const [banco, setBanco] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState("ahorros");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [titularCuenta, setTitularCuenta] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingNegocio, setUploadingNegocio] = useState(false);

  useEffect(() => {
    if (profile) setNombre(profile.nombre_completo);
    if (!uid) return;
    supabase.from("profiles")
      .select("negocio_nombre,negocio_foto_url,actividad,biografia,cedula,fecha_nacimiento,whatsapp,direccion,banco,tipo_cuenta,numero_cuenta,titular_cuenta")
      .eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as {
          negocio_nombre: string | null; negocio_foto_url: string | null; actividad: string | null; biografia: string | null;
          cedula: string | null; fecha_nacimiento: string | null; whatsapp: string | null; direccion: string | null;
          banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null; titular_cuenta: string | null;
        };
        setNegocioNombre(d.negocio_nombre ?? "");
        setNegocioFoto(d.negocio_foto_url);
        setActividad(d.actividad ?? "");
        setBiografia(d.biografia ?? "");
        setCedula(d.cedula ?? "");
        setFechaNacimiento(d.fecha_nacimiento ?? "");
        setWhatsapp(d.whatsapp ?? "");
        setDireccion(d.direccion ?? "");
        setBanco(d.banco ?? "");
        setTipoCuenta(d.tipo_cuenta ?? "ahorros");
        setNumeroCuenta(d.numero_cuenta ?? "");
        setTitularCuenta(d.titular_cuenta ?? profile?.nombre_completo ?? "");
      });
  }, [profile, uid]);

  const save = async () => {
    if (!uid || saving) return;
    if (esProfesor) {
      const faltan: string[] = [];
      if (!nombreProfesorValido(nombre)) faltan.push("dos nombres y dos apellidos");
      if (!/^\d{10}$/.test(cedula.trim())) faltan.push("cédula de 10 dígitos");
      if (whatsapp.trim().length < 7) faltan.push("WhatsApp");
      if (direccion.trim().length < 4) faltan.push("dirección");
      if (banco.trim().length < 2) faltan.push("banco/cooperativa");
      if (numeroCuenta.trim().length < 5) faltan.push("número de cuenta");
      if (titularCuenta.trim().length < 3) faltan.push("titular de la cuenta");
      if (faltan.length) return toast.error(`Completa correctamente: ${faltan.join(", ")}`);
    }

    setSaving(true);
    const payload = {
      nombre_completo: nombre.trim(),
      negocio_nombre: negocioNombre || null,
      actividad: actividad || null,
      biografia: biografia || null,
      ...(esProfesor ? {
        cedula: cedula.trim(),
        fecha_nacimiento: fechaNacimiento || null,
        whatsapp: whatsapp.trim(),
        direccion: direccion.trim(),
        banco: banco.trim(),
        tipo_cuenta: tipoCuenta,
        numero_cuenta: numeroCuenta.trim(),
        titular_cuenta: titularCuenta.trim() || nombre.trim(),
        ficha_completa: true,
      } : {}),
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", uid);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Perfil actualizado");
  };

  const uploadAvatar = async (file: File) => {
    if (!uid) return;
    setUploading(true);
    let url: string;
    try {
      url = await subirImagen(file, "adn/avatares");
    } catch (err) { setUploading(false); return toast.error((err as Error).message); }
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
    setUploading(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Avatar actualizado");
  };

  const uploadNegocio = async (file: File) => {
    if (!uid) return;
    setUploadingNegocio(true);
    let url: string;
    try {
      url = await subirImagen(file, "adn/avatares");
    } catch (err) { setUploadingNegocio(false); return toast.error((err as Error).message); }
    const { error } = await supabase.from("profiles").update({ negocio_foto_url: url }).eq("id", uid);
    setUploadingNegocio(false);
    if (error) return toast.error(error.message);
    setNegocioFoto(url);
    toast.success("Foto de negocio actualizada");
  };

  const inputClass = "w-full mt-1 px-3 py-2 rounded-lg border bg-background";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Mi perfil</h1>
      <p className="text-sm text-muted-foreground mb-6">Tus datos personales y de tu negocio. La foto del negocio aparece en el PDF de reportes.</p>

      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} className="w-20 h-20 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-20 h-20 rounded-full grid place-items-center text-white text-2xl font-semibold" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
              {(profile?.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <label className="px-3 py-2 rounded-lg border cursor-pointer text-sm hover:bg-muted">
            {uploading ? "Subiendo…" : "Cambiar foto"}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </label>
        </div>
        <div>
          <label className="text-xs font-medium">Email</label>
          <input value={profile?.email ?? ""} disabled className="w-full mt-1 px-3 py-2 rounded-lg border bg-muted" />
        </div>
        <div>
          <label className="text-xs font-medium">{esProfesor ? "Dos nombres y dos apellidos" : "Nombre completo"}</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium">A qué te dedicas</label>
          <input value={actividad} onChange={(e) => setActividad(e.target.value)} placeholder="Ej: Emprendedora textil" className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium">Biografía</label>
          <textarea value={biografia} onChange={(e) => setBiografia(e.target.value)} rows={4} placeholder="Cuéntale a la comunidad quién eres…" className={`${inputClass} resize-y`} />
        </div>
      </div>

      {esProfesor && (
        <div className="rounded-2xl border bg-card p-6 space-y-4 mt-5">
          <div>
            <div className="text-sm font-semibold">Datos del profesor y cuenta de pago</div>
            <p className="text-xs text-muted-foreground mt-1">Puedes actualizar estos datos cuando sea necesario. La cuenta bancaria será tu cuenta de destino en Pagos e informes.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Cédula *</label>
              <input inputMode="numeric" maxLength={10} value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 dígitos" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium">Fecha de nacimiento (opcional)</label>
              <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium">WhatsApp / celular *</label>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="09xxxxxxxx" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium">Banco o cooperativa *</label>
              <input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ej. Banco Pichincha" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">Dirección *</label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium">Tipo de cuenta *</label>
              <select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)} className={inputClass}>
                <option value="ahorros">Ahorros</option>
                <option value="corriente">Corriente</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Número de cuenta *</label>
              <input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">Titular de la cuenta *</label>
              <input value={titularCuenta} onChange={(e) => setTitularCuenta(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6 space-y-4 mt-5">
        <div className="text-sm font-semibold">Mi negocio</div>
        <p className="text-xs text-muted-foreground -mt-2">Esta información aparece en la portada del PDF mensual de reportes.</p>
        <div className="flex items-center gap-4">
          {negocioFoto ? (
            <img src={negocioFoto} className="w-20 h-20 rounded-xl object-cover" alt="negocio" />
          ) : (
            <div className="w-20 h-20 rounded-xl grid place-items-center text-white text-xl font-semibold border-2 border-dashed" style={{ background: "rgba(124,107,255,.1)", color: "var(--violet)" }}>📷</div>
          )}
          <label className="px-3 py-2 rounded-lg border cursor-pointer text-sm hover:bg-muted">
            {uploadingNegocio ? "Subiendo…" : "Foto del negocio"}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadNegocio(e.target.files[0])} />
          </label>
        </div>
        <div>
          <label className="text-xs font-medium">Nombre del negocio</label>
          <input value={negocioNombre} onChange={(e) => setNegocioNombre(e.target.value)} placeholder="Ej: Boutique María" className={inputClass} />
        </div>
      </div>

      <div className="mt-5">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      <div className="rounded-2xl border bg-card p-6 mt-5">
        <div className="text-sm font-semibold mb-1">Instalar app en tu celular</div>
        <p className="text-xs text-muted-foreground mb-3">Ten ADN Empresarial como app nativa y recibe notificaciones aunque cierres el navegador.</p>
        <InstallAppButton />
      </div>
    </div>
  );
}