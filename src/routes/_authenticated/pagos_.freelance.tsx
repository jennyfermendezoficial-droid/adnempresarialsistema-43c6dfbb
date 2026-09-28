import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";
import { listaMeses } from "@/lib/pagos-export";
import { formatHM } from "@/lib/tiempo";
import { dividirHorarioLaboral } from "@/lib/pagos-horario";
import { subirImagen, esUrlAbsoluta } from "@/lib/cloudinary";
import { leerComprobante } from "@/lib/comprobante-ocr.functions";
import {
  calcularFreelance,
  minutosDelDia,
  red2,
  seCruzan,
  tarifaEfectiva,
  type CalculoFreelance,
  type RegistroHorasFreelance,
  type TarifaFreelance,
} from "@/lib/freelance-calculo";
import { generarInformeFreelancePDF } from "@/lib/freelance-export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pagos_/freelance")({ component: Page });

interface Freelancer {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  servicio: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  titular_cuenta: string | null;
  activo: boolean;
}

interface TarifaMes {
  freelancer_id: string;
  valor_hora_laboral: number;
  valor_hora_fuera: number | null;
}

interface Ajuste {
  id: string;
  freelancer_id: string;
  tipo: "bono" | "descuento";
  monto: number;
  motivo: string;
  created_at: string;
}

interface AbonoFreelance {
  id: string;
  freelancer_id: string;
  mes: number;
  anio: number;
  fecha_pago: string;
  monto: number;
  tipo_pago: string;
  numero_comprobante: string | null;
  observacion: string | null;
  archivo_url: string | null;
}

type Estado = "pagado" | "parcial" | "por_pagar" | "sin_actividad";

