import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Lock, Star, ChevronLeft, FileText, CheckCircle2, Landmark, Gift, X } from "lucide-react";
import { toast } from "sonner";
import { formatHM, horasDecimal } from "@/lib/tiempo";
import { listaMeses, generarInformeProfesorPDF, type InformeItem, type InformeReemplazo, type AbonoExportRow } from "@/lib/pagos-export";
import { formatNombre } from "@/lib/nombres";
import { puedeVerPagos } from "@/lib/roles";
import { segmentarHorarioLaboral, refTarifa1a1Fuera, refTarifaCoach } from "@/lib/pagos-horario";
import { listarCoachPagos, type CoachRegistro } from "@/lib/coach.functions";
import { RegistrarAbonoModal, type Abono, type CuentaEmpresa } from "@/components/pagos/RegistrarAbonoModal";
import { PagosPrecios, type FilaPrecio } from "@/components/pagos/PagosPrecios";
import { PagosAbonos } from "@/components/pagos/PagosAbonos";
import { PagosCuentas } from "@/components/pagos/PagosCuentas";

export const Route = createFileRoute("/_authenticated/pagos")({ component: Page });

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Profile {
  id: string; nombre_completo: string; email: string; avatar_url?: string | null; cedula?: string | null;
  banco?: string | null; tipo_cuenta?: string | null; numero_cuenta?: string | null;
  titular_cuenta?: string | null; banco_logo_url?: string | null;
}
export interface BonoRow { id: string; monto: number; motivo: string | null; tipo: string }
export interface DescuentoRow { id: string; monto: number; motivo: string }
interface PagoHist { id: string; profesor_id: string; mes: number; anio: number; total_horas: number; total_bonos: number; monto_total: number; estado: string; fecha_pago: string | null }
interface Cancelada {
  id: string; tipo: string; profesor_id: string; contraparte_id: string | null;
  titulo: string | null; fecha: string; estado: string; razon: string | null;
}
interface Reemplazo {
  id: string; tipo: string; referencia_id: string; profesor_reporta: string;
  profesor_reemplazado: string; fecha: string; nota: string | null;
}

type CategoriaItem = "clase" | "1a1" | "coach";
type CategoriaSegmento = "1a1_laboral" | "1a1_fuera";
interface SegmentoPago {
  categoria: CategoriaSegmento;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  monto: number;
}
export interface ItemPago {
  tipo: "clase" | "1a1";
  categoria: CategoriaItem;
  refId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  titulo: string | null;
  tema: string | null;
  alumnaId: string | null;
  monto: number;
  segmentos?: SegmentoPago[];
}

interface StaffRow {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  tema: string;
  minutosClase: number;
  clasesRealizadas: number;
  sesiones1a1: number;
  minutos1a1: number;
  sesiones1a1Laboral: number;
  sesiones1a1Fuera: number;
  minutos1a1Laboral: number;
  minutos1a1Fuera: number;
  sesionesCoach: number;
  minutosCoach: number;
  ajusteMin: number;
  items: ItemPago[];
  mensajesEstudiantes: number;
  califPromedio: number;
  califCount: number;
  bonos: number;
  bonosList: BonoRow[];
  descuentos: number;
  descuentosList: DescuentoRow[];
  tarifaClase: number;
  tarifaSesion: number;
  tarifaSesionFuera: number;
  tarifaCoach: number;
  pendientes: number;
  total: number;
  estado: "pagado" | "por_pagar";
  pagoId?: string;
}

