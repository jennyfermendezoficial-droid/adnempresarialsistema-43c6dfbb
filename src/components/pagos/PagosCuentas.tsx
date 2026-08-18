import { useEffect, useState } from "react";
import { Landmark, Pencil, Plus, Trash2 } from "lucide-react";
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
            <div className="w-10 h-10 rounded-xl grid place-items-center bg-muted"><Landmark className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{c.nombre}</div>
              <div className="text-xs text-muted-foreground truncate capitalize">{c.tipo} · N° {c.numero_cuenta}{c.titular ? ` · ${c.titular}` : ""}</div>
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
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!nombre.trim() || !numero.trim()) return toast.error("Completa banco y número de cuenta");
    setGuardando(true);
    const payload = { nombre: nombre.trim(), tipo, numero_cuenta: numero.trim(), titular: titular.trim() || null, activo: true };
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
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Banco o cooperativa" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
          <option value="corriente">Corriente</option>
          <option value="ahorros">Ahorros</option>
          <option value="cooperativa">Cooperativa</option>
          <option value="efectivo">Caja / efectivo</option>
          <option value="otro">Otro</option>
        </select>
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número de cuenta" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Titular (opcional)" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
