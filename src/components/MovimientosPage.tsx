import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";

interface Mov { id: string; ambito: string; tipo: string; categoria: string | null; monto: number; descripcion: string | null; fecha: string }

export function MovimientosPage({ ambito, titulo, subtitulo }: { ambito: "negocio" | "casa"; titulo: string; subtitulo: string }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [movs, setMovs] = useState<Mov[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: "ingreso" as "ingreso" | "gasto", categoria: "", monto: "", descripcion: "", fecha: new Date().toISOString().slice(0,10) });

  const cargar = async () => {
    if (!uid) return;
    const { data } = await supabase.from("ae_movimientos").select("*").eq("usuario_id", uid).eq("ambito", ambito).order("fecha", { ascending: false }).limit(100);
    setMovs((data as Mov[]) ?? []);
  };
  useEffect(() => { cargar(); }, [uid, ambito]); // eslint-disable-line

  const total = (t: string) => movs.filter(m => m.tipo === t).reduce((s, m) => s + Number(m.monto), 0);
  const ingresos = total("ingreso");
  const gastos = total("gasto");
  const utilidad = ingresos - gastos;

  const crear = async () => {
    if (saving) return;
    if (!uid || !form.monto) return toast.error("Pon un monto");
    setSaving(true);
    const { error } = await supabase.from("ae_movimientos").insert({
      usuario_id: uid, ambito, tipo: form.tipo, categoria: form.categoria || null,
      monto: Number(form.monto), descripcion: form.descripcion || null, fecha: form.fecha,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setOpen(false); setForm({ ...form, categoria: "", monto: "", descripcion: "" });
    cargar();
  };
  const borrar = async (id: string) => { if (!confirm("¿Borrar?")) return; await supabase.from("ae_movimientos").delete().eq("id", id); cargar(); };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mi Agenda Emprendedora</div>
      <h1 className="text-3xl font-semibold mb-1">{titulo}</h1>
      <p className="text-sm text-muted-foreground mb-5">{subtitulo}</p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card label="Ingresos" value={ingresos} icon={TrendingUp} color="#7A8B6F" />
        <Card label="Gastos"   value={gastos}   icon={TrendingDown} color="#C2756B" />
        <Card label={ambito === "negocio" ? "Utilidad" : "Balance"} value={utilidad} icon={Wallet} color={utilidad >= 0 ? "#7C6BFF" : "#C2756B"} highlight />
      </div>

      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-semibold">Movimientos recientes</div>
        <button onClick={() => setOpen(true)} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-2"><Plus className="w-4 h-4"/> Nuevo</button>
      </div>

      <div className="rounded-2xl border bg-card divide-y">
        {movs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Aún no hay movimientos.</div>}
        {movs.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-full grid place-items-center text-white text-sm`} style={{ background: m.tipo === "ingreso" ? "#7A8B6F" : "#C2756B" }}>
                {m.tipo === "ingreso" ? "+" : "−"}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{m.descripcion || m.categoria || (m.tipo === "ingreso" ? "Ingreso" : "Gasto")}</div>
                <div className="text-xs text-muted-foreground">{m.categoria && <span>{m.categoria} · </span>}{new Date(m.fecha).toLocaleDateString("es-EC")}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="font-semibold tabular-nums" style={{ color: m.tipo === "ingreso" ? "#5a7853" : "#a8584d" }}>
                {m.tipo === "ingreso" ? "+" : "−"}${Number(m.monto).toFixed(2)}
              </div>
              <button onClick={() => borrar(m.id)} className="opacity-50 hover:opacity-100 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-card rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">Nuevo movimiento · {ambito}</h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button onClick={() => setForm({ ...form, tipo: "ingreso" })} className="py-2 rounded-lg border text-sm font-semibold" style={form.tipo === "ingreso" ? { background: "#7A8B6F", color: "white", borderColor: "#7A8B6F" } : {}}>Ingreso</button>
              <button onClick={() => setForm({ ...form, tipo: "gasto" })}   className="py-2 rounded-lg border text-sm font-semibold" style={form.tipo === "gasto"   ? { background: "#C2756B", color: "white", borderColor: "#C2756B" } : {}}>Gasto</button>
            </div>
            <div className="space-y-2">
              <input type="number" step="0.01" placeholder="Monto USD" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <input placeholder="Categoría (ej. ventas, sueldos, comida)" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <input placeholder="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 rounded-lg border bg-background" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={crear} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm disabled:opacity-60">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, icon: Icon, color, highlight }: { label: string; value: number; icon: any; color: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border p-4 bg-card" style={highlight ? { borderColor: color, background: color + "10" } : {}}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-1.5"><Icon className="w-3.5 h-3.5" style={{ color }}/> {label}</div>
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>${value.toFixed(2)}</div>
    </div>
  );
}
