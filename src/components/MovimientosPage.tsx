import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, X } from "lucide-react";
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

  // Agrupar gastos por categoría
  const porCategoria = (() => {
    const map = new Map<string, { total: number; items: Mov[] }>();
    movs.filter(m => m.tipo === "gasto").forEach((m) => {
      const k = (m.categoria || "Sin categoría").trim();
      const cur = map.get(k) || { total: 0, items: [] };
      cur.total += Number(m.monto); cur.items.push(m);
      map.set(k, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  })();

  const COLOR_CAT = ["#B8894A", "#C2756B", "#8B6B8B", "#6B8AA8", "#7A8B6F"];

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
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
        <div className="ae-eyebrow mb-1">Mi Agenda Emprendedora</div>
        <h1 className="ae-h1 mb-1">{titulo}</h1>
        <p className="ae-sub mb-5">{subtitulo}</p>

      <div className="ae-balance mb-5">
        <div className="ae-balance-label">{ambito === "negocio" ? "Utilidad del mes" : "Balance del mes"}</div>
        <div className="ae-balance-value">${utilidad.toFixed(2)}</div>
        <div className="ae-balance-grid">
          <div><small>Ingresos</small><strong style={{ color: "#A8C49D" }}>+${ingresos.toFixed(2)}</strong></div>
          <div><small>Gastos</small><strong style={{ color: "#E2A399" }}>−${gastos.toFixed(2)}</strong></div>
        </div>
      </div>

      {porCategoria.length > 0 && (
        <>
          <div className="ae-eyebrow mb-2">Gastos por categoría</div>
          <div className="space-y-3 mb-5">
            {porCategoria.map(([cat, info], i) => (
              <div key={cat} className="ae-cat-card" style={{ borderLeftColor: COLOR_CAT[i % COLOR_CAT.length] }}>
                <div className="flex justify-between items-baseline mb-2">
                  <div className="font-semibold" style={{ fontFamily: "Fraunces, serif", fontSize: 15 }}>{cat}</div>
                  <div className="ae-cat-total">${info.total.toFixed(2)}</div>
                </div>
                <div className="space-y-1">
                  {info.items.slice(0, 3).map((m) => (
                    <div key={m.id} className="flex justify-between items-center text-xs" style={{ color: "var(--ae-ink-soft)" }}>
                      <span className="truncate">{m.descripcion || "—"} <span className="opacity-60">· {new Date(m.fecha).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</span></span>
                      <span className="ae-exp-value">${Number(m.monto).toFixed(2)}</span>
                    </div>
                  ))}
                  {info.items.length > 3 && (
                    <div className="text-[11px] pt-1" style={{ color: "var(--ae-ink-soft)" }}>+{info.items.length - 3} más</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="ae-eyebrow mb-2">Movimientos recientes</div>
      <div className="ae-card mb-4">
        {movs.length === 0 && <div className="p-8 text-center text-sm" style={{ color: "var(--ae-ink-soft)" }}>Aún no hay movimientos.</div>}
        {movs.slice(0, 12).map((m, i) => (
          <div key={m.id} className="flex items-center justify-between p-3.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--ae-line)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full grid place-items-center text-white text-sm font-bold" style={{ background: m.tipo === "ingreso" ? "var(--ae-sage)" : "var(--ae-rose)" }}>
                {m.tipo === "ingreso" ? "+" : "−"}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{m.descripcion || m.categoria || (m.tipo === "ingreso" ? "Ingreso" : "Gasto")}</div>
                <div className="text-[11px]" style={{ color: "var(--ae-ink-soft)" }}>{m.categoria && <span className="ae-tag mr-1">{m.categoria}</span>}{new Date(m.fecha).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="ae-exp-value tabular-nums" style={{ color: m.tipo === "ingreso" ? "var(--ae-sage)" : "var(--ae-rose)" }}>
                {m.tipo === "ingreso" ? "+" : "−"}${Number(m.monto).toFixed(2)}
              </div>
              <button onClick={() => borrar(m.id)} className="opacity-40 hover:opacity-90 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setOpen(true)} className="ae-btn-ink w-full flex items-center justify-center gap-2"><Plus className="w-4 h-4"/> Nuevo movimiento</button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center z-50 p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="ae-modal" style={{ borderRadius: "24px 24px 0 0" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-semibold capitalize" style={{ fontFamily: "Fraunces, serif" }}>Nuevo movimiento</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setForm({ ...form, tipo: "ingreso" })} className="py-2.5 rounded-xl border text-sm font-semibold transition" style={form.tipo === "ingreso" ? { background: "var(--ae-sage)", color: "#fff", borderColor: "var(--ae-sage)" } : { borderColor: "var(--ae-line)" }}>Ingreso</button>
              <button onClick={() => setForm({ ...form, tipo: "gasto" })}   className="py-2.5 rounded-xl border text-sm font-semibold transition" style={form.tipo === "gasto"   ? { background: "var(--ae-rose)", color: "#fff", borderColor: "var(--ae-rose)" } : { borderColor: "var(--ae-line)" }}>Gasto</button>
            </div>
            <div className="space-y-3">
              <div><label className="ae-label">Monto (USD)</label><input type="number" step="0.01" placeholder="0.00" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className="ae-input"/></div>
              <div><label className="ae-label">Categoría</label><input placeholder={ambito === "negocio" ? "Ventas, sueldos, marketing…" : "Comida, servicios, transporte…"} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="ae-input"/></div>
              <div><label className="ae-label">Descripción</label><input placeholder="¿De qué se trata?" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="ae-input"/></div>
              <div><label className="ae-label">Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="ae-input"/></div>
            </div>
            <button onClick={crear} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60">
              {saving ? "Guardando…" : "Guardar movimiento"}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
