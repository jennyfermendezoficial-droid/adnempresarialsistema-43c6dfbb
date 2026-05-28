import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, X, ChevronRight, ChevronLeft, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { AeHeader } from "@/components/AeHeader";

type Tipo = "gasto fijo" | "gasto variable" | "gasto" | "prestamo" | "ingreso" | "ingreso variable";
interface Categoria { id: string; nombre: string; tipo: Tipo; color: string; icono: string | null; orden: number; ambito: string }
interface Item { id: string; categoria_id: string; nombre: string; descripcion: string | null; valor: number; fecha: string; recurrencia: string; cuenta_pago: string | null }
interface Prestamo { id: string; categoria_id: string | null; tipo: "banco" | "tarjeta" | "personal"; nombre: string; motivo: string | null; deuda_total: number; num_cuotas: number; valor_cuota: number; fecha_primera_cuota: string; observaciones: string | null }
interface Cuota { id: string; prestamo_id: string; numero: number; valor: number; fecha_programada: string; fecha_pago: string | null; estado: "pendiente" | "cancelado" | "atrasado"; observacion: string | null; modificada: boolean }
interface CuentaBancaria { id: string; nombre: string; numero_cuenta: string; tipo: string; activo: boolean }

const PALETA = ["#E94B8C", "#A8D547", "#7C9FE0", "#B47ED4", "#D4A847", "#D87060", "#7CC9B8", "#E0A06B", "#9B8FE0", "#5FAA8E"];
const EMOJIS = ["💰", "🏠", "💡", "👥", "🏦", "📱", "🚗", "🍽️", "📚", "⚕️", "🐾", "✈️", "🎨", "🛠️", "📦"];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function addMonths(date: string, n: number) { const d = new Date(date + "T00:00"); d.setMonth(d.getMonth() + n); return ymd(d); }

