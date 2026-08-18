import { useEffect, useRef, useState } from "react";
import { ImagePlus, Landmark, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CuentaEmpresa } from "./RegistrarAbonoModal";

export function PagosCuentas({ puedeEditar, onChanged }: { puedeEditar: boolean; onChanged?: () => void }) {
  const [cuentas, setCuentas] = useState<CuentaEmpresa[]>([]);
  const [editando, setEditando] = useState<CuentaEmpresa | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = async () => {
    const { data, error } = await supabase.from("pagos_cuentas_bancarias").select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setCuentas((data as CuentaEmpresa[]) ?? []);
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
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Cuentas bancarias del administrador</h2>
          <p className="text-xs text-muted-foreground mt-1">Registra las cuentas desde las que se realizan los pagos a profesores. El logo queda visible al momento de registrar el pago.</p>
        </div>
        {puedeEditar && (
          <button onClick={() => { setEditando(null); setAbierto(true); }}
            className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nueva cuenta
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {cuentas.length === 0 && <div className="md:col-span-2 text-sm text-muted-foreground border rounded-xl p-7 text-center">Aún no hay cuentas. Registra banco, tipo, número, titular y su imagen.</div>}
        {cuentas.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border rounded-2xl p-4 bg-background/50">
            {c.imagen_url ? (
              <img src={c.imagen_url} alt={c.nombre} className="w-14 h-14 rounded-xl object-contain border bg-white p-1 flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-xl grid place-items-center bg-muted flex-shrink-0"><Landmark className="w-6 h-6" /></div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{c.nombre}</div>
              <div className="text-xs text-muted-foreground truncate capitalize">{c.tipo} · N° {c.numero_cuenta}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">Titular: {c.titular || "Sin titular"}</div>
            </div>
            {puedeEditar && (
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditando(c); setAbierto(true); }} className="p-2 opacity-60 hover:opacity-100" aria-label="Editar cuenta"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => borrar(c.id)} className="p-2 opacity-60 hover:opacity-100 text-destructive" aria-label="Borrar cuenta"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {abierto && <ModalCuenta cuenta={editando} onClose={() => { setAbierto(false); setEditando(null); }} onSaved={() => { setAbierto(false); setEditando(null); void cargar(); }} />}
    </div>
  );
}

function ModalCuenta({ cuenta, onClose, onSaved }: { cuenta: CuentaEmpresa | null; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [tipo, setTipo] = useState(cuenta?.tipo ?? "corriente");
  const [numero, setNumero] = useState(cuenta?.numero_cuenta ?? "");
  const [titular, setTitular] = useState(cuenta?.titular ?? "");
  const [imagenUrl, setImagenUrl] = useState(cuenta?.imagen_url ?? "");
  const [imagen, setImagen] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(cuenta?.imagen_url ?? null);
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const escogerImagen = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Selecciona una imagen del banco");
    if (file.size > 5 * 1024 * 1024) return toast.error("La imagen no puede superar 5 MB");
    setImagen(file);
    const r = new FileReader();
    r.onload = () => setPreview(String(r.result));
    r.readAsDataURL(file);
  };

  const guardar = async () => {
    if (!nombre.trim() || !numero.trim() || !titular.trim()) return toast.error("Completa banco, número de cuenta y titular");
    if (!cuenta && !imagen && !imagenUrl) return toast.error("Agrega la imagen o logo del banco");
    setGuardando(true);

    let urlFinal = imagenUrl || null;
    if (imagen) {
      const ext = imagen.name.split(".").pop()?.toLowerCase() || "png";
      const path = `cuentas/${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("pagos-bancos").upload(path, imagen, { upsert: false });
      if (upErr) { setGuardando(false); return toast.error(upErr.message); }
      const { data } = supabase.storage.from("pagos-bancos").getPublicUrl(path);
      urlFinal = data.publicUrl;
    }

    const payload = {
      nombre: nombre.trim(),
      tipo,
      numero_cuenta: numero.trim(),
      titular: titular.trim(),
      imagen_url: urlFinal,
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
      <div className="w-full max-w-lg rounded-2xl border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{cuenta ? "Editar cuenta" : "Nueva cuenta bancaria"}</h3>
            <p className="text-xs text-muted-foreground">Cuenta de origen usada por administración.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed p-3 mb-4 flex items-center gap-4 text-left hover:bg-muted/30">
          {preview ? <img src={preview} alt="Logo del banco" className="w-16 h-16 rounded-xl object-contain border bg-white p-1" /> : <div className="w-16 h-16 rounded-xl bg-muted grid place-items-center"><ImagePlus className="w-6 h-6" /></div>}
          <div>
            <div className="text-sm font-semibold">Imagen / logo del banco *</div>
            <div className="text-xs text-muted-foreground">PNG, JPG o WEBP · máximo 5 MB</div>
          </div>
        </button>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && escogerImagen(e.target.files[0])} />

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="text-xs font-medium">Banco o cooperativa *</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Banco Pichincha" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm" /></div>
          <div><label className="text-xs font-medium">Tipo de cuenta *</label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm"><option value="corriente">Corriente</option><option value="ahorros">Ahorros</option><option value="cooperativa">Cooperativa</option><option value="efectivo">Caja / efectivo</option><option value="otro">Otro</option></select></div>
          <div><label className="text-xs font-medium">Número de cuenta *</label><input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número de cuenta" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm" /></div>
          <div className="sm:col-span-2"><label className="text-xs font-medium">Titular *</label><input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre del titular" className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm" /></div>
        </div>

        <div className="flex justify-end gap-2 pt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar cuenta"}</button>
        </div>
      </div>
    </div>
  );
}
