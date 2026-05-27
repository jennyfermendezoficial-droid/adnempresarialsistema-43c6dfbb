import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Landmark, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AeHeader } from "@/components/AeHeader";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/mis-cuentas-bancarias")({ component: Page });

interface CuentaBancaria {
  id: string;
  nombre: string;
  numero_cuenta: string;
  tipo: string;
  activo: boolean;
}

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CuentaBancaria | null>(null);

  const cargar = async () => {
    if (!uid) return;
    const { data, error } = await supabase.from("ae_cuentas_bancarias").select("*").eq("usuario_id", uid).order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setCuentas((data as CuentaBancaria[]) ?? []);
  };

  useEffect(() => { cargar(); }, [uid]); // eslint-disable-line

  const abrirNueva = () => { setEditing(null); setOpen(true); };
  const abrirEditar = (cuenta: CuentaBancaria) => { setEditing(cuenta); setOpen(true); };

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar esta cuenta bancaria?")) return;
    const { error } = await supabase.from("ae_cuentas_bancarias").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cuenta borrada");
    cargar();
  };

  return (
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
        <AeHeader />

        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <p className="ae-sub mb-1">Para usar en Casa y Negocio</p>
            <h2 className="ae-h1" style={{ fontSize: 28 }}>Mis cuentas bancarias</h2>
          </div>
          <button onClick={abrirNueva} className="ae-btn-ink flex items-center gap-2"><Plus className="w-4 h-4"/> Cuenta</button>
        </div>

        <div className="ae-card p-4 mb-4 text-sm" style={{ color: "var(--ae-ink-soft)" }}>
          Primero crea aquí tus bancos o cooperativas. Luego, al registrar pagos en Casa o Negocio, esas cuentas aparecerán en la lista para escoger.
        </div>

        <div className="space-y-3">
          {cuentas.length === 0 && (
            <div className="ae-card p-6 text-center text-sm" style={{ color: "var(--ae-ink-soft)" }}>
              Aún no tienes cuentas. Ej. Banco Pichincha, Cooperativa JEP, Banco Guayaquil.
            </div>
          )}
          {cuentas.map((cuenta) => (
            <div key={cuenta.id} className="ae-card p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl grid place-items-center flex-shrink-0" style={{ background: "var(--ae-paper)", color: "var(--ae-gold-deep)" }}>
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{cuenta.nombre}</div>
                  <div className="text-[11px] truncate" style={{ color: "var(--ae-ink-soft)" }}>{cuenta.tipo} · {cuenta.numero_cuenta}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => abrirEditar(cuenta)} className="p-2 opacity-60 hover:opacity-100" aria-label="Editar cuenta"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => borrar(cuenta.id)} className="p-2 opacity-50 hover:opacity-100" aria-label="Borrar cuenta"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open && uid && <CuentaModal uid={uid} cuenta={editing} onClose={() => { setOpen(false); setEditing(null); cargar(); }} />}
    </div>
  );
}

function CuentaModal({ uid, cuenta, onClose }: { uid: string; cuenta: CuentaBancaria | null; onClose: () => void }) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [numero, setNumero] = useState(cuenta?.numero_cuenta ?? "");
  const [tipo, setTipo] = useState(cuenta?.tipo ?? "banco");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!nombre.trim() || !numero.trim()) return toast.error("Completa banco/cooperativa y número de cuenta");
    setSaving(true);
    const payload = { usuario_id: uid, nombre: nombre.trim(), numero_cuenta: numero.trim(), tipo, activo: true };
    const { error } = cuenta
      ? await supabase.from("ae_cuentas_bancarias").update(payload).eq("id", cuenta.id)
      : await supabase.from("ae_cuentas_bancarias").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(cuenta ? "Cuenta actualizada" : "Cuenta creada");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="ae-modal" style={{ borderRadius: "24px 24px 0 0" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{cuenta ? "Editar cuenta" : "Nueva cuenta"}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
        </div>
        <div className="space-y-3">
          <div><label className="ae-label">Banco o cooperativa</label><input className="ae-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Banco Pichincha" autoFocus /></div>
          <div><label className="ae-label">Número de cuenta</label><input className="ae-input" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. 2100123456" /></div>
          <div><label className="ae-label">Tipo</label><select className="ae-input" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="banco">Banco</option><option value="cooperativa">Cooperativa</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></div>
        </div>
        <button onClick={guardar} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60">{saving ? "Guardando…" : "Guardar cuenta"}</button>
      </div>
    </div>
  );
}