const TEMAS: { match: string; tema: string }[] = [
  { match: "jennyfer", tema: "Marketing · WhatsApp" },
  { match: "jaime", tema: "Landing & sistemas" },
  { match: "karen", tema: "WhatsApp · Seguimiento" },
  { match: "henry", tema: "Meta Ads" },
  { match: "erick", tema: "IA · imágenes" },
];
function temaDe(p: Profile) {
  const k = `${p.nombre_completo} ${p.email}`.toLowerCase();
  return TEMAS.find((t) => k.includes(t.match))?.tema ?? "Mentoría";
}
const COLORS = ["#7C6BFF","#22A06B","#E78A3C","#3C8FE7","#C2756B"];
function colorDe(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
function red2(n: number) { return Math.round(n * 100) / 100; }
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function horaLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function registroTerminado(fecha: string, horaFin: string | null, horaInicio: string) {
  const hoy = hoyLocal();
  if (fecha < hoy) return true;
  if (fecha > hoy) return false;
  return (horaFin || horaInicio || "23:59").slice(0, 5) <= horaLocal();
}
function sumarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + Math.max(0, minutos);
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function Page() {
  const { role, session } = useAuth();
  const puedeEditar = puedeVerPagos(role, session?.user.id);
  const listarCoach = useServerFn(listarCoachPagos);
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
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cuentas, setCuentas] = useState<CuentaEmpresa[]>([]);
  const [abonoDe, setAbonoDe] = useState<string | null>(null);
  const [bonoDe, setBonoDe] = useState<string | null>(null);
  const [verCuentas, setVerCuentas] = useState(false);

  const cargarCuentas = async () => {
    const { data } = await supabase.from("pagos_cuentas_bancarias").select("*").eq("activo", true).order("created_at", { ascending: false });
    setCuentas((data as CuentaEmpresa[]) ?? []);
  };

  const cargar = async () => {
    if (!puedeEditar) return;
    setLoading(true);
    try {
      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("user_id, role").in("role", ["admin","soporte"]);
      if (rolesError) {
        toast.error(`No se pudieron leer los profesores: ${rolesError.message}`);
        setStaff([]);
        return;
      }

      const roleRows = ((roles ?? []) as { user_id: string; role: string }[]);
      const map = new Map<string, string>();
      roleRows.forEach((r) => {
        const prev = map.get(r.user_id);
        if (!prev || r.role === "admin") map.set(r.user_id, r.role);
      });

      // Pagos incluye a todo el equipo: Profesor/soporte y Líder/admin. Nunca alumnos puros.
      const ids = Array.from(new Set(roleRows.map((r) => r.user_id)));
      const { data: estudiantes } = await supabase.from("user_roles").select("user_id").eq("role", "usuario");
      const studentIds = new Set(((estudiantes ?? []) as { user_id: string }[]).map((r) => r.user_id));

      const profMap: Record<string, Profile> = {};
      if (ids.length) {
        const { data: profs } = await supabase.rpc("perfiles_pagos", { _ids: ids });
        ((profs ?? []) as Profile[]).forEach((p) => { profMap[p.id] = p; });
      }
      let faltantes = ids.filter((id) => !profMap[id]);
      if (faltantes.length) {
        const { data: directos } = await supabase.from("profiles")
          .select("id,nombre_completo,email,avatar_url,cedula,banco,tipo_cuenta,numero_cuenta,titular_cuenta,banco_logo_url")
          .in("id", faltantes);
        ((directos ?? []) as Profile[]).forEach((p) => { profMap[p.id] = p; });
      }
      faltantes = ids.filter((id) => !profMap[id]);
      if (faltantes.length) {
        const { data: lista } = await supabase.rpc("listar_profesores");
        ((lista ?? []) as Profile[]).filter((p) => faltantes.includes(p.id)).forEach((p) => { profMap[p.id] = p; });
      }
      ids.forEach((id) => {
        if (!profMap[id]) profMap[id] = { id, nombre_completo: "Profesor", email: "" };
      });
      setProfiles(profMap);

      const ini = `${anio}-${String(mes).padStart(2,"0")}-01`;
      const finDate = new Date(anio, mes, 0);
      const fin = `${anio}-${String(mes).padStart(2,"0")}-${String(finDate.getDate()).padStart(2,"0")}`;
      const iniTs = `${ini}T00:00:00`;
      const finTs = `${fin}T23:59:59`;

      const coachMes = await listarCoach({ data: { mes, anio } }).catch((error) => {
        toast.error(error instanceof Error ? `No se pudo cargar Coach: ${error.message}` : "No se pudo cargar Coach");
        return [] as CoachRegistro[];
      });
      const coachMap = new Map<string, CoachRegistro[]>();
      coachMes.forEach((c) => {
        const arr = coachMap.get(c.profesor_id) ?? [];
        arr.push(c);
        coachMap.set(c.profesor_id, arr);
      });

      const { data: pagosMes } = await supabase.from("pagos_mensuales").select("*").eq("mes", mes).eq("anio", anio);
      const { data: canc } = await supabase.from("sesiones_canceladas")
        .select("id,tipo,profesor_id,contraparte_id,titulo,fecha,estado,razon")
        .gte("fecha", ini).lte("fecha", fin).order("fecha", { ascending: false });
      const cancRows = ((canc ?? []) as Cancelada[]);
      setCanceladas(cancRows);
      const cids = Array.from(new Set(cancRows.map((c) => c.contraparte_id).filter(Boolean) as string[]));
      if (cids.length) {
        const { data: cps } = await supabase.rpc("perfiles_basicos", { _ids: cids });
        const nm: Record<string, string> = {};
        ((cps ?? []) as Profile[]).forEach((p) => { nm[p.id] = formatNombre(p.nombre_completo) || p.email; });
        setNombresCancel(nm);
      } else setNombresCancel({});

      const pagoMap = new Map<string, PagoHist>();
      ((pagosMes ?? []) as PagoHist[]).forEach((p) => pagoMap.set(p.profesor_id, p));

      const { data: abs } = await supabase.from("pagos_comprobantes").select("*").eq("mes", mes).eq("anio", anio).order("fecha_pago", { ascending: false });
      setAbonos((abs as Abono[]) ?? []);
      await cargarCuentas();

      const [{ data: precios }, { data: ajustes }, { data: reemp }, { data: tarifas }, { data: descs }] = await Promise.all([
        supabase.from("pagos_items_precio").select("tipo,referencia_id,monto").eq("mes", mes).eq("anio", anio),
        supabase.from("pagos_ajustes").select("profesor_id,minutos").eq("mes", mes).eq("anio", anio),
        supabase.from("reemplazos_clase").select("*").gte("fecha", ini).lte("fecha", fin),
        supabase.from("pagos_tarifas_mes").select("profesor_id,valor_hora_clase,valor_hora_sesion").eq("mes", mes).eq("anio", anio),
        supabase.from("pagos_descuentos").select("id,profesor_id,monto,motivo").eq("mes", mes).eq("anio", anio),
      ]);
      const precioMap = new Map<string, number>();
      ((precios ?? []) as { tipo: string; referencia_id: string; monto: number }[]).forEach((p) => precioMap.set(`${p.tipo}:${p.referencia_id}`, Number(p.monto)));
      const ajusteMap = new Map<string, number>();
      ((ajustes ?? []) as { profesor_id: string; minutos: number }[]).forEach((a) => ajusteMap.set(a.profesor_id, Number(a.minutos)));
      setReemplazos((reemp ?? []) as Reemplazo[]);
      const tarifaMap = new Map<string, { clase: number; sesion: number }>();
      ((tarifas ?? []) as { profesor_id: string; valor_hora_clase: number; valor_hora_sesion: number }[])
        .forEach((t) => tarifaMap.set(t.profesor_id, { clase: Number(t.valor_hora_clase), sesion: Number(t.valor_hora_sesion) }));
      const descMap = new Map<string, DescuentoRow[]>();
      ((descs ?? []) as { id: string; profesor_id: string; monto: number; motivo: string }[]).forEach((d) => {
        const arr = descMap.get(d.profesor_id) ?? [];
        arr.push({ id: d.id, monto: Number(d.monto), motivo: d.motivo });
        descMap.set(d.profesor_id, arr);
      });

      const alumnaIds = new Set<string>();
      const rows: StaffRow[] = await Promise.all(ids.map(async (pid) => {
        const p = profMap[pid];
        const [clasesRes, sesionesRes, califRes, chatsRes, bonosRes] = await Promise.all([
          supabase.from("clases_en_vivo").select("id,fecha,titulo,descripcion,hora_inicio,hora_fin,duracion_min").eq("profesor_id", pid).gte("fecha", ini).lte("fecha", fin),
          supabase.from("sesiones_1a1").select("id,fecha,alumna_id,hora_inicio,hora_fin,duracion_min,estado,motivo").eq("profesor_id", pid).gte("fecha", ini).lte("fecha", fin),
          supabase.from("calificaciones_mensuales").select("claridad,didactica,practico,desenvolvimiento").eq("profesor_id", pid).eq("mes", mes).eq("anio", anio),
          supabase.from("chats_1a1").select("id,usuario_a_id,usuario_b_id").or(`usuario_a_id.eq.${pid},usuario_b_id.eq.${pid}`),
          supabase.from("bonos").select("id,monto,motivo,tipo").eq("profesor_id", pid).eq("mes", mes).eq("anio", anio),
        ]);

        const tarifa = tarifaMap.get(pid) ?? { clase: 0, sesion: 0 };
        const tarifaSesionFuera = precioMap.get(`1a1:${refTarifa1a1Fuera(pid, mes, anio)}`) ?? tarifa.sesion;
        const tarifaCoach = precioMap.get(`clase:${refTarifaCoach(pid, mes, anio)}`) ?? 0;
        const items: ItemPago[] = [];

        const clasesData = ((clasesRes.data ?? []) as { id: string; fecha: string; titulo: string; descripcion: string | null; hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[]);
        const clasesRealizadas = clasesData.filter((c) => Number(c.duracion_min ?? 0) > 0).length;
        let minutosClase = 0;
        clasesData.forEach((c) => {
          const min = Number(c.duracion_min ?? 0) > 0 ? Number(c.duracion_min) : 0;
          minutosClase += min;
          const manual = precioMap.get(`clase:${c.id}`);
          items.push({
            tipo: "clase", categoria: "clase", refId: c.id, fecha: c.fecha, horaInicio: c.hora_inicio, horaFin: c.hora_fin ?? "",
            minutos: min, titulo: c.titulo, tema: c.titulo, alumnaId: null,
            monto: min > 0 ? (manual != null && manual > 0 ? manual : red2(tarifa.clase * min / 60)) : 0,
          });
        });

        const sesionesData = (sesionesRes.data ?? []) as { id: string; fecha: string; alumna_id: string; hora_inicio: string; hora_fin: string | null; duracion_min: number | null; estado?: string | null; motivo?: string | null }[];
        let minutos1a1 = 0;
        let minutos1a1Laboral = 0;
        let minutos1a1Fuera = 0;
        let sesiones1a1Laboral = 0;
        let sesiones1a1Fuera = 0;
        sesionesData.forEach((s) => {
          const min = Number(s.duracion_min ?? 0) > 0 ? Number(s.duracion_min) : 0;
          const baseSegmentos = segmentarHorarioLaboral(s.hora_inicio, min);
          const lab = baseSegmentos.filter((x) => x.laboral).reduce((a, x) => a + x.minutos, 0);
          const fuera = baseSegmentos.filter((x) => !x.laboral).reduce((a, x) => a + x.minutos, 0);
          minutos1a1 += min;
          minutos1a1Laboral += lab;
          minutos1a1Fuera += fuera;
          if (lab > 0) sesiones1a1Laboral += 1;
          if (fuera > 0) sesiones1a1Fuera += 1;
          alumnaIds.add(s.alumna_id);

          const manual1 = precioMap.get(`1a1:${s.id}`);
          const calculado = red2((tarifa.sesion * lab / 60) + (tarifaSesionFuera * fuera / 60));
          const totalSesion = min > 0 ? (manual1 != null && manual1 > 0 ? manual1 : calculado) : 0;
          let usado = 0;
          const segmentos: SegmentoPago[] = baseSegmentos.map((seg, idx) => {
            const categoria: CategoriaSegmento = seg.laboral ? "1a1_laboral" : "1a1_fuera";
            let montoSeg = 0;
            if (manual1 != null && manual1 > 0 && min > 0) {
              montoSeg = idx === baseSegmentos.length - 1 ? red2(totalSesion - usado) : red2(totalSesion * seg.minutos / min);
            } else {
              montoSeg = red2((seg.laboral ? tarifa.sesion : tarifaSesionFuera) * seg.minutos / 60);
            }
            usado = red2(usado + montoSeg);
            return { categoria, horaInicio: seg.horaInicio, horaFin: seg.horaFin, minutos: seg.minutos, monto: montoSeg };
          });

          items.push({
            tipo: "1a1", categoria: "1a1", refId: s.id, fecha: s.fecha, horaInicio: s.hora_inicio, horaFin: s.hora_fin ?? "",
            minutos: min, titulo: null, tema: s.motivo ?? null, alumnaId: s.alumna_id, monto: totalSesion, segmentos,
          });
        });

        const coachData = coachMap.get(pid) ?? [];
        let minutosCoach = 0;
        coachData.forEach((c) => {
          const min = Math.max(0, Number(c.duracion_min) || 0);
          minutosCoach += min;
          const manual = precioMap.get(`clase:${c.id}`);
          items.push({
            tipo: "clase", categoria: "coach", refId: c.id, fecha: c.fecha,
            horaInicio: c.hora_inicio, horaFin: sumarMinutos(c.hora_inicio, min), minutos: min,
            titulo: c.tema, tema: c.tema, alumnaId: null,
            monto: min > 0 ? (manual != null && manual > 0 ? manual : red2(tarifaCoach * min / 60)) : 0,
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
          .filter((c) => studentIds.has(c.usuario_a_id === pid ? c.usuario_b_id : c.usuario_a_id)).map((c) => c.id);
        let mensajesEstudiantes = 0;
        if (chatsConEstudiantes.length) {
          const { count } = await supabase.from("mensajes_chat_1a1")
            .select("id", { count: "exact", head: true }).eq("autor_id", pid).in("chat_id", chatsConEstudiantes)
            .gte("created_at", iniTs).lte("created_at", finTs);
          mensajesEstudiantes = count ?? 0;
        }

        const sesiones1a1 = sesionesData.filter((s) => Number(s.duracion_min ?? 0) > 0).length;
        const bonosList = ((bonosRes.data ?? []) as { id: string; monto: number; motivo: string | null; tipo: string }[])
          .map((b) => ({ id: b.id, monto: Number(b.monto), motivo: b.motivo, tipo: b.tipo }));
        const bonos = bonosList.reduce((a, b) => a + b.monto, 0);
        const descuentosList = descMap.get(pid) ?? [];
        const descuentos = descuentosList.reduce((a, d) => a + d.monto, 0);
        const total = Math.max(0, red2(items.reduce((a, i) => a + i.monto, 0) + bonos - descuentos));
        const pago = pagoMap.get(pid);
        const pendientesClase = clasesData.filter((c) => Number(c.duracion_min ?? 0) <= 0 && registroTerminado(c.fecha, c.hora_fin, c.hora_inicio)).length;
        const pendientesSesion = sesionesData.filter((s) => {
          const estado = (s.estado || "confirmada").toLowerCase();
          return Number(s.duracion_min ?? 0) <= 0 && !["cancelada", "cancelado", "anulada"].includes(estado) && registroTerminado(s.fecha, s.hora_fin, s.hora_inicio);
        }).length;

        return {
          id: pid, nombre: formatNombre(p.nombre_completo) || p.email || "Profesor", email: p.email,
          rol: map.get(pid) ?? "soporte", tema: temaDe(p), minutosClase, clasesRealizadas,
          sesiones1a1, minutos1a1, sesiones1a1Laboral, sesiones1a1Fuera, minutos1a1Laboral, minutos1a1Fuera,
          sesionesCoach: coachData.length, minutosCoach,
          ajusteMin: ajusteMap.get(pid) ?? 0, items, mensajesEstudiantes, califPromedio, califCount,
          bonos, bonosList, descuentos, descuentosList,
          tarifaClase: tarifa.clase, tarifaSesion: tarifa.sesion, tarifaSesionFuera, tarifaCoach,
          pendientes: pendientesClase + pendientesSesion, total,
          estado: (pago?.estado === "pagado" ? "pagado" : "por_pagar") as "pagado" | "por_pagar", pagoId: pago?.id,
        };
      }));
      setStaff(rows.filter(Boolean).sort((a,b) => a.nombre.localeCompare(b.nombre, "es")));

      if (alumnaIds.size) {
        const { data: as } = await supabase.rpc("perfiles_basicos", { _ids: Array.from(alumnaIds) });
        const nm: Record<string, string> = {};
        ((as ?? []) as Profile[]).forEach((p) => { nm[p.id] = formatNombre(p.nombre_completo) || p.email; });
        setNombresAlumnas(nm);
      } else setNombresAlumnas({});

      const { data: hist } = await supabase.from("pagos_mensuales").select("*").order("anio",{ascending:false}).order("mes",{ascending:false}).limit(24);
      setHistorial((hist as PagoHist[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void cargar(); /* eslint-disable-next-line */ }, [mes, anio, puedeEditar]);

  const tot = useMemo(() => {
    const minutos = staff.reduce((a,b) => a + b.minutosClase + b.minutos1a1 + b.minutosCoach, 0);
    const sesiones = staff.reduce((a,b) => a + b.sesiones1a1, 0);
    const pagar = staff.filter(s => s.estado === "por_pagar").reduce((a,b) => a + b.total, 0);
    const pendCount = staff.filter(s => s.estado === "por_pagar").length;
    const califs = staff.filter(s => s.califCount > 0).map(s => s.califPromedio);
    const califEq = califs.length ? califs.reduce((a,b)=>a+b,0)/califs.length : 0;
    return { minutos, sesiones, pagar, pendCount, califEq };
  }, [staff]);

  const abonadoPor = useMemo(() => {
    const m: Record<string, number> = {};
    abonos.forEach((a) => { m[a.profesor_id] = (m[a.profesor_id] ?? 0) + Number(a.monto); });
    return m;
  }, [abonos]);
  const totalesPor = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.total])), [staff]);
  const nombresStaff = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s.nombre])), [staff]);
  const estadoDe = (s: StaffRow): "pagado" | "parcial" | "por_pagar" => {
    const ab = abonadoPor[s.id] ?? 0;
    if (ab > 0 && ab + 0.009 >= s.total) return "pagado";
    if (ab > 0) return "parcial";
    return s.estado === "pagado" ? "pagado" : "por_pagar";
  };

  const nombreItem = (i: ItemPago) => {
    if (i.categoria === "coach") return "Coach";
    if (i.categoria === "clase") return "Clase en vivo";
    return i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante";
  };

  const filasPrecio: FilaPrecio[] = useMemo(() => staff.flatMap((s) => s.items.flatMap((i): FilaPrecio[] => {
    if (i.categoria === "clase") return [{
      key: `clase:${i.refId}`, tipo: "clase", refId: i.refId, profesorId: s.id, profesor: s.nombre,
      fecha: i.fecha, horaInicio: i.horaInicio, horaFin: i.horaFin, minutos: i.minutos,
      detalle: "Clase en vivo", tema: i.tema || i.titulo || "Clase", monto: i.monto,
    }];
    if (i.categoria === "coach") return [{
      key: `coach:${i.refId}`, tipo: "coach", refId: i.refId, profesorId: s.id, profesor: s.nombre,
      fecha: i.fecha, horaInicio: i.horaInicio, horaFin: i.horaFin, minutos: i.minutos,
      detalle: "Coach", tema: i.tema || i.titulo || "Coach", monto: i.monto,
    }];
    const detalle = i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante";
    if (i.minutos <= 0 || !i.segmentos?.length) return [{
      key: `1a1-pendiente:${i.refId}`, tipo: "1a1_pendiente", refId: i.refId, profesorId: s.id, profesor: s.nombre,
      fecha: i.fecha, horaInicio: i.horaInicio, horaFin: i.horaFin, minutos: 0, detalle, tema: i.tema || "", monto: 0,
    }];
    return i.segmentos.map((seg, idx) => ({
      key: `${seg.categoria}:${i.refId}:${idx}`, tipo: seg.categoria, refId: i.refId, profesorId: s.id, profesor: s.nombre,
      fecha: i.fecha, horaInicio: seg.horaInicio, horaFin: seg.horaFin, minutos: seg.minutos,
      detalle, tema: i.tema || "", monto: seg.monto,
    }));
  })).sort((a, b) => (b.fecha + b.horaInicio).localeCompare(a.fecha + a.horaInicio)), [staff, nombresAlumnas]);

  const sincronizarPago = async (row: StaffRow) => {
    const { data } = await supabase.from("pagos_comprobantes").select("monto").eq("profesor_id", row.id).eq("mes", mes).eq("anio", anio);
    const ab = ((data ?? []) as { monto: number }[]).reduce((a, b) => a + Number(b.monto), 0);
    const payload = {
      profesor_id: row.id, mes, anio,
      total_horas: horasDecimal(row.minutosClase + row.minutos1a1 + row.minutosCoach), total_bonos: row.bonos,
      monto_total: row.total, estado: ab + 0.009 >= row.total && ab > 0 ? "pagado" : "por_pagar",
      fecha_pago: ab > 0 ? new Date().toISOString() : null,
    };
    if (row.pagoId) await supabase.from("pagos_mensuales").update(payload).eq("id", row.pagoId);
    else await supabase.from("pagos_mensuales").insert(payload);
  };

  const cerrarMes = async () => {
    const pendientes = staff.filter(s => s.estado === "por_pagar");
    if (!pendientes.length) return toast.info("No hay pagos pendientes");
    if (!confirm(`Generar ${pendientes.length} pagos por un total de $${tot.pagar.toFixed(2)}?`)) return;
    for (const r of pendientes) {
      if (r.pagoId) continue;
      await supabase.from("pagos_mensuales").insert({
        profesor_id: r.id, mes, anio,
        total_horas: horasDecimal(r.minutosClase + r.minutos1a1 + r.minutosCoach), total_bonos: r.bonos,
        monto_total: r.total, estado: "por_pagar",
      });
    }
    toast.success("Mes cerrado · pagos generados");
    void cargar();
  };

  const filasCanceladas = useMemo(() => canceladas.map((c) => ({
    profesor: formatNombre(profiles[c.profesor_id]?.nombre_completo) || profiles[c.profesor_id]?.email || "—",
    fecha: c.fecha, tipo: c.tipo === "clase" ? "Clase en vivo" : "1 a 1",
    con: c.tipo === "clase" ? (c.titulo || "Clase") : (c.contraparte_id ? nombresCancel[c.contraparte_id] || "Estudiante" : "Estudiante"),
    estado: c.estado === "cancelada" ? "Cancelada" : "No registrada", razon: c.razon || "",
  })), [canceladas, profiles, nombresCancel]);

  const abonosExport = (profesorId?: string): AbonoExportRow[] => abonos
    .filter((a) => !profesorId || a.profesor_id === profesorId)
    .map((a) => ({
      fecha: a.fecha_pago,
      profesor: formatNombre(profiles[a.profesor_id]?.nombre_completo) || profiles[a.profesor_id]?.email || "—",
      monto: Number(a.monto), tipo: a.tipo_pago, banco: a.banco_texto || "", numero: a.numero_comprobante || "", observacion: a.observacion || "",
    }));

  const descargarInforme = (row: StaffRow) => {
    const items: InformeItem[] = row.items.flatMap((i): InformeItem[] => {
      if (i.categoria === "clase") return [{
        fecha: i.fecha, tipo: "Clase en vivo", categoria: i.minutos > 0 ? "clase" : "pendiente",
        detalle: "Clase en vivo", tema: i.tema || i.titulo || "Clase", horaInicio: i.horaInicio, horaFin: i.horaFin,
        minutos: i.minutos, monto: i.monto,
      }];
      if (i.categoria === "coach") return [{
        fecha: i.fecha, tipo: "Coach", categoria: "coach", detalle: "Coach", tema: i.tema || i.titulo || "Coach",
        horaInicio: i.horaInicio, horaFin: i.horaFin, minutos: i.minutos, monto: i.monto,
      }];
      const detalle = i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante";
      if (i.minutos <= 0 || !i.segmentos?.length) return [{
        fecha: i.fecha, tipo: "Sesión 1 a 1", categoria: "pendiente", detalle, tema: i.tema || "",
        horaInicio: i.horaInicio, horaFin: i.horaFin, minutos: 0, monto: 0,
      }];
      return i.segmentos.map((seg) => ({
        fecha: i.fecha,
        tipo: seg.categoria === "1a1_laboral" ? "Sesión 1 a 1 · horario laboral" : "Sesión 1 a 1 · fuera de horario laboral",
        categoria: seg.categoria, detalle, tema: i.tema || "", horaInicio: seg.horaInicio, horaFin: seg.horaFin,
        minutos: seg.minutos, monto: seg.monto,
      }));
    });
    const reems: InformeReemplazo[] = reemplazos.filter((r) => r.profesor_reporta === row.id).map((r) => ({
      fecha: r.fecha, detalle: r.tipo === "clase" ? "Clase en vivo" : "Sesión 1:1",
      profesor: formatNombre(profiles[r.profesor_reemplazado]?.nombre_completo) || profiles[r.profesor_reemplazado]?.email || "—", nota: r.nota || "",
    }));
    generarInformeProfesorPDF({
      nombre: row.nombre, tema: row.tema, mes, anio, items,
      canceladas: filasCanceladas.filter((c) => canceladas.some((raw) => raw.profesor_id === row.id && raw.fecha === c.fecha && c.profesor === row.nombre)),
      reemplazos: reems, abonos: abonosExport(row.id),
      bonos: row.bonos, bonosDetalle: row.bonosList.map((b) => ({ motivo: b.motivo || "Bono", monto: b.monto })),
      descuentos: row.descuentos, descuentosDetalle: row.descuentosList.map((d) => ({ motivo: d.motivo, monto: d.monto })),
      ajusteMin: row.ajusteMin, total: row.total, estadoPago: estadoDe(row),
      califPromedio: row.califPromedio, califCount: row.califCount,
    });
  };

  if (!puedeEditar) return <div className="p-8 text-center text-muted-foreground">No tienes permiso para ver Pagos e informes.</div>;

  if (detalleId) {
    const row = staff.find(s => s.id === detalleId);
    if (!row) return null;
    return <DetalleProfesor row={row} profile={profiles[detalleId]} mes={mes} anio={anio} onBack={() => setDetalleId(null)} onSelect={(id) => setDetalleId(id)} staff={staff}
      nombresAlumnas={nombresAlumnas} puedeEditar={puedeEditar} onRefresh={cargar} onInforme={() => descargarInforme(row)}
      reemplazos={reemplazos.filter((r) => r.profesor_reporta === row.id).map((r) => ({
        fecha: r.fecha, detalle: r.tipo === "clase" ? "Clase en vivo" : "Sesión 1:1",
        profesor: formatNombre(profiles[r.profesor_reemplazado]?.nombre_completo) || profiles[r.profesor_reemplazado]?.email || "—", nota: r.nota || "",
      }))}
      canceladas={canceladas.filter((c) => c.profesor_id === detalleId).map((c) => ({
        fecha: c.fecha, tipo: c.tipo === "clase" ? "Clase en vivo" : "1 a 1",
        con: c.tipo === "clase" ? (c.titulo || "Clase") : (c.contraparte_id ? nombresCancel[c.contraparte_id] || "Estudiante" : "Estudiante"),
        estado: c.estado === "cancelada" ? "Cancelada" : "No registrada", razon: c.razon || "",
      }))} />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={`${anio}-${mes}`} onChange={(e) => { const [a,m] = e.target.value.split("-").map(Number); setAnio(a); setMes(m); }} className="px-3 py-2 rounded-lg border bg-card text-sm font-medium">
          {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => setVerCuentas(true)} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold flex items-center gap-2 shadow-md">
          <Landmark className="w-4 h-4" /> Cuentas bancarias
        </button>
        <button onClick={cerrarMes} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold flex items-center gap-2 shadow-md">
          <Lock className="w-4 h-4" /> Cerrar mes y generar pagos
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0F1431,#1B1F4A)" }}>
          <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,107,255,.5), transparent 70%)" }} />
          <div className="text-[10px] uppercase tracking-wider opacity-70">Total a pagar · {MESES[mes-1]}</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">${tot.pagar.toFixed(2)}</div>
          <div className="text-xs opacity-80 mt-1">{tot.pendCount} {tot.pendCount === 1 ? "profesor" : "profesores"} · pendiente</div>
        </div>
        <KPI label="Tiempo dictado" value={formatHM(tot.minutos)} sub={`${staff.length} profesores`} />
        <KPI label="Sesiones 1:1" value={String(tot.sesiones)} sub="realizadas" />
        <KPI label="Calif. equipo" value={tot.califEq ? tot.califEq.toFixed(2) : "—"} sub={tot.califEq ? "promedio del equipo" : "Sin calificaciones"} />
      </div>

      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="text-lg font-semibold">Resumen del equipo · {MESES[mes-1]} {anio}</h2>
        <span className="text-xs text-muted-foreground">Profesores y Líderes · click en el nombre para ver detalle</span>
      </div>
      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[1180px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-4 py-3 font-semibold">Profesor</th>
              <th className="text-left px-3 py-3 font-semibold">Tiempo clase</th>
              <th className="text-left px-3 py-3 font-semibold">1 a 1 · laboral</th>
              <th className="text-left px-3 py-3 font-semibold">1 a 1 · fuera</th>
              <th className="text-left px-3 py-3 font-semibold">Coach</th>
              <th className="text-left px-3 py-3 font-semibold">Calificación</th>
              <th className="text-right px-3 py-3 font-semibold">Bonos</th>
              <th className="text-right px-3 py-3 font-semibold">Descuentos</th>
              <th className="text-right px-3 py-3 font-semibold">A pagar</th>
              <th className="text-left px-3 py-3 font-semibold">Estado</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
            {!loading && staff.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/30 transition">
                <td className="px-4 py-3">
                  <button onClick={() => setDetalleId(s.id)} className="flex items-center gap-3 text-left">
                    {profiles[s.id]?.avatar_url ? <img src={profiles[s.id]?.avatar_url ?? ""} alt={s.nombre} className="w-9 h-9 rounded-full object-cover shrink-0" /> : (
                      <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white" style={{ background: colorDe(s.id) }}>{s.nombre.slice(0,2).toUpperCase()}</div>
                    )}
                    <div>
                      <div className="font-semibold">{s.nombre}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        {profiles[s.id]?.banco_logo_url ? <img src={profiles[s.id]?.banco_logo_url ?? ""} alt="" className="w-4 h-4 rounded object-cover" /> : <Landmark className="w-3 h-3" />}
                        {profiles[s.id]?.banco ? `${profiles[s.id]?.banco} · ${profiles[s.id]?.tipo_cuenta ?? ""} ${profiles[s.id]?.numero_cuenta ?? ""}` : "Sin cuenta bancaria registrada"}
                      </div>
                      {s.pendientes > 0 && <div className="text-[11px] text-amber-600 font-medium">{s.pendientes} registro{s.pendientes === 1 ? "" : "s"} de horas pendiente{s.pendientes === 1 ? "" : "s"}</div>}
                    </div>
                  </button>
                </td>
                <td className="px-3 py-3">
                  <span className="font-medium">{s.clasesRealizadas} {s.clasesRealizadas === 1 ? "clase" : "clases"}</span> <span className="text-muted-foreground text-xs">· {formatHM(s.minutosClase)}</span>
                  {s.ajusteMin !== 0 && <span className="text-muted-foreground text-xs"> · ajuste {s.ajusteMin > 0 ? "+" : "−"}{formatHM(Math.abs(s.ajusteMin))}</span>}
                  <TarifaInput profesorId={s.id} campo="valor_hora_clase" valor={s.tarifaClase} mes={mes} anio={anio} puedeEditar={puedeEditar} onSaved={cargar} />
                </td>
                <td className="px-3 py-3">{s.sesiones1a1Laboral} <span className="text-muted-foreground text-xs">· {formatHM(s.minutos1a1Laboral)}</span><TarifaInput profesorId={s.id} campo="valor_hora_sesion" valor={s.tarifaSesion} mes={mes} anio={anio} puedeEditar={puedeEditar} onSaved={cargar} /></td>
                <td className="px-3 py-3">{s.sesiones1a1Fuera} <span className="text-muted-foreground text-xs">· {formatHM(s.minutos1a1Fuera)}</span><TarifaFueraInput profesorId={s.id} valor={s.tarifaSesionFuera} mes={mes} anio={anio} puedeEditar={puedeEditar} onSaved={cargar} /></td>
                <td className="px-3 py-3">{s.sesionesCoach} <span className="text-muted-foreground text-xs">· {formatHM(s.minutosCoach)}</span><TarifaCoachInput profesorId={s.id} valor={s.tarifaCoach} mes={mes} anio={anio} puedeEditar={puedeEditar} onSaved={cargar} /></td>
                <td className="px-3 py-3"><Estrellas valor={s.califPromedio} count={s.califCount} /></td>
                <td className="px-3 py-3 text-right tabular-nums text-emerald-600">{s.bonos ? `+$${s.bonos.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-red-600">{s.descuentos ? `−$${s.descuentos.toFixed(2)}` : "—"}</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">${s.total.toFixed(2)}</td>
                <td className="px-3 py-3">
                  {estadoDe(s) === "pagado" ? <span className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Pagado</span>
                    : estadoDe(s) === "parcial" ? <span className="px-2 py-1 rounded-md text-xs font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">Abono ${(abonadoPor[s.id] ?? 0).toFixed(2)} · saldo ${(s.total - (abonadoPor[s.id] ?? 0)).toFixed(2)}</span>
                    : <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Por pagar</span>}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <button onClick={() => descargarInforme(s)} className="px-3 py-1.5 rounded-lg border text-xs font-semibold mr-2 inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Informe</button>
                  <button onClick={() => setBonoDe(s.id)} className="px-3 py-1.5 rounded-lg border text-xs font-semibold mr-2 inline-flex items-center gap-1"><Gift className="w-3.5 h-3.5" /> Bono</button>
                  <button onClick={() => setAbonoDe(s.id)} className="px-3 py-1.5 rounded-lg bg-violet-gradient text-white text-xs font-semibold">{estadoDe(s) === "pagado" ? "Ver pagos" : "Marcar pagado"}</button>
                </td>
              </tr>
            ))}
            {!loading && staff.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">No se encontraron Profesores o Líderes para este período.</td></tr>}
            {!loading && staff.length > 0 && (
              <tr className="bg-muted/40 border-t">
                <td className="px-4 py-3" colSpan={7} />
                <td className="px-3 py-3 text-right text-xs uppercase tracking-wider font-semibold">Total a pagar</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: "var(--violet)" }}>${tot.pagar.toFixed(2)}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <PagosPrecios key={`${mes}-${anio}-${filasPrecio.length}`} filas={filasPrecio} mes={mes} anio={anio} puedeEditar={puedeEditar} onRefresh={cargar}
          onDescargarInforme={(profesorId) => { const row = staff.find((s) => s.id === profesorId); if (row) descargarInforme(row); }} />
      </div>
      <div className="mt-8"><PagosAbonos abonos={abonos} nombres={nombresStaff} totales={totalesPor} mes={mes} anio={anio} /></div>

      {historial.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Historial de pagos</h2>
          <div className="rounded-2xl border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b"><tr><th className="text-left px-4 py-2 font-semibold">Mes</th><th className="text-left px-3 py-2 font-semibold">Profesor</th><th className="text-right px-3 py-2 font-semibold">Horas</th><th className="text-right px-3 py-2 font-semibold">Total</th><th className="text-left px-3 py-2 font-semibold">Estado</th><th className="text-left px-3 py-2 font-semibold">Fecha pago</th></tr></thead>
              <tbody>{historial.map((p) => <tr key={p.id} className="border-t"><td className="px-4 py-2">{MESES[p.mes-1]} {p.anio}</td><td className="px-3 py-2">{formatNombre(profiles[p.profesor_id]?.nombre_completo) || profiles[p.profesor_id]?.email || "—"}</td><td className="px-3 py-2 text-right">{formatHM(Number(p.total_horas) * 60)}</td><td className="px-3 py-2 text-right font-semibold">${Number(p.monto_total).toFixed(2)}</td><td className="px-3 py-2">{p.estado === "pagado" ? <span className="text-xs text-emerald-600">Pagado</span> : <span className="text-xs text-amber-600">Por pagar</span>}</td><td className="px-3 py-2 text-xs text-muted-foreground">{p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString("es-EC") : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {abonoDe && (() => {
        const row = staff.find((s) => s.id === abonoDe); if (!row) return null;
        return <RegistrarAbonoModal profesorId={row.id} profesorNombre={row.nombre} mes={mes} anio={anio} total={row.total}
          abonos={abonos.filter((a) => a.profesor_id === row.id)} cuentas={cuentas} bonos={row.bonosList} descuentos={row.descuentosList}
          onClose={() => setAbonoDe(null)} onSaved={async () => { await cargar(); await sincronizarPago(row); }} />;
      })()}
      {bonoDe && (() => { const row = staff.find((s) => s.id === bonoDe); return row ? <BonoModal row={row} mes={mes} anio={anio} onClose={() => setBonoDe(null)} onSaved={cargar} /> : null; })()}
      {verCuentas && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={() => setVerCuentas(false)}><div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-1" onClick={(e) => e.stopPropagation()}><div className="flex justify-end p-2"><button onClick={() => setVerCuentas(false)} className="p-2 rounded-lg border"><X className="w-4 h-4" /></button></div><PagosCuentas puedeEditar={puedeEditar} onChanged={cargarCuentas} /></div></div>}
    </div>
  );
}

function Estrellas({ valor, count }: { valor: number; count: number }) {
  if (!count) return <span className="text-muted-foreground text-xs">Sin calificar</span>;
  return <span className="inline-flex items-center gap-0.5" title={`${valor.toFixed(2)} de 5 · ${count} respuestas`}>{[1,2,3,4,5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${valor >= n - 0.25 ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />)}<span className="ml-1 text-xs font-medium tabular-nums">{valor.toFixed(1)}</span></span>;
}

function TarifaInput({ profesorId, campo, valor, mes, anio, puedeEditar, onSaved }: { profesorId: string; campo: "valor_hora_clase" | "valor_hora_sesion"; valor: number; mes: number; anio: number; puedeEditar: boolean; onSaved: () => void }) {
  const [v, setV] = useState(valor ? String(valor) : "");
  useEffect(() => { setV(valor ? String(valor) : ""); }, [valor]);
  const guardar = async () => {
    const num = Number(v || 0); if (!Number.isFinite(num) || num < 0) return toast.error("Valor inválido"); if (num === valor) return;
    const otro = campo === "valor_hora_clase" ? "valor_hora_sesion" : "valor_hora_clase";
    const { error } = await supabase.from("pagos_tarifas_mes").upsert({ profesor_id: profesorId, mes, anio, [campo]: num, [otro]: undefined } as never, { onConflict: "profesor_id,mes,anio" });
    if (error) return toast.error(error.message); toast.success("Valor por hora guardado"); onSaved();
  };
  return <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><span>$/h</span><input type="number" step="0.01" min="0" value={v} disabled={!puedeEditar} onChange={(e) => setV(e.target.value)} onBlur={guardar} placeholder="0.00" className="w-20 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" /></div>;
}

function TarifaFueraInput({ profesorId, valor, mes, anio, puedeEditar, onSaved }: { profesorId: string; valor: number; mes: number; anio: number; puedeEditar: boolean; onSaved: () => void }) {
  const [v, setV] = useState(valor ? String(valor) : "");
  useEffect(() => { setV(valor ? String(valor) : ""); }, [valor]);
  const guardar = async () => {
    const num = Number(v || 0); if (!Number.isFinite(num) || num < 0) return toast.error("Valor inválido"); if (num === valor) return;
    const { error } = await supabase.from("pagos_items_precio").upsert({ profesor_id: profesorId, tipo: "1a1", referencia_id: refTarifa1a1Fuera(profesorId, mes, anio), mes, anio, monto: num }, { onConflict: "tipo,referencia_id" });
    if (error) return toast.error(error.message); toast.success("Valor 1 a 1 fuera de horario guardado"); onSaved();
  };
  return <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><span>$/h</span><input type="number" step="0.01" min="0" value={v} disabled={!puedeEditar} onChange={(e) => setV(e.target.value)} onBlur={guardar} placeholder="0.00" className="w-20 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" /></div>;
}

function TarifaCoachInput({ profesorId, valor, mes, anio, puedeEditar, onSaved }: { profesorId: string; valor: number; mes: number; anio: number; puedeEditar: boolean; onSaved: () => void }) {
  const [v, setV] = useState(valor ? String(valor) : "");
  useEffect(() => { setV(valor ? String(valor) : ""); }, [valor]);
  const guardar = async () => {
    const num = Number(v || 0); if (!Number.isFinite(num) || num < 0) return toast.error("Valor inválido"); if (num === valor) return;
    const { error } = await supabase.from("pagos_items_precio").upsert({ profesor_id: profesorId, tipo: "clase", referencia_id: refTarifaCoach(profesorId, mes, anio), mes, anio, monto: num }, { onConflict: "tipo,referencia_id" });
    if (error) return toast.error(error.message); toast.success("Valor de Coach guardado"); onSaved();
  };
  return <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><span>$/h</span><input type="number" step="0.01" min="0" value={v} disabled={!puedeEditar} onChange={(e) => setV(e.target.value)} onBlur={guardar} placeholder="0.00" className="w-20 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" /></div>;
}

function BonoModal({ row, mes, anio, onClose, onSaved }: { row: StaffRow; mes: number; anio: number; onClose: () => void; onSaved: () => void }) {
  const [monto, setMonto] = useState(""); const [motivo, setMotivo] = useState(""); const [saving, setSaving] = useState(false);
  const guardar = async () => {
    const num = Number(monto); if (!Number.isFinite(num) || num <= 0) return toast.error("Escribe un monto válido"); if (motivo.trim().length < 3) return toast.error("Escribe el motivo del bono");
    setSaving(true); const { error } = await supabase.from("bonos").insert({ profesor_id: row.id, mes, anio, monto: num, motivo: motivo.trim(), tipo: "bono", frecuencia: "mensual", estado: "pendiente" } as never); setSaving(false);
    if (error) return toast.error(error.message); toast.success("Bono registrado"); setMonto(""); setMotivo(""); onSaved();
  };
  const borrar = async (id: string) => { const { error } = await supabase.from("bonos").delete().eq("id", id); if (error) return toast.error(error.message); toast.success("Bono eliminado"); onSaved(); };
  return <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}><div className="w-full max-w-md rounded-2xl border bg-card p-5" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between mb-4"><div><h3 className="text-lg font-semibold">Bonos · {row.nombre}</h3><p className="text-xs text-muted-foreground">{MESES[mes-1]} {anio} · se suman al total a pagar.</p></div><button onClick={onClose} className="p-2 rounded-lg border"><X className="w-4 h-4" /></button></div><div className="space-y-2 mb-4"><label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor del bono</label><input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border bg-background tabular-nums" /><label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motivo</label><input value={motivo} maxLength={140} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. bono por clases extra" className="w-full px-3 py-2 rounded-lg border bg-background" /><button onClick={guardar} disabled={saving} className="w-full mt-1 px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{saving ? "Guardando…" : "Agregar bono"}</button></div><div className="space-y-2">{row.bonosList.length === 0 && <div className="text-xs text-muted-foreground">Sin bonos este mes.</div>}{row.bonosList.map((b) => <div key={b.id} className="flex items-center justify-between gap-2 text-sm border-t pt-2"><div className="min-w-0"><div className="font-semibold tabular-nums">+${b.monto.toFixed(2)}</div><div className="text-xs text-muted-foreground truncate">{b.motivo || "Sin motivo"}</div></div><button onClick={() => borrar(b.id)} className="text-xs text-red-600 font-semibold">Borrar</button></div>)}</div></div></div>;
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-2xl border bg-card p-5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div><div className="text-3xl font-bold mt-1 tabular-nums">{value}</div>{sub && <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{sub}</div>}</div>;
}

function DetalleProfesor({ row, profile, mes, anio, onBack, onSelect, staff, canceladas = [], nombresAlumnas = {}, puedeEditar = false, onRefresh, onInforme, reemplazos = [] }: {
  row: StaffRow; profile?: Profile; mes: number; anio: number; onBack: () => void; onSelect: (id: string) => void; staff: StaffRow[];
  canceladas?: Array<{ fecha: string; tipo: string; con: string; estado: string; razon: string }>; nombresAlumnas?: Record<string, string>;
  puedeEditar?: boolean; onRefresh?: () => void; onInforme?: () => void; reemplazos?: InformeReemplazo[];
}) {
  const [califs, setCalifs] = useState<Array<{ claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null; comentario: string|null; created_at: string; alumna_id: string }>>([]);
  const [alumnaNombres, setAlumnaNombres] = useState<Record<string, string>>({});
  const [precios, setPrecios] = useState<Record<string, string>>(Object.fromEntries(row.items.map((i) => [`${i.tipo}:${i.refId}`, i.monto ? String(i.monto) : ""])));
  const [ajuste, setAjuste] = useState(String(row.ajusteMin || 0));
  const [guardando, setGuardando] = useState(false);

  const nombreItemLocal = (i: ItemPago) => i.categoria === "coach" ? (i.titulo || "Coach") : i.categoria === "clase" ? (i.titulo || "Clase en vivo") : (i.alumnaId ? nombresAlumnas[i.alumnaId] || "Estudiante" : "Estudiante");
  const etiquetaItem = (i: ItemPago) => i.categoria === "coach" ? "Coach" : i.categoria === "clase" ? "Clase en vivo" : "Sesión 1:1";
  const guardarPrecio = async (i: ItemPago) => {
    if (i.minutos <= 0) return toast.error("Primero debe registrarse la duración real");
    const key = `${i.tipo}:${i.refId}`; const monto = Number(precios[key] || 0); if (Number.isNaN(monto) || monto < 0) return toast.error("Valor inválido"); if (monto === i.monto) return;
    setGuardando(true); const { error } = await supabase.from("pagos_items_precio").upsert({ profesor_id: row.id, tipo: i.tipo, referencia_id: i.refId, mes, anio, monto }, { onConflict: "tipo,referencia_id" }); setGuardando(false);
    if (error) return toast.error(error.message); toast.success("Valor guardado"); onRefresh?.();
  };
  const guardarAjuste = async () => {
    const minutos = Math.round(Number(ajuste || 0)); if (Number.isNaN(minutos)) return toast.error("Minutos inválidos"); setGuardando(true);
    const { error } = await supabase.from("pagos_ajustes").upsert({ profesor_id: row.id, mes, anio, minutos }, { onConflict: "profesor_id,mes,anio" }); setGuardando(false);
    if (error) return toast.error(error.message); toast.success("Ajuste guardado"); onRefresh?.();
  };
  const bitacora = row.items.filter((i) => i.minutos > 0).slice(0, 10).map((i) => ({ fecha: i.fecha, tipo: etiquetaItem(i), detalle: `${nombreItemLocal(i)} · ${formatHM(i.minutos)}`, monto: i.monto }));
  const pendientesItems = row.items.filter((i) => i.minutos <= 0);

  useEffect(() => {
    (async () => {
      const { data: cals } = await supabase.from("calificaciones_mensuales").select("claridad,didactica,practico,desenvolvimiento,comentario,created_at,alumna_id").eq("profesor_id", row.id).eq("mes", mes).eq("anio", anio).order("created_at", { ascending: false });
      setCalifs((cals ?? []) as never);
      const aids = Array.from(new Set(((cals ?? []) as { alumna_id: string }[]).map((c) => c.alumna_id)));
      if (aids.length) { const { data: ps } = await supabase.rpc("perfiles_basicos", { _ids: aids }); const m: Record<string,string> = {}; ((ps ?? []) as Profile[]).forEach((p) => { m[p.id] = formatNombre(p.nombre_completo) || p.email; }); setAlumnaNombres(m); }
    })();
  }, [row.id, mes, anio]);

  const promedios = useMemo(() => {
    const acc = { claridad: [] as number[], didactica: [] as number[], desenvolvimiento: [] as number[], practico: [] as number[] };
    califs.forEach((c) => { if (typeof c.claridad === "number") acc.claridad.push(c.claridad); if (typeof c.didactica === "number") acc.didactica.push(c.didactica); if (typeof c.desenvolvimiento === "number") acc.desenvolvimiento.push(c.desenvolvimiento); if (typeof c.practico === "number") acc.practico.push(c.practico); });
    const avg = (a: number[]) => a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
    return { claridad: avg(acc.claridad), didactica: avg(acc.didactica), desenvolvimiento: avg(acc.desenvolvimiento), practico: avg(acc.practico) };
  }, [califs]);
  const ultimoComentario = califs.find((c) => c.comentario);
  const montoClase = row.items.filter((i) => i.categoria === "clase").reduce((a, i) => a + i.monto, 0);
  const monto1a1Laboral = row.items.filter((i) => i.categoria === "1a1").flatMap((i) => i.segmentos ?? []).filter((s) => s.categoria === "1a1_laboral").reduce((a, s) => a + s.monto, 0);
  const monto1a1Fuera = row.items.filter((i) => i.categoria === "1a1").flatMap((i) => i.segmentos ?? []).filter((s) => s.categoria === "1a1_fuera").reduce((a, s) => a + s.monto, 0);
  const montoCoach = row.items.filter((i) => i.categoria === "coach").reduce((a, i) => a + i.monto, 0);

  return <div className="p-4 md:p-6 max-w-7xl mx-auto">
    <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"><ChevronLeft className="w-4 h-4" /> Volver al resumen</button>
    <div className="flex items-baseline justify-between flex-wrap gap-2 mb-5"><h1 className="text-2xl font-semibold">Informe detallado · {row.nombre}</h1><div className="flex items-center gap-3"><button onClick={() => onInforme?.()} className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Descargar informe PDF</button><div className="text-xs text-muted-foreground">{MESES[mes-1]} {anio}</div></div></div>
    {profile && <div className="rounded-xl border bg-card p-3 mb-4 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1"><span>CI: {profile.cedula || "—"}</span><span>{profile.banco || "Sin banco"} · {profile.tipo_cuenta || ""} · {profile.numero_cuenta || ""}</span><span>Titular: {profile.titular_cuenta || "—"}</span></div>}

    <div className="grid lg:grid-cols-2 gap-4 mb-4">
      <div className="rounded-2xl border bg-card p-5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Resumen económico</div><div className="space-y-3">
        <Linea titulo="Clases en vivo" sub={`${row.clasesRealizadas} clases · ${formatHM(row.minutosClase)}`} monto={montoClase} />
        <Linea titulo="1 a 1 · horario laboral" sub={`${formatHM(row.minutos1a1Laboral)}`} monto={monto1a1Laboral} />
        <Linea titulo="1 a 1 · fuera de horario" sub={`${formatHM(row.minutos1a1Fuera)}`} monto={monto1a1Fuera} />
        <Linea titulo="Coach" sub={`${row.sesionesCoach} sesiones · ${formatHM(row.minutosCoach)}`} monto={montoCoach} />
        {row.bonos > 0 && <Linea titulo="Bonos del mes" sub={row.bonosList.map((b) => b.motivo || "Bono").join(" · ")} monto={row.bonos} />}
        {row.descuentos > 0 && <Linea titulo="Descuentos" sub={row.descuentosList.map((d) => d.motivo).join(" · ")} monto={-row.descuentos} />}
        <div className="border-t pt-3 flex items-baseline justify-between"><div className="text-sm font-semibold">Total a pagar</div><div className="text-2xl font-bold tabular-nums" style={{ color: "var(--violet)" }}>${row.total.toFixed(2)}</div></div>
      </div></div>
      <div className="rounded-2xl border bg-card p-5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Actividad del mes</div><div className="space-y-3"><Item icon="🎓" titulo={`${row.clasesRealizadas} clases impartidas`} sub={`${formatHM(row.minutosClase)} en total`} /><Item icon="📅" titulo={`${row.sesiones1a1} sesiones 1:1 realizadas`} sub={`${formatHM(row.minutos1a1)} en total`} /><Item icon="🧭" titulo={`${row.sesionesCoach} sesiones Coach`} sub={`${formatHM(row.minutosCoach)} en total`} />{row.pendientes > 0 && <Item icon="⏱️" titulo={`${row.pendientes} registros de horas pendientes`} sub="No generan pago hasta registrar duración" />}<Item icon="⭐" titulo={`${row.califCount} calificaciones recibidas`} sub={row.califCount ? `Promedio ${row.califPromedio.toFixed(2)}` : "Sin respuestas"} /></div></div>
    </div>

    <div className="grid lg:grid-cols-2 gap-4 mb-6">
      <div className="rounded-2xl border bg-card p-5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Calificaciones ({row.califCount} respuestas)</div><div className="space-y-3"><Barra label="Claridad al explicar" v={promedios.claridad} /><Barra label="Didáctica" v={promedios.didactica} /><Barra label="Desenvolvimiento" v={promedios.desenvolvimiento} /><Barra label="Práctico vs teórico" v={promedios.practico} /></div>{ultimoComentario && <div className="mt-4 rounded-xl p-3 border-l-4 text-sm italic" style={{ borderColor: "var(--violet)", background: "color-mix(in oklab, var(--violet) 8%, transparent)" }}>“{ultimoComentario.comentario}”<div className="text-xs not-italic mt-1 opacity-70">— {alumnaNombres[ultimoComentario.alumna_id] || "Estudiante"} · {new Date(ultimoComentario.created_at).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</div></div>}</div>
      <div className="rounded-2xl border bg-card p-5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Bitácora · movimientos recientes</div><div className="space-y-3">{bitacora.map((b, i) => <div key={i} className="flex items-center gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"><div className="text-[11px] uppercase opacity-60 w-14">{new Date(b.fecha+"T00:00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</div><div className="flex-1"><div className="font-medium">{b.tipo} · <span className="text-muted-foreground font-normal">{b.detalle}</span></div></div><div className="font-semibold text-emerald-600 tabular-nums">+${b.monto.toFixed(2)}</div></div>)}{bitacora.length === 0 && <div className="text-xs text-muted-foreground">Sin movimientos este mes.</div>}</div></div>
    </div>

    <div className="rounded-2xl border bg-card p-5 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Valor de cada actividad · {MESES[mes-1]} {anio}</div><div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground text-xs">Ajuste de tiempo (min)</span><input type="number" value={ajuste} disabled={!puedeEditar} onChange={(e) => setAjuste(e.target.value)} onBlur={guardarAjuste} className="w-24 px-2 py-1 rounded-lg border bg-background text-right" /></div></div>
      {row.items.length === 0 ? <div className="text-xs text-muted-foreground">Sin actividad registrada este mes.</div> : <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]"><thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b"><th className="text-left px-2 py-2 font-semibold">Fecha</th><th className="text-left px-2 py-2 font-semibold">Horario</th><th className="text-left px-2 py-2 font-semibold">Tipo</th><th className="text-left px-2 py-2 font-semibold">Con / Tema</th><th className="text-left px-2 py-2 font-semibold">Duración</th><th className="text-right px-2 py-2 font-semibold">Valor $</th></tr></thead><tbody>{row.items.map((i) => { const key = `${i.tipo}:${i.refId}`; return <tr key={`${i.categoria}:${key}`} className="border-t"><td className="px-2 py-2 whitespace-nowrap">{new Date(i.fecha + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}</td><td className="px-2 py-2 whitespace-nowrap">{i.horaInicio.slice(0,5)}{i.horaFin ? ` – ${i.horaFin.slice(0,5)}` : ""}</td><td className="px-2 py-2">{etiquetaItem(i)}</td><td className="px-2 py-2">{nombreItemLocal(i)}{i.tema && i.categoria === "1a1" ? <div className="text-xs text-muted-foreground">{i.tema}</div> : null}</td><td className="px-2 py-2">{i.minutos > 0 ? formatHM(i.minutos) : <span className="text-amber-600 font-medium">Pendiente</span>}</td><td className="px-2 py-2 text-right"><input type="number" step="0.01" min="0" disabled={!puedeEditar || guardando || i.minutos <= 0} value={precios[key] ?? ""} onChange={(e) => setPrecios((p) => ({ ...p, [key]: e.target.value }))} onBlur={() => guardarPrecio(i)} placeholder={i.minutos <= 0 ? "—" : "0.00"} className="w-24 px-2 py-1 rounded-lg border bg-background text-right tabular-nums" /></td></tr>; })}</tbody></table></div>}
      {!puedeEditar && <div className="text-xs text-muted-foreground mt-2">Solo un gestor autorizado puede cambiar los valores.</div>}
    </div>

    {pendientesItems.length > 0 && <div className="rounded-2xl border bg-amber-50/40 dark:bg-amber-950/10 p-5 mb-6"><div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-3">Horas pendientes · monto $0 hasta registrar</div>{pendientesItems.map((i) => <div key={`${i.tipo}:${i.refId}`} className="text-sm py-1 border-b last:border-0">{i.fecha} · {etiquetaItem(i)} · {nombreItemLocal(i)}</div>)}</div>}
    {reemplazos.length > 0 && <div className="rounded-2xl border bg-card p-5 mb-6"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Reemplazos reportados · informativo</div><div className="space-y-2">{reemplazos.map((r, i) => <div key={i} className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"><div className="text-[11px] uppercase opacity-60 w-14 pt-0.5">{new Date(r.fecha + "T00:00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</div><div className="flex-1"><div className="font-medium">{r.detalle} · <span className="text-muted-foreground font-normal">reemplazó a {r.profesor}</span></div>{r.nota && <div className="text-xs text-muted-foreground">{r.nota}</div>}</div></div>)}</div></div>}
    <div className="rounded-2xl border bg-card p-5 mb-6"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Sesiones canceladas o no registradas · no cuentan horas</div>{canceladas.length === 0 ? <div className="text-xs text-muted-foreground">Ninguna este mes.</div> : <div className="space-y-2">{canceladas.map((c, i) => <div key={i} className="flex items-start gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"><div className="text-[11px] uppercase opacity-60 w-14 pt-0.5">{new Date(c.fecha + "T00:00:00").toLocaleDateString("es-EC", { day: "numeric", month: "short" })}</div><div className="flex-1"><div className="font-medium">{c.tipo} · <span className="text-muted-foreground font-normal">{c.con}</span></div><div className="text-xs text-muted-foreground">{c.razon || "Sin razón registrada"}</div></div><span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,.12)", color: "#dc2626" }}>{c.estado}</span><div className="font-semibold tabular-nums text-muted-foreground">$0.00</div></div>)}</div>}</div>
    <div className="mb-2 text-sm font-semibold">Ver informe de otro profesor</div><div className="flex gap-2 flex-wrap">{staff.map((s) => <button key={s.id} onClick={() => onSelect(s.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition ${s.id === row.id ? "border-violet bg-violet/10" : "bg-card"}`}><span className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold text-white" style={{ background: colorDe(s.id) }}>{s.nombre.slice(0,2).toUpperCase()}</span>{s.nombre.split(" ")[0]}</button>)}</div>
  </div>;
}

function Linea({ titulo, sub, monto }: { titulo: string; sub: string; monto: number }) {
  return <div className="flex items-baseline justify-between"><div><div className="font-semibold">{titulo}</div><div className="text-xs text-muted-foreground">{sub}</div></div><div className={`text-lg font-bold tabular-nums ${monto < 0 ? "text-red-600" : ""}`}>{monto < 0 ? "−" : ""}${Math.abs(monto).toFixed(2)}</div></div>;
}
function Item({ icon, titulo, sub }: { icon: string; titulo: string; sub: string }) { return <div className="flex items-start gap-3"><div className="w-9 h-9 rounded-lg bg-muted grid place-items-center text-lg">{icon}</div><div className="flex-1 min-w-0"><div className="font-semibold text-sm">{titulo}</div><div className="text-xs text-muted-foreground">{sub}</div></div></div>; }
function Barra({ label, v }: { label: string; v: number }) { const pct = Math.max(0, Math.min(100, (v / 5) * 100)); return <div><div className="flex items-baseline justify-between text-sm mb-1"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{v ? v.toFixed(1) : "—"}</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--violet),var(--violet-2))" }} /></div></div>; }
