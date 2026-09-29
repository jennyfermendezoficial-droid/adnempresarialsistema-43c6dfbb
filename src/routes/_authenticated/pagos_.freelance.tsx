import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Scale,
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
import { PagosCuentas } from "@/components/pagos/PagosCuentas";
import type { CuentaEmpresa } from "@/components/pagos/RegistrarAbonoModal";
import {
  AJUSTE_LABEL,
  calcularFreelance,
  carpetaFreelancer,
  desdeIso,
  efectoAjuste,
  inicioSemana,
  isoLocal,
  minutosDelDia,
  rangoCuadriculaMes,
  red2,
  seCruzan,
  sumarDias,
  type AjusteFreelance,
  type RegistroHorasFreelance,
  type TipoAjuste,
  type TrabajoCalculado,
} from "@/lib/freelance-calculo";
import { generarResumenFreelancePDF } from "@/lib/freelance-export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pagos_/freelance")({ component: Page });

interface Freelancer {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  servicio: string | null;
  tarifa_hora: number;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  titular_cuenta: string | null;
  activo: boolean;
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
  cuenta_empresa_id: string | null;
}

interface InformePdf {
  id: string;
  freelancer_id: string;
  tipo: "diario" | "semanal";
  fecha_inicio: string;
  fecha_fin: string;
  archivo_path: string;
  nombre_archivo: string;
  created_at: string;
}

type Vista = "dia" | "semana" | "mes";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CORTOS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const COLORS = ["#7C6BFF", "#22A06B", "#E78A3C", "#3C8FE7", "#C2756B"];
const BUCKET = "freelance-informes";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MIGRACIONES = "20260928120000_pagos_freelance.sql y 20260929120000_freelance_informes_ajustes.sql";

