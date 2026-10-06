import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subirImagen } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth-context";
import { formatNombre } from "@/lib/nombres";
import { toast } from "sonner";
import { InstallAppButton } from "@/components/InstallAppButton";
import { Landmark, Save, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/perfil")({ component: Page });

function Page() {
  const { profile, session, refresh } = useAuth();
  const uid = session?.user.id;
  const [nombre, setNombre] = useState("");
  const [actividad, setActividad] = useState("");
  const [biografia, setBiografia] = useState("");
  const [negocioNombre, setNegocioNombre] = useState("");
  const [negocioFoto, setNegocioFoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingNegocio, setUploadingNegocio] = useState(false);

  useEffect(() => {
    if (profile) setNombre(profile.nombre_completo);
    if (!uid) return;
    supabase.from("profiles").select("negocio_nombre,negocio_foto_url,actividad,biografia").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as { negocio_nombre: string | null; negocio_foto_url: string | null; actividad: string | null; biografia: string | null };
        setNegocioNombre(d.negocio_nombre ?? "");
        setNegocioFoto(d.negocio_foto_url);
        setActividad(d.actividad ?? "");
        setBiografia(d.biografia ?? "");
      });
  }, [profile, uid]);

  const save = async () => {
    if (!uid || saving) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      nombre_completo: nombre,
      negocio_nombre: negocioNombre || null,
      actividad: actividad || null,
      biografia: biografia || null,
    }).eq("id", uid);
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
          <label className="text-xs font-medium">Nombre completo</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" />
        </div>
        <div>
          <label className="text-xs font-medium">A qué te dedicas</label>
          <input value={actividad} onChange={(e) => setActividad(e.target.value)} placeholder="Ej: Emprendedora textil" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" />
        </div>
        <div>
          <label className="text-xs font-medium">Biografía</label>
          <textarea value={biografia} onChange={(e) => setBiografia(e.target.value)} rows={4} placeholder="Cuéntale a la comunidad quién eres…" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background resize-y" />
        </div>
      </div>

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
          <input value={negocioNombre} onChange={(e) => setNegocioNombre(e.target.value)} placeholder="Ej: Boutique María" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" />
        </div>
      </div>

      <div className="mt-5">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      <MentoriaDatosPagoPanel uid={uid} />

      <div className="rounded-2xl border bg-card p-6 mt-5">
        <div className="text-sm font-semibold mb-1">Instalar app en tu celular</div>
        <p className="text-xs text-muted-foreground mb-3">Ten ADN Empresarial como app nativa y recibe notificaciones aunque cierres el navegador.</p>
        <InstallAppButton />
      </div>
    </div>
  );
}


type MentoriaCuenta = {
  seleccionada: boolean;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  titular_cuenta: string | null;
  cedula_titular: string | null;
  completo: boolean;
};

type Compania = {
  id: string;
  nombre_completo: string | null;
  email: string | null;
  avatar_url: string | null;
};

