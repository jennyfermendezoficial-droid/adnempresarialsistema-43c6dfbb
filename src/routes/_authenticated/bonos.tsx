import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bonos")({ component: Page });

interface Bono { id: string; profesor_id: string; tipo: string; monto: number; motivo: string | null; mes: number; anio: number; estado: string; frecuencia: string }
interface Profile { id: string; nombre_completo: string; email: string }

function Page() {
  const { role, session } = useAuth();
  const [bonos, setBonos] = useState<Bono[]>([]);
  const [profs, setProfs] = useState<Profile[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ profesor_id: "", tipo: "desempeño", monto: 0, motivo: "", mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), frecuencia: "una_vez" });

  useEffect(() => {
    supabase.from("bonos").select("*").order("anio", { ascending: false }).order("mes", { ascending: false })
      .then(({ data }) => setBonos((data as Bono[]) ?? []));
    if (role === "admin") {
      (async () => {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "soporte"]);
        const ids = Array.from(new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)));
        if (!ids.length) return;
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,nombre_completo,email")
          .in("id", ids);
        setProfs((ps as Profile[]) ?? []);
      })();
    }
  }, [role]);

  const total = bonos.reduce((a, b) => a + Number(b.monto), 0);

  const crear = async () => {
    if (!form.profesor_id || !form.monto || !session) return;
    const { data, error } = await supabase.from("bonos").insert({ ...form, otorgado_por: session.user.id }).select().single();
    if (error) return toast.error(error.message);
    setBonos((b) => [data as Bono, ...b]);
    setAdding(false);
    toast.success("Bono otorgado");
  };
  const borrar = async (id: string) => {
    if (!confirm("¿Eliminar bono?")) return;
    const { error } = await supabase.from("bonos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setBonos((b) => b.filter((x) => x.id !== id));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-semibold">Bonos</h1>
        {role === "admin" && <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4"/>Otorgar bono</button>}
      </div>
      <p className="text-sm text-muted-foreground mb-6">Total: S/ {total.toFixed(2)}</p>
      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {role === "admin" && <th className="text-left px-3 py-2">Profesor</th>}
              <th className="text-left px-3 py-2">Tipo</th>
              <th className="text-right px-3 py-2">Monto</th>
              <th className="text-left px-3 py-2">Motivo</th>
              <th className="text-left px-3 py-2">Periodo</th>
              <th className="text-left px-3 py-2">Estado</th>
              {role === "admin" && <th></th>}
            </tr>
          </thead>
          <tbody>
            {bonos.map((b) => (
              <tr key={b.id} className="border-t">
                {role === "admin" && <td className="px-3 py-2">{profs.find((p) => p.id === b.profesor_id)?.nombre_completo || "—"}</td>}
                <td className="px-3 py-2">{b.tipo}</td>
                <td className="text-right px-3 py-2 font-semibold">S/ {Number(b.monto).toFixed(2)}</td>
                <td className="px-3 py-2">{b.motivo || "—"}</td>
                <td className="px-3 py-2">{b.mes}/{b.anio}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${b.estado === "pagado" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{b.estado}</span></td>
                {role === "admin" && <td className="px-3 py-2"><button onClick={() => borrar(b.id)} className="opacity-50 hover:opacity-100"><Trash2 className="w-4 h-4"/></button></td>}
              </tr>
            ))}
            {bonos.length === 0 && <tr><td colSpan={role === "admin" ? 7 : 5} className="text-center py-8 text-muted-foreground">Sin bonos.</td></tr>}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onClick={() => setAdding(false)}>
          <div className="bg-card p-6 rounded-2xl max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Otorgar bono</h3>
            <select value={form.profesor_id} onChange={(e) => setForm({ ...form, profesor_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background">
              <option value="">— Profesor —</option>
              {profs.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo || p.email}</option>)}
            </select>
            <input placeholder="Tipo (desempeño, especial…)" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
            <input type="number" step="0.01" placeholder="Monto" value={form.monto || ""} onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg border bg-background" />
            <textarea placeholder="Motivo (opcional)" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={1} max={12} value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })} className="px-3 py-2 rounded-lg border bg-background" />
              <input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} className="px-3 py-2 rounded-lg border bg-background" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button onClick={crear} className="px-4 py-2 rounded-lg bg-violet-gradient text-white">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
