import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Eye,
  FileImage,
  FileText,
  Loader2,
  ReceiptText,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";
import { formatNombre } from "@/lib/nombres";
import { generarInformeAlumnasPDF, listaMeses } from "@/lib/pagos-export";
import { subirImagen, esUrlAbsoluta } from "@/lib/cloudinary";
import { leerComprobante } from "@/lib/comprobante-ocr.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pagos_/alumnas")({ component: Page });

interface AlumnaBasica {
  id: string;
  nombre_completo: string | null;
  email: string | null;
  avatar_url?: string | null;
  estado?: string | null;
  seleccionada?: boolean;
  cuenta_bancaria_completa?: boolean;
  acompanantes_count?: number;
}

interface TotalMentoria {
  id: string;
  alumna_id: string;
  mes: number;
  anio: number;
  total: number;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

interface AbonoMentoria {
  id: string;
  alumna_id: string;
  mes: number;
  anio: number;
  fecha_pago: string;
  monto: number;
  tipo_pago: string;
  numero_comprobante: string | null;
  observacion: string | null;
  archivo_url: string | null;
  banco_origen?: string | null;
  cuenta_origen?: string | null;
  titular_origen?: string | null;
  referencia_pago?: string | null;
  tarjeta_marca?: string | null;
  tarjeta_ultimos4?: string | null;
  archivo_nombre?: string | null;
  creado_por: string | null;
  created_at: string;
}

interface FilaAlumna extends AlumnaBasica {
  total: number;
  pagado: number;
  falta: number;
  estado: "pagado" | "debe" | "sin_total";
  abonos: AbonoMentoria[];
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

function nombreAlumna(a: AlumnaBasica) {
  return formatNombre(a.nombre_completo) || a.email || "Alumna";
}

// Tablas creadas previamente para la gestión mensual de mentoría de alumnas.
// El cast conserva el cliente generado actual sin tocar types.ts; en runtime
// Supabase recibe los nombres reales que aparecen antes del `as`.
function tablaTotales() {
  return supabase.from("pagos_mentoria_totales" as "pagos_mensuales");
}

function tablaAbonos() {
  return supabase.from("pagos_mentoria_abonos" as "pagos_comprobantes");
}

function Page() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [alumnas, setAlumnas] = useState<AlumnaBasica[]>([]);
  const [totales, setTotales] = useState<TotalMentoria[]>([]);
  const [abonos, setAbonos] = useState<AbonoMentoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [infraError, setInfraError] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [totalesDe, setTotalesDe] = useState<FilaAlumna | null>(null);
  const [abonoDe, setAbonoDe] = useState<FilaAlumna | null>(null);
  const [comprobantesDe, setComprobantesDe] = useState<FilaAlumna | null>(null);
  const [todosUsuarios, setTodosUsuarios] = useState<AlumnaBasica[]>([]);
  const [seleccionAlumnasOpen, setSeleccionAlumnasOpen] = useState(false);
  const [gestionDe, setGestionDe] = useState<FilaAlumna | null>(null);

