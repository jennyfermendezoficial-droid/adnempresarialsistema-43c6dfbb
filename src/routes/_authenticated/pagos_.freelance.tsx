import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileText, Loader2, Plus, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";
import { listaMeses } from "@/lib/pagos-export";
import { formatNombre } from "@/lib/nombres";
import { CalendarioActividades } from "@/components/CalendarioActividades";
import { generarResumenFreelance, leerComprobanteGratis } from "@/lib/freelance-ia.functions";

export const Route = createFileRoute("/_authenticated/pagos_/freelance")({
  head: () => ({ meta: [
    { title: "Pagos freelance · ADN Empresarial" },
    { name: "description", content: "Actividades, pagos e informes mensuales de los freelancers." },
    { property: "og:title", content: "Pagos freelance · ADN Empresarial" },
    { property: "og:description", content: "Actividades, pagos e informes mensuales de los freelancers." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type Usuario = { id: string; nombre_completo: string | null; email: string | null; avatar_url: string | null; seleccionado: boolean };
type Miembro = { usuario_id: string; area: string | null; modalidad: string; tarifa_hora: number; monto_fijo: number; tarifa_actividad: number; activo: boolean };
type Cuenta = { usuario_id: string; banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null; titular_cuenta: string | null; cedula_titular: string | null };
type Act = { id: string; usuario_id: string; fecha: string; titulo: string; descripcion: string | null; horas: number; archivo_path: string | null; archivo_nombre: string | null; hora_inicio?: string | null; hora_fin?: string | null; archivo_tipo?: string | null; valor?: number | null; observacion_lider?: string | null };
type Ajuste = { id: string; usuario_id: string; tipo: "bono" | "descuento"; monto: number; motivo: string };
type Pago = { id: string; usuario_id: string; fecha_pago: string; monto: number; tipo_pago: string; numero_comprobante: string | null; banco: string | null; referencia: string | null; observacion: string | null; archivo_url: string | null };

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const cls = "w-full px-3 py-2 rounded-lg border bg-background text-sm";

function calcular(m: Miembro, acts: Act[], aj: Ajuste[], pagos: Pago[]) {
  const horas = acts.reduce((s, a) => s + Number(a.horas), 0);
  const reales = acts.filter((a) => Number(a.horas) > 0);
  const porAct = reales.reduce((s, a) => s + Number(a.valor ?? m.tarifa_actividad ?? 0), 0);
  const base = m.modalidad === "fijo" ? Number(m.monto_fijo)
    : m.modalidad === "actividad" ? porAct
    : m.modalidad === "fijo_hora" ? Number(m.monto_fijo) + horas * Number(m.tarifa_hora)
    : horas * Number(m.tarifa_hora);
  const bonos = aj.filter((x) => x.tipo === "bono").reduce((s, x) => s + Number(x.monto), 0);
  const desc = aj.filter((x) => x.tipo === "descuento").reduce((s, x) => s + Number(x.monto), 0);
  const total = Math.max(0, base + bonos - desc);
  const pagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  return { horas, base, bonos, desc, total, pagado, saldo: Math.max(0, total - pagado) };
}

function Page() { return <FreelancePanel />; }

export function FreelancePanel({ embebido = false }: { embebido?: boolean }) {
  const { role, session } = useAuth();
  const permitido = puedeVerPagos(role, session?.user.id);
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [cuentas, setCuentas] = useState<Record<string, Cuenta>>({});
  const [acts, setActs] = useState<Act[]>([]);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [resumenes, setResumenes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selOpen, setSelOpen] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!permitido) return;
    setLoading(true);
    const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const fin = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const [u, m, c, a, j, p, r] = await Promise.all([
      supabase.rpc("listar_usuarios_freelance"),
      supabase.from("freelance_miembros").select("*").eq("activo", true),
      supabase.from("freelance_datos_pago").select("*"),
      supabase.from("freelance_actividades").select("*").gte("fecha", ini).lte("fecha", fin).order("fecha"),
      supabase.from("freelance_ajustes").select("*").eq("mes", mes).eq("anio", anio),
      supabase.from("freelance_pagos").select("*").eq("mes", mes).eq("anio", anio).order("fecha_pago", { ascending: false }),
      supabase.from("freelance_resumenes").select("*").eq("mes", mes).eq("anio", anio),
    ]);
    const err = u.error || m.error || a.error;
    if (err) toast.error(err.message);
    setUsuarios((u.data ?? []) as Usuario[]);
    setMiembros((m.data ?? []) as Miembro[]);
    const cm: Record<string, Cuenta> = {}; (c.data ?? []).forEach((x) => { if (x.numero_cuenta) cm[x.usuario_id] = x as Cuenta; });
    // Los datos de pago son los mismos de toda la app: si no registró aparte, se usan los de su ficha.
    const ids = (m.data ?? []).map((x) => x.usuario_id).filter((id) => !cm[id]);
    if (ids.length) {
      const { data: pf } = await supabase.rpc("perfiles_pagos", { _ids: ids });
      ((pf ?? []) as { id: string; banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null; titular_cuenta: string | null; cedula: string | null }[])
        .forEach((x) => { if (x.numero_cuenta) cm[x.id] = { usuario_id: x.id, banco: x.banco, tipo_cuenta: x.tipo_cuenta, numero_cuenta: x.numero_cuenta, titular_cuenta: x.titular_cuenta, cedula_titular: x.cedula }; });
    }
    setCuentas(cm);
    setActs((a.data ?? []) as Act[]); setAjustes((j.data ?? []) as Ajuste[]); setPagos((p.data ?? []) as Pago[]);
    const rm: Record<string, string> = {}; (r.data ?? []).forEach((x) => { rm[x.usuario_id] = x.resumen; }); setResumenes(rm);
    setLoading(false);
  }, [permitido, mes, anio]);
  useEffect(() => { void cargar(); }, [cargar]);

  const nombre = useCallback((id: string) => {
    const u = usuarios.find((x) => x.id === id);
    return formatNombre(u?.nombre_completo) || u?.email || "Freelance";
  }, [usuarios]);

  const filas = useMemo(() => miembros.map((m) => {
    const a = acts.filter((x) => x.usuario_id === m.usuario_id);
    const j = ajustes.filter((x) => x.usuario_id === m.usuario_id);
    const p = pagos.filter((x) => x.usuario_id === m.usuario_id);
    return { m, a, j, p, c: calcular(m, a, j, p) };
  }).sort((x, y) => nombre(x.m.usuario_id).localeCompare(nombre(y.m.usuario_id), "es")), [miembros, acts, ajustes, pagos, nombre]);

  if (!permitido) return <div className="p-8 text-center text-muted-foreground">No tienes permiso para ver Pagos e informes.</div>;

  const fila = detalle ? filas.find((f) => f.m.usuario_id === detalle) : null;
  if (fila) {
    return <Detalle fila={fila} nombre={nombre(fila.m.usuario_id)} cuenta={cuentas[fila.m.usuario_id]} resumen={resumenes[fila.m.usuario_id]} mes={mes} anio={anio} onBack={() => setDetalle(null)} recargar={cargar} />;
  }

  const tot = filas.reduce((s, f) => ({ total: s.total + f.c.total, pagado: s.pagado + f.c.pagado, saldo: s.saldo + f.c.saldo }), { total: 0, pagado: 0, saldo: 0 });

  return (
    <div className={embebido ? "" : "p-4 md:p-6 max-w-7xl mx-auto"}>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div><h1 className={embebido ? "text-xl font-bold" : "text-2xl font-bold"}>{embebido ? "Freelancers del equipo" : "Pagos e informes · Freelance"}</h1><p className="text-sm text-muted-foreground mt-1">Actividades, bonos, descuentos y pagos de cada freelance.</p></div>
        <div className="flex gap-2">
          <select value={`${anio}-${mes}`} onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); setAnio(a); setMes(m); }} className="px-3 py-2 rounded-lg border bg-card text-sm">
            {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!embebido && miembros.some((x) => x.usuario_id === session?.user.id) && (
            <Link to="/mis-actividades-freelance" className="px-4 py-2 rounded-lg border bg-card text-sm font-semibold inline-flex gap-2 items-center"><Upload className="w-4 h-4" />Subir mis actividades (PDF)</Link>
          )}
          <button onClick={() => setSelOpen(true)} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex gap-2 items-center"><Users className="w-4 h-4" />Seleccionar freelancers</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5"><Kpi l="Total del mes" v={money(tot.total)} /><Kpi l="Pagado" v={money(tot.pagado)} /><Kpi l="Saldo pendiente" v={money(tot.saldo)} /></div>
      {loading ? <div className="py-12 text-center text-muted-foreground">Cargando…</div> : filas.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Aún no hay freelancers. Usa "Seleccionar freelancers".</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filas.map((f) => (
            <div key={f.m.usuario_id} className="rounded-2xl border bg-card p-5">
              <div className="font-semibold text-lg">{nombre(f.m.usuario_id)}</div>
              <div className="text-sm text-muted-foreground">{f.m.area || "Sin área"} · {f.m.modalidad === "fijo" ? `${money(f.m.monto_fijo)} fijo/mes` : f.m.modalidad === "actividad" ? `${money(f.m.tarifa_actividad)}/actividad` : f.m.modalidad === "fijo_hora" ? `${money(f.m.monto_fijo)} + ${money(f.m.tarifa_hora)}/h` : `${money(f.m.tarifa_hora)}/hora`}</div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs"><Mini l="Horas" v={f.c.horas.toFixed(2)} /><Mini l="Total" v={money(f.c.total)} /><Mini l="Saldo" v={money(f.c.saldo)} /></div>
              <div className="text-xs mt-2">{cuentas[f.m.usuario_id]?.numero_cuenta ? <span className="text-emerald-600">Cuenta bancaria registrada</span> : <span className="text-amber-600">Cuenta bancaria pendiente</span>} · {f.a.length} actividades</div>
              <button onClick={() => setDetalle(f.m.usuario_id)} className="mt-4 w-full px-3 py-2 rounded-lg border text-sm font-semibold">Abrir</button>
            </div>
          ))}
        </div>
      )}
      {selOpen && <SeleccionModal usuarios={usuarios} close={() => setSelOpen(false)} saved={cargar} />}
    </div>
  );
}