export function MovimientosPage({ ambito, titulo, subtitulo }: { ambito: "negocio" | "casa"; titulo: string; subtitulo: string }) {
  const { session } = useAuth();
  const uid = session?.user.id;

  // ----- Mes seleccionado -----
  const [mesAncla, setMesAncla] = useState(() => { const d = new Date(); d.setDate(1); return ymd(d); });
  const mesFin = useMemo(() => addMonths(mesAncla, 1), [mesAncla]);
  const mesLabel = new Date(mesAncla + "T00:00").toLocaleDateString("es-EC", { month: "long", year: "numeric" });

  // ----- Datos -----
  const [cats, setCats] = useState<Categoria[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [cuotasMes, setCuotasMes] = useState<Cuota[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);

  const cargar = async () => {
    if (!uid) return;
    const { data: c } = await supabase.from("ae_cat_gastos").select("*").eq("usuario_id", uid).eq("ambito", ambito).order("orden").order("created_at");
    setCats((c as Categoria[]) ?? []);
    const { data: it } = await supabase.from("ae_items_cat").select("*").eq("usuario_id", uid).gte("fecha", mesAncla).lt("fecha", mesFin).order("fecha", { ascending: false });
    setItems((it as Item[]) ?? []);
    const { data: p } = await supabase.from("ae_prestamos").select("*").eq("usuario_id", uid).eq("ambito", ambito).order("created_at");
    setPrestamos((p as Prestamo[]) ?? []);
    const { data: cu } = await supabase.from("ae_cuotas").select("*").eq("usuario_id", uid).gte("fecha_programada", mesAncla).lt("fecha_programada", mesFin);
    setCuotasMes((cu as Cuota[]) ?? []);
    const { data: cb } = await supabase.from("ae_cuentas_bancarias").select("*").eq("usuario_id", uid).eq("activo", true).order("created_at", { ascending: false });
    setCuentas((cb as CuentaBancaria[]) ?? []);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [uid, ambito, mesAncla]);

  // ----- Modales -----
  const [modalCat, setModalCat] = useState(false);
  const [modalItem, setModalItem] = useState<{ categoria: Categoria; item?: Item } | null>(null);
  const [modalPrestamo, setModalPrestamo] = useState<Categoria | null>(null);
  const [detallePrestamo, setDetallePrestamo] = useState<Prestamo | null>(null);
  const [editCat, setEditCat] = useState<Categoria | null>(null);

  // ----- Totales -----
  const totalCategoria = (cat: Categoria) => {
    if (cat.tipo === "prestamo") {
      const ids = prestamos.filter(p => p.categoria_id === cat.id).map(p => p.id);
      return cuotasMes.filter(q => ids.includes(q.prestamo_id)).reduce((s, q) => s + Number(q.valor), 0);
    }
    return items.filter(i => i.categoria_id === cat.id).reduce((s, i) => s + Number(i.valor), 0);
  };
  const esIngreso = (t: Tipo) => t === "ingreso" || t === "ingreso variable";
  const totalIngresos = cats.filter(c => esIngreso(c.tipo)).reduce((s, c) => s + totalCategoria(c), 0);
  const totalGastos = cats.filter(c => !esIngreso(c.tipo)).reduce((s, c) => s + totalCategoria(c), 0);
  const balance = totalIngresos - totalGastos;

  return (
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
        <AeHeader />

        <div className="flex items-end justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="ae-sub mb-1">{subtitulo}</p>
            <h2 className="ae-h1" style={{ fontSize: 28 }}>{titulo}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setMesAncla(addMonths(mesAncla, -1))} className="w-8 h-8 rounded-full grid place-items-center bg-white border" style={{ borderColor: "var(--ae-line)" }} aria-label="Mes anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="ae-pill capitalize">📅 {mesLabel}</div>
            <button onClick={() => setMesAncla(addMonths(mesAncla, 1))} className="w-8 h-8 rounded-full grid place-items-center bg-white border" style={{ borderColor: "var(--ae-line)" }} aria-label="Mes siguiente">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button onClick={() => setModalCat(true)} className="ae-btn-ink w-full flex items-center justify-center gap-2 mb-5">
          <Plus className="w-4 h-4" /> Crear nueva categoría
        </button>

        {cats.length === 0 && (
          <div className="ae-card p-6 text-center text-sm mb-5" style={{ color: "var(--ae-ink-soft)" }}>
            Aún no tienes categorías. Crea la primera tocando el botón de arriba.<br/>
            <span className="text-xs">Ej. Sueldos, Servicios básicos, Préstamos, Ingresos…</span>
          </div>
        )}

        <div className="space-y-4 mb-5">
          {cats.map(cat => (
            <CategoriaCard
              key={cat.id}
              cat={cat}
              items={items.filter(i => i.categoria_id === cat.id)}
              prestamos={prestamos.filter(p => p.categoria_id === cat.id)}
              cuotasMes={cuotasMes}
              total={totalCategoria(cat)}
              onAdd={() => cat.tipo === "prestamo" ? setModalPrestamo(cat) : setModalItem({ categoria: cat })}
              onEditItem={(item) => setModalItem({ categoria: cat, item })}
              onOpenPrestamo={(p) => setDetallePrestamo(p)}
              onDeleteItem={async (id) => { await supabase.from("ae_items_cat").delete().eq("id", id); cargar(); }}
              onEditCat={() => setEditCat(cat)}
              onDeleteCat={async () => { if (!confirm(`¿Borrar la categoría "${cat.nombre}" y todos sus ítems?`)) return; await supabase.from("ae_cat_gastos").delete().eq("id", cat.id); cargar(); }}
            />
          ))}
        </div>

        {/* Balance */}
        <div className="ae-card p-5" style={{ background: "var(--ae-ink)", color: "var(--ae-cream)" }}>
          <div className="text-xs uppercase tracking-wider opacity-70 mb-1">{ambito === "negocio" ? "Utilidad del mes" : "Balance del mes"}</div>
          <div className="text-3xl font-semibold tabular-nums" style={{ fontFamily: "Fraunces, serif", color: balance >= 0 ? "#A8D547" : "#E94B8C" }}>
            ${balance.toFixed(2)}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
            <div><div className="opacity-70">Ingresos que suman</div><div className="text-lg font-semibold" style={{ color: "#A8D547" }}>+${totalIngresos.toFixed(2)}</div></div>
            <div><div className="opacity-70">Todo lo que descuenta</div><div className="text-lg font-semibold" style={{ color: "#E94B8C" }}>−${totalGastos.toFixed(2)}</div></div>
          </div>
        </div>
      </div>

      {modalCat && uid && <ModalCategoria ambito={ambito} uid={uid} ordenInicial={cats.length} onClose={() => setModalCat(false)} onCreated={(cat, abrirItem) => { setModalCat(false); cargar(); if (abrirItem) { if (cat.tipo === "prestamo") setModalPrestamo(cat); else setModalItem({ categoria: cat }); } }} />}
      {modalItem && uid && <ModalItem uid={uid} categoria={modalItem.categoria} item={modalItem.item} cuentas={cuentas} mesAncla={mesAncla} onClose={() => { setModalItem(null); cargar(); }} onSaved={() => cargar()} />}
      {modalPrestamo && uid && <ModalPrestamo uid={uid} ambito={ambito} categoria={modalPrestamo} onClose={() => { setModalPrestamo(null); cargar(); }} />}
      {detallePrestamo && uid && <ModalDetallePrestamo uid={uid} prestamo={detallePrestamo} onClose={() => { setDetallePrestamo(null); cargar(); }} />}
      {editCat && uid && <ModalEditarCategoria uid={uid} categoria={editCat} onClose={() => setEditCat(null)} onSaved={() => { setEditCat(null); cargar(); }} />}
    </div>
  );
}