function colorDe(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function dinero(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fechaLarga(iso: string) {
  return desdeIso(iso).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fechaCorta(iso: string) {
  return desdeIso(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function rangoMesIso(mes: number, anio: number) {
  return {
    ini: `${anio}-${String(mes).padStart(2, "0")}-01`,
    fin: `${anio}-${String(mes).padStart(2, "0")}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`,
  };
}

// Estas tablas se crean en las migraciones de esta rama. El cast conserva el
// cliente generado actual sin tocar types.ts (mismo criterio que Alumnas);
// en runtime Supabase recibe el nombre real.
type TablaFreelance = "freelancers" | "freelance_registros_horas" | "freelance_ajustes" | "freelance_abonos" | "freelance_informes";
function tabla(nombre: TablaFreelance) {
  return supabase.from(nombre as "pagos_mensuales");
}

const COLS_REGISTRO = "id,freelancer_id,fecha,hora_inicio,duracion_min,tarea,descripcion,observaciones,tarifa_hora";

function normalizarRegistros(data: unknown): RegistroHorasFreelance[] {
  return ((data ?? []) as RegistroHorasFreelance[]).map((r) => ({
    ...r,
    duracion_min: Number(r.duracion_min),
    tarifa_hora: r.tarifa_hora == null ? null : Number(r.tarifa_hora),
  }));
}

function normalizarFreelancers(data: unknown): Freelancer[] {
  return ((data ?? []) as Freelancer[]).map((f) => ({ ...f, tarifa_hora: Number(f.tarifa_hora ?? 0) }));
}

async function abrirUrlFirmada(path: string, descargarComo?: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, descargarComo ? { download: descargarComo } : undefined);
  if (error || !data) throw new Error(error?.message || "No se pudo abrir el PDF.");
  return data.signedUrl;
}

// ===================== PÁGINA =====================

function Page() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [registros, setRegistros] = useState<RegistroHorasFreelance[]>([]);
  const [ajustes, setAjustes] = useState<AjusteFreelance[]>([]);
  const [abonos, setAbonos] = useState<AbonoFreelance[]>([]);
  const [loading, setLoading] = useState(true);
  const [infraError, setInfraError] = useState<string | null>(null);
  const [verFreelancers, setVerFreelancers] = useState(false);
  const [verCuentas, setVerCuentas] = useState(false);
  const [perfilId, setPerfilId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!puedeGestionar) { setLoading(false); return; }
    setLoading(true);
    setInfraError(null);
    try {
      const { ini, fin } = rangoMesIso(mes, anio);
      const [fRes, rRes, aRes, abRes] = await Promise.all([
        tabla("freelancers").select("*").order("nombre", { ascending: true }),
        tabla("freelance_registros_horas").select(COLS_REGISTRO).gte("fecha", ini).lte("fecha", fin),
        tabla("freelance_ajustes").select("id,freelancer_id,tipo,monto,motivo").eq("mes", mes).eq("anio", anio),
        tabla("freelance_abonos").select("id,freelancer_id,monto").eq("mes", mes).eq("anio", anio),
      ]);
      const err = fRes.error ?? rRes.error ?? aRes.error ?? abRes.error;
      if (err) {
        setFreelancers([]); setRegistros([]); setAjustes([]); setAbonos([]);
        setInfraError(err.message || "No se pudo cargar la estructura de pagos freelance.");
        return;
      }
      setFreelancers(normalizarFreelancers(fRes.data));
      setRegistros(normalizarRegistros(rRes.data));
      setAjustes(((aRes.data ?? []) as unknown as AjusteFreelance[]).map((a) => ({ ...a, monto: Number(a.monto) })));
      setAbonos(((abRes.data ?? []) as unknown as AbonoFreelance[]).map((a) => ({ ...a, monto: Number(a.monto) })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los pagos freelance.");
    } finally {
      setLoading(false);
    }
  }, [puedeGestionar, mes, anio]);

  useEffect(() => { void cargar(); }, [cargar]);

  const tarjetas = useMemo(() => freelancers
    .map((f) => {
      const regs = registros.filter((r) => r.freelancer_id === f.id);
      const ajs = ajustes.filter((a) => a.freelancer_id === f.id);
      const pagado = red2(abonos.filter((a) => a.freelancer_id === f.id).reduce((s, a) => s + a.monto, 0));
      const calculo = calcularFreelance(regs, f.tarifa_hora, ajs);
      return { f, calculo, pagado, pendiente: Math.max(0, red2(calculo.total - pagado)), actividad: regs.length + ajs.length };
    })
    // Los inactivos solo aparecen si tienen movimientos en el mes.
    .filter((t) => t.f.activo || t.actividad > 0 || t.pagado > 0), [freelancers, registros, ajustes, abonos]);

  const resumen = useMemo(() => ({
    pendiente: red2(tarjetas.reduce((s, t) => s + t.pendiente, 0)),
    generado: red2(tarjetas.reduce((s, t) => s + t.calculo.generado, 0)),
    pagado: red2(tarjetas.reduce((s, t) => s + t.pagado, 0)),
    minutos: tarjetas.reduce((s, t) => s + t.calculo.minutos, 0),
  }), [tarjetas]);

  if (!puedeGestionar) {
    return <div className="p-8 text-center text-muted-foreground">No tienes permiso para ver Pagos e informes.</div>;
  }

  const perfil = perfilId ? freelancers.find((f) => f.id === perfilId) : null;
  if (perfil) {
    return (
      <PerfilFreelance
        freelancer={perfil}
        mesInicial={mes}
        anioInicial={anio}
        onBack={() => { setPerfilId(null); void cargar(); }}
        onFreelancerCambiado={cargar}
      />
    );
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
        <div className="flex-1" />
        <button onClick={() => setVerCuentas(true)} className="px-3 py-2 rounded-lg border bg-card text-sm inline-flex items-center gap-1.5">
          <Landmark className="w-4 h-4" /> Cuentas bancarias
        </button>
        <button onClick={() => setVerFreelancers(true)} disabled={!!infraError} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 shadow-md disabled:opacity-50">
          <Users className="w-4 h-4" /> Gestionar freelancers
        </button>
      </div>

      {infraError && <AvisoInfra error={infraError} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0F1431,#1B1F4A)" }}>
          <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,107,255,.5), transparent 70%)" }} />
          <div className="text-[10px] uppercase tracking-wider opacity-70">Pendiente de pago · {MESES[mes - 1]}</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">{dinero(resumen.pendiente)}</div>
          <div className="text-xs opacity-80 mt-1">{tarjetas.length} freelancer{tarjetas.length === 1 ? "" : "s"}</div>
        </div>
        <KPI label="Pago generado" value={dinero(resumen.generado)} sub="horas × tarifa acordada" />
        <KPI label="Horas trabajadas" value={formatHM(resumen.minutos)} sub={`${MESES[mes - 1]} ${anio}`} />
        <KPI label="Pagado" value={dinero(resumen.pagado)} sub="registrado en el periodo" />
      </div>

      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="text-lg font-semibold">Freelancers · {MESES[mes - 1]} {anio}</h2>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card py-10 text-center text-muted-foreground">Cargando freelancers…</div>
      ) : tarjetas.length === 0 ? (
        <div className="rounded-2xl border bg-card py-10 px-4 text-center text-muted-foreground text-sm">
          {infraError ? "Sin datos." : "Aún no hay freelancers. Agrégalos con “Gestionar freelancers”."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {tarjetas.map(({ f, pendiente }) => (
            <div key={f.id} className="rounded-2xl border bg-card p-5 flex flex-col gap-4 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full grid place-items-center text-sm font-bold text-white shrink-0" style={{ background: colorDe(f.id) }}>
                  {f.nombre.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{f.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">Área: {f.servicio || "Sin área"}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border p-3 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tarifa</div>
                  <div className="font-bold tabular-nums mt-1">{dinero(f.tarifa_hora)}/hora</div>
                </div>
                <div className="rounded-xl border p-3 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pendiente de pago</div>
                  <div className={`font-bold tabular-nums mt-1 ${pendiente > 0 ? "text-red-600" : ""}`}>{dinero(pendiente)}</div>
                </div>
              </div>
              <button onClick={() => setPerfilId(f.id)} className="w-full px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" /> Ver informes
              </button>
            </div>
          ))}
        </div>
      )}

      {verFreelancers && <FreelancersModal freelancers={freelancers} onClose={() => setVerFreelancers(false)} onSaved={cargar} />}
      {verCuentas && <CuentasModal onClose={() => setVerCuentas(false)} />}
    </div>
  );
}

function AvisoInfra({ error }: { error: string }) {
  return (
    <div className="mb-5 rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
      <div className="font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
        <AlertCircle className="w-4 h-4 shrink-0" /> La estructura de pagos freelance todavía no está disponible en la base de datos.
      </div>
      <div className="text-xs text-muted-foreground mt-1 break-words">{error}</div>
      <div className="text-xs text-muted-foreground mt-1 break-words">Falta aplicar las migraciones {MIGRACIONES}.</div>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums truncate">{value}</div>
      <div className="text-xs text-emerald-600 mt-1">{sub}</div>
    </div>
  );
}

// ===================== PERFIL DEL FREELANCE =====================

function PerfilFreelance({ freelancer, mesInicial, anioInicial, onBack, onFreelancerCambiado }: {
  freelancer: Freelancer;
  mesInicial: number;
  anioInicial: number;
  onBack: () => void;
  onFreelancerCambiado: () => void | Promise<void>;
}) {
  const f = freelancer;
  const hoyIso = isoLocal(new Date());
  const hoy = new Date();
  const inicial = mesInicial === hoy.getMonth() + 1 && anioInicial === hoy.getFullYear() ? hoyIso : `${anioInicial}-${String(mesInicial).padStart(2, "0")}-01`;
  const [cursor, setCursor] = useState(inicial);
  const [vista, setVista] = useState<Vista>("mes");
  const [registros, setRegistros] = useState<RegistroHorasFreelance[]>([]);
  const [informes, setInformes] = useState<InformePdf[]>([]);
  const [ajustes, setAjustes] = useState<AjusteFreelance[]>([]);
  const [abonos, setAbonos] = useState<AbonoFreelance[]>([]);
  const [cuentas, setCuentas] = useState<CuentaEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [infraError, setInfraError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "trabajo" | "informe" | "ajuste" | "pago" | "editar">(null);
  const [pdf, setPdf] = useState<InformePdf | null>(null);

  const cur = desdeIso(cursor);
  const mes = cur.getMonth() + 1;
  const anio = cur.getFullYear();

  const cargar = useCallback(async () => {
    setLoading(true);
    setInfraError(null);
    try {
      const { inicio, fin } = rangoCuadriculaMes(anio, mes);
      const [rRes, iRes, aRes, abRes, cRes] = await Promise.all([
        tabla("freelance_registros_horas").select(COLS_REGISTRO).filter("freelancer_id", "eq", f.id).gte("fecha", isoLocal(inicio)).lte("fecha", isoLocal(fin)),
        tabla("freelance_informes").select("id,freelancer_id,tipo,fecha_inicio,fecha_fin,archivo_path,nombre_archivo,created_at").filter("freelancer_id", "eq", f.id).lte("fecha_inicio", isoLocal(fin)).gte("fecha_fin", isoLocal(inicio)).order("created_at", { ascending: false }),
        tabla("freelance_ajustes").select("id,freelancer_id,tipo,monto,motivo").filter("freelancer_id", "eq", f.id).eq("mes", mes).eq("anio", anio).order("created_at", { ascending: true }),
        tabla("freelance_abonos").select("*").filter("freelancer_id", "eq", f.id).eq("mes", mes).eq("anio", anio).order("fecha_pago", { ascending: false }),
        supabase.from("pagos_cuentas_bancarias").select("*").eq("activo", true).order("created_at", { ascending: false }),
      ]);
      const err = rRes.error ?? iRes.error ?? aRes.error ?? abRes.error;
      if (err) { setInfraError(err.message); return; }
      setRegistros(normalizarRegistros(rRes.data));
      setInformes((iRes.data ?? []) as unknown as InformePdf[]);
      setAjustes(((aRes.data ?? []) as unknown as AjusteFreelance[]).map((a) => ({ ...a, monto: Number(a.monto) })));
      setAbonos(((abRes.data ?? []) as unknown as AbonoFreelance[]).map((a) => ({ ...a, monto: Number(a.monto) })));
      setCuentas(((cRes.data ?? []) as unknown as CuentaEmpresa[]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el perfil.");
    } finally {
      setLoading(false);
    }
  }, [f.id, mes, anio]);

  useEffect(() => { void cargar(); }, [cargar]);

  const { ini: iniMes, fin: finMes } = rangoMesIso(mes, anio);
  // El resumen económico es del mes del calendario; la cuadrícula puede incluir días vecinos.
  const calculoMes = useMemo(
    () => calcularFreelance(registros.filter((r) => r.fecha >= iniMes && r.fecha <= finMes), f.tarifa_hora, ajustes),
    [registros, iniMes, finMes, f.tarifa_hora, ajustes],
  );
  const trabajosRango = useMemo(() => calcularFreelance(registros, f.tarifa_hora, []).trabajos, [registros, f.tarifa_hora]);
  const pagado = red2(abonos.reduce((s, a) => s + a.monto, 0));
  const pendiente = Math.max(0, red2(calculoMes.total - pagado));

  const trabajosDe = (iso: string) => trabajosRango.filter((t) => t.fecha === iso);
  const informesDe = (iso: string) => informes.filter((i) => i.fecha_inicio <= iso && i.fecha_fin >= iso);

  const mover = (dir: -1 | 1) => {
    if (vista === "dia") setCursor(isoLocal(sumarDias(cur, dir)));
    else if (vista === "semana") setCursor(isoLocal(sumarDias(cur, 7 * dir)));
    else setCursor(isoLocal(new Date(anio, mes - 1 + dir, 1)));
  };

  const tituloCalendario = vista === "mes"
    ? `${MESES[mes - 1]} ${anio}`
    : vista === "semana"
      ? (() => { const a = inicioSemana(cur); const b = sumarDias(a, 6); return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`; })()
      : fechaLarga(cursor);

  const borrarTrabajo = async (t: TrabajoCalculado) => {
    if (!confirm(`¿Eliminar el trabajo "${t.tarea}" del ${fechaCorta(t.fecha)}?`)) return;
    const { error } = await tabla("freelance_registros_horas").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Trabajo eliminado");
    await cargar();
  };

  const borrarAjuste = async (a: AjusteFreelance) => {
    if (!confirm(`¿Eliminar este ajuste (${AJUSTE_LABEL[a.tipo]})?`)) return;
    const { error } = await tabla("freelance_ajustes").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Ajuste eliminado");
    await cargar();
  };

  const borrarInforme = async (inf: InformePdf) => {
    if (!confirm(`¿Eliminar el informe "${inf.nombre_archivo}"?`)) return;
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([inf.archivo_path]);
    if (stErr) return toast.error(stErr.message);
    const { error } = await tabla("freelance_informes").delete().eq("id", inf.id);
    if (error) return toast.error(error.message);
    toast.success("Informe eliminado");
    setPdf(null);
    await cargar();
  };

  const descargarResumen = () => {
    const nombreCuenta = (id: string | null) => cuentas.find((c) => c.id === id)?.nombre;
    generarResumenFreelancePDF({
      nombre: f.nombre, area: f.servicio ?? "", tarifa: f.tarifa_hora, mes, anio,
      trabajos: calculoMes.trabajos.map((t) => ({
        fecha: t.fecha, horaInicio: t.hora_inicio, horaFin: t.horaFin, actividad: t.tarea, minutos: t.duracion_min,
        minutosLaboral: t.minutosLaboral, minutosFuera: t.minutosFuera, tarifa: t.tarifa, valor: t.valor,
      })),
      ajustes: ajustes.map((a) => ({ tipo: AJUSTE_LABEL[a.tipo], motivo: a.motivo, efecto: efectoAjuste(a) })),
      abonos: abonos.map((a) => ({ fecha: a.fecha_pago, monto: a.monto, tipo: nombreCuenta(a.cuenta_empresa_id) ? `${a.tipo_pago} · ${nombreCuenta(a.cuenta_empresa_id)}` : a.tipo_pago, numero: a.numero_comprobante ?? "" })),
      generado: calculoMes.generado,
      total: calculoMes.total,
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ChevronLeft className="w-4 h-4" /> Volver a freelancers
      </button>

      {infraError && <AvisoInfra error={infraError} />}

      {/* Encabezado */}
      <div className="rounded-2xl border bg-card p-5 mb-4 flex flex-wrap items-center gap-4">
        <div className="w-14 h-14 rounded-full grid place-items-center text-lg font-bold text-white shrink-0" style={{ background: colorDe(f.id) }}>
          {f.nombre.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-semibold break-words">{f.nombre}</h1>
          <div className="text-sm text-muted-foreground">Área: {f.servicio || "Sin área"} · Tarifa acordada: <strong className="text-foreground">{dinero(f.tarifa_hora)}/hora</strong></div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 break-words">
            <Landmark className="w-3.5 h-3.5 shrink-0" />
            {f.banco ? `${f.banco} · ${f.tipo_cuenta ?? ""} ${f.numero_cuenta ?? ""}${f.titular_cuenta ? ` · ${f.titular_cuenta}` : ""}` : "Sin datos bancarios registrados"}
          </div>
        </div>
        <button onClick={() => setModal("editar")} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5"><Pencil className="w-4 h-4" /> Editar datos</button>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button disabled={!!infraError || !f.activo} onClick={() => setModal("trabajo")} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"><Clock className="w-4 h-4" /> Registrar trabajo</button>
        <button disabled={!!infraError} onClick={() => setModal("informe")} className="px-3 py-2 rounded-lg border bg-card text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Upload className="w-4 h-4" /> Subir informe PDF</button>
        <button disabled={!!infraError} onClick={() => setModal("ajuste")} className="px-3 py-2 rounded-lg border bg-card text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Scale className="w-4 h-4" /> Ajuste de pago</button>
        <button disabled={!!infraError || pendiente <= 0} onClick={() => setModal("pago")} className="px-3 py-2 rounded-lg border bg-card text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><ReceiptText className="w-4 h-4" /> Registrar pago</button>
        <button disabled={!!infraError} onClick={descargarResumen} className="px-3 py-2 rounded-lg border bg-card text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><Download className="w-4 h-4" /> Resumen PDF del mes</button>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        {/* Calendario */}
        <section className="rounded-2xl border bg-card overflow-hidden min-w-0">
          <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
            <CalendarDays className="w-5 h-5 text-violet shrink-0" />
            <div className="font-semibold capitalize flex-1 min-w-[140px]">{tituloCalendario}</div>
            <div className="inline-flex items-center gap-1 rounded-xl border p-1">
              {(["dia", "semana", "mes"] as Vista[]).map((v) => (
                <button key={v} onClick={() => setVista(v)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${vista === v ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>
                  {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1">
              <button onClick={() => mover(-1)} className="p-1.5 rounded-lg border" aria-label="Anterior"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setCursor(hoyIso)} className="px-2 py-1 rounded-lg border text-xs">Hoy</button>
              <button onClick={() => mover(1)} className="p-1.5 rounded-lg border" aria-label="Siguiente"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Cargando calendario…</div>
          ) : vista === "mes" ? (
            <VistaMes anio={anio} mes={mes} hoyIso={hoyIso} trabajosDe={trabajosDe} informesDe={informesDe}
              onDia={(iso) => { setCursor(iso); setVista("dia"); }} />
          ) : vista === "semana" ? (
            <VistaSemana cursor={cur} hoyIso={hoyIso} trabajosDe={trabajosDe} informesDe={informesDe}
              onDia={(iso) => { setCursor(iso); setVista("dia"); }} />
          ) : (
            <VistaDia iso={cursor} trabajos={trabajosDe(cursor)} informes={informesDe(cursor)}
              onVerPdf={setPdf} onBorrar={borrarTrabajo}
              onRegistrar={cursor <= hoyIso && f.activo && !infraError ? () => setModal("trabajo") : undefined} />
          )}
        </section>

        {/* Resumen económico */}
        <aside className="space-y-4 min-w-0">
          <section className="rounded-2xl border bg-card p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Cálculo económico · {MESES[mes - 1]} {anio}</div>
            <div className="space-y-2 text-sm">
              <Linea titulo="Pago generado" sub={`${formatHM(calculoMes.minutos)} × ${dinero(f.tarifa_hora)}/h`} valor={dinero(calculoMes.generado)} />
              {ajustes.map((a) => {
                const e = efectoAjuste(a);
                return (
                  <div key={a.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{AJUSTE_LABEL[a.tipo]}</div>
                      <div className="text-xs text-muted-foreground break-words">{a.motivo}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`tabular-nums font-semibold ${e < 0 ? "text-red-600" : "text-emerald-600"}`}>{e < 0 ? "−" : "+"}{dinero(Math.abs(e))}</span>
                      <button onClick={() => void borrarAjuste(a)} className="p-1 text-muted-foreground hover:text-red-600" aria-label="Eliminar ajuste"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
              <div className="border-t pt-2 flex items-baseline justify-between">
                <span className="font-semibold">Total a pagar</span>
                <span className="text-xl font-bold tabular-nums" style={{ color: "var(--violet)" }}>{dinero(calculoMes.total)}</span>
              </div>
              <Linea titulo="Pagado" valor={dinero(pagado)} positivo />
              <Linea titulo="Pendiente de pago" valor={dinero(pendiente)} alerta={pendiente > 0} />
            </div>
            {calculoMes.minutosFuera > 0 && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Informativo: {formatHM(calculoMes.minutosLaboral)} en horario laboral y {formatHM(calculoMes.minutosFuera)} fuera de horario (07:00–13:00 · 14:30–17:30). Se paga con la misma tarifa.
              </p>
            )}
          </section>

          {abonos.length > 0 && (
            <section className="rounded-2xl border bg-card p-5 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pagos realizados</div>
              {abonos.map((a) => <FilaAbono key={a.id} abono={a} cuenta={cuentas.find((c) => c.id === a.cuenta_empresa_id)} />)}
            </section>
          )}

          <section className="rounded-2xl border bg-card p-5 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Informes PDF del periodo</div>
            {informes.length === 0 ? (
              <div className="text-xs text-muted-foreground">Sin informes subidos.</div>
            ) : informes.map((i) => <FilaInforme key={i.id} informe={i} onVer={() => setPdf(i)} />)}
          </section>
        </aside>
      </div>

      {modal === "trabajo" && (
        <RegistrarTrabajoModal freelancer={f} fechaInicial={cursor <= hoyIso ? cursor : hoyIso} existentes={registros}
          onClose={() => setModal(null)}
          onSaved={async (fecha) => { setModal(null); setCursor(fecha); if (desdeIso(fecha).getMonth() + 1 === mes && desdeIso(fecha).getFullYear() === anio) await cargar(); }} />
      )}
      {modal === "informe" && (
        <SubirInformeModal freelancer={f} fechaInicial={cursor <= hoyIso ? cursor : hoyIso}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await cargar(); }} />
      )}
      {modal === "ajuste" && (
        <AjusteModal freelancer={f} mes={mes} anio={anio} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await cargar(); }} />
      )}
      {modal === "pago" && (
        <RegistrarPagoModal freelancer={f} mes={mes} anio={anio} total={calculoMes.total} pagado={pagado} pendiente={pendiente} cuentas={cuentas}
          onClose={() => setModal(null)} onSaved={async () => { setModal(null); await cargar(); }} />
      )}
      {modal === "editar" && (
        <FreelancerFormModal freelancer={f} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await onFreelancerCambiado(); }} />
      )}
      {pdf && <VisorPdfModal informe={pdf} onClose={() => setPdf(null)} onBorrar={() => void borrarInforme(pdf)} />}
    </div>
  );
}

function Linea({ titulo, sub, valor, positivo = false, alerta = false }: { titulo: string; sub?: string; valor: string; positivo?: boolean; alerta?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <div className="font-medium">{titulo}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className={`tabular-nums font-semibold shrink-0 ${positivo ? "text-emerald-600" : alerta ? "text-red-600" : ""}`}>{valor}</div>
    </div>
  );
}

function FilaInforme({ informe, onVer }: { informe: InformePdf; onVer: () => void }) {
  return (
    <button onClick={onVer} className="w-full text-left rounded-lg border px-3 py-2 flex items-center gap-2 hover:bg-muted/40">
      <FileText className="w-4 h-4 text-red-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold truncate">{informe.nombre_archivo}</div>
        <div className="text-[11px] text-muted-foreground">
          {informe.tipo === "diario" ? `Diario · ${fechaCorta(informe.fecha_inicio)}` : `Semanal · ${fechaCorta(informe.fecha_inicio)} – ${fechaCorta(informe.fecha_fin)}`}
        </div>
      </div>
      <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function FilaAbono({ abono, cuenta }: { abono: AbonoFreelance; cuenta?: CuentaEmpresa }) {
  const abrir = async () => {
    if (!abono.archivo_url) return toast.info("Este pago no tiene comprobante adjunto.");
    if (esUrlAbsoluta(abono.archivo_url)) { window.open(abono.archivo_url, "_blank", "noopener,noreferrer"); return; }
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(abono.archivo_url, 3600);
    if (error || !data) return toast.error("No se pudo abrir el comprobante.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="flex items-center gap-2 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold tabular-nums">{dinero(abono.monto)} · {abono.tipo_pago}</div>
        <div className="text-[11px] text-muted-foreground break-words">
          {fechaCorta(abono.fecha_pago)}{cuenta ? ` · desde ${cuenta.nombre}` : ""}{abono.numero_comprobante ? ` · N.º ${abono.numero_comprobante}` : ""}
        </div>
      </div>
      {abono.archivo_url && <button onClick={() => void abrir()} className="p-1.5 rounded-lg border" aria-label="Ver comprobante"><Eye className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

// ===================== VISTAS DEL CALENDARIO =====================

function VistaMes({ anio, mes, hoyIso, trabajosDe, informesDe, onDia }: {
  anio: number; mes: number; hoyIso: string;
  trabajosDe: (iso: string) => TrabajoCalculado[];
  informesDe: (iso: string) => InformePdf[];
  onDia: (iso: string) => void;
}) {
  const { inicio, fin } = rangoCuadriculaMes(anio, mes);
  const dias: Date[] = [];
  for (let d = inicio; d <= fin; d = sumarDias(d, 1)) dias.push(d);
  return (
    <div className="grid grid-cols-7 gap-px bg-border">
      {DIAS_CORTOS.map((d) => <div key={d} className="bg-muted px-1 sm:px-2 py-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider opacity-80 text-center sm:text-left">{d}</div>)}
      {dias.map((d) => {
        const iso = isoLocal(d);
        const fuera = d.getMonth() + 1 !== mes;
        const ts = trabajosDe(iso);
        const tieneInforme = informesDe(iso).some((i) => i.tipo === "diario");
        const min = ts.reduce((s, t) => s + t.duracion_min, 0);
        const valor = red2(ts.reduce((s, t) => s + t.valor, 0));
        return (
          <button key={iso} onClick={() => onDia(iso)} className={`bg-card p-1 sm:p-2 min-h-16 sm:min-h-24 text-left flex flex-col gap-1 hover:bg-muted/40 transition min-w-0 ${fuera ? "opacity-40" : ""}`}>
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[11px] font-bold ${iso === hoyIso ? "px-1.5 rounded-full bg-violet-gradient text-white" : "opacity-70"}`}>{d.getDate()}</span>
              {tieneInforme && <FileText className="w-3 h-3 text-red-600 shrink-0" />}
            </div>
            {ts.length > 0 && (
              <div className="rounded-md bg-violet-gradient text-white px-1 sm:px-1.5 py-1 text-[9px] sm:text-[10px] leading-tight min-w-0">
                <div className="font-semibold tabular-nums truncate">{formatHM(min)}</div>
                <div className="tabular-nums truncate hidden sm:block">{dinero(valor)}</div>
                <div className="truncate hidden md:block opacity-90">{ts[0].tarea}{ts.length > 1 ? ` +${ts.length - 1}` : ""}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function VistaSemana({ cursor, hoyIso, trabajosDe, informesDe, onDia }: {
  cursor: Date; hoyIso: string;
  trabajosDe: (iso: string) => TrabajoCalculado[];
  informesDe: (iso: string) => InformePdf[];
  onDia: (iso: string) => void;
}) {
  const lunes = inicioSemana(cursor);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const semanales = informesDe(isoLocal(lunes)).filter((i) => i.tipo === "semanal");
  return (
    <div>
      {semanales.length > 0 && (
        <div className="px-4 py-2 border-b text-xs flex items-center gap-2 bg-muted/30">
          <FileText className="w-4 h-4 text-red-600" /> {semanales.length} informe{semanales.length === 1 ? "" : "s"} semanal{semanales.length === 1 ? "" : "es"} en esta semana
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-border">
        {dias.map((d) => {
          const iso = isoLocal(d);
          const ts = trabajosDe(iso);
          const diarios = informesDe(iso).filter((i) => i.tipo === "diario").length;
          return (
            <button key={iso} onClick={() => onDia(iso)} className="bg-card p-2 min-h-20 md:min-h-40 text-left flex flex-col gap-1.5 hover:bg-muted/40 min-w-0">
              <div className={`text-xs font-semibold capitalize ${iso === hoyIso ? "text-violet" : ""}`}>
                {d.toLocaleDateString("es-EC", { weekday: "long" })} {d.getDate()}
              </div>
              {ts.map((t) => (
                <div key={t.id} className="rounded-md bg-violet-gradient text-white px-2 py-1 text-[10px] leading-tight min-w-0">
                  <div className="font-semibold truncate">{t.tarea}</div>
                  <div className="tabular-nums opacity-90">{t.hora_inicio.slice(0, 5)}–{t.horaFin} · {formatHM(t.duracion_min)} · {dinero(t.valor)}</div>
                </div>
              ))}
              {diarios > 0 && <div className="text-[10px] text-red-600 inline-flex items-center gap-1"><FileText className="w-3 h-3" /> Informe PDF</div>}
              {ts.length === 0 && diarios === 0 && <div className="text-[10px] text-muted-foreground">Sin actividad</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VistaDia({ iso, trabajos, informes, onVerPdf, onBorrar, onRegistrar }: {
  iso: string;
  trabajos: TrabajoCalculado[];
  informes: InformePdf[];
  onVerPdf: (i: InformePdf) => void;
  onBorrar: (t: TrabajoCalculado) => void;
  onRegistrar?: () => void;
}) {
  const min = trabajos.reduce((s, t) => s + t.duracion_min, 0);
  const valor = red2(trabajos.reduce((s, t) => s + t.valor, 0));
  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground flex-1">
          {trabajos.length ? <>Total del día: <strong className="text-foreground">{formatHM(min)}</strong> · <strong className="text-foreground">{dinero(valor)}</strong></> : "Sin trabajos registrados este día."}
        </div>
        {onRegistrar && <button onClick={onRegistrar} className="px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Registrar trabajo</button>}
      </div>

      {trabajos.map((t) => (
        <div key={t.id} className="rounded-xl border p-4 space-y-2 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Actividad</div>
              <div className="font-semibold break-words">{t.tarea}</div>
            </div>
            <button onClick={() => onBorrar(t)} className="p-1.5 rounded-lg border text-red-600 shrink-0" aria-label="Eliminar trabajo"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Dato label="Fecha" valor={fechaCorta(t.fecha)} />
            <Dato label="Horario" valor={`${t.hora_inicio.slice(0, 5)}–${t.horaFin}`} />
            <Dato label="Horas" valor={formatHM(t.duracion_min)} />
            <Dato label="Valor" valor={`${dinero(t.valor)}`} sub={`${dinero(t.tarifa)}/h`} />
          </div>
          {t.minutosFuera > 0 && (
            <div className="text-[11px] text-muted-foreground">Informativo: {formatHM(t.minutosLaboral)} laboral · {formatHM(t.minutosFuera)} fuera de horario</div>
          )}
          {t.descripcion && <Dato label="Descripción" valor={t.descripcion} largo />}
          {t.observaciones && <Dato label="Observaciones" valor={t.observaciones} largo />}
        </div>
      ))}

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Informe PDF</div>
        {informes.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin informe para este día.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">{informes.map((i) => <FilaInforme key={i.id} informe={i} onVer={() => onVerPdf(i)} />)}</div>
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor, sub, largo = false }: { label: string; valor: string; sub?: string; largo?: boolean }) {
  return (
    <div className={`min-w-0 ${largo ? "" : "rounded-lg bg-muted/40 px-2 py-1.5"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${largo ? "text-sm whitespace-pre-wrap break-words" : "font-semibold tabular-nums truncate"}`}>{valor}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ===================== MODALES =====================

function VisorPdfModal({ informe, onClose, onBorrar }: { informe: InformePdf; onClose: () => void; onBorrar: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    abrirUrlFirmada(informe.archivo_path)
      .then((u) => { if (activo) setUrl(u); })
      .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : "No se pudo abrir el PDF."); });
    return () => { activo = false; };
  }, [informe.archivo_path]);

  const descargar = async () => {
    try {
      const u = await abrirUrlFirmada(informe.archivo_path, informe.nombre_archivo);
      const a = document.createElement("a");
      a.href = u; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar el PDF.");
    }
  };

  return (
    <ModalBase
      title={informe.nombre_archivo}
      subtitle={informe.tipo === "diario" ? `Informe diario · ${fechaCorta(informe.fecha_inicio)}` : `Informe semanal · ${fechaCorta(informe.fecha_inicio)} – ${fechaCorta(informe.fecha_fin)}`}
      onClose={onClose}
      ancho="max-w-5xl"
    >
      <div className="p-3 sm:p-4 space-y-3">
        <div className="h-[70vh] rounded-xl border overflow-hidden bg-muted grid place-items-center">
          {error ? <div className="text-sm text-red-600 p-4 text-center">{error}</div>
            : url ? <iframe src={url} title={informe.nombre_archivo} className="w-full h-full bg-white" />
            : <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={onBorrar} className="px-3 py-2 rounded-lg border text-sm text-red-600 inline-flex items-center gap-1.5 mr-auto"><Trash2 className="w-4 h-4" /> Eliminar</button>
          <button onClick={() => void descargar()} disabled={!url} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Download className="w-4 h-4" /> Descargar PDF</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cerrar</button>
        </div>
      </div>
    </ModalBase>
  );
}

function validarPdf(file: File) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return "El archivo debe ser PDF.";
  if (file.size > MAX_PDF_BYTES) return "El PDF supera 20 MB.";
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}

/** Sube el PDF al bucket privado y registra la fila. Si falla el registro, borra el archivo subido. */
async function subirInformePdf(f: Freelancer, file: File, tipo: "diario" | "semanal", inicio: string, finRango: string) {
  const rango = tipo === "diario" ? inicio : `${inicio}_${finRango}`;
  const path = `${carpetaFreelancer(f.nombre, f.id)}/${tipo}-${rango}-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(`No se pudo subir el PDF: ${upErr.message}`);
  const { error } = await tabla("freelance_informes").insert({
    freelancer_id: f.id, tipo, fecha_inicio: inicio, fecha_fin: finRango, archivo_path: path,
    nombre_archivo: file.name.slice(0, 180), tamano_bytes: file.size,
  } as never);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

function RegistrarTrabajoModal({ freelancer, fechaInicial, existentes, onClose, onSaved }: {
  freelancer: Freelancer;
  fechaInicial: string;
  existentes: RegistroHorasFreelance[];
  onClose: () => void;
  onSaved: (fecha: string) => void | Promise<void>;
}) {
  const hoy = isoLocal(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const [fecha, setFecha] = useState(fechaInicial);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [actividad, setActividad] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const ini = horaInicio ? minutosDelDia(horaInicio) : NaN;
  const fin = horaFin ? minutosDelDia(horaFin) : NaN;
  const duracion = Number.isFinite(ini) && Number.isFinite(fin) ? fin - ini : 0;
  const division = duracion > 0 ? dividirHorarioLaboral(horaInicio, duracion) : { laboral: 0, fuera: 0 };
  const valor = red2(freelancer.tarifa_hora * Math.max(0, duracion) / 60);

  const guardar = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast.error("Selecciona la fecha.");
    if (fecha > hoy) return toast.error("No se pueden registrar trabajos en fechas futuras.");
    if (!horaInicio || !horaFin) return toast.error("Escribe la hora de inicio y la hora de fin.");
    if (duracion <= 0) return toast.error("La hora de fin debe ser posterior a la hora de inicio.");
    if (duracion > 720) return toast.error("Un registro no puede superar 12 horas. Divídelo en varios registros.");
    if (desdeIso(fecha).getTime() + fin * 60000 > Date.now()) return toast.error("Ese trabajo todavía no termina. Solo se registra trabajo ya realizado.");
    if (actividad.trim().length < 3) return toast.error("Escribe la actividad realizada.");
    if (archivo) { const e = validarPdf(archivo); if (e) return toast.error(e); }
    const cruce = existentes.find((r) => seCruzan(r, { fecha, hora_inicio: horaInicio, duracion_min: duracion }));
    if (cruce) return toast.error(`Se cruza con otro trabajo (${fechaCorta(cruce.fecha)} ${cruce.hora_inicio.slice(0, 5)}).`);

    setGuardando(true);
    const { error } = await tabla("freelance_registros_horas").insert({
      freelancer_id: freelancer.id, fecha, hora_inicio: horaInicio, duracion_min: duracion,
      tarea: actividad.trim(), descripcion: descripcion.trim() || null, observaciones: observaciones.trim() || null,
      tarifa_hora: freelancer.tarifa_hora,
    } as never);
    if (error) { setGuardando(false); return toast.error(error.message); }
    if (archivo) {
      try {
        await subirInformePdf(freelancer, archivo, "diario", fecha, fecha);
      } catch (e) {
        toast.error(`Trabajo guardado, pero el PDF no se subió: ${e instanceof Error ? e.message : "error"}. Súbelo con “Subir informe PDF”.`);
      }
    }
    setGuardando(false);
    toast.success(`Trabajo registrado · ${formatHM(duracion)} · ${dinero(valor)}`);
    await onSaved(fecha);
  };

  return (
    <ModalBase title="Registrar trabajo" subtitle={`${freelancer.nombre} · ${dinero(freelancer.tarifa_hora)}/hora`} onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="Fecha *"><input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
          <Campo label="Hora inicio *"><input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
          <Campo label="Hora fin *"><input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
        </div>
        <Campo label="Actividad *"><input value={actividad} maxLength={300} onChange={(e) => setActividad(e.target.value)} placeholder="Ej. Configuración campañas Meta Ads" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
        <Campo label="Descripción"><textarea rows={3} value={descripcion} maxLength={2000} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se hizo en detalle" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
        <Campo label="Observaciones"><textarea rows={2} value={observaciones} maxLength={1000} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
        <div>
          <span className="block text-[11px] font-semibold text-muted-foreground mb-1">Informe PDF del día (opcional)</span>
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={() => inputRef.current?.click()} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5 shrink-0"><Upload className="w-4 h-4" /> Elegir PDF</button>
            <span className="text-xs text-muted-foreground truncate">{archivo ? archivo.name : "Ningún archivo"}</span>
            {archivo && <button type="button" onClick={() => setArchivo(null)} className="p-1 text-muted-foreground" aria-label="Quitar PDF"><X className="w-4 h-4" /></button>}
          </div>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0] ?? null; e.target.value = ""; if (file) { const err = validarPdf(file); if (err) toast.error(err); else setArchivo(file); } }} />
        </div>

        <div className="rounded-xl border p-3 text-sm">
          {duracion > 0 ? (
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Horas trabajadas</span><strong className="tabular-nums">{formatHM(duracion)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor generado</span><strong className="tabular-nums">{dinero(valor)}</strong></div>
              <div className="text-[11px] text-muted-foreground pt-1">Informativo: {formatHM(division.laboral)} en horario laboral · {formatHM(division.fuera)} fuera de horario (07:00–13:00 · 14:30–17:30).</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Escribe la hora de inicio y fin para calcular las horas y el valor ({dinero(freelancer.tarifa_hora)}/hora).</div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar trabajo"}</button>
        </div>
      </div>
    </ModalBase>
  );
}

function SubirInformeModal({ freelancer, fechaInicial, onClose, onSaved }: {
  freelancer: Freelancer;
  fechaInicial: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const hoy = isoLocal(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<"diario" | "semanal">("diario");
  const [fecha, setFecha] = useState(fechaInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  const lunes = valida ? isoLocal(inicioSemana(desdeIso(fecha))) : "";
  const domingo = valida ? isoLocal(sumarDias(inicioSemana(desdeIso(fecha)), 6)) : "";
  const inicio = tipo === "diario" ? fecha : lunes;
  const fin = tipo === "diario" ? fecha : domingo;

  const guardar = async () => {
    if (!valida) return toast.error("Selecciona la fecha.");
    if (inicio > hoy) return toast.error("No se pueden subir informes de fechas futuras.");
    if (!archivo) return toast.error("Elige el archivo PDF.");
    const e = validarPdf(archivo);
    if (e) return toast.error(e);
    setGuardando(true);
    try {
      await subirInformePdf(freelancer, archivo, tipo, inicio, fin);
      toast.success("Informe PDF subido");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir el informe.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalBase title="Subir informe PDF" subtitle={freelancer.nombre} onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="inline-flex items-center gap-1 rounded-xl border p-1">
          {(["diario", "semanal"] as const).map((t) => (
            <button key={t} onClick={() => setTipo(t)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${tipo === t ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>
              {t === "diario" ? "Informe diario" : "Informe semanal"}
            </button>
          ))}
        </div>
        <Campo label={tipo === "diario" ? "Día del informe *" : "Cualquier día de la semana *"}>
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        </Campo>
        {tipo === "semanal" && valida && (
          <div className="text-xs text-muted-foreground">Semana: <strong className="text-foreground">{fechaCorta(lunes)} – {fechaCorta(domingo)}</strong> (lunes a domingo)</div>
        )}
        <div>
          <span className="block text-[11px] font-semibold text-muted-foreground mb-1">Archivo PDF * (máx. 20 MB)</span>
          <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed p-5 text-sm text-muted-foreground inline-flex flex-col items-center gap-2" style={{ borderColor: "var(--violet)" }}>
            {archivo ? <><FileText className="w-6 h-6 text-red-600" /><span className="text-foreground font-medium break-all">{archivo.name}</span><span className="text-xs">{(archivo.size / 1024 / 1024).toFixed(2)} MB · toca para cambiar</span></>
              : <><Upload className="w-6 h-6" /> Elegir PDF</>}
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0] ?? null; e.target.value = ""; if (file) { const err = validarPdf(file); if (err) toast.error(err); else setArchivo(file); } }} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5">
            {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo…</> : "Subir informe"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

const TIPOS_AJUSTE: Array<{ value: Exclude<TipoAjuste, "bono" | "descuento">; ayuda: string }> = [
  { value: "bonificacion", ayuda: "Suma al pago" },
  { value: "deduccion", ayuda: "Resta del pago" },
  { value: "multa", ayuda: "Resta del pago" },
  { value: "correccion", ayuda: "Suma o resta para corregir un error" },
];

function AjusteModal({ freelancer, mes, anio, onClose, onSaved }: {
  freelancer: Freelancer; mes: number; anio: number;
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const [tipo, setTipo] = useState<(typeof TIPOS_AJUSTE)[number]["value"]>("bonificacion");
  const [signo, setSigno] = useState<1 | -1>(-1);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return toast.error("Escribe un monto mayor a 0.");
    if (motivo.trim().length < 3) return toast.error("Escribe el motivo del ajuste.");
    setGuardando(true);
    const { error } = await tabla("freelance_ajustes").insert({
      freelancer_id: freelancer.id, mes, anio, tipo, monto: tipo === "correccion" ? red2(m * signo) : red2(m), motivo: motivo.trim(),
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`${AJUSTE_LABEL[tipo]} registrada`);
    await onSaved();
  };

  return (
    <ModalBase title="Ajuste de pago" subtitle={`${freelancer.nombre} · ${MESES[mes - 1]} ${anio}`} onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_AJUSTE.map((t) => (
            <button key={t.value} onClick={() => setTipo(t.value)} className={`rounded-xl border p-3 text-left ${tipo === t.value ? "border-violet ring-2 ring-violet/30" : ""}`}>
              <div className="text-sm font-semibold">{AJUSTE_LABEL[t.value]}</div>
              <div className="text-[11px] text-muted-foreground">{t.ayuda}</div>
            </button>
          ))}
        </div>
        {tipo === "correccion" && (
          <div className="inline-flex items-center gap-1 rounded-xl border p-1">
            <button onClick={() => setSigno(1)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${signo === 1 ? "bg-emerald-600 text-white" : "text-muted-foreground"}`}>+ Sumar</button>
            <button onClick={() => setSigno(-1)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${signo === -1 ? "bg-red-600 text-white" : "text-muted-foreground"}`}>− Restar</button>
          </div>
        )}
        <Campo label="Monto ($) *"><input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border bg-background text-sm tabular-nums" /></Campo>
        <Campo label="Motivo *"><input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. entrega fuera de plazo" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
        <div className="flex justify-end gap-2 pt-1">
          <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar ajuste"}</button>
        </div>
      </div>
    </ModalBase>
  );
}

function RegistrarPagoModal({ freelancer, mes, anio, total, pagado, pendiente, cuentas, onClose, onSaved }: {
  freelancer: Freelancer; mes: number; anio: number; total: number; pagado: number; pendiente: number;
  cuentas: CuentaEmpresa[];
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const leer = useServerFn(leerComprobante);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fecha, setFecha] = useState(isoLocal(new Date()));
  const [monto, setMonto] = useState(pendiente > 0 ? String(pendiente) : "");
  const [tipoPago, setTipoPago] = useState("transferencia");
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
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
      toast.success("Comprobante leído · revisa los datos antes de guardar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo leer el comprobante.");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async () => {
    if (!Number.isFinite(montoNum) || montoNum <= 0) return toast.error("Escribe el monto del pago.");
    if (montoNum > pendiente + 0.001) return toast.error(`El pago supera lo pendiente (${dinero(pendiente)}).`);
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
      freelancer_id: freelancer.id, mes, anio, fecha_pago: fecha, monto: montoNum, tipo_pago: tipoPago,
      cuenta_empresa_id: cuentaId || null,
      numero_comprobante: numero.trim() || null, observacion: observacion.trim() || null, archivo_url: archivoUrl,
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Pago registrado");
    await onSaved();
  };

  return (
    <ModalBase title={`Registrar pago · ${freelancer.nombre}`} subtitle={`${MESES[mes - 1]} ${anio}`} onClose={onClose} ancho="max-w-3xl">
      <div className="grid md:grid-cols-[1fr_220px] gap-5 p-5">
        <div className="space-y-3 min-w-0">
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
            <Campo label="Pagado desde (cuenta del líder)">
              <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
                <option value="">Sin especificar</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.numero_cuenta}</option>)}
              </select>
            </Campo>
          </div>
          <div className="rounded-xl border px-3 py-2 text-xs text-muted-foreground break-words">
            Destino: <strong className="text-foreground">{freelancer.banco ? `${freelancer.banco} · ${freelancer.tipo_cuenta ?? ""} ${freelancer.numero_cuenta ?? ""}${freelancer.titular_cuenta ? ` · ${freelancer.titular_cuenta}` : ""}` : "sin datos bancarios del freelance"}</strong>
          </div>
          <Campo label="N.º de comprobante"><input value={numero} onChange={(e) => setNumero(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Opcional" /></Campo>
          <Campo label="Observación"><textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value.slice(0, 300))} maxLength={300} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Opcional" /></Campo>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <MiniTotal label="Total" value={dinero(total)} />
            <MiniTotal label="Pagado" value={dinero(pagado)} positivo />
            <MiniTotal label="Pendiente" value={dinero(pendiente)} alerta={pendiente > 0} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Comprobante (imagen)</div>
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
        <button disabled={guardando || leyendo} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar pago"}</button>
      </div>
    </ModalBase>
  );
}

// ===================== FREELANCERS =====================

const FORM_VACIO = { nombre: "", servicio: "", tarifa_hora: "", email: "", telefono: "", banco: "", tipo_cuenta: "", numero_cuenta: "", titular_cuenta: "" };
type FormFreelancer = typeof FORM_VACIO;

function FormFreelancerCampos({ form, setForm }: { form: FormFreelancer; setForm: (fn: (p: FormFreelancer) => FormFreelancer) => void }) {
  const campo = (key: keyof FormFreelancer, label: string, placeholder = "", tipo = "text") => (
    <Campo label={label}>
      <input type={tipo} value={form[key]} min={tipo === "number" ? "0" : undefined} step={tipo === "number" ? "0.01" : undefined}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} maxLength={120}
        className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
    </Campo>
  );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campo("nombre", "Nombre completo *")}
        {campo("servicio", "Área de trabajo", "Ej. Marketing")}
        {campo("tarifa_hora", "Tarifa acordada ($/hora) *", "0.00", "number")}
        {campo("email", "Correo")}
        {campo("telefono", "Teléfono")}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">Datos bancarios del freelance</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campo("banco", "Banco", "Ej. Banco Pichincha")}
        {campo("tipo_cuenta", "Tipo de cuenta", "Ahorros / Corriente")}
        {campo("numero_cuenta", "Número de cuenta")}
        {campo("titular_cuenta", "Titular")}
      </div>
    </div>
  );
}

function formDesde(f: Freelancer): FormFreelancer {
  return {
    nombre: f.nombre, servicio: f.servicio ?? "", tarifa_hora: f.tarifa_hora ? String(f.tarifa_hora) : "", email: f.email ?? "",
    telefono: f.telefono ?? "", banco: f.banco ?? "", tipo_cuenta: f.tipo_cuenta ?? "", numero_cuenta: f.numero_cuenta ?? "", titular_cuenta: f.titular_cuenta ?? "",
  };
}

async function guardarFreelancer(form: FormFreelancer, id: string | null) {
  const nombre = form.nombre.trim();
  if (nombre.length < 2) throw new Error("Escribe el nombre del freelancer.");
  const tarifa = Number(form.tarifa_hora);
  if (form.tarifa_hora.trim() === "" || !Number.isFinite(tarifa) || tarifa < 0) throw new Error("Escribe la tarifa acordada por hora.");
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no es válido.");
  const limpio = (v: string) => v.trim() || null;
  const payload = {
    nombre, servicio: limpio(form.servicio), tarifa_hora: red2(tarifa), email: email || null, telefono: limpio(form.telefono),
    banco: limpio(form.banco), tipo_cuenta: limpio(form.tipo_cuenta), numero_cuenta: limpio(form.numero_cuenta),
    titular_cuenta: limpio(form.titular_cuenta), updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await tabla("freelancers").update(payload as never).eq("id", id)
    : await tabla("freelancers").insert(payload as never);
  if (error) throw new Error(error.message);
}

function FreelancerFormModal({ freelancer, onClose, onSaved }: { freelancer: Freelancer; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState<FormFreelancer>(formDesde(freelancer));
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarFreelancer(form, freelancer.id);
      toast.success("Datos actualizados · la nueva tarifa aplica a los trabajos que se registren desde ahora");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <ModalBase title="Editar freelancer" subtitle={freelancer.nombre} onClose={onClose} ancho="max-w-3xl">
      <div className="p-5 space-y-4">
        <FormFreelancerCampos form={form} setForm={setForm} />
        <div className="flex justify-end gap-2">
          <button disabled={guardando} onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
          <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </ModalBase>
  );
}

function FreelancersModal({ freelancers, onClose, onSaved }: {
  freelancers: Freelancer[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(freelancers.length ? null : "nuevo");
  const [form, setForm] = useState<FormFreelancer>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const abrir = (f: Freelancer | null) => {
    setEditando(f ? f.id : "nuevo");
    setForm(f ? formDesde(f) : FORM_VACIO);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarFreelancer(form, editando === "nuevo" ? null : editando);
      toast.success(editando === "nuevo" ? "Freelancer agregado" : "Freelancer actualizado");
      setEditando(null);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActivo = async (f: Freelancer) => {
    if (f.activo && !confirm(`¿Desactivar a ${f.nombre}? Su información se conserva y podrás activarlo de nuevo.`)) return;
    const { error } = await tabla("freelancers").update({ activo: !f.activo, updated_at: new Date().toISOString() } as never).eq("id", f.id);
    if (error) return toast.error(error.message);
    toast.success(f.activo ? "Freelancer desactivado" : "Freelancer activado");
    await onSaved();
  };

  return (
    <ModalBase title="Gestionar freelancers" subtitle="Trabajadores freelance de la empresa" onClose={onClose} ancho="max-w-3xl">
      <div className="p-5 space-y-4">
        {editando ? (
          <div className="rounded-xl border p-4 space-y-3">
            <div className="font-semibold text-sm">{editando === "nuevo" ? "Nuevo freelancer" : "Editar freelancer"}</div>
            <FormFreelancerCampos form={form} setForm={setForm} />
            <div className="flex justify-end gap-2">
              <button disabled={guardando} onClick={() => setEditando(null)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button disabled={guardando} onClick={() => void guardar()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => abrir(null)} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar freelancer</button>
        )}
        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {freelancers.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Todavía no hay freelancers registrados.</div>}
          {freelancers.map((f) => (
            <div key={f.id} className="rounded-xl border p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-sm">{f.nombre} {!f.activo && <span className="text-[10px] text-muted-foreground">(inactivo)</span>}</div>
                <div className="text-xs text-muted-foreground">{[f.servicio, `${dinero(f.tarifa_hora)}/hora`].filter(Boolean).join(" · ")}</div>
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

function CuentasModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalBase title="Cuentas bancarias del líder" subtitle="Cuentas de la empresa desde las que se paga (las mismas de Profesores)" onClose={onClose} ancho="max-w-3xl">
      <div className="p-2 max-h-[75vh] overflow-y-auto">
        <PagosCuentas puedeEditar />
      </div>
    </ModalBase>
  );
}

// ===================== UI BASE =====================

// Modal persistente: solo se cierra con X, Cancelar/Cerrar o al guardar
// (no al hacer clic fuera ni al cambiar de pestaña).
function ModalBase({ title, subtitle, onClose, ancho = "max-w-lg", children }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  ancho?: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 overflow-y-auto">
      <div className={`w-full ${ancho} rounded-2xl bg-card border shadow-xl my-6 min-w-0`}>
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