function MentoriaDatosPagoPanel({ uid }: { uid?: string }) {
  const [seleccionada, setSeleccionada] = useState(false);
  const [cuenta, setCuenta] = useState<MentoriaCuenta | null>(null);
  const [usuarios, setUsuarios] = useState<Compania[]>([]);
  const [acompanantes, setAcompanantes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const [guardandoAcompanantes, setGuardandoAcompanantes] = useState(false);
  const [banco, setBanco] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState("ahorros");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [titular, setTitular] = useState("");
  const [cedula, setCedula] = useState("");

  useEffect(() => {
    let activo = true;
    if (!uid) { setLoading(false); return; }

    (async () => {
      try {
        const cuentaRes = await supabase.rpc("obtener_datos_pago_alumna", { _alumna_id: uid });
        if (cuentaRes.error) {
          // Una cuenta que todavía no ha sido seleccionada para mentoría no necesita este panel.
          if (activo) {
            setSeleccionada(false);
            setLoading(false);
          }
          return;
        }

        const cuentaRow = (cuentaRes.data?.[0] ?? null) as MentoriaCuenta | null;
        if (!activo) return;
        setCuenta(cuentaRow);
        setSeleccionada(Boolean(cuentaRow?.seleccionada));
        if (cuentaRow) {
          setBanco(cuentaRow.banco ?? "");
          setTipoCuenta(cuentaRow.tipo_cuenta ?? "ahorros");
          setNumeroCuenta(cuentaRow.numero_cuenta ?? "");
          setTitular(cuentaRow.titular_cuenta ?? "");
          setCedula(cuentaRow.cedula_titular ?? "");
        }

        const [usuariosRes, acRes] = await Promise.all([
          supabase.rpc("listar_usuarios_acompanantes"),
          supabase.rpc("listar_acompanantes_mentoria", { _alumna_id: uid }),
        ]);
        if (!activo) return;
        if (!usuariosRes.error) setUsuarios(((usuariosRes.data ?? []) as unknown) as Compania[]);
        if (!acRes.error) {
          const ac = (acRes.data ?? []) as Array<{ id: string; orden: number }>;
          setAcompanantes(ac.sort((a, b) => a.orden - b.orden).map((x) => x.id));
        }
      } catch {
        // El panel es opcional para cuentas que no pertenecen a la mentoría.
      } finally {
        if (activo) setLoading(false);
      }
    })();

    return () => { activo = false; };
  }, [uid]);

  if (loading || !seleccionada) return null;

  const guardarCuenta = async () => {
    if (!uid) return;
    if (!banco.trim() || !tipoCuenta.trim() || !numeroCuenta.trim() || !titular.trim()) {
      toast.error("Completa banco, tipo de cuenta, número y titular.");
      return;
    }
    setGuardandoCuenta(true);
    const { error } = await supabase.rpc("guardar_datos_pago_alumna", {
      _alumna_id: uid,
      _banco: banco,
      _tipo_cuenta: tipoCuenta,
      _numero_cuenta: numeroCuenta,
      _titular_cuenta: titular,
      _cedula_titular: cedula || null,
    });
    setGuardandoCuenta(false);
    if (error) return toast.error(error.message);
    setCuenta({ seleccionada: true, banco: banco.trim(), tipo_cuenta: tipoCuenta, numero_cuenta: numeroCuenta.trim(), titular_cuenta: titular.trim(), cedula_titular: cedula.trim() || null, completo: true });
    toast.success("Cuenta bancaria guardada");
  };

  const guardarAcompanantes = async () => {
    if (!uid) return;
    const clean = acompanantes.filter(Boolean);
    if (clean.length > 2) return toast.error("Máximo 2 acompañantes.");
    if (new Set(clean).size !== clean.length) return toast.error("No puedes repetir un acompañante.");
    setGuardandoAcompanantes(true);
    const { error } = await supabase.rpc("guardar_acompanantes_mentoria", { _alumna_id: uid, _acompanantes: clean });
    setGuardandoAcompanantes(false);
    if (error) return toast.error(error.message);
    setAcompanantes(clean);
    toast.success("Acompañantes guardados");
  };

  const setSlot = (index: number, value: string) => {
    setAcompanantes((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const opcionesPara = (index: number) => usuarios.filter((u) => !acompanantes.some((id, i) => id === u.id && i !== index));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2"><Landmark className="w-4 h-4" /> Cuenta bancaria para pagos</div>
            <p className="text-xs text-muted-foreground mt-1">Esta información se guarda de forma separada de los datos bancarios de Profesores.</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${cuenta?.completo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
            {cuenta?.completo ? "Completa" : "Pendiente"}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Banco o cooperativa *</label><input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ej. Banco Pichincha" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" /></div>
          <div><label className="text-xs font-medium">Tipo de cuenta *</label><select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option><option value="cooperativa">Cooperativa</option><option value="otro">Otro</option></select></div>
          <div><label className="text-xs font-medium">Número de cuenta *</label><input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} inputMode="numeric" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" /></div>
          <div><label className="text-xs font-medium">Titular de la cuenta *</label><input value={titular} onChange={(e) => setTitular(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" /></div>
          <div><label className="text-xs font-medium">Cédula del titular</label><input value={cedula} onChange={(e) => setCedula(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} className="w-full mt-1 px-3 py-2 rounded-lg border bg-background" placeholder="Opcional" /></div>
        </div>

        <button onClick={() => void guardarCuenta()} disabled={guardandoCuenta} className="mt-4 px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" /> {guardandoCuenta ? "Guardando…" : "Guardar cuenta bancaria"}
        </button>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Acompañantes de mentoría</div>
            <p className="text-xs text-muted-foreground mt-1">Selecciona hasta 2 cuentas existentes que serán tus acompañantes.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1].map((index) => (
            <div key={index}>
              <label className="text-xs font-medium">Acompañante {index + 1}</label>
              <select value={acompanantes[index] || ""} onChange={(e) => setSlot(index, e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm">
                <option value="">Ninguno</option>
                {opcionesPara(index).map((u) => (
                  <option key={u.id} value={u.id}>{formatNombre(u.nombre_completo) || u.email || "Usuario"}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <button onClick={() => void guardarAcompanantes()} disabled={guardandoAcompanantes} className="mt-4 px-4 py-2 rounded-lg border text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
          <Save className="w-4 h-4" /> {guardandoAcompanantes ? "Guardando…" : "Guardar acompañantes"}
        </button>
      </div>
    </div>
  );
}