// ============== Componentes ==============

function CategoriaCard({ cat, items, prestamos, cuotasMes, total, onAdd, onEditItem, onOpenPrestamo, onDeleteItem, onEditCat, onDeleteCat }: {
  cat: Categoria; items: Item[]; prestamos: Prestamo[]; cuotasMes: Cuota[]; total: number;
  onAdd: () => void; onEditItem: (item: Item) => void; onOpenPrestamo: (p: Prestamo) => void; onDeleteItem: (id: string) => void; onEditCat: () => void; onDeleteCat: () => void;
}) {
  const esPrestamo = cat.tipo === "prestamo";
  const tipoLabel =
    cat.tipo === "ingreso" ? "Ingreso fijo · suma" :
    cat.tipo === "ingreso variable" ? "Ingreso variable · suma" :
    cat.tipo === "gasto fijo" ? "Gasto fijo · descuenta" :
    cat.tipo === "gasto variable" ? "Gasto variable · descuenta" :
    cat.tipo === "prestamo" ? "Préstamo · descuenta" :
    "Gasto general · descuenta";
  return (
    <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "var(--ae-shadow)" }}>
      <div className="p-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${cat.color}, ${cat.color}dd)`, color: "#fff" }}>
        <div className="flex items-center gap-2 min-w-0">
          {cat.icono && <span className="text-xl">{cat.icono}</span>}
          <div className="min-w-0">
            <div className="font-semibold truncate" style={{ fontFamily: "Fraunces, serif", fontSize: 17 }}>{cat.nombre}</div>
            <div className="text-[10px] uppercase tracking-wider opacity-90">{tipoLabel}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums" style={{ fontFamily: "Fraunces, serif" }}>${total.toFixed(2)}</div>
          <div className="flex items-center gap-2 justify-end">
            <button onClick={onEditCat} className="text-[10px] opacity-80 hover:opacity-100 underline">editar</button>
            <button onClick={onDeleteCat} className="text-[10px] opacity-80 hover:opacity-100 underline">borrar</button>
          </div>
        </div>
      </div>
      <div className="p-3">
        {esPrestamo ? (
          <>
            {prestamos.length === 0 && <div className="text-xs text-center py-3" style={{ color: "var(--ae-ink-soft)" }}>Sin préstamos aún.</div>}
            {prestamos.map(p => {
              const cuotasP = cuotasMes.filter(c => c.prestamo_id === p.id);
              const cuotaMes = cuotasP[0];
              return (
                <button key={p.id} onClick={() => onOpenPrestamo(p)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[var(--ae-paper)] text-left">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.nombre}</div>
                    <div className="text-[11px]" style={{ color: "var(--ae-ink-soft)" }}>{p.motivo || p.tipo} · cuota {cuotaMes?.numero ?? "—"}/{p.num_cuotas}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold tabular-nums text-sm">${(cuotaMes?.valor ?? 0).toFixed(2)}</span>
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  </div>
                </button>
              );
            })}
          </>
        ) : (
          <>
            {items.length === 0 && <div className="text-xs text-center py-3" style={{ color: "var(--ae-ink-soft)" }}>Sin ítems este mes.</div>}
            {items.map(it => (
              <div key={it.id} className="flex items-center justify-between p-2.5 border-b last:border-b-0" style={{ borderColor: "var(--ae-line)" }}>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{it.nombre}</div>
                  <div className="text-[11px]" style={{ color: "var(--ae-ink-soft)" }}>
                    {it.descripcion && <span>{it.descripcion} · </span>}
                    {new Date(it.fecha + "T00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" })}{it.cuenta_pago ? ` · ${it.cuenta_pago}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-sm">${Number(it.valor).toFixed(2)}</span>
                  <button onClick={() => onEditItem(it)} className="opacity-50 hover:opacity-100 p-1" aria-label="Editar ítem"><Pencil className="w-3.5 h-3.5"/></button>
                  <button onClick={() => onDeleteItem(it.id)} className="opacity-40 hover:opacity-90 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            ))}
          </>
        )}
        <button onClick={onAdd} className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold border border-dashed flex items-center justify-center gap-2" style={{ borderColor: cat.color, color: cat.color }}>
          <Plus className="w-4 h-4" /> {esPrestamo ? "Añadir préstamo" : `Añadir ítem en ${cat.nombre}`}
        </button>
      </div>
    </div>
  );
}

function ModalShell({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm grid place-items-end sm:place-items-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--ae-cream)] w-full sm:max-w-md p-5 max-h-[92vh] overflow-y-auto" style={{ borderRadius: "24px 24px 0 0" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold" style={{ fontFamily: "Fraunces, serif" }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: "var(--ae-paper)", color: "var(--ae-ink-soft)" }}><X className="w-4 h-4"/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalCategoria({ ambito, uid, ordenInicial, onClose, onCreated }: { ambito: "negocio" | "casa"; uid: string; ordenInicial: number; onClose: () => void; onCreated: (cat: Categoria, abrirItem: boolean) => void }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<Tipo>("gasto variable");
  const [color, setColor] = useState(PALETA[0]);
  const [icono, setIcono] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const crear = async (abrir: boolean) => {
    if (!nombre.trim()) return toast.error("Ponle un nombre");
    setSaving(true);
    const { data, error } = await supabase.from("ae_cat_gastos").insert({ usuario_id: uid, ambito, nombre, tipo, color, icono, orden: ordenInicial }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    onCreated(data as Categoria, abrir);
  };

  return (
    <ModalShell title="Crear categoría" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="ae-label">Nombre</label><input className="ae-input" placeholder="Ej. Sueldos, Servicios básicos…" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus/></div>
        <div>
          <label className="ae-label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {([["gasto","Gasto"],["gasto variable","Gasto variable"],["gasto fijo","Gasto fijo"],["prestamo","Préstamos"],["ingreso","Ingreso fijo"],["ingreso variable","Ingreso variable"]] as [Tipo,string][]).map(([v, l]) => (
              <button key={v} onClick={() => setTipo(v)} className="py-2 rounded-xl text-xs font-semibold border" style={tipo === v ? { background: "var(--ae-ink)", color: "#fff", borderColor: "var(--ae-ink)" } : { borderColor: "var(--ae-line)" }}>{l}</button>
            ))}
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: "var(--ae-ink-soft)" }}>
            {tipo === "gasto" && "Gasto general que se descuenta del balance (compras, pagos varios)."}
            {tipo === "gasto fijo" && "Mismo valor cada mes (arriendo, sueldos)."}
            {tipo === "gasto variable" && "Gasto que cambia cada mes (luz, agua, alimentación)."}
            {tipo === "prestamo" && "Préstamos con cuotas — tendrá un flujo especial."}
            {tipo === "ingreso" && "Ingreso fijo que suma al balance (sueldo, mesada)."}
            {tipo === "ingreso variable" && "Ingreso que cambia cada mes (ventas, comisiones, propinas)."}
          </div>
        </div>
        <div>
          <label className="ae-label">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PALETA.map(c => (
              <button key={c} onClick={() => setColor(c)} className="w-8 h-8 rounded-full border-2" style={{ background: c, borderColor: color === c ? "var(--ae-ink)" : "transparent" }}/>
            ))}
          </div>
        </div>
        <div>
          <label className="ae-label">Ícono (opcional)</label>
          <div className="flex gap-1.5 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setIcono(icono === e ? null : e)} className="w-9 h-9 rounded-xl border text-lg grid place-items-center" style={icono === e ? { background: "var(--ae-ink)", borderColor: "var(--ae-ink)" } : { borderColor: "var(--ae-line)", background: "#fff" }}>{e}</button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={() => crear(true)} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60">
        {saving ? "Creando…" : "Crear y empezar a añadir ítems"}
      </button>
      <button onClick={() => crear(false)} disabled={saving} className="w-full mt-2 py-2.5 text-sm font-semibold" style={{ color: "var(--ae-ink-soft)" }}>
        Solo crear categoría
      </button>
    </ModalShell>
  );
}

function ModalItem({ uid, categoria, item, cuentas, mesAncla, onClose, onSaved }: { uid: string; categoria: Categoria; item?: Item; cuentas: CuentaBancaria[]; mesAncla: string; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(item);
  const fechaDefault = mesAncla;
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [desc, setDesc] = useState(item?.descripcion ?? "");
  const [valor, setValor] = useState(item ? String(item.valor) : "");
  const [fecha, setFecha] = useState(item?.fecha ?? fechaDefault);
  const [cuenta, setCuenta] = useState(item?.cuenta_pago ?? "");
  const [recur, setRecur] = useState<"ninguna" | "mismo_valor" | "mismo_concepto">((item?.recurrencia as "ninguna" | "mismo_valor" | "mismo_concepto" | undefined) ?? (categoria.tipo === "gasto fijo" ? "mismo_valor" : "ninguna"));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);

  const guardar = async (continuar: boolean) => {
    if (!nombre.trim() || !valor) return toast.error("Nombre y valor son obligatorios");
    setSaving(true);
    const payload = { usuario_id: uid, categoria_id: categoria.id, nombre, descripcion: desc || null, valor: Number(valor), fecha, recurrencia: recur, cuenta_pago: cuenta.trim() || null };
    const { error } = editing && item
      ? await supabase.from("ae_items_cat").update(payload).eq("id", item.id)
      : await supabase.from("ae_items_cat").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Ítem actualizado" : "Ítem guardado");
    onSaved();
    if (continuar && !editing) {
      setFlash(true); setTimeout(() => setFlash(false), 600);
      setNombre(""); setDesc(""); setValor(""); setCuenta("");
    } else {
      onClose();
    }
  };

  return (
    <ModalShell title={`${editing ? "Editar" : "Añadir"} en ${categoria.nombre}`} onClose={onClose}>
      {!editing && <div className="rounded-xl p-2.5 mb-3 text-[11px] font-semibold flex items-center gap-2" style={{ background: "#E8F4E1", color: "#3D6B2F" }}>
        <Check className="w-3.5 h-3.5"/> Captura rápida: al guardar y añadir otro, el formulario se limpia para el siguiente.
      </div>}
      {flash && <div className="rounded-xl p-2 mb-2 text-xs font-semibold text-center" style={{ background: "#A8D547", color: "#1F1B16" }}>✓ Guardado</div>}
      <div className="space-y-3">
        <div><label className="ae-label">Nombre del ítem</label><input className="ae-input" placeholder="Ej. Pago de luz" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus/></div>
        <div><label className="ae-label">Descripción (opcional)</label><input className="ae-input" placeholder="Ej. Empresa Eléctrica – mayo" value={desc} onChange={(e) => setDesc(e.target.value)}/></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="ae-label">Valor (USD)</label><input type="number" step="0.01" className="ae-input" placeholder="0.00" value={valor} onChange={(e) => setValor(e.target.value)}/></div>
          <div><label className="ae-label">Fecha</label><input type="date" className="ae-input" value={fecha} onChange={(e) => setFecha(e.target.value)}/></div>
        </div>
        <div><label className="ae-label">Cuenta bancaria / método de pago</label><select className="ae-input" value={cuenta} onChange={(e) => setCuenta(e.target.value)}><option value="">{cuentas.length ? "Sin cuenta específica" : "Primero crea una cuenta en Mis cuentas bancarias"}</option>{cuentas.map(c => <option key={c.id} value={`${c.nombre} – ${c.numero_cuenta}`}>{c.nombre} – {c.numero_cuenta}</option>)}</select></div>
        <div>
          <label className="ae-label">¿Se repite cada mes?</label>
          <div className="grid grid-cols-3 gap-1.5">
            {([["ninguna","Solo este mes"],["mismo_valor","Mismo valor"],["mismo_concepto","Concepto, valor cambia"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setRecur(v)} className="py-2 rounded-xl text-[11px] font-semibold border" style={recur === v ? { background: categoria.color, color: "#fff", borderColor: categoria.color } : { borderColor: "var(--ae-line)" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      {!editing && <button onClick={() => guardar(true)} disabled={saving} className="ae-btn-ink w-full mt-4 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar y añadir otro ↓"}
      </button>}
      <button onClick={() => guardar(false)} disabled={saving} className="w-full mt-2 py-2.5 text-sm font-semibold" style={{ color: "var(--ae-ink-soft)" }}>
        {editing ? "Guardar cambios" : "Guardar y cerrar"}
      </button>
    </ModalShell>
  );
}

function ModalPrestamo({ uid, ambito, categoria, onClose }: { uid: string; ambito: "negocio" | "casa"; categoria: Categoria; onClose: () => void }) {
  const [tipo, setTipo] = useState<"banco" | "tarjeta" | "personal">("banco");
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");
  const [deuda, setDeuda] = useState("");
  const [cuotas, setCuotas] = useState("12");
  const [valor, setValor] = useState("");
  const [fecha, setFecha] = useState(ymd(new Date()));
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-calc cuota
  useEffect(() => {
    const d = Number(deuda), n = Number(cuotas);
    if (d > 0 && n > 0) setValor((d / n).toFixed(2));
  }, [deuda, cuotas]);

  const crear = async () => {
    if (!nombre.trim() || !deuda || !valor || !cuotas) return toast.error("Faltan datos");
    setSaving(true);
    const { data: pres, error } = await supabase.from("ae_prestamos").insert({
      usuario_id: uid, ambito, categoria_id: categoria.id, tipo, nombre, motivo: motivo || null,
      deuda_total: Number(deuda), num_cuotas: Number(cuotas), valor_cuota: Number(valor),
      fecha_primera_cuota: fecha, observaciones: obs || null,
    }).select().single();
    if (error || !pres) { setSaving(false); return toast.error(error?.message || "Error"); }
    // Generar cuotas
    const rows = Array.from({ length: Number(cuotas) }, (_, i) => {
      const fc = new Date(fecha + "T00:00"); fc.setMonth(fc.getMonth() + i);
      return { prestamo_id: (pres as Prestamo).id, usuario_id: uid, numero: i + 1, valor: Number(valor), fecha_programada: ymd(fc), estado: "pendiente" as const };
    });
    await supabase.from("ae_cuotas").insert(rows);
    setSaving(false);
    toast.success("Préstamo creado con sus cuotas");
    onClose();
  };

  return (
    <ModalShell title={`Nuevo préstamo en ${categoria.nombre}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="ae-label">Tipo</label>
          <div className="grid grid-cols-3 gap-1.5">
            {([["banco","Banco"],["tarjeta","Tarjeta"],["personal","Personal"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTipo(v)} className="py-2 rounded-xl text-xs font-semibold border" style={tipo === v ? { background: "var(--ae-ink)", color: "#fff", borderColor: "var(--ae-ink)" } : { borderColor: "var(--ae-line)" }}>{l}</button>
            ))}
          </div>
        </div>
        <div><label className="ae-label">Entidad / nombre</label><input className="ae-input" placeholder="Ej. Banco Pichincha" value={nombre} onChange={(e) => setNombre(e.target.value)}/></div>
        <div><label className="ae-label">Motivo</label><input className="ae-input" placeholder="Ej. Maquinaria" value={motivo} onChange={(e) => setMotivo(e.target.value)}/></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="ae-label">Deuda total</label><input type="number" step="0.01" className="ae-input" placeholder="0.00" value={deuda} onChange={(e) => setDeuda(e.target.value)}/></div>
          <div><label className="ae-label"># cuotas</label><input type="number" className="ae-input" value={cuotas} onChange={(e) => setCuotas(e.target.value)}/></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="ae-label">Valor cuota</label><input type="number" step="0.01" className="ae-input" value={valor} onChange={(e) => setValor(e.target.value)}/></div>
          <div><label className="ae-label">1ª cuota</label><input type="date" className="ae-input" value={fecha} onChange={(e) => setFecha(e.target.value)}/></div>
        </div>
        <div><label className="ae-label">Observaciones</label><textarea rows={2} className="ae-input" value={obs} onChange={(e) => setObs(e.target.value)}/></div>
      </div>
      <button onClick={crear} disabled={saving} className="ae-btn-ink w-full mt-4 disabled:opacity-60">
        {saving ? "Creando…" : "Crear préstamo y generar cuotas"}
      </button>
    </ModalShell>
  );
}

function ModalDetallePrestamo({ uid, prestamo, onClose }: { uid: string; prestamo: Prestamo; onClose: () => void }) {
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [editar, setEditar] = useState<Cuota | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from("ae_cuotas").select("*").eq("prestamo_id", prestamo.id).order("numero");
    setCuotas((data as Cuota[]) ?? []);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [prestamo.id]);

  const pagadas = cuotas.filter(c => c.estado === "cancelado");
  const pagado = pagadas.reduce((s, c) => s + Number(c.valor), 0);
  const pendiente = cuotas.filter(c => c.estado !== "cancelado").reduce((s, c) => s + Number(c.valor), 0);
  const progreso = cuotas.length ? (pagadas.length / cuotas.length) * 100 : 0;

  const borrarPrestamo = async () => {
    if (!confirm(`¿Borrar el préstamo "${prestamo.nombre}" y todas sus cuotas?`)) return;
    await supabase.from("ae_prestamos").delete().eq("id", prestamo.id);
    onClose();
  };

  return (
    <ModalShell title={prestamo.nombre} onClose={onClose}>
      <div className="text-xs mb-3" style={{ color: "var(--ae-ink-soft)" }}>{prestamo.motivo} · {prestamo.tipo}</div>
      <div className="rounded-2xl p-4 mb-4" style={{ background: "#7C9FE0", color: "#fff" }}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><div className="text-[10px] opacity-80 uppercase">Deuda total</div><div className="text-lg font-bold tabular-nums">${Number(prestamo.deuda_total).toFixed(2)}</div></div>
          <div><div className="text-[10px] opacity-80 uppercase">Cuota mensual</div><div className="text-lg font-bold tabular-nums">${Number(prestamo.valor_cuota).toFixed(2)}</div></div>
          <div><div className="text-[10px] opacity-80 uppercase">Pagado ({pagadas.length})</div><div className="text-sm font-bold tabular-nums">${pagado.toFixed(2)}</div></div>
          <div><div className="text-[10px] opacity-80 uppercase">Pendiente ({cuotas.length - pagadas.length})</div><div className="text-sm font-bold tabular-nums">${pendiente.toFixed(2)}</div></div>
        </div>
        <div className="h-2 rounded-full bg-white/30 overflow-hidden"><div className="h-full bg-white" style={{ width: `${progreso}%` }}/></div>
        <div className="text-[10px] mt-1 opacity-90">{progreso.toFixed(0)}% pagado</div>
      </div>
      <div className="ae-eyebrow mb-2">Cuotas</div>
      <div className="space-y-1.5 mb-3 max-h-72 overflow-y-auto">
        {cuotas.map(c => {
          const bg = c.estado === "cancelado" ? "#E8F4E1" : "#fff";
          const bd = c.estado === "cancelado" ? "#A8D547" : "var(--ae-line)";
          return (
            <button key={c.id} onClick={() => setEditar(c)} className="w-full flex items-center justify-between p-2.5 rounded-xl border text-left" style={{ background: bg, borderColor: bd }}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="font-bold text-xs w-12">{c.numero}/{prestamo.num_cuotas}</div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{new Date(c.fecha_programada + "T00:00").toLocaleDateString("es-EC", { month: "short", year: "numeric" })}</div>
                  {c.observacion && <div className="text-[10px] italic truncate" style={{ color: "var(--ae-ink-soft)" }}>{c.observacion}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.modificada && <Pencil className="w-3 h-3 opacity-50"/>}
                <span className="font-semibold tabular-nums text-sm">${Number(c.valor).toFixed(2)}</span>
                <span className="text-[10px] uppercase font-bold" style={{ color: c.estado === "cancelado" ? "#3D6B2F" : "var(--ae-ink-soft)" }}>{c.estado === "cancelado" ? "✓" : c.estado.slice(0,3)}</span>
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={borrarPrestamo} className="w-full py-2 text-xs font-semibold" style={{ color: "#C2756B" }}>Borrar este préstamo</button>
      {editar && <ModalEditarCuota uid={uid} cuota={editar} valorBase={Number(prestamo.valor_cuota)} onClose={() => { setEditar(null); cargar(); }}/>}
    </ModalShell>
  );
}

function ModalEditarCuota({ uid: _uid, cuota, valorBase, onClose }: { uid: string; cuota: Cuota; valorBase: number; onClose: () => void }) {
  const [estado, setEstado] = useState(cuota.estado);
  const [valor, setValor] = useState(String(cuota.valor));
  const [fechaPago, setFechaPago] = useState(cuota.fecha_pago || ymd(new Date()));
  const [obs, setObs] = useState(cuota.observacion || "");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    setSaving(true);
    const modificada = Number(valor) !== valorBase || (obs.trim().length > 0);
    const { error } = await supabase.from("ae_cuotas").update({
      estado, valor: Number(valor),
      fecha_pago: estado === "cancelado" ? fechaPago : null,
      observacion: obs || null, modificada,
    }).eq("id", cuota.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cuota actualizada");
    onClose();
  };

  return (
    <ModalShell title={`Cuota ${cuota.numero}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="ae-label">Estado</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["pendiente","cancelado","atrasado"] as const).map(s => (
              <button key={s} onClick={() => setEstado(s)} className="py-2 rounded-xl text-xs font-semibold border capitalize" style={estado === s ? { background: "var(--ae-ink)", color: "#fff", borderColor: "var(--ae-ink)" } : { borderColor: "var(--ae-line)" }}>{s}</button>
            ))}
          </div>
        </div>
        <div><label className="ae-label">Valor de la cuota</label><input type="number" step="0.01" className="ae-input" value={valor} onChange={(e) => setValor(e.target.value)}/></div>
        {estado === "cancelado" && (
          <div><label className="ae-label">Fecha real de pago</label><input type="date" className="ae-input" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)}/></div>
        )}
        <div><label className="ae-label">Observación</label><textarea rows={2} className="ae-input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej. Subió por reajuste"/></div>
      </div>
      <button onClick={guardar} disabled={saving} className="ae-btn-ink w-full mt-4 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
    </ModalShell>
  );
}

function ModalEditarCategoria({ uid, categoria, onClose, onSaved }: { uid: string; categoria: Categoria; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState(categoria.nombre);
  const [tipo, setTipo] = useState<Tipo>(categoria.tipo);
  const [color, setColor] = useState(categoria.color);
  const [icono, setIcono] = useState<string | null>(categoria.icono);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) return toast.error("Ponle un nombre");
    setSaving(true);
    const { error } = await supabase.from("ae_cat_gastos").update({ nombre, tipo, color, icono }).eq("id", categoria.id).eq("usuario_id", uid);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Categoría actualizada");
    onSaved();
  };

  return (
    <ModalShell title="Editar categoría" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="ae-label">Nombre</label><input className="ae-input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus/></div>
        <div>
          <label className="ae-label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {([["gasto","Gasto"],["gasto variable","Gasto variable"],["gasto fijo","Gasto fijo"],["prestamo","Préstamos"],["ingreso","Ingreso fijo"],["ingreso variable","Ingreso variable"]] as [Tipo,string][]).map(([v, l]) => (
              <button key={v} onClick={() => setTipo(v)} className="py-2 rounded-xl text-xs font-semibold border" style={tipo === v ? { background: "var(--ae-ink)", color: "#fff", borderColor: "var(--ae-ink)" } : { borderColor: "var(--ae-line)" }}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="ae-label">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PALETA.map(c => (
              <button key={c} onClick={() => setColor(c)} className="w-8 h-8 rounded-full border-2" style={{ background: c, borderColor: color === c ? "var(--ae-ink)" : "transparent" }}/>
            ))}
          </div>
        </div>
        <div>
          <label className="ae-label">Ícono (opcional)</label>
          <div className="flex gap-1.5 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setIcono(icono === e ? null : e)} className="w-9 h-9 rounded-xl border text-lg grid place-items-center" style={icono === e ? { background: "var(--ae-ink)", borderColor: "var(--ae-ink)" } : { borderColor: "var(--ae-line)", background: "#fff" }}>{e}</button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={guardar} disabled={saving} className="ae-btn-ink w-full mt-5 disabled:opacity-60">
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
    </ModalShell>
  );
}
