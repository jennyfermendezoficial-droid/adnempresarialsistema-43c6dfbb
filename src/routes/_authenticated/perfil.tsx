import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({ component: Page });

function Page() {
  const { profile, session, refresh } = useAuth();
  const uid = session?.user.id;
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { if (profile) setNombre(profile.nombre_completo); }, [profile]);

  const save = async () => {
    if (!uid) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ nombre_completo: nombre }).eq("id", uid);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Perfil actualizado");
  };

  const uploadAvatar = async (file: File) => {
    if (!uid) return;
    setUploading(true);
    const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", uid);
    setUploading(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Avatar actualizado");
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6">Mi perfil</h1>
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
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