function SeleccionModal({ usuarios, close, saved }: { usuarios: Usuario[]; close: () => void; saved: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const toggle = async (u: Usuario) => {
    const { error } = u.seleccionado
      ? await supabase.from("freelance_miembros").update({ activo: false }).eq("usuario_id", u.id)
      : await supabase.from("freelance_miembros").upsert({ usuario_id: u.id, activo: true });
    if (error) return toast.error(error.message);
    await saved();
  };
  const lista = usuarios.filter((u) => `${u.nombre_completo} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Seleccionar freelancers" close={close}>
      <div className="p-5 space-y-3">
        <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className={cls} />
        <div className="max-h-[60vh] overflow-y-auto divide-y border rounded-xl">
          {lista.map((u) => (
            <label key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer">
              <span><b>{formatNombre(u.nombre_completo) || u.email}</b><span className="block text-xs text-muted-foreground">{u.email}</span></span>
              <input type="checkbox" checked={u.seleccionado} onChange={() => toggle(u)} />
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

type FilaF = { m: Miembro; a: Act[]; j: Ajuste[]; p: Pago[]; c: ReturnType<typeof calcular> };

function Detalle({ fila, nombre, cuenta, resumen, mes, anio, onBack, recargar }: {
  fila: FilaF; nombre: string; cuenta?: Cuenta; resumen?: string; mes: number; anio: number; onBack: () => void; recargar: () => Promise<void>;
}) {
  const { m, a, j, p, c } = fila;
  const [tarifa, setTarifa] = useState({ area: m.area ?? "", modalidad: m.modalidad, tarifa: String(m.tarifa_hora), fijo: String(m.monto_fijo), act: String(m.tarifa_actividad ?? 0) });
  const [ajOpen, setAjOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [iaBusy, setIaBusy] = useState(false);
  const resumir = useServerFn(generarResumenFreelance);

  const guardarTarifa = async () => {
    const { error } = await supabase.from("freelance_miembros").update({
      area: tarifa.area.trim() || null, modalidad: tarifa.modalidad, tarifa_hora: Number(tarifa.tarifa || 0), monto_fijo: Number(tarifa.fijo || 0), tarifa_actividad: Number(tarifa.act || 0),
    }).eq("usuario_id", m.usuario_id);
    if (error) return toast.error(error.message);
    toast.success("Valor acordado guardado"); await recargar();
  };
  const ver = async (path: string) => {
    const { data } = await supabase.storage.from("freelance").createSignedUrl(path, 3600);
    if (data) window.open(data.signedUrl, "_blank", "noreferrer");
  };
  const generarIA = async () => {
    setIaBusy(true);
    try { await resumir({ data: { usuario_id: m.usuario_id, mes, anio } }); toast.success("Resumen generado"); await recargar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo generar el resumen"); }
    finally { setIaBusy(false); }
  };
  const borrar = async (tabla: "freelance_ajustes" | "freelance_pagos", id: string) => {
    if (!confirm("¿Borrar este registro?")) return;
    await supabase.from(tabla).delete().eq("id", id); await recargar();
  };

  const pdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 50; const W = doc.internal.pageSize.getWidth();
    const line = (t: string, bold = false, size = 10) => {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
      doc.splitTextToSize(t, W - 80).forEach((l: string) => { if (y > 790) { doc.addPage(); y = 50; } doc.text(l, 40, y); y += size + 4; });
    };
    line("ADN Empresarial · Informe freelance", true, 16);
    line(`${nombre} · ${String(mes).padStart(2, "0")}/${anio}`, true, 12); y += 6;
    line(`Área: ${m.area || "—"}   Modalidad: ${m.modalidad === "fijo" ? `Fijo ${money(m.monto_fijo)}` : `${money(m.tarifa_hora)}/hora`}`);
    line(`Cuenta: ${cuenta ? `${cuenta.banco ?? ""} · ${cuenta.tipo_cuenta ?? ""} · ${cuenta.numero_cuenta ?? ""} · ${cuenta.titular_cuenta ?? ""}` : "No registrada"}`); y += 6;
    line(`Horas: ${c.horas.toFixed(2)}   Base: ${money(c.base)}   Bonos: ${money(c.bonos)}   Descuentos: ${money(c.desc)}`, true);
    line(`Total: ${money(c.total)}   Pagado: ${money(c.pagado)}   Saldo: ${money(c.saldo)}`, true); y += 8;
    if (resumen) { line("Lo importante del mes", true, 12); line(resumen); y += 8; }
    line("Actividades", true, 12); a.forEach((x) => line(`${x.fecha}${x.hora_inicio && x.hora_fin ? ` (${x.hora_inicio.slice(0, 5)}-${x.hora_fin.slice(0, 5)})` : ""} · ${x.titulo} · ${x.horas} h${x.descripcion ? ` — ${x.descripcion}` : ""}${x.observacion_lider ? ` [Obs. líder: ${x.observacion_lider}]` : ""}`)); if (!a.length) line("Sin actividades.");
    y += 6; line("Bonos y descuentos", true, 12); j.forEach((x) => line(`${x.tipo === "bono" ? "+" : "-"}${money(x.monto)} · ${x.motivo}`)); if (!j.length) line("Ninguno.");
    y += 6; line("Pagos", true, 12); p.forEach((x) => line(`${x.fecha_pago} · ${money(x.monto)} · ${x.tipo_pago} · ${x.banco ?? ""} · N° ${x.numero_comprobante ?? "—"} · Ref ${x.referencia ?? "—"}`)); if (!p.length) line("Sin pagos.");
    doc.save(`informe-freelance-${nombre.replace(/\s+/g, "_")}-${anio}-${mes}.pdf`);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <button onClick={onBack} className="inline-flex gap-2 items-center text-sm text-muted-foreground"><ArrowLeft className="w-4 h-4" />Volver a Freelance</button>
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div><h1 className="text-2xl font-bold">{nombre}</h1><div className="text-sm text-muted-foreground">{String(mes).padStart(2, "0")}/{anio}</div></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAjOpen(true)} className="px-3 py-2 rounded-lg border text-sm font-semibold inline-flex gap-2 items-center"><Plus className="w-4 h-4" />Bono / descuento</button>
            <button onClick={() => setPagoOpen(true)} className="px-3 py-2 rounded-lg border text-sm font-semibold inline-flex gap-2 items-center"><Plus className="w-4 h-4" />Registrar pago</button>
            <button onClick={pdf} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex gap-2 items-center"><FileText className="w-4 h-4" />Informe PDF</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
          <Kpi l="Horas" v={c.horas.toFixed(2)} /><Kpi l="Base" v={money(c.base)} /><Kpi l="Bonos" v={money(c.bonos)} /><Kpi l="Descuentos" v={money(c.desc)} /><Kpi l="Pagado" v={money(c.pagado)} /><Kpi l="Saldo" v={money(c.saldo)} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <b>Valor acordado</b>
          <datalist id="areas-freelance">{["Programación", "Diseño gráfico", "Edición de video", "Grabación de pantalla", "Redes sociales", "Marketing", "Soporte técnico", "Contenido / redacción", "Asistente virtual"].map((x) => <option key={x} value={x} />)}</datalist>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Área"><input list="areas-freelance" placeholder="Ej: Programación" value={tarifa.area} onChange={(e) => setTarifa({ ...tarifa, area: e.target.value })} className={cls} /></Field>
            <Field label="Modalidad"><select value={tarifa.modalidad} onChange={(e) => setTarifa({ ...tarifa, modalidad: e.target.value })} className={cls}>
              <option value="hora">Por hora</option><option value="actividad">Por actividad</option><option value="fijo">Monto fijo mensual</option><option value="fijo_hora">Fijo mensual + horas extra</option>
            </select></Field>
            {(tarifa.modalidad === "hora" || tarifa.modalidad === "fijo_hora") && <Field label="Valor por hora ($)"><input type="number" min="0" step="0.01" value={tarifa.tarifa} onChange={(e) => setTarifa({ ...tarifa, tarifa: e.target.value })} className={cls} /></Field>}
            {(tarifa.modalidad === "fijo" || tarifa.modalidad === "fijo_hora") && <Field label="Monto fijo mensual ($)"><input type="number" min="0" step="0.01" value={tarifa.fijo} onChange={(e) => setTarifa({ ...tarifa, fijo: e.target.value })} className={cls} /></Field>}
            {tarifa.modalidad === "actividad" && <Field label="Valor base por actividad ($)"><input type="number" min="0" step="0.01" value={tarifa.act} onChange={(e) => setTarifa({ ...tarifa, act: e.target.value })} className={cls} /></Field>}
            <div className="col-span-2 text-xs text-muted-foreground">{tarifa.modalidad === "actividad" ? "Puedes cambiar el valor de cada actividad abriendo el día en el calendario." : tarifa.modalidad === "fijo_hora" ? "Se paga el fijo del mes más cada hora registrada." : ""}</div>
          </div>
          <button onClick={guardarTarifa} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold">Guardar</button>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <b>Datos bancarios</b>
          {cuenta?.numero_cuenta ? (
            <div className="grid grid-cols-2 gap-3 text-sm mt-3"><Info l="Banco" v={cuenta.banco} /><Info l="Tipo" v={cuenta.tipo_cuenta} /><Info l="Número" v={cuenta.numero_cuenta} /><Info l="Titular" v={cuenta.titular_cuenta} /><Info l="Cédula" v={cuenta.cedula_titular} /></div>
          ) : <div className="text-sm text-amber-600 mt-3">El freelance aún no registra su cuenta (se le pide al entrar).</div>}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex justify-between items-center mb-2">
          <b>Lo importante del mes (resumen con IA gratuita)</b>
          <button disabled={iaBusy} onClick={generarIA} className="px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex gap-2 items-center">{iaBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{resumen ? "Regenerar" : "Generar resumen"}</button>
        </div>
        <div className="text-sm whitespace-pre-wrap text-muted-foreground">{resumen || "Aún no hay resumen. Se genera leyendo las actividades y PDFs del mes."}</div>
      </div>

      <CalendarioActividades acts={a} mes={mes} anio={anio} editable porActividad={m.modalidad === "actividad"} valorDefecto={Number(m.tarifa_actividad ?? 0)} onChange={recargar} />
      <Lista titulo="Bonos y descuentos">
        {j.map((x) => (
          <div key={x.id} className="px-5 py-3 border-t flex justify-between text-sm">
            <span>{x.tipo === "bono" ? "Bono" : "Descuento"} · {x.motivo}</span>
            <span className="flex gap-3 items-center"><b className={x.tipo === "bono" ? "text-emerald-600" : "text-red-600"}>{x.tipo === "bono" ? "+" : "-"}{money(x.monto)}</b><button onClick={() => borrar("freelance_ajustes", x.id)}><Trash2 className="w-4 h-4" /></button></span>
          </div>
        ))}
      </Lista>
      <Lista titulo="Pagos realizados">
        {p.map((x) => (
          <div key={x.id} className="px-5 py-3 border-t flex justify-between gap-3 text-sm">
            <span>{x.fecha_pago} · {x.tipo_pago.replace("_", " ")} · {x.banco ?? "—"} · N° {x.numero_comprobante ?? "—"} · Ref {x.referencia ?? "—"}{x.observacion && <span className="block text-xs text-muted-foreground">Obs: {x.observacion}</span>}</span>
            <span className="flex gap-3 items-center"><b>{money(x.monto)}</b>{x.archivo_url && <a href={x.archivo_url} target="_blank" rel="noreferrer" className="text-xs underline">Ver</a>}<button onClick={() => borrar("freelance_pagos", x.id)}><Trash2 className="w-4 h-4" /></button></span>
          </div>
        ))}
      </Lista>

      {ajOpen && <AjusteModal uid={m.usuario_id} mes={mes} anio={anio} close={() => setAjOpen(false)} saved={async () => { setAjOpen(false); await recargar(); }} />}
      {pagoOpen && <PagoModal uid={m.usuario_id} mes={mes} anio={anio} saldo={c.saldo} close={() => setPagoOpen(false)} saved={async () => { setPagoOpen(false); await recargar(); }} />}
    </div>
  );
}

function AjusteModal({ uid, mes, anio, close, saved }: { uid: string; mes: number; anio: number; close: () => void; saved: () => Promise<void> }) {
  const [v, setV] = useState({ tipo: "bono", monto: "", motivo: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (Number(v.monto) <= 0 || !v.motivo.trim()) return toast.error("Completa monto y motivo.");
    setBusy(true);
    const { error } = await supabase.from("freelance_ajustes").insert({ usuario_id: uid, mes, anio, tipo: v.tipo, monto: Number(v.monto), motivo: v.motivo.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    await saved();
  };
  return (
    <Modal title="Bono o descuento" close={close}>
      <div className="p-5 space-y-3">
        <Field label="Tipo"><select value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })} className={cls}><option value="bono">Bono</option><option value="descuento">Descuento</option></select></Field>
        <Field label="Monto ($)"><input type="number" min="0" step="0.01" value={v.monto} onChange={(e) => setV({ ...v, monto: e.target.value })} className={cls} /></Field>
        <Field label="Motivo (obligatorio)"><textarea rows={3} value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} className={cls} /></Field>
      </div>
      <Foot close={close} save={save} busy={busy} />
    </Modal>
  );
}

function PagoModal({ uid, mes, anio, saldo, close, saved }: { uid: string; mes: number; anio: number; saldo: number; close: () => void; saved: () => Promise<void> }) {
  const leer = useServerFn(leerComprobanteGratis);
  const [v, setV] = useState({ fecha: new Date().toISOString().slice(0, 10), monto: saldo ? saldo.toFixed(2) : "", tipo: "transferencia", numero: "", banco: "", referencia: "", observacion: "", cuenta: "", titular: "" });
  const [file, setFile] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const cargarImagen = async (f: File) => {
    if (!f.type.startsWith("image/")) return toast.error("Sube una imagen del comprobante.");
    setFile(f); setLeyendo(true);
    try {
      const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      const d = await leer({ data: { imagenBase64: b64 } });
      setV((x) => ({ ...x, monto: d.monto ? String(d.monto) : x.monto, fecha: d.fecha ?? x.fecha, numero: d.numero_comprobante ?? x.numero, banco: d.banco ?? x.banco, referencia: d.referencia ?? x.referencia, tipo: d.tipo_pago ?? x.tipo, cuenta: (d as { cuenta_origen?: string }).cuenta_origen ?? x.cuenta, titular: (d as { titular?: string }).titular ?? x.titular }));
      toast.success("Comprobante leído");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo leer el comprobante"); }
    finally { setLeyendo(false); }
  };

  const save = async () => {
    if (Number(v.monto) <= 0) return toast.error("Escribe el monto.");
    setBusy(true);
    let url: string | null = null;
    if (file) {
      const path = `${uid}/pagos/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
      const up = await supabase.storage.from("comprobantes").upload(path, file, { contentType: file.type });
      if (!up.error) { const s = await supabase.storage.from("comprobantes").createSignedUrl(path, 60 * 60 * 24 * 365 * 5); url = s.data?.signedUrl ?? null; }
    }
    const { error } = await supabase.from("freelance_pagos").insert({
      usuario_id: uid, mes, anio, fecha_pago: v.fecha, monto: Number(v.monto), tipo_pago: v.tipo,
      numero_comprobante: v.numero || null, banco: v.banco || null, referencia: v.referencia || null, observacion: v.observacion || null, archivo_url: url, cuenta_origen: v.cuenta || null, titular_cuenta: v.titular || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    await saved();
  };

  return (
    <Modal title="Registrar pago" close={close}>
      <div className="p-5 grid sm:grid-cols-2 gap-3" onPaste={(e) => { const f = e.clipboardData.files?.[0]; if (f) void cargarImagen(f); }}>
        <div className="sm:col-span-2">
          <button type="button" onClick={() => ref.current?.click()} className="w-full aspect-[3/1] rounded-xl border-2 border-dashed grid place-items-center text-sm text-muted-foreground">
            {leyendo ? <span className="inline-flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" />Leyendo comprobante…</span> : file ? file.name : <span className="inline-flex gap-2 items-center"><Upload className="w-4 h-4" />Sube o pega (Ctrl+V) la imagen del comprobante</span>}
          </button>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void cargarImagen(f); }} />
        </div>
        <Field label="Fecha"><input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} className={cls} /></Field>
        <Field label="Monto ($)"><input type="number" min="0" step="0.01" value={v.monto} onChange={(e) => setV({ ...v, monto: e.target.value })} className={cls} /></Field>
        <Field label="Método"><select value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })} className={cls}>{[["transferencia", "Transferencia bancaria"], ["deposito", "Depósito bancario"], ["efectivo", "Efectivo"], ["cheque", "Cheque"], ["pago_directo", "Pago directo"], ["tarjeta_credito", "Tarjeta de crédito"], ["tarjeta_debito", "Tarjeta de débito"], ["otro", "Otro"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Banco"><input value={v.banco} onChange={(e) => setV({ ...v, banco: e.target.value })} className={cls} /></Field>
        {v.tipo !== "efectivo" && <Field label="Cuenta de origen"><input value={v.cuenta} onChange={(e) => setV({ ...v, cuenta: e.target.value })} className={cls} /></Field>}
        {v.tipo !== "efectivo" && <Field label="Titular de la cuenta"><input value={v.titular} onChange={(e) => setV({ ...v, titular: e.target.value })} className={cls} /></Field>}
        <Field label="N° comprobante"><input value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} className={cls} /></Field>
        <Field label="Referencia"><input value={v.referencia} onChange={(e) => setV({ ...v, referencia: e.target.value })} className={cls} /></Field>
        <div className="sm:col-span-2"><Field label="Observación"><textarea rows={2} value={v.observacion} onChange={(e) => setV({ ...v, observacion: e.target.value })} className={cls} /></Field></div>
      </div>
      <Foot close={close} save={save} busy={busy} />
    </Modal>
  );
}