  const cargar = useCallback(async () => {
    if (!puedeGestionar) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setInfraError(null);
    try {
      const { data: usuariosData, error: usuariosError } = await supabase.rpc("listar_usuarios_para_mentoria");
      if (usuariosError) throw usuariosError;

      const usuarios = ((usuariosData ?? []) as unknown) as AlumnaBasica[];
      const seleccionadas = usuarios
        .filter((u) => Boolean(u.seleccionada))
        .sort((a, b) => nombreAlumna(a).localeCompare(nombreAlumna(b), "es"));

      setTodosUsuarios(usuarios);
      setAlumnas(seleccionadas);

      const [totalesRes, abonosRes] = await Promise.all([
        tablaTotales().select("*").eq("mes", mes).eq("anio", anio),
        tablaAbonos().select("*").eq("mes", mes).eq("anio", anio).order("fecha_pago", { ascending: false }),
      ]);

      if (totalesRes.error || abonosRes.error) {
        const err = totalesRes.error ?? abonosRes.error;
        setTotales([]);
        setAbonos([]);
        setInfraError(err?.message || "No se pudo cargar la estructura de pagos de alumnas.");
        return;
      }

      setTotales(((totalesRes.data ?? []) as unknown) as TotalMentoria[]);
      setAbonos(((abonosRes.data ?? []) as unknown) as AbonoMentoria[]);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "No se pudieron cargar los pagos de alumnas.";
      setTodosUsuarios([]);
      setAlumnas([]);
      setTotales([]);
      setAbonos([]);
      setInfraError(mensaje);
      toast.error(mensaje);
    } finally {
      setLoading(false);
    }
  }, [puedeGestionar, mes, anio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filas = useMemo<FilaAlumna[]>(() => {
    const totalPorAlumna = new Map(totales.map((t) => [t.alumna_id, Number(t.total || 0)]));
    const abonosPorAlumna = new Map<string, AbonoMentoria[]>();
    abonos.forEach((a) => {
      const lista = abonosPorAlumna.get(a.alumna_id) ?? [];
      lista.push(a);
      abonosPorAlumna.set(a.alumna_id, lista);
    });

    return alumnas.map((alumna) => {
      const total = totalPorAlumna.get(alumna.id) ?? 0;
      const lista = abonosPorAlumna.get(alumna.id) ?? [];
      const pagado = Math.round(lista.reduce((s, a) => s + Number(a.monto || 0), 0) * 100) / 100;
      const falta = Math.max(0, Math.round((total - pagado) * 100) / 100);
      const estado: FilaAlumna["estado"] = total <= 0 ? "sin_total" : pagado + 0.001 >= total ? "pagado" : "debe";
      return { ...alumna, total, pagado, falta, estado, abonos: lista };
    });
  }, [alumnas, totales, abonos]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => `${nombreAlumna(f)} ${f.email ?? ""}`.toLowerCase().includes(q));
  }, [filas, buscar]);

  const resumen = useMemo(() => ({
    cobrar: filas.reduce((s, f) => s + f.falta, 0),
    abonado: filas.reduce((s, f) => s + f.pagado, 0),
    pendientes: filas.filter((f) => f.estado === "debe").length,
    alDia: filas.filter((f) => f.estado === "pagado").length,
  }), [filas]);

