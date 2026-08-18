import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Lock, Star, ChevronLeft, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatHM, minutosEntre, horasDecimal } from "@/lib/tiempo";
import { generarPagosPDF, exportarPagosExcel, listaMeses, generarInformeProfesorPDF, type InformeItem, type InformeReemplazo, type AbonoExportRow } from "@/lib/pagos-export";
import { formatNombre } from "@/lib/nombres";
import { RegistrarAbonoModal, type Abono, type CuentaEmpresa } from "@/components/pagos/RegistrarAbonoModal";
import { PagosPrecios, type FilaPrecio } from "@/components/pagos/PagosPrecios";
import { PagosAbonos } from "@/components/pagos/PagosAbonos";
import { PagosBonos } from "@/components/pagos/PagosBonos";
import { PagosCuentas } from "@/components/pagos/PagosCuentas";

export const Route = createFileRoute("/_authenticated/pagos")({ component: Page });

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Profile { id: string; nombre_completo: string; email: string; avatar_url?: string | null }
interface PagoHist { id: string; profesor_id: string; mes: number; anio: number; total_horas: number; total_bonos: number; monto_total: number; estado: string; fecha_pago: string | null }
interface Cancelada {
  id: string; tipo: string; profesor_id: string; contraparte_id: string | null;
  titulo: string | null; fecha: string; estado: string; razon: string | null;
}
interface Reemplazo {
  id: string; tipo: string; referencia_id: string; profesor_reporta: string;
  profesor_reemplazado: string; fecha: string; nota: string | null;
}
export interface ItemPago {
  tipo: "clase" | "1a1";
  refId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  titulo: string | null;
  alumnaId: string | null;
  monto: number;
}

interface StaffRow {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  tema: string;
  minutosClase: number;
  sesiones1a1: number;
  minutos1a1: number;
  ajusteMin: number;
  items: ItemPago[];
  mensajesEstudiantes: number;
  califPromedio: number;
  califCount: number;
  bonos: number;
  total: number;
  estado: "pagado" | "por_pagar";
  pagoId?: string;
}

type Tab = "resumen" | "precios" | "abonos" | "bonos" | "cuentas";
const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "abonos", label: "Pagos realizados" },
  { id: "cuentas", label: "Cuentas bancarias" },
];