function Lista({ titulo, children }: { titulo: string; children: ReactNode[] }) {
  return <div className="rounded-2xl border bg-card"><div className="px-5 py-3 font-semibold">{titulo}</div>{children.length ? children : <div className="px-5 pb-4 text-sm text-muted-foreground">Nada registrado este mes.</div>}</div>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><div className="w-full max-w-2xl rounded-2xl bg-card border shadow-xl"><div className="px-5 py-3 bg-violet-gradient text-white rounded-t-2xl flex justify-between items-center"><b>{title}</b><button onClick={close}><X className="w-5 h-5" /></button></div>{children}</div></div>;
}
function Foot({ close, save, busy }: { close: () => void; save: () => void; busy: boolean }) {
  return <div className="px-5 pb-5 flex justify-end gap-2"><button onClick={close} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button><button disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold">{busy ? "Guardando…" : "Guardar"}</button></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>{children}</label>;
}
function Kpi({ l, v }: { l: string; v: string }) { return <div className="rounded-xl border bg-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div><div className="font-bold mt-1 tabular-nums">{v}</div></div>; }
function Mini({ l, v }: { l: string; v: string }) { return <div className="rounded-lg border p-2"><div className="text-[10px] text-muted-foreground">{l}</div><b className="tabular-nums">{v}</b></div>; }
function Info({ l, v }: { l: string; v: string | null }) { return <div><div className="text-[10px] uppercase text-muted-foreground">{l}</div><div className="font-medium mt-1 break-all">{v || "No registrado"}</div></div>; }