  if (!puedeGestionar) {
    return <div className="p-8 text-center text-muted-foreground">No tienes permiso para ver Pagos e informes.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select
          value={`${anio}-${mes}`}
          onChange={(e) => {
            const [a, m] = e.target.value.split("-").map(Number);
            setAnio(a);
            setMes(m);
          }}
          className="px-3 py-2 rounded-lg border bg-card text-sm font-medium"
        >
          {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="text-xs text-muted-foreground">
          Usa <strong className="text-foreground">Totales</strong> para fijar el valor de mentoría; Pagado y Falta se calculan automáticamente con los abonos.
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold">Pagos e informes · Alumnas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Solo aparecen aquí las cuentas que fueron seleccionadas como alumnas de mentoría.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSeleccionAlumnasOpen(true)} className="px-3 py-2 rounded-lg border bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-muted/40">
            <Users className="w-4 h-4" /> Seleccionar alumnas
          </button>
          <button
            onClick={() => {
              generarInformeAlumnasPDF({
                mes,
                anio,
                totalAlumnas: todosUsuarios.length,
                seleccionadas: filas.length,
                pagadas: resumen.alDia,
                pendientes: resumen.pendientes,
                totalFacturado: filas.reduce((s, f) => s + f.total, 0),
                totalAbonado: resumen.abonado,
                totalFalta: resumen.cobrar,
                filas: filas.map((f) => ({
                  nombre: nombreAlumna(f),
                  email: f.email || "",
                  total: f.total,
                  pagado: f.pagado,
                  falta: f.falta,
                  estado: f.estado === "sin_total" ? "sin_total" : f.estado,
                  cuentaCompleta: Boolean(f.cuenta_bancaria_completa),
                  acompanantes: Number(f.acompanantes_count || 0),
                  abonos: f.abonos.map((a) => ({
                    fecha: a.fecha_pago,
                    monto: Number(a.monto),
                    tipo: a.tipo_pago,
                    bancoOrigen: a.banco_origen,
                    cuentaOrigen: a.cuenta_origen,
                    titularOrigen: a.titular_origen,
                    referencia: a.referencia_pago,
                    numeroComprobante: a.numero_comprobante,
                    observacion: a.observacion,
                  })),
                })),
              });
            }}
            className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Informe PDF
          </button>
        </div>
      </div>

      {infraError && (
        <div className="mb-5 rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
          <div className="font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4" /> La estructura de pagos de alumnas todavía no está disponible en la base de datos.
          </div>
          <div className="text-xs text-muted-foreground mt-1">{infraError}</div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0F1431,#1B1F4A)" }}>
          <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,107,255,.5), transparent 70%)" }} />
          <div className="text-[10px] uppercase tracking-wider opacity-70">Deuda total · {MESES[mes - 1]}</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{dinero(resumen.cobrar)}</div>
          <div className="text-xs opacity-80 mt-1">{resumen.pendientes} alumna{resumen.pendientes === 1 ? "" : "s"} · debe</div>
        </div>
        <KPI label="Total abonado" value={dinero(resumen.abonado)} sub="registrado en el periodo" />
        <KPI label="Alumnas que deben" value={String(resumen.pendientes)} sub={`de ${filas.length} seleccionadas`} />
        <KPI label="Alumnas al día" value={String(resumen.alDia)} sub={`de ${filas.length} seleccionadas`} />
        <KPI label="Cuentas seleccionables" value={String(todosUsuarios.length)} sub="usuarios con rol Alumno" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3 px-1">
        <div>
          <h2 className="text-lg font-semibold">Resumen de alumnas · {MESES[mes - 1]} {anio}</h2>
          <p className="text-xs text-muted-foreground">Control mensual de la mentoría. El total mensual se fija por alumna y Pagado/Falta se calculan desde los abonos.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar alumna…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-card text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-4 py-3 font-semibold">Alumna</th>
              <th className="text-right px-3 py-3 font-semibold">Total</th>
              <th className="text-right px-3 py-3 font-semibold">Pagado</th>
              <th className="text-right px-3 py-3 font-semibold">Falta</th>
              <th className="text-left px-3 py-3 font-semibold">Estado</th>
              <th className="text-left px-3 py-3 font-semibold">Cuenta bancaria</th>
              <th className="text-left px-3 py-3 font-semibold">Acompañantes</th>
              <th className="text-right px-4 py-3 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Cargando alumnas…</td></tr>
            )}
            {!loading && filtradas.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No hay alumnas seleccionadas. Usa “Seleccionar alumnas” para agregar cuentas existentes.</td></tr>
            )}
            {!loading && filtradas.map((f) => (
              <tr key={f.id} className="border-t hover:bg-muted/30 transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white shrink-0" style={{ background: colorDe(f.id) }}>
                        {nombreAlumna(f).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{nombreAlumna(f)}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{f.email || "Sin correo"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{dinero(f.total)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-600">{dinero(f.pagado)}</td>
                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${f.falta > 0 ? "text-red-600" : "text-muted-foreground"}`}>{dinero(f.falta)}</td>
                <td className="px-3 py-3">
                  {f.estado === "pagado" ? (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Pagado
                    </span>
                  ) : f.estado === "sin_total" ? (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Sin valor</span>
                  ) : (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Debe</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {f.cuenta_bancaria_completa ? (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Completa</span>
                  ) : (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Pendiente</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs font-medium">{Number(f.acompanantes_count || 0)} / 2</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setGestionDe(f)} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted/40">
                      <UserRound className="w-3.5 h-3.5" /> Ficha
                    </button>
                    <button onClick={() => setTotalesDe(f)} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted/40">
                      <Calculator className="w-3.5 h-3.5" /> Totales
                    </button>
                    <button onClick={() => setComprobantesDe(f)} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-muted/40">
                      <Eye className="w-3.5 h-3.5" /> Ver comp.
                    </button>
                    <button onClick={() => setAbonoDe(f)} disabled={!!infraError} className="px-3 py-1.5 rounded-lg bg-violet-gradient text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
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
                <td className="px-4 py-3 text-right" colSpan={3}>TOTAL POR COBRAR</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--violet)" }}>{dinero(resumen.cobrar)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalesDe && (
        <TotalesModal
          fila={totalesDe}
          mes={mes}
          anio={anio}
          uid={session?.user.id ?? null}
          onClose={() => setTotalesDe(null)}
          onSaved={async () => { setTotalesDe(null); await cargar(); }}
        />
      )}

      {abonoDe && (
        <RegistrarAbonoAlumnaModal
          fila={abonoDe}
          mes={mes}
          anio={anio}
          uid={session?.user.id ?? null}
          onClose={() => setAbonoDe(null)}
          onSaved={async () => { setAbonoDe(null); await cargar(); }}
        />
      )}

      {comprobantesDe && (
        <ComprobantesModal fila={comprobantesDe} onClose={() => setComprobantesDe(null)} />
      )}
      {seleccionAlumnasOpen && (
        <SeleccionAlumnasModal
          usuarios={todosUsuarios}
          onClose={() => setSeleccionAlumnasOpen(false)}
          onSaved={async () => { await cargar(); }}
        />
      )}
      {gestionDe && (
        <GestionAlumnaModal
          fila={gestionDe}
          onClose={() => setGestionDe(null)}
          onSaved={async () => { setGestionDe(null); await cargar(); }}
        />
      )}
    </div>
  );
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

function TotalesModal({ fila, mes, anio, uid, onClose, onSaved }: {
  fila: FilaAlumna;
  mes: number;
  anio: number;
  uid: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [valor, setValor] = useState(fila.total ? String(fila.total) : "");
  const [guardando, setGuardando] = useState(false);
  const totalNum = Number(valor || 0);
  const faltaCalculada = Math.max(0, Math.round((totalNum - fila.pagado) * 100) / 100);
  const ultimo = fila.abonos[0]?.fecha_pago ?? null;

  const guardar = async () => {
    if (!Number.isFinite(totalNum) || totalNum < 0) return toast.error("Escribe un total válido.");
    if (totalNum + 0.001 < fila.pagado) return toast.error(`El total no puede ser menor a lo ya pagado (${dinero(fila.pagado)}).`);
    setGuardando(true);
    const { error } = await tablaTotales().upsert({
      alumna_id: fila.id,
      mes,
      anio,
      total: totalNum,
      creado_por: uid,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "alumna_id,mes,anio" });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Total de mentoría guardado");
    await onSaved();
  };

  return (
    <ModalBase title={`Totales · ${nombreAlumna(fila)}`} subtitle={`${MESES[mes - 1]} ${anio}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold mb-1">Total de mentoría del mes ($)</label>
          <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" placeholder="0.00" />
          <p className="text-[11px] text-muted-foreground mt-1">Este es el único valor manual. Pagado y Falta se calculan con los abonos registrados.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniTotal label="Total" value={dinero(totalNum)} />
          <MiniTotal label="Pagado" value={dinero(fila.pagado)} positivo />
          <MiniTotal label="Falta" value={dinero(faltaCalculada)} alerta={faltaCalculada > 0} />
          <MiniTotal label="N.º de abonos" value={String(fila.abonos.length)} />
        </div>

        <div className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">
          Último abono: <strong className="text-foreground">{ultimo ? new Date(`${ultimo}T00:00:00`).toLocaleDateString("es-EC") : "Sin abonos"}</strong>
        </div>

        <div className="flex justify-end gap-2">
          <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar total"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

function RegistrarAbonoAlumnaModal({ fila, mes, anio, uid, onClose, onSaved }: {
  fila: FilaAlumna;
  mes: number;
  anio: number;
  uid: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const leer = useServerFn(leerComprobante);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [tipoPago, setTipoPago] = useState("transferencia");
  const [numero, setNumero] = useState("");
  const [bancoOrigen, setBancoOrigen] = useState("");
  const [cuentaOrigen, setCuentaOrigen] = useState("");
  const [titularOrigen, setTitularOrigen] = useState("");
  const [referenciaPago, setReferenciaPago] = useState("");
  const [tarjetaMarca, setTarjetaMarca] = useState("");
  const [tarjetaUltimos4, setTarjetaUltimos4] = useState("");
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
      if (data.numero_comprobante) {
        setNumero(data.numero_comprobante);
        setReferenciaPago(data.numero_comprobante);
      }
      if (data.banco) setBancoOrigen(data.banco);
      if (data.tipo_pago) {
        const normalizado = data.tipo_pago === "tarjeta" ? "tarjeta" : data.tipo_pago;
        if (["transferencia", "efectivo", "cheque", "deposito", "tarjeta", "otro"].includes(normalizado)) setTipoPago(normalizado);
      }
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
    if (fila.total <= 0) return toast.error("Primero registra el total de mentoría del mes.");
    if (montoNum > fila.falta + 0.001) return toast.error(`El abono supera lo que falta por pagar (${dinero(fila.falta)}).`);
    if ((tipoPago === "transferencia" || tipoPago === "deposito") && !bancoOrigen.trim()) {
      return toast.error("Indica el banco de origen para este pago.");
    }
    if ((tipoPago === "transferencia" || tipoPago === "deposito") && !archivo) {
      return toast.error("Adjunta el comprobante de la transferencia o depósito.");
    }
    if (tipoPago === "tarjeta" && tarjetaUltimos4 && tarjetaUltimos4.length !== 4) {
      return toast.error("Los últimos 4 dígitos de la tarjeta deben tener exactamente 4 números.");
    }
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

    const { error } = await tablaAbonos().insert({
      alumna_id: fila.id,
      mes,
      anio,
      fecha_pago: fecha,
      monto: montoNum,
      tipo_pago: tipoPago,
      numero_comprobante: numero.trim() || null,
      observacion: observacion.trim() || null,
      archivo_url: archivoUrl,
      archivo_nombre: archivo?.name || null,
      banco_origen: bancoOrigen.trim() || null,
      cuenta_origen: cuentaOrigen.trim() || null,
      titular_origen: titularOrigen.trim() || null,
      referencia_pago: referenciaPago.trim() || numero.trim() || null,
      tarjeta_marca: tarjetaMarca || null,
      tarjeta_ultimos4: tarjetaUltimos4 || null,
      creado_por: uid,
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Abono de la alumna registrado");
    await onSaved();
  };

  return (
    <ModalBase title={`Registrar abono · ${nombreAlumna(fila)}`} subtitle={`${MESES[mes - 1]} ${anio}`} onClose={onClose} wide>
      <div className="grid md:grid-cols-[1fr_220px] gap-5 p-5">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha *"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
            <Campo label="Monto ($) *"><input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" placeholder="0.00" /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Método de pago *">
              <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
                <option value="transferencia">Transferencia bancaria</option>
                <option value="deposito">Depósito bancario</option>
                <option value="tarjeta">Tarjeta crédito / débito</option>
                <option value="efectivo">Efectivo / pago directo</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="N.º de comprobante"><input value={numero} onChange={(e) => setNumero(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Opcional" /></Campo>
          </div>

          {(tipoPago === "transferencia" || tipoPago === "deposito") && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Banco de origen *"><input value={bancoOrigen} onChange={(e) => setBancoOrigen(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Ej. Banco Pichincha" /></Campo>
              <Campo label="Cuenta de origen"><input value={cuentaOrigen} onChange={(e) => setCuentaOrigen(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Número de cuenta" /></Campo>
              <Campo label="Titular de la cuenta"><input value={titularOrigen} onChange={(e) => setTitularOrigen(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Titular que realizó el pago" /></Campo>
              <Campo label="Referencia bancaria"><input value={referenciaPago} onChange={(e) => setReferenciaPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Código o referencia" /></Campo>
            </div>
          )}

          {tipoPago === "tarjeta" && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Marca de tarjeta"><select value={tarjetaMarca} onChange={(e) => setTarjetaMarca(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm"><option value="">Seleccionar…</option><option value="visa">Visa</option><option value="mastercard">Mastercard</option><option value="amex">American Express</option><option value="otra">Otra</option></select></Campo>
              <Campo label="Últimos 4 dígitos"><input inputMode="numeric" maxLength={4} value={tarjetaUltimos4} onChange={(e) => setTarjetaUltimos4(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="1234" /></Campo>
            </div>
          )}

          <Campo label="Observación"><textarea rows={3} value={observacion} onChange={(e) => setObservacion(e.target.value.slice(0, 300))} maxLength={300} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Nota adicional, concepto o medio usado" /></Campo>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <MiniTotal label="Total" value={dinero(fila.total)} />
            <MiniTotal label="Pagado" value={dinero(fila.pagado)} positivo />
            <MiniTotal label="Falta" value={dinero(fila.falta)} alerta={fila.falta > 0} />
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Comprobante</div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full aspect-square max-h-[210px] rounded-xl border-2 border-dashed grid place-items-center overflow-hidden text-xs"
            style={{ borderColor: "var(--violet)", background: "color-mix(in oklab, var(--violet) 6%, transparent)" }}
          >
            {preview ? <img src={preview} alt="Comprobante" className="w-full h-full object-contain" /> : leyendo ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo…</span>
            ) : (
              <span className="inline-flex flex-col items-center gap-2 text-muted-foreground px-3 text-center"><Upload className="w-5 h-5" /> Subir imagen y detectar datos</span>
            )}
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void procesar(file); }} />
          <p className="text-[11px] text-muted-foreground mt-2">Al subir una imagen, el sistema intenta detectar monto, fecha y número de comprobante.</p>
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

function ComprobantesModal({ fila, onClose }: { fila: FilaAlumna; onClose: () => void }) {
  const abrirComprobante = async (abono: AbonoMentoria) => {
    if (!abono.archivo_url) return toast.info("Este abono no tiene una imagen adjunta.");
    if (esUrlAbsoluta(abono.archivo_url)) {
      window.open(abono.archivo_url, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(abono.archivo_url, 3600);
    if (error || !data) return toast.error("No se pudo abrir el comprobante.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <ModalBase title={`Comprobantes · ${nombreAlumna(fila)}`} subtitle={`${fila.abonos.length} abono${fila.abonos.length === 1 ? "" : "s"} registrado${fila.abonos.length === 1 ? "" : "s"}`} onClose={onClose} wide>
      <div className="p-5">
        {fila.abonos.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No hay abonos ni comprobantes registrados para esta alumna en el periodo.</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {fila.abonos.map((a) => (
              <div key={a.id} className="rounded-xl border p-3 flex items-center gap-3 flex-wrap">
                <div className="w-9 h-9 rounded-lg grid place-items-center bg-muted shrink-0"><FileImage className="w-4 h-4" /></div>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold text-sm">{dinero(a.monto)} · {a.tipo_pago}</div>
                  <div className="text-xs text-muted-foreground">{new Date(`${a.fecha_pago}T00:00:00`).toLocaleDateString("es-EC")}{a.numero_comprobante ? ` · N.º ${a.numero_comprobante}` : ""}</div>
                  {(a.banco_origen || a.cuenta_origen || a.titular_origen || a.referencia_pago) && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {[a.banco_origen, a.cuenta_origen ? `Cuenta ${a.cuenta_origen}` : null, a.titular_origen ? `Titular: ${a.titular_origen}` : null, a.referencia_pago ? `Ref: ${a.referencia_pago}` : null].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {(a.tarjeta_marca || a.tarjeta_ultimos4) && <div className="text-[11px] text-muted-foreground mt-1">Tarjeta: {[a.tarjeta_marca, a.tarjeta_ultimos4 ? `•••• ${a.tarjeta_ultimos4}` : null].filter(Boolean).join(" · ")}</div>}
                  {a.observacion && <div className="text-xs text-muted-foreground mt-1">{a.observacion}</div>
                </div>
                <button onClick={() => void abrirComprobante(a)} disabled={!a.archivo_url} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40">
                  <Eye className="w-3.5 h-3.5" /> {a.archivo_url ? "Abrir comprobante" : "Sin archivo"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-4"><button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cerrar</button></div>
      </div>
    </ModalBase>
  );
}

function ModalBase({ title, subtitle, onClose, wide = false, children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-card border shadow-xl my-6`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 rounded-t-2xl text-white bg-violet-gradient">
          <div className="min-w-0">
            <div className="font-semibold truncate">{title}</div>
            {subtitle && <div className="text-xs opacity-85 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center bg-white/20"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>{children}</label>;
}

function MiniTotal({ label, value, positivo = false, alerta = false }: { label: string; value: string; positivo?: boolean; alerta?: boolean }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-bold tabular-nums mt-1 ${positivo ? "text-emerald-600" : alerta ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}


function SeleccionAlumnasModal({ usuarios, onClose, onSaved }: {
  usuarios: AlumnaBasica[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [rows, setRows] = useState<AlumnaBasica[]>(usuarios);
  useEffect(() => setRows(usuarios), [usuarios]);

  const filtradas = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((u) => `${nombreAlumna(u)} ${u.email || ""}`.toLowerCase().includes(needle));
  }, [rows, q]);

  const toggle = async (u: AlumnaBasica) => {
    setGuardando(u.id);
    const { error } = await supabase.rpc("guardar_alumna_mentoria", { _alumna_id: u.id, _activo: !u.seleccionada });
    setGuardando(null);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((x) => x.id === u.id ? { ...x, seleccionada: !u.seleccionada } : x));
    toast.success(!u.seleccionada ? "Alumna agregada a mentoría" : "Alumna retirada de mentoría");
    await onSaved();
  };

  return (
    <ModalBase title="Seleccionar alumnas de mentoría" subtitle={`${rows.filter((r) => r.seleccionada).length} seleccionadas · ${rows.length} cuentas existentes`} onClose={onClose} wide>
      <div className="p-5">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo…" className="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-background text-sm" />
        </div>
        <div className="border rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
          {filtradas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No hay cuentas que coincidan.</div>
          ) : filtradas.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 border-b last:border-b-0">
              {u.avatar_url ? <img src={u.avatar_url} className="w-9 h-9 rounded-full object-cover" alt="" /> : (
                <div className="w-9 h-9 rounded-full bg-muted grid place-items-center text-xs font-bold">{nombreAlumna(u).slice(0,2).toUpperCase()}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{nombreAlumna(u)}</div>
                <div className="text-[11px] text-muted-foreground truncate">{u.email || "Sin correo"} · {u.estado || "sin estado"}</div>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{u.cuenta_bancaria_completa ? "Banco registrado" : "Banco pendiente"}</span>
                <span>·</span><span>{Number(u.acompanantes_count || 0)}/2 acompañantes</span>
              </div>
              <button disabled={guardando === u.id} onClick={() => void toggle(u)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${u.seleccionada ? "bg-foreground text-background border-transparent" : "bg-card hover:bg-muted"}`}>
                {guardando === u.id ? "Guardando…" : u.seleccionada ? "Seleccionada" : "Seleccionar"}
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-4"><button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cerrar</button></div>
      </div>
    </ModalBase>
  );
}

function GestionAlumnaModal({ fila, onClose, onSaved }: {
  fila: FilaAlumna;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [acompanantes, setAcompanantes] = useState<Array<{ id: string; nombre_completo: string | null; email: string | null; avatar_url?: string | null }>>([]);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [cuenta, setCuenta] = useState<{ banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null; titular_cuenta: string | null; cedula_titular: string | null; completo: boolean } | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const [acRes, cuentaRes] = await Promise.all([
          supabase.rpc("listar_acompanantes_mentoria", { _alumna_id: fila.id }),
          supabase.rpc("obtener_datos_pago_alumna", { _alumna_id: fila.id }),
        ]);
        if (acRes.error) throw acRes.error;
        if (cuentaRes.error) throw cuentaRes.error;
        if (!activo) return;
        const ac = ((acRes.data ?? []) as Array<{ id: string; nombre_completo: string | null; email: string | null; avatar_url?: string | null; orden: number }>).sort((a,b) => a.orden - b.orden);
        setAcompanantes(ac);
        setSeleccionados(ac.map((a) => a.id));
        const row = (cuentaRes.data?.[0] ?? null) as { banco: string | null; tipo_cuenta: string | null; numero_cuenta: string | null; titular_cuenta: string | null; cedula_titular: string | null; completo: boolean } | null;
        setCuenta(row);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cargar la ficha de la alumna.");
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [fila.id]);

  const guardarAcompanantes = async () => {
    if (new Set(seleccionados.filter(Boolean)).size !== seleccionados.filter(Boolean).length) return toast.error("No puedes repetir un acompañante.");
    if (seleccionados.length > 2) return toast.error("Máximo 2 acompañantes.");
    setGuardando(true);
    const { error } = await supabase.rpc("guardar_acompanantes_mentoria", { _alumna_id: fila.id, _acompanantes: seleccionados.filter(Boolean) });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Acompañantes guardados");
    await onSaved();
  };

  const añadirSlot = (index: number, value: string) => {
    setSeleccionados((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const opciones = acompanantes.filter((a) => !seleccionados.some((id, idx) => id === a.id && idx !== seleccionados.indexOf(a.id)));

  return (
    <ModalBase title={`Ficha de mentoría · ${nombreAlumna(fila)}`} subtitle={`${fila.email || "Sin correo"}`} onClose={onClose} wide>
      <div className="p-5 space-y-5">
        {cargando ? <div className="py-8 text-center text-sm text-muted-foreground">Cargando ficha…</div> : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cuenta bancaria de la alumna</div>
                {cuenta?.completo ? (
                  <div className="mt-2 space-y-1.5 text-sm">
                    <div><span className="text-muted-foreground">Banco:</span> {cuenta.banco}</div>
                    <div><span className="text-muted-foreground">Tipo:</span> {cuenta.tipo_cuenta}</div>
                    <div><span className="text-muted-foreground">Número:</span> {cuenta.numero_cuenta}</div>
                    <div><span className="text-muted-foreground">Titular:</span> {cuenta.titular_cuenta}</div>
                    {cuenta.cedula_titular && <div><span className="text-muted-foreground">Cédula:</span> {cuenta.cedula_titular}</div>}
                  </div>
                ) : <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">La alumna todavía no registra una cuenta bancaria completa.</div>}
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Resumen mensual</div>
                <div className="mt-2 text-sm"><strong>{fila.estado === "pagado" ? "Pagado" : "Debe"}</strong> · {dinero(fila.falta)} pendiente.</div>
                <div className="text-xs text-muted-foreground mt-1">{fila.abonos.length} abono{fila.abonos.length === 1 ? "" : "s"} registrados.</div>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acompañantes de mentoría</div>
                  <div className="text-xs text-muted-foreground mt-1">Se seleccionan de las cuentas existentes con rol Alumno. Máximo 2.</div>
                </div>
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {[0,1].map((index) => (
                  <select key={index} value={seleccionados[index] || ""} onChange={(e) => añadirSlot(index, e.target.value)} className="px-3 py-2 rounded-lg border bg-background text-sm">
                    <option value="">{index === 0 ? "Acompañante 1 · Ninguno" : "Acompañante 2 · Ninguno"}</option>
                    {opciones.map((a) => <option key={a.id} value={a.id}>{nombreAlumna(a)}</option>)}
                  </select>
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <button disabled={guardando} onClick={() => void guardarAcompanantes()} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold">{guardando ? "Guardando…" : "Guardar acompañantes"}</button>
              </div>
            </div>

            <div className="rounded-xl border p-4 bg-muted/20 flex items-start gap-3 text-xs text-muted-foreground">
              <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Los datos bancarios los registra la propia alumna desde su perfil. El gestor puede comprobar aquí si ya están completos.</span>
            </div>
          </>
        )}
        <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cerrar</button></div>
      </div>
    </ModalBase>
  );
}