const TEMAS: { match: string; tema: string }[] = [
  { match: "jennyfer", tema: "Marketing · WhatsApp" },
  { match: "jaime",    tema: "Landing & sistemas" },
  { match: "karen",    tema: "WhatsApp · Seguimiento" },
  { match: "henry",    tema: "Meta Ads" },
  { match: "erick",    tema: "IA · imágenes" },
];
function temaDe(p: Profile) {
  const k = (p.nombre_completo + " " + p.email).toLowerCase();
  return TEMAS.find((t) => k.includes(t.match))?.tema ?? "Mentoría";
}
const COLORS = ["#7C6BFF","#22A06B","#E78A3C","#3C8FE7","#C2756B"];
function colorDe(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function inicial(p: Profile) { return (p.nombre_completo || p.email).slice(0,1).toUpperCase(); }

function Page() {
  const { role } = useAuth();
  const today = new Date();
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [anio, setAnio] = useState(today.getFullYear());
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [historial, setHistorial] = useState<PagoHist[]>([]);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canceladas, setCanceladas] = useState<Cancelada[]>([]);
  const [nombresCancel, setNombresCancel] = useState<Record<string, string>>({});
  const [reemplazos, setReemplazos] = useState<Reemplazo[]>([]);
  const [nombresAlumnas, setNombresAlumnas] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("resumen");
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cuentas, setCuentas] = useState<CuentaEmpresa[]>([]);
  const [abonoDe, setAbonoDe] = useState<string | null>(null);

  const cargarCuentas = async () => {
    const { data } = await supabase.from("pagos_cuentas_bancarias").select("*").eq("activo", true).order("created_at", { ascending: false });
    setCuentas((data as CuentaEmpresa[]) ?? []);
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin","soporte"]);
      const map = new Map<string, string>();
      ((roles ?? []) as { user_id: string; role: string }[]).forEach((r) => {
        const prev = map.get(r.user_id);
        if (!prev || r.role === "admin") map.set(r.user_id, r.role);
      });
      const ids = Array.from(map.keys());
      const { data: estudiantes } = await supabase.from("user_roles").select("user_id").eq("role", "usuario");
      const studentIds = new Set(((estudiantes ?? []) as { user_id: string }[]).map((r) => r.user_id));

      const { data: profs } = await supabase.from("profiles").select("id,nombre_completo,email,avatar_url").in("id", ids);
      const profMap: Record<string, Profile> = {};
      ((profs ?? []) as Profile[]).forEach((p) => { profMap[p.id] = p; });
      setProfiles(profMap);

      const ini = `${anio}-${String(mes).padStart(2,"0")}-01`;
      const finDate = new Date(anio, mes, 0);
      const fin = `${anio}-${String(mes).padStart(2,"0")}-${String(finDate.getDate()).padStart(2,"0")}`;
      const iniTs = `${ini}T00:00:00`;
      const finTs = `${fin}T23:59:59`;

      const { data: pagosMes } = await supabase.from("pagos_mensuales")
        .select("*").eq("mes", mes).eq("anio", anio);

      const { data: canc } = await supabase.from("sesiones_canceladas")
        .select("id,tipo,profesor_id,contraparte_id,titulo,fecha,estado,razon")
        .gte("fecha", ini).lte("fecha", fin).order("fecha", { ascending: false });
      const cancRows = ((canc ?? []) as Cancelada[]);
      setCanceladas(cancRows);
      const cids = Array.from(new Set(cancRows.map((c) => c.contraparte_id).filter(Boolean) as string[]));
      if (cids.length) {
        const { data: cps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", cids);
        const nm: Record<string, string> = {};
        ((cps ?? []) as Profile[]).forEach((p) => { nm[p.id] = formatNombre(p.nombre_completo) || p.email; });
        setNombresCancel(nm);
      } else setNombresCancel({});

      const pagoMap = new Map<string, PagoHist>();
      ((pagosMes ?? []) as PagoHist[]).forEach((p) => pagoMap.set(p.profesor_id, p));

      const { data: abs } = await supabase.from("pagos_comprobantes")
        .select("*").eq("mes", mes).eq("anio", anio).order("fecha_pago", { ascending: false });
      setAbonos((abs as Abono[]) ?? []);
      await cargarCuentas();

      const [{ data: precios }, { data: ajustes }, { data: reemp }] = await Promise.all([
        supabase.from("pagos_items_precio").select("tipo,referencia_id,monto").eq("mes", mes).eq("anio", anio),
        supabase.from("pagos_ajustes").select("profesor_id,minutos").eq("mes", mes).eq("anio", anio),
        supabase.from("reemplazos_clase").select("*").gte("fecha", ini).lte("fecha", fin),
      ]);
      const precioMap = new Map<string, number>();
      ((precios ?? []) as { tipo: string; referencia_id: string; monto: number }[])
        .forEach((p) => precioMap.set(`${p.tipo}:${p.referencia_id}`, Number(p.monto)));
      const ajusteMap = new Map<string, number>();
      ((ajustes ?? []) as { profesor_id: string; minutos: number }[])
        .forEach((a) => ajusteMap.set(a.profesor_id, Number(a.minutos)));
      setReemplazos((reemp ?? []) as Reemplazo[]);

      const alumnaIds = new Set<string>();

      const rows: StaffRow[] = await Promise.all(ids.map(async (pid) => {
        const p = profMap[pid];
        if (!p) return null as unknown as StaffRow;

        const [clasesRes, sesionesRes, califRes, chatsRes, bonosRes] = await Promise.all([
          supabase.from("clases_en_vivo").select("id,fecha,titulo,hora_inicio,hora_fin,duracion_min").eq("profesor_id", pid).gte("fecha", ini).lte("fecha", fin),
          supabase.from("sesiones_1a1").select("id,fecha,alumna_id,hora_inicio,hora_fin,duracion_min").eq("profesor_id", pid).gte("fecha", ini).lte("fecha", fin),
          supabase.from("calificaciones_mensuales").select("claridad,didactica,practico,desenvolvimiento").eq("profesor_id", pid),
          supabase.from("chats_1a1").select("id,usuario_a_id,usuario_b_id").or(`usuario_a_id.eq.${pid},usuario_b_id.eq.${pid}`),
          supabase.from("bonos").select("monto").eq("profesor_id", pid).eq("mes", mes).eq("anio", anio),
        ]);

        const items: ItemPago[] = [];
        let minutosClase = 0;
        ((clasesRes.data ?? []) as { id: string; fecha: string; titulo: string; hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[]).forEach((c) => {
          const min = c.duracion_min && c.duracion_min > 0 ? c.duracion_min : minutosEntre(c.hora_inicio, c.hora_fin);
          minutosClase += min;
          items.push({
            tipo: "clase", refId: c.id, fecha: c.fecha, horaInicio: c.hora_inicio, horaFin: c.hora_fin ?? "",
            minutos: min, titulo: c.titulo, alumnaId: null, monto: precioMap.get(`clase:${c.id}`) ?? 0,
          });
        });

        const sesionesData = (sesionesRes.data ?? []) as { id: string; fecha: string; alumna_id: string; hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[];
        let minutos1a1 = 0;
        sesionesData.forEach((s) => {
          const min = s.duracion_min && s.duracion_min > 0 ? s.duracion_min : minutosEntre(s.hora_inicio, s.hora_fin);
          minutos1a1 += min;
          alumnaIds.add(s.alumna_id);
          items.push({
            tipo: "1a1", refId: s.id, fecha: s.fecha, horaInicio: s.hora_inicio, horaFin: s.hora_fin ?? "",
            minutos: min, titulo: null, alumnaId: s.alumna_id, monto: precioMap.get(`1a1:${s.id}`) ?? 0,
          });
        });
        items.sort((a, b) => (b.fecha + b.horaInicio).localeCompare(a.fecha + a.horaInicio));

        const vals: number[] = [];
        ((califRes.data ?? []) as { claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null }[]).forEach((c) => {
          [c.claridad, c.didactica, c.practico, c.desenvolvimiento].forEach((v) => { if (typeof v === "number") vals.push(v); });
        });
        const califPromedio = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
        const califCount = (califRes.data ?? []).length;

        const chatsConEstudiantes = ((chatsRes.data ?? []) as { id: string; usuario_a_id: string; usuario_b_id: string }[])
          .filter((c) => {
            const otro = c.usuario_a_id === pid ? c.usuario_b_id : c.usuario_a_id;
            return studentIds.has(otro);
          })
          .map((c) => c.id);
        let mensajesEstudiantes = 0;
        if (chatsConEstudiantes.length) {
          const { count } = await supabase.from("mensajes_chat_1a1")
            .select("id", { count: "exact", head: true })
            .eq("autor_id", pid).in("chat_id", chatsConEstudiantes)
            .gte("created_at", iniTs).lte("created_at", finTs);
          mensajesEstudiantes = count ?? 0;
        }

        const sesiones1a1 = sesionesData.length;
        const bonos = ((bonosRes.data ?? []) as { monto: number }[]).reduce((a,b)=>a + Number(b.monto), 0);
        const total = Math.round((items.reduce((a, i) => a + i.monto, 0) + bonos) * 100) / 100;
        const pago = pagoMap.get(pid);

        return {
          id: pid,
          nombre: formatNombre(p.nombre_completo) || p.email,
          email: p.email,
          rol: map.get(pid) ?? "soporte",
          tema: temaDe(p),
          minutosClase,
          sesiones1a1, minutos1a1,
          ajusteMin: ajusteMap.get(pid) ?? 0,
          items,
          mensajesEstudiantes,
          califPromedio, califCount,
          bonos,
          total,
          estado: (pago?.estado === "pagado" ? "pagado" : "por_pagar") as "pagado" | "por_pagar",
          pagoId: pago?.id,
        };
      }));
      setStaff(rows.filter(Boolean).sort((a,b) => b.total - a.total));

      if (alumnaIds.size) {
        const { data: as } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", Array.from(alumnaIds));
        const nm: Record<string, string> = {};
        ((as ?? []) as Profile[]).forEach((p) => { nm[p.id] = formatNombre(p.nombre_completo) || p.email; });
        setNombresAlumnas(nm);
      } else setNombresAlumnas({});

      const { data: hist } = await supabase.from("pagos_mensuales")
        .select("*").order("anio",{ascending:false}).order("mes",{ascending:false}).limit(24);
      setHistorial((hist as PagoHist[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [mes, anio]);

  const abonadoPor = useMemo(() => {
    const m: Record<string, number> = {};
    abonos.filter((a) => !a.es_descuento).forEach((a) => { m[a.profesor_id] = (m[a.profesor_id] ?? 0) + Number(a.monto); });
    return m;
  }, [abonos]);
  const descuentosPor = useMemo(() => {
    const m: Record<string, number> = {};
    abonos.filter((a) => a.es_descuento).forEach((a) => { m[a.profesor_id] = (m[a.profesor_id] ?? 0) + Number(a.monto); });
    return m;
  }, [abonos]);
  const aplicadoPor = useMemo(() => {
    const m: Record<string, number> = {};
    staff.forEach((s) => { m[s.id] = (abonadoPor[s.id] ?? 0) + (descuentosPor[s.id] ?? 0); });
    return m;
  }, [staff, abonadoPor, descuentosPor]);

  const tot = useMemo(() => {
    const minutos = staff.reduce((a,b) => a + b.minutosClase + b.minutos1a1, 0);
    const sesiones = staff.reduce((a,b) => a + b.sesiones1a1, 0);
    const pagar = staff.reduce((a, s) => a + Math.max(0, s.total - (aplicadoPor[s.id] ?? 0)), 0);
    const pendCount = staff.filter((s) => s.estado !== "pagado" && (aplicadoPor[s.id] ?? 0) + 0.009 < s.total).length;
    const califs = staff.filter(s => s.califCount > 0).map(s => s.califPromedio);
    const califEq = califs.length ? califs.reduce((a,b)=>a+b,0)/califs.length : 0;
    return { minutos, sesiones, pagar, pendCount, califEq };
  }, [staff, aplicadoPor]);

  const totalesPor = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.total])), [staff]);
  const nombresStaff = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.nombre])), [staff]);
  const estadoDe = (s: StaffRow): "pagado" | "parcial" | "por_pagar" => {
    const aplicado = aplicadoPor[s.id] ?? 0;
    if (aplicado > 0 && aplicado + 0.009 >= s.total) return "pagado";
    if (aplicado > 0) return "parcial";
    return s.estado === "pagado" ? "pagado" : "por_pagar";
  };

  const filasPrecio: FilaPrecio[] = useMemo(() => staff.flatMap((s) => s.items.map((i) => ({
    key: `${i.tipo}:${i.refId}`,
    tipo: i.tipo, refId: i.refId, profesorId: s.id, profesor: s.nombre,
    fecha: i.fecha, horaInicio: i.horaInicio, horaFin: i.horaFin, minutos: i.minutos,
    detalle: i.tipo === "clase" ? (i.titulo || "Clase en vivo") : (i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante"),
    monto: i.monto,
  }))).sort((a, b) => (b.fecha + b.horaInicio).localeCompare(a.fecha + a.horaInicio)), [staff, nombresAlumnas]);

  const sincronizarPago = async (row: StaffRow) => {
    const { data } = await supabase.from("pagos_comprobantes")
      .select("*").eq("profesor_id", row.id).eq("mes", mes).eq("anio", anio);
    const movimientos = ((data ?? []) as Abono[]);
    const aplicado = movimientos.reduce((a, b) => a + Number(b.monto), 0);
    const pagadoReal = movimientos.filter((a) => !a.es_descuento).reduce((a, b) => a + Number(b.monto), 0);
    const payload = {
      profesor_id: row.id, mes, anio,
      total_horas: horasDecimal(row.minutosClase + row.minutos1a1), total_bonos: row.bonos,
      monto_total: row.total, estado: aplicado + 0.009 >= row.total && aplicado > 0 ? "pagado" : "por_pagar",
      fecha_pago: pagadoReal > 0 ? new Date().toISOString() : null,
    };
    if (row.pagoId) await supabase.from("pagos_mensuales").update(payload).eq("id", row.pagoId);
    else await supabase.from("pagos_mensuales").insert(payload);
  };

  const cerrarMes = async () => {
    const pendientes = staff.filter(s => estadoDe(s) !== "pagado");
    if (!pendientes.length) return toast.info("No hay pagos pendientes");
    if (!confirm(`Generar ${pendientes.length} pagos por un saldo total de $${tot.pagar.toFixed(2)}?`)) return;
    for (const r of pendientes) {
      if (r.pagoId) continue;
      await supabase.from("pagos_mensuales").insert({
        profesor_id: r.id, mes, anio,
        total_horas: horasDecimal(r.minutosClase + r.minutos1a1), total_bonos: r.bonos,
        monto_total: r.total, estado: "por_pagar",
      });
    }
    toast.success("Mes cerrado · pagos generados");
    cargar();
  };

  const filasCanceladas = useMemo(() => canceladas.map((c) => ({
    profesor: formatNombre(profiles[c.profesor_id]?.nombre_completo) || profiles[c.profesor_id]?.email || "—",
    fecha: c.fecha,
    tipo: c.tipo === "clase" ? "Clase en vivo" : "1 a 1",
    con: c.tipo === "clase" ? (c.titulo || "Clase") : (c.contraparte_id ? nombresCancel[c.contraparte_id] || "Estudiante" : "Estudiante"),
    estado: c.estado === "cancelada" ? "Cancelada" : "No registrada",
    razon: c.razon || "",
  })), [canceladas, profiles, nombresCancel]);

  const nombreItem = (i: ItemPago) =>
    i.tipo === "clase" ? (i.titulo || "Clase en vivo") : (i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante");

  const abonosExport = (profesorId?: string): AbonoExportRow[] =>
    abonos
      .filter((a) => !profesorId || a.profesor_id === profesorId)
      .map((a) => ({
        fecha: a.fecha_pago,
        profesor: formatNombre(profiles[a.profesor_id]?.nombre_completo) || profiles[a.profesor_id]?.email || "—",
        monto: Number(a.monto),
        tipo: a.es_descuento ? "Descuento" : a.tipo_pago,
        banco: a.es_descuento ? "" : (a.banco_texto || ""),
        numero: a.es_descuento ? "" : (a.numero_comprobante || ""),
        observacion: a.es_descuento ? (a.motivo_descuento || a.observacion || "") : (a.observacion || ""),
      }));

  const descargarInforme = (row: StaffRow) => {
    const items: InformeItem[] = row.items.map((i) => ({
      fecha: i.fecha,
      tipo: i.tipo === "clase" ? "Clase en vivo" : "Sesión 1:1",
      detalle: nombreItem(i),
      horaInicio: i.horaInicio,
      horaFin: i.horaFin,
      minutos: i.minutos,
      monto: i.monto,
    }));
    const reems: InformeReemplazo[] = reemplazos
      .filter((r) => r.profesor_reporta === row.id)
      .map((r) => ({
        fecha: r.fecha,
        detalle: r.tipo === "clase" ? "Clase en vivo" : "Sesión 1:1",
        profesor: formatNombre(profiles[r.profesor_reemplazado]?.nombre_completo) || profiles[r.profesor_reemplazado]?.email || "—",
        nota: r.nota || "",
      }));
    generarInformeProfesorPDF({
      nombre: row.nombre, tema: row.tema, mes, anio, items,
      canceladas: filasCanceladas.filter((c) => c.profesor === row.nombre),
      reemplazos: reems,
      abonos: abonosExport(row.id),
      bonos: row.bonos, ajusteMin: row.ajusteMin, total: row.total,
      califPromedio: row.califPromedio, califCount: row.califCount,
    });
  };

  if (role !== "admin" && role !== "soporte") {
    return <div className="p-8 text-center text-muted-foreground">Solo el equipo puede ver esta sección.</div>;
  }

  if (detalleId) {
    const row = staff.find(s => s.id === detalleId);
    if (!row) return null;
    return <DetalleProfesor row={row} profile={profiles[detalleId]} mes={mes} anio={anio} onBack={() => setDetalleId(null)} onSelect={(id) => setDetalleId(id)} staff={staff}
      nombresAlumnas={nombresAlumnas}
      puedeEditar={role === "admin"}
      onRefresh={cargar}
      onInforme={() => descargarInforme(row)}
      reemplazos={reemplazos.filter((r) => r.profesor_reporta === row.id).map((r) => ({
        fecha: r.fecha,
        detalle: r.tipo === "clase" ? "Clase en vivo" : "Sesión 1:1",
        profesor: formatNombre(profiles[r.profesor_reemplazado]?.nombre_completo) || profiles[r.profesor_reemplazado]?.email || "—",
        nota: r.nota || "",
      }))}
      canceladas={canceladas.filter((c) => c.profesor_id === detalleId).map((c) => ({
        fecha: c.fecha, tipo: c.tipo === "clase" ? "Clase en vivo" : "1 a 1",
        con: c.tipo === "clase" ? (c.titulo || "Clase") : (c.contraparte_id ? nombresCancel[c.contraparte_id] || "Estudiante" : "Estudiante"),
        estado: c.estado === "cancelada" ? "Cancelada" : "No registrada",
        razon: c.razon || "",
      }))} />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={`${anio}-${mes}`} onChange={(e) => { const [a,m] = e.target.value.split("-").map(Number); setAnio(a); setMes(m); }} className="px-3 py-2 rounded-lg border bg-card text-sm font-medium">
          {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="px-3 py-2 rounded-lg border bg-card text-sm flex items-center gap-1.5" onClick={() => {
          if (!staff.length) return toast.info("Sin datos para exportar");
          exportarPagosExcel({ mes, anio, rows: staff, canceladas: filasCanceladas, abonos: abonosExport() });
        }}>
          📊 Exportar Excel
        </button>
        <button className="px-3 py-2 rounded-lg border bg-card text-sm flex items-center gap-1.5" onClick={() => {
          if (!staff.length) return toast.info("Sin datos para exportar");
          generarPagosPDF({ mes, anio, rows: staff, canceladas: filasCanceladas, abonos: abonosExport() });
        }}>
          <FileText className="w-4 h-4" /> Generar PDF
        </button>
        <div className="flex-1" />
        {role === "admin" && (
          <button onClick={cerrarMes} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold flex items-center gap-2 shadow-md">
            <Lock className="w-4 h-4" /> Cerrar mes y generar pagos
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl border bg-card w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t.id ? "bg-violet-gradient text-white" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "abonos" && (
        <PagosAbonos abonos={abonos} nombres={nombresStaff} totales={totalesPor} mes={mes} anio={anio} />
      )}
      {tab === "cuentas" && (
        <PagosCuentas puedeEditar={role === "admin"} onChanged={cargarCuentas} />
      )}

      {tab === "resumen" && (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0F1431,#1B1F4A)" }}>
          <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,107,255,.5), transparent 70%)" }} />
          <div className="text-[10px] uppercase tracking-wider opacity-70">Saldo a pagar · {MESES[mes-1]}</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">${tot.pagar.toFixed(2)}</div>
          <div className="text-xs opacity-80 mt-1">{tot.pendCount} {tot.pendCount === 1 ? "profesor" : "profesores"} · pendiente</div>
        </div>
        <KPI label="Tiempo dictado" value={formatHM(tot.minutos)} sub={`${staff.length} miembros activos`} />
        <KPI label="Sesiones 1:1" value={String(tot.sesiones)} sub="reservadas" />
        <KPI label="Calif. equipo" value={tot.califEq ? tot.califEq.toFixed(2) : "—"} sub={tot.califEq ? "promedio del equipo" : "Sin calificaciones"} />
      </div>

      <div className="space-y-2 mb-6">
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold text-sm">Valores por hora · clases y sesiones</summary>
          <div className="mt-4">
            <PagosPrecios key={`${mes}-${anio}-${filasPrecio.length}`} filas={filasPrecio} mes={mes} anio={anio} puedeEditar={role === "admin"} onRefresh={cargar} />
          </div>
        </details>
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold text-sm">Bonos del mes</summary>
          <div className="mt-4">
            <PagosBonos mes={mes} anio={anio} nombres={nombresStaff} puedeEditar={role === "admin"} onChanged={cargar} />
          </div>
        </details>
      </div>

      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="text-lg font-semibold">Resumen del equipo · {MESES[mes-1]} {anio}</h2>
        <span className="text-xs text-muted-foreground">Click en el nombre para ver el detalle</span>
      </div>
      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-4 py-3 font-semibold">Profesor</th>
              <th className="text-left px-3 py-3 font-semibold">Clases realizadas</th>
              <th className="text-left px-3 py-3 font-semibold">Sesiones 1:1</th>
              <th className="text-right px-3 py-3 font-semibold">Bonos</th>
              <th className="text-left px-3 py-3 font-semibold">Calificación</th>
              <th className="text-right px-3 py-3 font-semibold">A pagar</th>
              <th className="text-left px-3 py-3 font-semibold">Estado</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
            {!loading && staff.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/30 transition">
                <td className="px-4 py-3">
                  <button onClick={() => setDetalleId(s.id)} className="flex items-center gap-3 text-left">
                    {profiles[s.id]?.avatar_url ? (
                      <img src={profiles[s.id].avatar_url!} alt={s.nombre} className="w-10 h-10 rounded-full object-cover border bg-muted flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full grid place-items-center text-xs font-bold text-white flex-shrink-0" style={{ background: colorDe(s.id) }}>
                        {(s.nombre).slice(0,2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">{s.nombre}</div>
                      <div className="text-[11px] text-muted-foreground">{s.tema}</div>
                    </div>
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{s.items.filter((i) => i.tipo === "clase").length} clases</div>
                  {s.minutosClase > 0 && <div className="text-xs text-muted-foreground">{formatHM(s.minutosClase)}</div>}
                  {s.ajusteMin !== 0 && (
                    <div className="text-[11px] text-muted-foreground">Ajuste {s.ajusteMin > 0 ? "+" : "−"}{formatHM(Math.abs(s.ajusteMin))}</div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span className="font-medium">{s.sesiones1a1}</span>
                  <span className="text-xs text-muted-foreground"> {s.sesiones1a1 === 1 ? "sesión" : "sesiones"}</span>
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{s.bonos > 0 ? `$${s.bonos.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-3">
                  {s.califCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-flex gap-0.5">
                        {[1,2,3,4,5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= Math.round(s.califPromedio) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />)}
                      </span>
                      <span className="font-medium text-xs">{s.califPromedio.toFixed(1)}</span>
                    </span>
                  ) : <span className="text-muted-foreground text-xs">Sin calificar</span>}
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">
                  ${Math.max(0, s.total - (descuentosPor[s.id] ?? 0)).toFixed(2)}
                  {(descuentosPor[s.id] ?? 0) > 0 && <div className="text-[10px] font-normal text-amber-600">−${(descuentosPor[s.id] ?? 0).toFixed(2)} desc.</div>}
                </td>
                <td className="px-3 py-3">
                  {estadoDe(s) === "pagado" ? (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Pagado</span>
                  ) : estadoDe(s) === "parcial" ? (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                      Abono ${(abonadoPor[s.id] ?? 0).toFixed(2)}
                      {(descuentosPor[s.id] ?? 0) > 0 ? ` · descuento $${(descuentosPor[s.id] ?? 0).toFixed(2)}` : ""}
                      {` · saldo $${Math.max(0, s.total - (aplicadoPor[s.id] ?? 0)).toFixed(2)}`}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Por pagar</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => descargarInforme(s)} className="px-3 py-1.5 rounded-lg border text-xs font-semibold mr-2 inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Informe
                  </button>
                  {role === "admin" && (
                    <button onClick={() => setAbonoDe(s.id)} className="px-3 py-1.5 rounded-lg bg-violet-gradient text-white text-xs font-semibold">
                      {estadoDe(s) === "pagado" ? "Ver pagos" : "Marcar pagado"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && staff.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin actividad este mes.</td></tr>}
            {!loading && staff.length > 0 && (
              <tr className="bg-muted/40 border-t">
                <td className="px-4 py-3" colSpan={4} />
                <td className="px-3 py-3 text-right text-xs uppercase tracking-wider font-semibold">Saldo pendiente</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: "var(--violet)" }}>${tot.pagar.toFixed(2)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {historial.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Historial de pagos</h2>
          <div className="rounded-2xl border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Mes</th>
                  <th className="text-left px-3 py-2 font-semibold">Profesor</th>
                  <th className="text-right px-3 py-2 font-semibold">Horas</th>
                  <th className="text-right px-3 py-2 font-semibold">Total</th>
                  <th className="text-left px-3 py-2 font-semibold">Estado</th>
                  <th className="text-left px-3 py-2 font-semibold">Fecha pago</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2">{MESES[p.mes-1]} {p.anio}</td>
                    <td className="px-3 py-2">{formatNombre(profiles[p.profesor_id]?.nombre_completo) || profiles[p.profesor_id]?.email || "—"}</td>
                    <td className="px-3 py-2 text-right">{formatHM(Number(p.total_horas) * 60)}</td>
                    <td className="px-3 py-2 text-right font-semibold">${Number(p.monto_total).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {p.estado === "pagado"
                        ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Pagado</span>
                        : <span className="text-xs text-amber-600 dark:text-amber-400">Por pagar</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString("es-PE") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {abonoDe && (() => {
        const row = staff.find((s) => s.id === abonoDe);
        if (!row) return null;
        return (
          <RegistrarAbonoModal
            profesorId={row.id}
            profesorNombre={row.nombre}
            mes={mes}
            anio={anio}
            total={row.total}
            abonos={abonos.filter((a) => a.profesor_id === row.id)}
            cuentas={cuentas}
            onClose={() => setAbonoDe(null)}
            onSaved={async () => { await cargar(); await sincronizarPago(row); }}
          />
        );
      })()}
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-3xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{sub}</div>}
    </div>
  );
}

function DetalleProfesor({ row, profile, mes, anio, onBack, onSelect, staff, canceladas = [], nombresAlumnas = {}, puedeEditar = false, onRefresh, onInforme, reemplazos = [] }: {
  row: StaffRow; profile?: Profile; mes: number; anio: number;
  onBack: () => void; onSelect: (id: string) => void; staff: StaffRow[];
  canceladas?: Array<{ fecha: string; tipo: string; con: string; estado: string; razon: string }>;
  nombresAlumnas?: Record<string, string>;
  puedeEditar?: boolean;
  onRefresh?: () => void;
  onInforme?: () => void;
  reemplazos?: InformeReemplazo[];
}) {
  const [califs, setCalifs] = useState<Array<{ claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null; comentario: string|null; created_at: string; alumna_id: string }>>([]);
  const [alumnaNombres, setAlumnaNombres] = useState<Record<string, string>>({});
  const [precios, setPrecios] = useState<Record<string, string>>(
    Object.fromEntries(row.items.map((i) => [`${i.tipo}:${i.refId}`, i.monto ? String(i.monto) : ""])),
  );
  const [ajuste, setAjuste] = useState(String(row.ajusteMin || 0));
  const [guardando, setGuardando] = useState(false);

  const nombreItem = (i: ItemPago) =>
    i.tipo === "clase" ? (i.titulo || "Clase en vivo") : (i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante");

  const guardarPrecio = async (i: ItemPago) => {
    const key = `${i.tipo}:${i.refId}`;
    const monto = Number(precios[key] || 0);
    if (Number.isNaN(monto) || monto < 0) return toast.error("Valor inválido");
    if (monto === i.monto) return;
    setGuardando(true);
    const { error } = await supabase.from("pagos_items_precio").upsert({
      profesor_id: row.id, tipo: i.tipo, referencia_id: i.refId, mes, anio, monto,
    }, { onConflict: "tipo,referencia_id" });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Valor guardado");
    onRefresh?.();
  };

  const guardarAjuste = async () => {
    const minutos = Math.round(Number(ajuste || 0));
    if (Number.isNaN(minutos)) return toast.error("Minutos inválidos");
    setGuardando(true);
    const { error } = await supabase.from("pagos_ajustes").upsert({
      profesor_id: row.id, mes, anio, minutos,
    }, { onConflict: "profesor_id,mes,anio" });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Ajuste guardado");
    onRefresh?.();
  };

  const bitacora = row.items.slice(0, 10).map((i) => ({
    fecha: i.fecha,
    tipo: i.tipo === "clase" ? "Clase en vivo" : "Sesión 1:1",
    detalle: `${nombreItem(i)} · ${formatHM(i.minutos)}`,
    monto: i.monto,
  }));

  useEffect(() => {
    (async () => {
      const { data: cals } = await supabase.from("calificaciones_mensuales")
        .select("claridad,didactica,practico,desenvolvimiento,comentario,created_at,alumna_id")
        .eq("profesor_id", row.id).order("created_at", { ascending: false });
      setCalifs((cals ?? []) as never);
      const aids = Array.from(new Set(((cals ?? []) as { alumna_id: string }[]).map((c) => c.alumna_id)));
      if (aids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", aids);
        const m: Record<string,string> = {};
        ((ps ?? []) as Profile[]).forEach((p) => { m[p.id] = formatNombre(p.nombre_completo) || p.email; });
        setAlumnaNombres(m);
      }
    })();
  }, [row.id, mes, anio]);

  const promedios = useMemo(() => {
    const acc = { claridad: [] as number[], didactica: [] as number[], desenvolvimiento: [] as number[], practico: [] as number[] };
    califs.forEach((c) => {
      if (typeof c.claridad === "number") acc.claridad.push(c.claridad);
      if (typeof c.didactica === "number") acc.didactica.push(c.didactica);
      if (typeof c.desenvolvimiento === "number") acc.desenvolvimiento.push(c.desenvolvimiento);
      if (typeof c.practico === "number") acc.practico.push(c.practico);
    });
    const avg = (a: number[]) => a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
    return {
      claridad: avg(acc.claridad),
      didactica: avg(acc.didactica),
      desenvolvimiento: avg(acc.desenvolvimiento),
      practico: avg(acc.practico),
    };
  }, [califs]);

  const ultimoComentario = califs.find((c) => c.comentario);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ChevronLeft className="w-4 h-4" /> Volver al resumen
      </button>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-5">
        <h1 className="text-2xl font-semibold">Informe detallado · {row.nombre}</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => onInforme?.()} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Descargar informe PDF
          </button>
          <div className="text-xs text-muted-foreground">{MESES[mes-1]} {anio}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Resumen económico</div>
          <div className="space-y-3">
            <Linea titulo="Clases grupales" sub={formatHM(row.minutosClase)} monto={row.items.filter((i) => i.tipo === "clase").reduce((a, i) => a + i.monto, 0)} />
            <Linea titulo="Sesiones 1:1" sub={`${row.sesiones1a1} sesiones · ${formatHM(row.minutos1a1)}`} monto={row.items.filter((i) => i.tipo === "1a1").reduce((a, i) => a + i.monto, 0)} />
            {row.bonos > 0 && <Linea titulo="Bonos del mes" sub="otorgados por admin" monto={row.bonos} />}
            <div className="border-t pt-3 flex items-baseline justify-between">
              <div className="text-sm font-semibold">Total a pagar</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--violet)" }}>${row.total.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Actividad del mes</div>
          <div className="space-y-3">
            <Item icon="🎓" titulo={`${bitacora.filter(b=>b.tipo==="Clase en vivo").length} clases impartidas`} sub={`${formatHM(row.minutosClase)} en total`} />
            <Item icon="📅" titulo={`${row.sesiones1a1} sesiones 1:1 realizadas`} sub={`${formatHM(row.minutos1a1)} en total`} />
            <Item icon="⭐" titulo={`${row.califCount} calificaciones recibidas`} sub={row.califCount ? `Promedio ${row.califPromedio.toFixed(2)}` : "Sin respuestas"} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Calificaciones ({row.califCount} respuestas)</div>
          <div className="space-y-3">
            <Barra label="Claridad al explicar" v={promedios.claridad} />
            <Barra label="Didáctica" v={promedios.didactica} />
            <Barra label="Desenvolvimiento" v={promedios.desenvolvimiento} />
            <Barra label="Práctico vs teórico" v={promedios.practico} />
          </div>
          {ultimoComentario && (
            <div className="mt-4 rounded-xl p-3 border-l-4 text-sm italic" style={{ borderColor: "var(--violet)", background: "color-mix(in oklab, var(--violet) 8%, transparent)" }}>
              "{ultimoComentario.comentario}"
              <div className="text-xs not-italic mt-1 opacity-70">— {alumnaNombres[ultimoComentario.alumna_id] || "Estudiante"} · {new Date(ultimoComentario.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Bitácora · movimientos recientes</div>
          <div className="space-y-3">
            {bitacora.map((b, i) => (
              <div key={i} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="text-[11px] uppercase opacity-60 w-14">{new Date(b.fecha+"T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</div>
                <div className="flex-1">
                  <div className="font-medium">{b.tipo} · <span className="text-muted-foreground font-normal">{b.detalle}</span></div>
                </div>
                <div className="font-semibold text-emerald-600 tabular-nums">+${b.monto.toFixed(2)}</div>
              </div>
            ))}
            {bitacora.length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos este mes.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Valor de cada clase y sesión · {MESES[mes-1]} {anio}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground text-xs">Ajuste de tiempo (min)</span>
            <input type="number" value={ajuste} disabled={!puedeEditar}
              onChange={(e) => setAjuste(e.target.value)} onBlur={guardarAjuste}
              className="w-24 px-2 py-1 rounded-lg border bg-background text-right" />
          </div>
        </div>
        {row.items.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin clases ni sesiones registradas este mes.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                  <th className="text-left px-2 py-2 font-semibold">Fecha</th>
                  <th className="text-left px-2 py-2 font-semibold">Horario</th>
                  <th className="text-left px-2 py-2 font-semibold">Tipo</th>
                  <th className="text-left px-2 py-2 font-semibold">Con / Tema</th>
                  <th className="text-left px-2 py-2 font-semibold">Duración</th>
                  <th className="text-right px-2 py-2 font-semibold">Valor $</th>
                </tr>
              </thead>
              <tbody>
                {row.items.map((i) => {
                  const key = `${i.tipo}:${i.refId}`;
                  return (
                    <tr key={key} className="border-t">
                      <td className="px-2 py-2 whitespace-nowrap">{new Date(i.fecha + "T00:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{i.horaInicio.slice(0,5)}{i.horaFin ? ` – ${i.horaFin.slice(0,5)}` : ""}</td>
                      <td className="px-2 py-2">{i.tipo === "clase" ? "Clase en vivo" : "1 a 1"}</td>
                      <td className="px-2 py-2">{nombreItem(i)}</td>
                      <td className="px-2 py-2">{formatHM(i.minutos)}</td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" step="0.01" min="0" disabled={!puedeEditar || guardando}
                          value={precios[key] ?? ""}
                          onChange={(e) => setPrecios((p) => ({ ...p, [key]: e.target.value }))}
                          onBlur={() => guardarPrecio(i)}
                          placeholder="0.00"
                          className="w-24 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!puedeEditar && <div className="text-xs text-muted-foreground mt-2">Solo un administrador puede cambiar los valores.</div>}
      </div>

      {reemplazos.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 mb-6">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            Reemplazos reportados · informativo
          </div>
          <div className="space-y-2">
            {reemplazos.map((r, i) => (
              <div key={i} className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="text-[11px] uppercase opacity-60 w-14 pt-0.5">
                  {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{r.detalle} · <span className="text-muted-foreground font-normal">reemplazó a {r.profesor}</span></div>
                  {r.nota && <div className="text-xs text-muted-foreground">{r.nota}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-5 mb-6">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Sesiones canceladas o no registradas · no cuentan horas
        </div>
        {canceladas.length === 0 ? (
          <div className="text-xs text-muted-foreground">Ninguna este mes.</div>
        ) : (
          <div className="space-y-2">
            {canceladas.map((c, i) => (
              <div key={i} className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="text-[11px] uppercase opacity-60 w-14 pt-0.5">
                  {new Date(c.fecha + "T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{c.tipo} · <span className="text-muted-foreground font-normal">{c.con}</span></div>
                  <div className="text-xs text-muted-foreground">{c.razon || "Sin razón registrada (pasaron 7 días sin registrar la duración)"}</div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(239,68,68,.12)", color: "#dc2626" }}>{c.estado}</span>
                <div className="font-semibold tabular-nums text-muted-foreground">$0.00</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-2 text-sm font-semibold">Ver informe de otro profesor</div>
      <div className="flex gap-2 flex-wrap">
        {staff.map((s) => (
          <button key={s.id} onClick={() => onSelect(s.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition ${s.id === row.id ? "border-violet bg-violet/10" : "bg-card"}`}>
            <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white" style={{ background: colorDe(s.id) }}>{s.nombre.slice(0,2).toUpperCase()}</span>
            {s.nombre.split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Linea({ titulo, sub, monto }: { titulo: string; sub: string; monto: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <div>
        <div className="font-semibold">{titulo}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <div className="text-lg font-bold tabular-nums">${monto.toFixed(2)}</div>
    </div>
  );
}
function Item({ icon, titulo, sub }: { icon: string; titulo: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center text-lg">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{titulo}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}
function Barra({ label, v }: { label: string; v: number }) {
  const pct = Math.max(0, Math.min(100, (v / 5) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{v ? v.toFixed(1) : "—"}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--violet),var(--violet-2))" }} />
      </div>
    </div>
  );
}
