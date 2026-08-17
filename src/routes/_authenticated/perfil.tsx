import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subirImagen } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { InstallAppButton } from "@/components/InstallAppButton";

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

      <div className="rounded-2xl border bg-card p-6 mt-5">
        <div className="text-sm font-semibold mb-1">Instalar app en tu celular</div>
        <p className="text-xs text-muted-foreground mb-3">Ten ADN Empresarial como app nativa y recibe notificaciones aunque cierres el navegador.</p>
        <InstallAppButton />
      </div>
    </div>
  );
}
