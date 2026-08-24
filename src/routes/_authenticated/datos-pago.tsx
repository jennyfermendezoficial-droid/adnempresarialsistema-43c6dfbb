import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ImagePlus, Landmark, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { subirImagenBancoProfesor } from "@/lib/bank-images";

export const Route = createFileRoute("/_authenticated/datos-pago")({ component: Page });

interface DatosPago {
  banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular_cuenta: string;
  banco_logo_url: string | null;
}

const VACIO: DatosPago = {
  banco: "",
  tipo_cuenta: "ahorros",
  numero_cuenta: "",
  titular_cuenta: "",
  banco_logo_url: null,
};

function Page() {
  const { session, role, roles, profile } = useAuth();
  const uid = session?.user.id;
  const isProfesor = roles.includes("soporte") || role === "soporte";
  const [datos, setDatos] = useState<DatosPago>(VACIO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!uid || !isProfesor) {
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("banco,tipo_cuenta,numero_cuenta,titular_cuenta,banco_logo_url")
        .eq("id", uid)
        .maybeSingle();
      if (!alive) return;
      if (error) toast.error(error.message);
      const d = data as Partial<DatosPago> | null;
      setDatos({
        banco: d?.banco ?? "",
        tipo_cuenta: d?.tipo_cuenta ?? "ahorros",
        numero_cuenta: d?.numero_cuenta ?? "",
        titular_cuenta: d?.titular_cuenta ?? profile?.nombre_completo ?? "",
        banco_logo_url: d?.banco_logo_url ?? null,
      });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [uid, isProfesor, profile?.nombre_completo]);

  if (!isProfesor) {
    return <div className="p-8 text-center text-muted-foreground">Esta sección es exclusiva para Profesores.</div>;
  }

  const subirImagen = async (file?: File) => {
    if (!file || !uid) return;
    setUploading(true);
    try {
      const url = await subirImagenBancoProfesor(file, uid);
      setDatos((d) => ({ ...d, banco_logo_url: url }));
      toast.success("Imagen bancaria cargada. Guarda los cambios para finalizar.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const guardar = async () => {
    if (!uid) return;
    const banco = datos.banco.trim();
    const numero = datos.numero_cuenta.trim();
    const titular = datos.titular_cuenta.trim();
    if (banco.length < 2) return toast.error("Escribe el banco o cooperativa.");
    if (numero.length < 5) return toast.error("Escribe un número de cuenta válido.");
    if (titular.length < 3) return toast.error("Escribe el titular de la cuenta.");
    if (!datos.banco_logo_url) return toast.error("La imagen o logo del banco es obligatorio.");

    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      banco,
      tipo_cuenta: datos.tipo_cuenta,
      numero_cuenta: numero,
      titular_cuenta: titular,
      banco_logo_url: datos.banco_logo_url,
    }).eq("id", uid);
    setSaving(false);
    if (error) return toast.error(error.message);
    window.dispatchEvent(new Event("adn:datos-pago-actualizados"));
    toast.success("Datos de pago guardados correctamente.");
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">Cargando datos de pago…</div>;

  return (
    <div className="p-5 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet mb-2">
          <Landmark className="w-4 h-4" /> Profesor
        </div>
        <h1 className="text-3xl font-semibold">Datos de pago</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registra la cuenta donde quieres recibir tus pagos. Puedes actualizarla cuando sea necesario.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-5 md:p-6 space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Imagen o logo del banco *</div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border p-4 bg-muted/20">
            {datos.banco_logo_url ? (
              <img src={datos.banco_logo_url} alt="Banco o cooperativa" className="w-20 h-20 rounded-xl object-cover border bg-background" />
            ) : (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed grid place-items-center text-muted-foreground bg-background">
                <Landmark className="w-8 h-8" />
              </div>
            )}
            <div className="min-w-0">
              <label className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-background cursor-pointer text-sm font-semibold hover:bg-muted">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {uploading ? "Subiendo…" : datos.banco_logo_url ? "Cambiar imagen" : "Subir imagen"}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(e) => void subirImagen(e.target.files?.[0])} />
              </label>
              <p className="text-[11px] text-muted-foreground mt-2">Obligatorio · JPG, PNG o WEBP · máximo 5 MB.</p>
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

        <button onClick={() => void guardar()} disabled={saving || uploading} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-gradient text-white font-semibold disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando…" : "Guardar datos de pago"}
        </button>
      </div>
    </div>
  );
}
