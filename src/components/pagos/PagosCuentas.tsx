import { useEffect, useState } from "react";
import { ImagePlus, Landmark, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CuentaEmpresa } from "./RegistrarAbonoModal";
import { subirImagenBancoEmpresa } from "@/lib/bank-images";

type CuentaConLogo = CuentaEmpresa & { logo_url?: string | null };

export function PagosCuentas({ puedeEditar, onChanged }: { puedeEditar: boolean; onChanged?: () => void }) {
  const [cuentas, setCuentas] = useState<CuentaConLogo[]>([]);
  const [editando, setEditando] = useState<CuentaConLogo | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = async () => {
    const { data, error } = await supabase.from("pagos_cuentas_bancarias").select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setCuentas((data as CuentaConLogo[]) ?? []);
    onChanged?.();
  };
  useEffect(() => { void cargar(); }, []); // eslint-disable-line

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar esta cuenta bancaria?")) return;
    const { error } = await supabase.from("pagos_cuentas_bancarias").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cuenta borrada");
    void cargar();
  };

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Cuentas bancarias de la empresa</h2>
          <p className="text-xs text-muted-foreground">Estas cuentas aparecen al registrar un pago a los profesores.</p>
        </div>
        {puedeEditar && (
          <button onClick={() => { setEditando(null); setAbierto(true); }}
            className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nueva cuenta
          </button>
        )}
      </div>

      <div className="space-y-2">
        {cuentas.length === 0 && <div className="text-sm text-muted-foreground border rounded-xl p-6 text-center">Aún no hay cuentas. Ej. Banco Pichincha · Corriente · N° 2100191103.</div>}
        {cuentas.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border rounded-xl p-3">
            {c.logo_url ? (
              <img src={c.logo_url} alt={c.nombre} className="w-10 h-10 rounded-xl object-cover border bg-background" />
            ) : (
              <div className="w-10 h-10 rounded-xl grid place-items-center bg-muted"><Landmark className="w-5 h-5" /></div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{c.nombre}</div>
              <div className="text-xs text-muted-foreground truncate capitalize">{c.tipo} · N° {c.numero_cuenta}{c.titular ? ` · ${c.titular}` : ""}</div>
            </div>
            {puedeEditar && (
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditando(c); setAbierto(true); }} className="p-2 opacity-60 hover:opacity-100" aria-label="Editar cuenta"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => void borrar(c.id)} className="p-2 opacity-60 hover:opacity-100 text-destructive" aria-label="Borrar cuenta"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {abierto && <ModalCuenta cuenta={editando} onClose={() => { setAbierto(false); setEditando(null); }} onSaved={() => { setAbierto(false); setEditando(null); void cargar(); }} />}
    </div>
  );
}

function ModalCuenta({ cuenta, onClose, onSaved }: { cuenta: CuentaConLogo | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [tipo, setTipo] = useState(cuenta?.tipo ?? "corriente");
  const [numero, setNumero] = useState(cuenta?.numero_cuenta ?? "");
  const [titular, setTitular] = useState(cuenta?.titular ?? "");
  const [logoUrl, setLogoUrl] = useState(cuenta?.logo_url ?? "");
  const [guardando, setGuardando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  const subirLogo = async (file?: File) => {
    if (!file) return;
    setSubiendoLogo(true);
    try {
      const url = await subirImagenBancoEmpresa(file);
      setLogoUrl(url);
      toast.success("Imagen bancaria cargada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setSubiendoLogo(false);
    }
  };

  const guardar = async () => {
    if (!nombre.trim() || !numero.trim() || !titular.trim()) return toast.error("Completa banco, número de cuenta y titular");
    setGuardando(true);
    const payload = {
      nombre: nombre.trim(),
      tipo,
      numero_cuenta: numero.trim(),
      titular: titular.trim(),
      logo_url: logoUrl || null,
      activo: true,
    };
    const { error } = cuenta
      ? await supabase.from("pagos_cuentas_bancarias").update(payload).eq("id", cuenta.id)
      : await supabase.from("pagos_cuentas_bancarias").insert(payload);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(cuenta ? "Cuenta actualizada" : "Cuenta creada");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{cuenta ? "Editar cuenta" : "Nueva cuenta"}</h3>

        <div className="flex items-center gap-3 rounded-xl border p-3 bg-muted/20">
          {logoUrl ? (
            <img src={logoUrl} alt="Imagen del banco" className="w-14 h-14 rounded-xl object-cover border bg-background" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-background border grid place-items-center"><Landmark className="w-6 h-6 text-muted-foreground" /></div>
          )}
          <div>
            <label className="px-3 py-2 rounded-lg border cursor-pointer text-sm inline-flex items-center gap-2 bg-background hover:bg-muted">
              {subiendoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {subiendoLogo ? "Subiendo…" : logoUrl ? "Cambiar imagen" : "Subir imagen / logo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subiendoLogo} onChange={(e) => void subirLogo(e.target.files?.[0])} />
            </label>
            <div className="text-[11px] text-muted-foreground mt-1">JPG, PNG o WEBP · máximo 5 MB.</div>
          </div>
        </div>

        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Banco o cooperativa" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
          <option value="corriente">Corriente</option>
          <option value="ahorros">Ahorros</option>
          <option value="cooperativa">Cooperativa</option>
          <option value="efectivo">Caja / efectivo</option>
          <option value="otro">Otro</option>
        </select>
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número de cuenta" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Titular de la cuenta" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando || subiendoLogo} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