interface FilaFreelance extends Freelancer {
  tarifa: TarifaFreelance;
  tarifaFueraDefinida: boolean;
  registros: RegistroHorasFreelance[];
  ajustes: Ajuste[];
  abonos: AbonoFreelance[];
  calculo: CalculoFreelance;
  pagado: number;
  falta: number;
  estado: Estado;
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const COLORS = ["#7C6BFF", "#22A06B", "#E78A3C", "#3C8FE7", "#C2756B"];

function colorDe(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function dinero(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

/** Fecha local del navegador (no UTC) en formato YYYY-MM-DD. */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaLegible(fecha: string) {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

// Estas tablas se crean en la migración 20260928120000_pagos_freelance.sql.
// El cast conserva el cliente generado actual sin tocar types.ts (mismo
// criterio que Alumnas); en runtime Supabase recibe el nombre real.
type TablaFreelance = "freelancers" | "freelance_tarifas_mes" | "freelance_registros_horas" | "freelance_ajustes" | "freelance_abonos";
function tabla(nombre: TablaFreelance) {
  return supabase.from(nombre as "pagos_mensuales");
}

function Page() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [tarifas, setTarifas] = useState<TarifaMes[]>([]);
  const [registros, setRegistros] = useState<RegistroHorasFreelance[]>([]);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [abonos, setAbonos] = useState<AbonoFreelance[]>([]);
  const [loading, setLoading] = useState(true);
  const [infraError, setInfraError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [verFreelancers, setVerFreelancers] = useState(false);
  const [horasPara, setHorasPara] = useState<{ id: string | null } | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [abonoDe, setAbonoDe] = useState<FilaFreelance | null>(null);

  const cargar = useCallback(async () => {
    if (!puedeGestionar) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setInfraError(null);
    try {
      const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const fin = `${anio}-${String(mes).padStart(2, "0")}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;
      const [fRes, tRes, rRes, aRes, abRes] = await Promise.all([
        tabla("freelancers").select("*").order("nombre", { ascending: true }),
        tabla("freelance_tarifas_mes").select("freelancer_id,valor_hora_laboral,valor_hora_fuera").eq("mes", mes).eq("anio", anio),
        tabla("freelance_registros_horas").select("id,freelancer_id,fecha,hora_inicio,duracion_min,tarea").gte("fecha", ini).lte("fecha", fin).order("fecha", { ascending: true }),
        tabla("freelance_ajustes").select("id,freelancer_id,tipo,monto,motivo,created_at").eq("mes", mes).eq("anio", anio).order("created_at", { ascending: true }),
        tabla("freelance_abonos").select("*").eq("mes", mes).eq("anio", anio).order("fecha_pago", { ascending: false }),
      ]);
      const err = fRes.error ?? tRes.error ?? rRes.error ?? aRes.error ?? abRes.error;
      if (err) {
        setFreelancers([]); setTarifas([]); setRegistros([]); setAjustes([]); setAbonos([]);
        setInfraError(err.message || "No se pudo cargar la estructura de pagos freelance.");
        return;
      }
      setFreelancers((fRes.data ?? []) as unknown as Freelancer[]);
      setTarifas(((tRes.data ?? []) as unknown as TarifaMes[]));
      setRegistros(((rRes.data ?? []) as unknown as RegistroHorasFreelance[]).map((r) => ({ ...r, duracion_min: Number(r.duracion_min) })));
      setAjustes(((aRes.data ?? []) as unknown as Ajuste[]).map((a) => ({ ...a, monto: Number(a.monto) })));
      setAbonos(((abRes.data ?? []) as unknown as AbonoFreelance[]).map((a) => ({ ...a, monto: Number(a.monto) })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los pagos freelance.");
    } finally {
      setLoading(false);
    }
  }, [puedeGestionar, mes, anio]);

  useEffect(() => { void cargar(); }, [cargar]);

  const filas = useMemo<FilaFreelance[]>(() => {
    const agrupar = <T extends { freelancer_id: string }>(lista: T[]) => {
      const m = new Map<string, T[]>();
      lista.forEach((x) => { const arr = m.get(x.freelancer_id) ?? []; arr.push(x); m.set(x.freelancer_id, arr); });
      return m;
    };
    const tarifaMap = new Map(tarifas.map((t) => [t.freelancer_id, t]));
    const regMap = agrupar(registros);
    const ajMap = agrupar(ajustes);
    const abMap = agrupar(abonos);

    return freelancers
      .map((f) => {
        const t = tarifaMap.get(f.id);
        const tarifa = tarifaEfectiva(t?.valor_hora_laboral, t?.valor_hora_fuera);
        const regs = regMap.get(f.id) ?? [];
        const ajs = ajMap.get(f.id) ?? [];
        const abs = abMap.get(f.id) ?? [];
        const bonos = ajs.filter((a) => a.tipo === "bono").reduce((s, a) => s + a.monto, 0);
        const descuentos = ajs.filter((a) => a.tipo === "descuento").reduce((s, a) => s + a.monto, 0);
        const calculo = calcularFreelance(regs, tarifa, bonos, descuentos);
        const pagado = red2(abs.reduce((s, a) => s + a.monto, 0));
        const falta = Math.max(0, red2(calculo.total - pagado));
        const estado: Estado = calculo.total <= 0 && pagado <= 0
          ? "sin_actividad"
          : calculo.total > 0 && pagado + 0.001 >= calculo.total
            ? "pagado"
            : pagado > 0 ? "parcial" : "por_pagar";
        return {
          ...f, tarifa, tarifaFueraDefinida: t?.valor_hora_fuera != null,
          registros: regs, ajustes: ajs, abonos: abs, calculo, pagado, falta, estado,
        };
      })
      // Los inactivos solo aparecen si tienen movimientos en el mes.
      .filter((f) => f.activo || f.registros.length || f.ajustes.length || f.abonos.length);
  }, [freelancers, tarifas, registros, ajustes, abonos]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => `${f.nombre} ${f.email ?? ""} ${f.servicio ?? ""}`.toLowerCase().includes(q));
  }, [filas, buscar]);

  const resumen = useMemo(() => ({
    total: red2(filas.reduce((s, f) => s + f.calculo.total, 0)),
    falta: red2(filas.reduce((s, f) => s + f.falta, 0)),
    pagado: red2(filas.reduce((s, f) => s + f.pagado, 0)),
    minLaboral: filas.reduce((s, f) => s + f.calculo.minutosLaboral, 0),
    minFuera: filas.reduce((s, f) => s + f.calculo.minutosFuera, 0),
    pendientes: filas.filter((f) => f.estado === "por_pagar" || f.estado === "parcial").length,
  }), [filas]);

  const detalle = detalleId ? filas.find((f) => f.id === detalleId) ?? null : null;

  if (!puedeGestionar) {
    return <div className="p-8 text-center text-muted-foreground">No tienes permiso para ver Pagos e informes.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select
          value={`${anio}-${mes}`}
          onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); setAnio(a); setMes(m); }}
          className="px-3 py-2 rounded-lg border bg-card text-sm font-medium"
        >
          {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          Horario laboral: <strong className="text-foreground">07:00–13:00 y 14:30–17:30</strong>. Si un trabajo cruza un límite, el tiempo se divide minuto a minuto.
        </div>
        <button onClick={() => setVerFreelancers(true)} disabled={!!infraError} className="px-3 py-2 rounded-lg border bg-card text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
          <Users className="w-4 h-4" /> Freelancers
        </button>
        <button onClick={() => setHorasPara({ id: null })} disabled={!!infraError || !freelancers.some((f) => f.activo)} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 shadow-md disabled:opacity-50">
          <Clock className="w-4 h-4" /> Registrar horas
        </button>
      </div>

      {infraError && (
        <div className="mb-5 rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
          <div className="font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4" /> La estructura de pagos freelance todavía no está disponible en la base de datos.
          </div>
          <div className="text-xs text-muted-foreground mt-1">{infraError}</div>
          <div className="text-xs text-muted-foreground mt-1">Falta aplicar la migración <code>20260928120000_pagos_freelance.sql</code>.</div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0F1431,#1B1F4A)" }}>
          <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,107,255,.5), transparent 70%)" }} />
          <div className="text-[10px] uppercase tracking-wider opacity-70">Por pagar · {MESES[mes - 1]}</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{dinero(resumen.falta)}</div>
          <div className="text-xs opacity-80 mt-1">{resumen.pendientes} freelancer{resumen.pendientes === 1 ? "" : "s"} pendiente{resumen.pendientes === 1 ? "" : "s"}</div>
        </div>
        <KPI label="Horario laboral" value={formatHM(resumen.minLaboral)} sub="07:00–13:00 · 14:30–17:30" />
        <KPI label="Fuera de horario" value={formatHM(resumen.minFuera)} sub="resto del día" />
        <KPI label="Total abonado" value={dinero(resumen.pagado)} sub={`de ${dinero(resumen.total)} del mes`} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3 px-1">
        <div>
          <h2 className="text-lg font-semibold">Resumen freelance · {MESES[mes - 1]} {anio}</h2>
          <p className="text-xs text-muted-foreground">Total = horas laborales × tarifa laboral + horas fuera de horario × tarifa fuera + bonos − descuentos.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar freelancer…" className="w-full pl-9 pr-3 py-2 rounded-lg border bg-card text-sm" />
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-4 py-3 font-semibold">Freelancer</th>
              <th className="text-left px-3 py-3 font-semibold">Laboral</th>
              <th className="text-left px-3 py-3 font-semibold">Fuera de horario</th>
              <th className="text-right px-3 py-3 font-semibold">Bonos / Desc.</th>
              <th className="text-right px-3 py-3 font-semibold">Total</th>
              <th className="text-right px-3 py-3 font-semibold">Pagado</th>
              <th className="text-right px-3 py-3 font-semibold">Falta</th>
              <th className="text-left px-3 py-3 font-semibold">Estado</th>
              <th className="text-right px-4 py-3 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">Cargando freelancers…</td></tr>}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">
                {infraError ? "Sin datos." : freelancers.length === 0 ? "Aún no hay freelancers. Agrégalos con el botón “Freelancers”." : "No hay freelancers para mostrar."}
              </td></tr>
            )}
            {!loading && filtradas.map((f) => (
              <tr key={f.id} className="border-t hover:bg-muted/30 transition">
                <td className="px-4 py-3">
                  <button onClick={() => setDetalleId(f.id)} className="flex items-center gap-3 min-w-0 text-left">
                    <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: colorDe(f.id) }}>
                      {f.nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{f.nombre}{!f.activo && <span className="ml-1 text-[10px] text-muted-foreground">(inactivo)</span>}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{f.servicio || f.email || "Freelance"}</div>
                    </div>
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="tabular-nums">{formatHM(f.calculo.minutosLaboral)}</div>
                  <div className="text-[11px] text-muted-foreground">{dinero(f.tarifa.laboral)}/h</div>
                </td>
                <td className="px-3 py-3">
                  <div className="tabular-nums">{formatHM(f.calculo.minutosFuera)}</div>
                  <div className="text-[11px] text-muted-foreground">{dinero(f.tarifa.fuera)}/h</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-xs">
                  {f.calculo.bonos > 0 && <div className="text-emerald-600">+{dinero(f.calculo.bonos)}</div>}
                  {f.calculo.descuentos > 0 && <div className="text-red-600">−{dinero(f.calculo.descuentos)}</div>}
                  {!f.calculo.bonos && !f.calculo.descuentos && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">{dinero(f.calculo.total)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-600">{dinero(f.pagado)}</td>
                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${f.falta > 0 ? "text-red-600" : "text-muted-foreground"}`}>{dinero(f.falta)}</td>
                <td className="px-3 py-3"><EstadoBadge estado={f.estado} /></td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setHorasPara({ id: f.id })} disabled={!f.activo} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted/40 disabled:opacity-40">
                      <Clock className="w-3.5 h-3.5" /> Horas
                    </button>
                    <button onClick={() => setDetalleId(f.id)} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted/40">
                      <Eye className="w-3.5 h-3.5" /> Detalle
                    </button>
                    <button onClick={() => setAbonoDe(f)} disabled={f.falta <= 0} className="px-3 py-1.5 rounded-lg bg-violet-gradient text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                      <ReceiptText className="w-3.5 h-3.5" /> Registrar abono
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && filas.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/20 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-3 py-3 tabular-nums">{formatHM(resumen.minLaboral)}</td>
                <td className="px-3 py-3 tabular-nums">{formatHM(resumen.minFuera)}</td>
                <td />
                <td className="px-3 py-3 text-right tabular-nums">{dinero(resumen.total)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{dinero(resumen.pagado)}</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--violet)" }}>{dinero(resumen.falta)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {verFreelancers && (
        <FreelancersModal freelancers={freelancers} onClose={() => setVerFreelancers(false)} onSaved={cargar} />
      )}

      {/* El detalle va antes para que Horas y Abono se abran por encima de él. */}
      {detalle && (
        <DetalleModal fila={detalle} mes={mes} anio={anio} onClose={() => setDetalleId(null)} onRefresh={cargar}
          onRegistrarHoras={() => setHorasPara({ id: detalle.id })} onRegistrarAbono={() => setAbonoDe(detalle)} />
      )}

      {horasPara && (
        <RegistrarHorasModal
          freelancers={freelancers.filter((f) => f.activo)}
          inicialId={horasPara.id}
          mes={mes}
          anio={anio}
          filas={filas}
          onClose={() => setHorasPara(null)}
          onSaved={async (fecha) => {
            setHorasPara(null);
            const [a, m] = fecha.split("-").map(Number);
            if (a !== anio || m !== mes) {
              // El registro pertenece a otro mes: se muestra ese mes.
              setAnio(a); setMes(m);
              toast.info(`Mostrando ${MESES[m - 1]} ${a}, el mes del registro.`);
            } else await cargar();
          }}
        />
      )}

      {abonoDe && (
        <RegistrarAbonoModal
          fila={filas.find((f) => f.id === abonoDe.id) ?? abonoDe}
          mes={mes}
          anio={anio}
          onClose={() => setAbonoDe(null)}
          onSaved={async () => { setAbonoDe(null); await cargar(); }}
        />
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: Estado }) {
  if (estado === "pagado") return <span className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Pagado</span>;
  if (estado === "parcial") return <span className="px-2 py-1 rounded-md text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">Abono parcial</span>;
  if (estado === "por_pagar") return <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Por pagar</span>;
  return <span className="px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">Sin actividad</span>;
}

function KPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-emerald-600 mt-1">{sub}</div>
    </div>
  );
}

// ===================== FREELANCERS =====================

const FREELANCER_VACIO = { nombre: "", email: "", telefono: "", servicio: "", banco: "", tipo_cuenta: "", numero_cuenta: "", titular_cuenta: "" };

function FreelancersModal({ freelancers, onClose, onSaved }: {
  freelancers: Freelancer[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(freelancers.length ? null : "nuevo");
  const [form, setForm] = useState(FREELANCER_VACIO);
  const [guardando, setGuardando] = useState(false);

  const abrir = (f: Freelancer | null) => {
    setEditando(f ? f.id : "nuevo");
    setForm(f ? {
      nombre: f.nombre, email: f.email ?? "", telefono: f.telefono ?? "", servicio: f.servicio ?? "",
      banco: f.banco ?? "", tipo_cuenta: f.tipo_cuenta ?? "", numero_cuenta: f.numero_cuenta ?? "", titular_cuenta: f.titular_cuenta ?? "",
    } : FREELANCER_VACIO);
  };

  const guardar = async () => {
    const nombre = form.nombre.trim();
    if (nombre.length < 2) return toast.error("Escribe el nombre del freelancer.");
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("El correo no es válido.");
    const limpio = (v: string) => v.trim() || null;
    const payload = {
      nombre, email: email || null, telefono: limpio(form.telefono), servicio: limpio(form.servicio),
      banco: limpio(form.banco), tipo_cuenta: limpio(form.tipo_cuenta), numero_cuenta: limpio(form.numero_cuenta),
      titular_cuenta: limpio(form.titular_cuenta), updated_at: new Date().toISOString(),
    };
    setGuardando(true);
    const { error } = editando === "nuevo"
      ? await tabla("freelancers").insert(payload as never)
      : await tabla("freelancers").update(payload as never).eq("id", editando as string);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(editando === "nuevo" ? "Freelancer agregado" : "Freelancer actualizado");
    setEditando(null);
    await onSaved();
  };

  const cambiarActivo = async (f: Freelancer) => {
    if (f.activo && !confirm(`¿Desactivar a ${f.nombre}? Su historial se conserva y podrás activarlo de nuevo.`)) return;
    const { error } = await tabla("freelancers").update({ activo: !f.activo, updated_at: new Date().toISOString() } as never).eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success(f.activo ? "Freelancer desactivado" : "Freelancer activado");
    await onSaved();
  };

  const campo = (key: keyof typeof FREELANCER_VACIO, label: string, placeholder = "") => (
    <Campo label={label}>
      <input value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} maxLength={120}
        className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
    </Campo>
  );

  return (
    <ModalBase title="Freelancers" subtitle="Trabajadores freelance de la empresa" onClose={onClose} wide>
      <div className="p-5 space-y-4">
        {editando ? (
          <div className="rounded-xl border p-4 space-y-3">
            <div className="font-semibold text-sm">{editando === "nuevo" ? "Nuevo freelancer" : "Editar freelancer"}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {campo("nombre", "Nombre completo *")}
              {campo("servicio", "Servicio / área", "Ej. Diseño, edición de video")}
              {campo("email", "Correo")}
              {campo("telefono", "Teléfono")}
              {campo("banco", "Banco")}
              {campo("tipo_cuenta", "Tipo de cuenta", "Ahorros / Corriente")}
              {campo("numero_cuenta", "N.º de cuenta")}
              {campo("titular_cuenta", "Titular de la cuenta")}
            </div>
            <div className="flex justify-end gap-2">
              <button disabled={guardando} onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => abrir(null)} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Agregar freelancer
          </button>
        )}

        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {freelancers.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Todavía no hay freelancers registrados.</div>}
          {freelancers.map((f) => (
            <div key={f.id} className="rounded-xl border p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-sm">{f.nombre} {!f.activo && <span className="text-[10px] text-muted-foreground">(inactivo)</span>}</div>
                <div className="text-xs text-muted-foreground">
                  {[f.servicio, f.email, f.banco && `${f.banco} ${f.tipo_cuenta ?? ""} ${f.numero_cuenta ?? ""}`.trim()].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                </div>
              </div>
              <button onClick={() => abrir(f)} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Editar</button>
              <button onClick={() => void cambiarActivo(f)} className="px-3 py-1.5 rounded-lg border text-xs font-medium">{f.activo ? "Desactivar" : "Activar"}</button>
            </div>
          ))}
        </div>
        <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cerrar</button></div>
      </div>
    </ModalBase>
  );
}

// ===================== REGISTRAR HORAS =====================

function RegistrarHorasModal({ freelancers, inicialId, mes, anio, filas, onClose, onSaved }: {
  freelancers: Freelancer[];
  inicialId: string | null;
  mes: number;
  anio: number;
  filas: FilaFreelance[];
  onClose: () => void;
  onSaved: (fecha: string) => void | Promise<void>;
}) {
  const hoy = hoyLocal();
  const [freelancerId, setFreelancerId] = useState(inicialId ?? freelancers[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoy);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [tarea, setTarea] = useState("");
  const [guardando, setGuardando] = useState(false);

  const ini = horaInicio ? minutosDelDia(horaInicio) : NaN;
  const finMin = horaFin ? minutosDelDia(horaFin) : NaN;
  const duracion = Number.isFinite(ini) && Number.isFinite(finMin) ? finMin - ini : 0;
  const division = duracion > 0 ? dividirHorarioLaboral(horaInicio, duracion) : { laboral: 0, fuera: 0 };
  const [a, m] = fecha.split("-").map(Number);
  const mismoMes = a === anio && m === mes;
  const fila = filas.find((f) => f.id === freelancerId);
  const estimado = mismoMes && fila
    ? red2(fila.tarifa.laboral * division.laboral / 60 + fila.tarifa.fuera * division.fuera / 60)
    : null;

  const guardar = async () => {
    if (!freelancerId) return toast.error("Selecciona el freelancer.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast.error("Selecciona la fecha.");
    if (fecha > hoy) return toast.error("No se pueden registrar horas en fechas futuras.");
    if (!horaInicio || !horaFin) return toast.error("Escribe la hora de inicio y la hora de fin.");
    if (duracion <= 0) return toast.error("La hora de fin debe ser posterior a la hora de inicio.");
    if (duracion > 720) return toast.error("Un registro no puede superar 12 horas. Divídelo en varios registros.");
    const finReal = new Date(`${fecha}T00:00:00`).getTime() + finMin * 60000;
    if (finReal > Date.now()) return toast.error("Ese trabajo todavía no termina. Solo se registran horas ya trabajadas.");
    if (tarea.trim().length < 3) return toast.error("Describe la tarea realizada.");
    const nuevo = { fecha, hora_inicio: horaInicio, duracion_min: duracion };
    const cruce = fila?.registros.find((r) => seCruzan(r, nuevo));
    if (cruce) return toast.error(`Se cruza con otro registro (${cruce.fecha} ${cruce.hora_inicio.slice(0, 5)}).`);

    setGuardando(true);
    const { error } = await tabla("freelance_registros_horas").insert({
      freelancer_id: freelancerId, fecha, hora_inicio: horaInicio, duracion_min: duracion, tarea: tarea.trim(),
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`Horas registradas · ${formatHM(division.laboral)} laboral${division.fuera ? ` + ${formatHM(division.fuera)} fuera de horario` : ""}`);
    await onSaved(fecha);
  };

  return (
    <ModalBase title="Registrar horas trabajadas" subtitle="Solo trabajo ya realizado · se permiten meses anteriores" onClose={onClose}>
      <div className="p-5 space-y-3">
        <Campo label="Freelancer *">
          <select value={freelancerId} onChange={(e) => setFreelancerId(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
            {freelancers.map((f) => <option key={f.id} value={f.id}>{f.nombre}{f.servicio ? ` · ${f.servicio}` : ""}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="Fecha *"><input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
          <Campo label="Hora inicio *"><input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
          <Campo label="Hora fin *"><input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
        </div>
        <Campo label="Tarea realizada *">
          <textarea rows={2} value={tarea} maxLength={300} onChange={(e) => setTarea(e.target.value)} placeholder="Ej. Edición de 3 videos para Reels" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        </Campo>

        <div className="rounded-xl border p-3 text-sm">
          {duracion > 0 ? (
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Duración total</span><strong className="tabular-nums">{formatHM(duracion)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Horario laboral</span><span className="tabular-nums">{formatHM(division.laboral)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fuera de horario</span><span className="tabular-nums">{formatHM(division.fuera)}</span></div>
              {estimado != null && <div className="flex justify-between border-t pt-1 mt-1"><span className="text-muted-foreground">Valor estimado</span><strong className="tabular-nums">{dinero(estimado)}</strong></div>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Escribe la hora de inicio y fin para ver cuánto tiempo es laboral y cuánto fuera de horario (07:00–13:00 y 14:30–17:30).</div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar horas"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

// ===================== DETALLE =====================

function DetalleModal({ fila, mes, anio, onClose, onRefresh, onRegistrarHoras, onRegistrarAbono }: {
  fila: FilaFreelance;
  mes: number;
  anio: number;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onRegistrarHoras: () => void;
  onRegistrarAbono: () => void;
}) {
  const [tLab, setTLab] = useState(fila.tarifa.laboral ? String(fila.tarifa.laboral) : "");
  const [tFuera, setTFuera] = useState(fila.tarifaFueraDefinida ? String(fila.tarifa.fuera) : "");
  const [ajTipo, setAjTipo] = useState<"bono" | "descuento">("bono");
  const [ajMonto, setAjMonto] = useState("");
  const [ajMotivo, setAjMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardarTarifas = async () => {
    const lab = Number(tLab || 0);
    const fuera = tFuera.trim() === "" ? null : Number(tFuera);
    if (!Number.isFinite(lab) || lab < 0 || (fuera != null && (!Number.isFinite(fuera) || fuera < 0))) return toast.error("Valor por hora inválido.");
    setGuardando(true);
    const { error } = await tabla("freelance_tarifas_mes").upsert({
      freelancer_id: fila.id, mes, anio, valor_hora_laboral: lab, valor_hora_fuera: fuera, updated_at: new Date().toISOString(),
    } as never, { onConflict: "freelancer_id,mes,anio" });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Valores por hora guardados");
    await onRefresh();
  };

  const agregarAjuste = async () => {
    const monto = Number(ajMonto);
    if (!Number.isFinite(monto) || monto <= 0) return toast.error("Escribe un monto válido.");
    if (ajMotivo.trim().length < 3) return toast.error("Escribe el motivo.");
    setGuardando(true);
    const { error } = await tabla("freelance_ajustes").insert({
      freelancer_id: fila.id, mes, anio, tipo: ajTipo, monto, motivo: ajMotivo.trim(),
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(ajTipo === "bono" ? "Bono agregado" : "Descuento agregado");
    setAjMonto(""); setAjMotivo("");
    await onRefresh();
  };

  const borrar = async (t: "freelance_ajustes" | "freelance_registros_horas", id: string, texto: string) => {
    if (!confirm(texto)) return;
    const { error } = await tabla(t).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    await onRefresh();
  };

  const abrirComprobante = async (abono: AbonoFreelance) => {
    if (!abono.archivo_url) return toast.info("Este abono no tiene una imagen adjunta.");
    if (esUrlAbsoluta(abono.archivo_url)) { window.open(abono.archivo_url, "_blank", "noopener,noreferrer"); return; }
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(abono.archivo_url, 3600);
    if (error || !data) return toast.error("No se pudo abrir el comprobante.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const descargarPDF = () => {
    const seg = (laboral: boolean) => fila.calculo.segmentos.filter((s) => s.laboral === laboral).map((s) => ({
      fecha: s.fecha, horaInicio: s.horaInicio, horaFin: s.horaFin, tarea: s.tarea, minutos: s.minutos, monto: s.monto,
    }));
    generarInformeFreelancePDF({
      nombre: fila.nombre, servicio: fila.servicio ?? "", mes, anio,
      tarifaLaboral: fila.tarifa.laboral, tarifaFuera: fila.tarifa.fuera,
      laboral: seg(true), fuera: seg(false),
      bonos: fila.ajustes.filter((a) => a.tipo === "bono").map((a) => ({ motivo: a.motivo, monto: a.monto })),
      descuentos: fila.ajustes.filter((a) => a.tipo === "descuento").map((a) => ({ motivo: a.motivo, monto: a.monto })),
      abonos: fila.abonos.map((a) => ({ fecha: a.fecha_pago, monto: a.monto, tipo: a.tipo_pago, numero: a.numero_comprobante ?? "", observacion: a.observacion ?? "" })),
      total: fila.calculo.total,
    });
  };

  return (
    <ModalBase title={`Detalle · ${fila.nombre}`} subtitle={`${MESES[mes - 1]} ${anio}${fila.servicio ? ` · ${fila.servicio}` : ""}`} onClose={onClose} wide>
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          <button onClick={descargarPDF} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Informe PDF</button>
          {fila.activo && <button onClick={onRegistrarHoras} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5"><Clock className="w-4 h-4" /> Registrar horas</button>}
          {fila.falta > 0 && <button onClick={onRegistrarAbono} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-1.5"><ReceiptText className="w-4 h-4" /> Registrar abono</button>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniTotal label="Total" value={dinero(fila.calculo.total)} />
          <MiniTotal label="Pagado" value={dinero(fila.pagado)} positivo />
          <MiniTotal label="Falta" value={dinero(fila.falta)} alerta={fila.falta > 0} />
          <MiniTotal label="Tiempo" value={formatHM(fila.calculo.minutosLaboral + fila.calculo.minutosFuera)} />
        </div>

        <section className="rounded-xl border p-4 space-y-3">
          <div className="font-semibold text-sm">Valor por hora · {MESES[mes - 1]} {anio}</div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Campo label="Horario laboral ($/h)"><input type="number" min="0" step="0.01" value={tLab} onChange={(e) => setTLab(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" /></Campo>
            <Campo label="Fuera de horario ($/h)"><input type="number" min="0" step="0.01" value={tFuera} onChange={(e) => setTFuera(e.target.value)} placeholder="Igual al laboral" className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" /></Campo>
            <button disabled={guardando} onClick={() => void guardarTarifas()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">Guardar</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Si dejas vacío “Fuera de horario”, se usa el mismo valor que el horario laboral.</p>
        </section>

        <section className="rounded-xl border p-4">
          <div className="font-semibold text-sm mb-2">Horas registradas ({fila.registros.length})</div>
          {fila.registros.length === 0 ? (
            <div className="text-xs text-muted-foreground">Sin horas registradas en este mes.</div>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {fila.registros.map((r) => {
                const segs = fila.calculo.segmentos.filter((s) => s.registroId === r.id);
                const lab = segs.filter((s) => s.laboral).reduce((x, s) => x + s.minutos, 0);
                const fue = segs.filter((s) => !s.laboral).reduce((x, s) => x + s.minutos, 0);
                const monto = red2(segs.reduce((x, s) => x + s.monto, 0));
                return (
                  <div key={r.id} className="rounded-lg border p-3 flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <div className="text-sm font-semibold">{fechaLegible(r.fecha)} · {r.hora_inicio.slice(0, 5)}–{segs[segs.length - 1]?.horaFin ?? ""}</div>
                      <div className="text-xs text-muted-foreground break-words">{r.tarea}</div>
                      <div className="text-[11px] mt-1">
                        {lab > 0 && <span className="mr-2">Laboral: <strong>{formatHM(lab)}</strong></span>}
                        {fue > 0 && <span className="text-amber-700 dark:text-amber-300">Fuera de horario: <strong>{formatHM(fue)}</strong></span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold tabular-nums">{dinero(monto)}</div>
                    <button onClick={() => void borrar("freelance_registros_horas", r.id, "¿Eliminar este registro de horas?")} className="p-1.5 rounded-lg border text-red-600" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border p-4 space-y-3">
          <div className="font-semibold text-sm">Bonos y descuentos</div>
          <div className="grid grid-cols-1 sm:grid-cols-[130px_120px_1fr_auto] gap-2 items-end">
            <Campo label="Tipo">
              <select value={ajTipo} onChange={(e) => setAjTipo(e.target.value as "bono" | "descuento")} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
                <option value="bono">Bono</option>
                <option value="descuento">Descuento</option>
              </select>
            </Campo>
            <Campo label="Monto ($)"><input type="number" min="0" step="0.01" value={ajMonto} onChange={(e) => setAjMonto(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" /></Campo>
            <Campo label="Motivo"><input value={ajMotivo} maxLength={200} onChange={(e) => setAjMotivo(e.target.value)} placeholder="Ej. entrega anticipada" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
            <button disabled={guardando} onClick={() => void agregarAjuste()} className="px-4 py-2 rounded-lg border text-sm font-semibold disabled:opacity-60">Agregar</button>
          </div>
          {fila.ajustes.map((aj) => (
            <div key={aj.id} className="flex items-center justify-between gap-2 text-sm border-t pt-2">
              <div className="min-w-0">
                <div className={`font-semibold tabular-nums ${aj.tipo === "bono" ? "text-emerald-600" : "text-red-600"}`}>{aj.tipo === "bono" ? "+" : "−"}{dinero(aj.monto)}</div>
                <div className="text-xs text-muted-foreground truncate">{aj.motivo}</div>
              </div>
              <button onClick={() => void borrar("freelance_ajustes", aj.id, `¿Eliminar este ${aj.tipo}?`)} className="text-xs text-red-600 font-semibold">Borrar</button>
            </div>
          ))}
        </section>

        {fila.abonos.length > 0 && (
          <section className="rounded-xl border p-4 space-y-2">
            <div className="font-semibold text-sm">Pagos realizados</div>
            {fila.abonos.map((a) => (
              <div key={a.id} className="flex items-center gap-3 flex-wrap border-t pt-2">
                <div className="flex-1 min-w-[160px]">
                  <div className="font-semibold text-sm">{dinero(a.monto)} · {a.tipo_pago}</div>
                  <div className="text-xs text-muted-foreground">{new Date(`${a.fecha_pago}T00:00:00`).toLocaleDateString("es-EC")}{a.numero_comprobante ? ` · N.º ${a.numero_comprobante}` : ""}</div>
                  {a.observacion && <div className="text-xs text-muted-foreground">{a.observacion}</div>}
                </div>
                <button onClick={() => void abrirComprobante(a)} disabled={!a.archivo_url} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40">
                  <Eye className="w-3.5 h-3.5" /> {a.archivo_url ? "Comprobante" : "Sin archivo"}
                </button>
              </div>
            ))}
          </section>
        )}

        <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cerrar</button></div>
      </div>
    </ModalBase>
  );
}

// ===================== ABONOS =====================

function RegistrarAbonoModal({ fila, mes, anio, onClose, onSaved }: {
  fila: FilaFreelance;
  mes: number;
  anio: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const leer = useServerFn(leerComprobante);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fecha, setFecha] = useState(hoyLocal());
  const [monto, setMonto] = useState(fila.falta > 0 ? String(fila.falta) : "");
  const [tipoPago, setTipoPago] = useState("transferencia");
  const [numero, setNumero] = useState("");
  const [observacion, setObservacion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const montoNum = Number(monto || 0);

  const procesar = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Sube una imagen del comprobante.");
    setArchivo(file);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    });
    setPreview(dataUrl);
    setLeyendo(true);
    try {
      const data = await leer({ data: { imagenBase64: dataUrl } });
      if (data.monto) setMonto(String(data.monto));
      if (data.fecha && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) setFecha(data.fecha);
      if (data.numero_comprobante) setNumero(data.numero_comprobante);
      if (data.tipo_pago && ["transferencia", "efectivo", "cheque", "deposito", "otro"].includes(data.tipo_pago)) setTipoPago(data.tipo_pago);
      if (data.observacion && !observacion) setObservacion(data.observacion);
      toast.success("Comprobante leído · revisa los datos antes de guardar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo leer el comprobante.");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async () => {
    if (!Number.isFinite(montoNum) || montoNum <= 0) return toast.error("Escribe el monto del abono.");
    if (montoNum > fila.falta + 0.001) return toast.error(`El abono supera lo que falta por pagar (${dinero(fila.falta)}).`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast.error("Selecciona la fecha del pago.");
    setGuardando(true);
    let archivoUrl: string | null = null;
    if (archivo) {
      try {
        archivoUrl = await subirImagen(archivo, "adn/comprobantes");
      } catch (error) {
        setGuardando(false);
        return toast.error(error instanceof Error ? error.message : "No se pudo subir el comprobante.");
      }
    }
    const { error } = await tabla("freelance_abonos").insert({
      freelancer_id: fila.id, mes, anio, fecha_pago: fecha, monto: montoNum, tipo_pago: tipoPago,
      numero_comprobante: numero.trim() || null, observacion: observacion.trim() || null, archivo_url: archivoUrl,
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Abono registrado");
    await onSaved();
  };

  return (
    <ModalBase title={`Registrar abono · ${fila.nombre}`} subtitle={`${MESES[mes - 1]} ${anio}`} onClose={onClose} wide>
      <div className="grid md:grid-cols-[1fr_220px] gap-5 p-5">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Fecha *"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
            <Campo label="Monto ($) *"><input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" placeholder="0.00" /></Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Método de pago *">
              <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
                <option value="transferencia">Transferencia</option>
                <option value="deposito">Depósito</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="N.º de comprobante"><input value={numero} onChange={(e) => setNumero(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Opcional" /></Campo>
          </div>
          <Campo label="Observación"><textarea rows={3} value={observacion} onChange={(e) => setObservacion(e.target.value.slice(0, 300))} maxLength={300} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Opcional" /></Campo>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <MiniTotal label="Total" value={dinero(fila.calculo.total)} />
            <MiniTotal label="Pagado" value={dinero(fila.pagado)} positivo />
            <MiniTotal label="Falta" value={dinero(fila.falta)} alerta={fila.falta > 0} />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Comprobante</div>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="w-full aspect-square max-h-[210px] rounded-xl border-2 border-dashed grid place-items-center overflow-hidden text-xs"
            style={{ borderColor: "var(--violet)", background: "color-mix(in oklab, var(--violet) 6%, transparent)" }}>
            {preview ? <img src={preview} alt="Comprobante" className="w-full h-full object-contain" /> : leyendo ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo…</span>
            ) : (
              <span className="inline-flex flex-col items-center gap-2 text-muted-foreground px-3 text-center"><Upload className="w-5 h-5" /> Subir imagen y detectar datos</span>
            )}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void procesar(file); }} />
        </div>
      </div>
      <div className="px-5 pb-5 flex justify-end gap-2">
        <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
        <button disabled={guardando || leyendo} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar abono"}
        </button>
      </div>
    </ModalBase>
  );
}

// ===================== UI BASE =====================

// Modal persistente: solo se cierra con X, Cancelar/Cerrar o al guardar
// (no al hacer clic fuera ni al cambiar de pestaña).
function ModalBase({ title, subtitle, onClose, wide = false, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 overflow-y-auto">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-card border shadow-xl my-6 min-w-0`}>
        <div className="flex items-center justify-between gap-2 px-5 py-3 rounded-t-2xl text-white bg-violet-gradient">
          <div className="min-w-0">
            <div className="font-semibold truncate">{title}</div>
            {subtitle && <div className="text-xs opacity-85 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 shrink-0 rounded-full grid place-items-center bg-white/20"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>{children}</label>;
}

function MiniTotal({ label, value, positivo = false, alerta = false }: { label: string; value: string; positivo?: boolean; alerta?: boolean }) {
  return (
    <div className="rounded-xl border p-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold tabular-nums mt-1 truncate ${positivo ? "text-emerald-600" : alerta ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
