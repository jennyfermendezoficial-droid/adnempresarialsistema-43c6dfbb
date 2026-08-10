import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

interface Bono { id: string; profesor_id: string; tipo: string; monto: number; motivo: string | null; mes: number; anio: number; estado: string; frecuencia: string }

export function PagosBonos({ mes, anio, nombres, puedeEditar, onChanged }: {
  mes: number; anio: number; nombres: Record<string, string>; puedeEditar: boolean; onChanged?: () => void;
}) {
  const { session } = useAuth();
  const [bonos, setBonos] = useState<Bono[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ profesor_id: "", tipo: "desempeño", monto: "", motivo: "" });

  const cargar = async () => {
    const { data, error } = await supabase.from("bonos").select("*").eq("mes", mes).eq("anio", anio).order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setBonos((data as Bono[]) ?? []);
  };
  useEffect(() => { void cargar(); }, [mes, anio]); // eslint-disable-line

  const crear = async () => {
    const monto = Number(form.monto);
    if (!form.profesor_id || !Number.isFinite(monto) || monto <= 0) return toast.error("Elige profesor y monto");
    const { error } = await supabase.from("bonos").insert({
      profesor_id: form.profesor_id, tipo: form.tipo, monto, motivo: form.motivo.trim() || null,
      mes, anio, frecuencia: "una_vez", otorgado_por: session?.user.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Bono otorgado");
    setAbierto(false);
    setForm({ profesor_id: "", tipo: "desempeño", monto: "", motivo: "" });
    void cargar();
    onChanged?.();
  };

  const borrar = async (id: string) => {
    if (!confirm("¿Eliminar bono?")) return;
    const { error } = await supabase.from("bonos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void cargar();
    onChanged?.();
  };

  const total = bonos.reduce((a, b) => a + Number(b.monto), 0);

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Bonos del mes</h2>
          <p className="text-xs text-muted-foreground">Se suman al total a pagar de cada profesor. Total: ${total.toFixed(2)}</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setAbierto(true)} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Otorgar bono
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-3 py-2 font-semibold">Profesor</th>
              <th className="text-left px-3 py-2 font-semibold">Tipo</th>
              <th className="text-right px-3 py-2 font-semibold">Monto</th>
              <th className="text-left px-3 py-2 font-semibold">Motivo</th>
              {puedeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {bonos.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-3 py-2">{nombres[b.profesor_id] || "—"}</td>
                <td className="px-3 py-2">{b.tipo}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">${Number(b.monto).toFixed(2)}</td>
                <td className="px-3 py-2 text-muted-foreground">{b.motivo || "—"}</td>
                {puedeEditar && <td className="px-3 py-2 text-right"><button onClick={() => borrar(b.id)} className="opacity-60 hover:opacity-100 text-destructive" aria-label="Borrar bono"><Trash2 className="w-4 h-4" /></button></td>}
              </tr>
            ))}
            {bonos.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Sin bonos este mes.</td></tr>}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Otorgar bono</h3>
            <select value={form.profesor_id} onChange={(e) => setForm({ ...form, profesor_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
              <option value="">— Profesor —</option>
              {Object.entries(nombres).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Tipo (desempeño, especial…)" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
            <input type="number" step="0.01" min="0" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="Monto" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
            <textarea rows={2} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Motivo (opcional)" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={crear} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
