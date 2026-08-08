import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Lock, Star, ChevronLeft, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatHM, minutosEntre, horasDecimal } from "@/lib/tiempo";
import { generarPagosPDF, exportarPagosExcel, listaMeses } from "@/lib/pagos-export";
import { formatNombre } from "@/lib/nombres";

export const Route = createFileRoute("/_authenticated/pagos")({ component: Page });

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

interface Profile { id: string; nombre_completo: string; email: string; avatar_url?: string | null }
interface PagoHist { id: string; profesor_id: string; mes: number; anio: number; total_horas: number; total_bonos: number; monto_total: number; estado: string; fecha_pago: string | null }

interface StaffRow {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  tema: string;
  minutosClase: number;
  tarifaHora: number;
  sesiones1a1: number;
  minutos1a1: number;
  tarifa1a1: number;
  mensajesEstudiantes: number;
  califPromedio: number;
  califCount: number;
  bonos: number;
  total: number;
  estado: "pagado" | "por_pagar";
  pagoId?: string;
}

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

// Tarifa por estrellas
function tarifaSesion(stars: number) {
  if (stars >= 4.5) return 10;
  if (stars >= 4.0) return 8;
  if (stars >= 3.5) return 7;
  if (stars > 0)    return 6;
  return 8;
}
function tarifaHora(stars: number) {
  if (stars >= 4.5) return 15;
  if (stars >= 4.0) return 12;
  if (stars >= 3.5) return 10;
  if (stars > 0)    return 8;
  return 12;
}

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

      // Pagos ya generados para este mes
      const { data: pagosMes } = await supabase.from("pagos_mensuales")
        .select("*").eq("mes", mes).eq("anio", anio);
      const pagoMap = new Map<string, PagoHist>();
      ((pagosMes ?? []) as PagoHist[]).forEach((p) => pagoMap.set(p.profesor_id, p));

      const rows: StaffRow[] = await Promise.all(ids.map(async (pid) => {
        const p = profMap[pid];
        if (!p) return null as unknown as StaffRow;

        const [clasesRes, sesionesRes, califRes, chatsRes, bonosRes] = await Promise.all([
          supabase.from("clases_en_vivo").select("hora_inicio,hora_fin,duracion_min").eq("profesor_id", pid).gte("fecha", ini).lte("fecha", fin),
          supabase.from("sesiones_1a1").select("hora_inicio,hora_fin,duracion_min").eq("profesor_id", pid).gte("fecha", ini).lte("fecha", fin),
          supabase.from("calificaciones_mensuales").select("claridad,didactica,practico,desenvolvimiento").eq("profesor_id", pid),
          supabase.from("chats_1a1").select("id,usuario_a_id,usuario_b_id").or(`usuario_a_id.eq.${pid},usuario_b_id.eq.${pid}`),
          supabase.from("bonos").select("monto").eq("profesor_id", pid).eq("mes", mes).eq("anio", anio),
        ]);

        // Minutos exactos de clases en vivo
        let minutosClase = 0;
        ((clasesRes.data ?? []) as { hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[]).forEach((c) => {
          minutosClase += c.duracion_min && c.duracion_min > 0 ? c.duracion_min : minutosEntre(c.hora_inicio, c.hora_fin);
        });

        // Minutos exactos de sesiones 1 a 1
        const sesionesData = (sesionesRes.data ?? []) as { hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[];
        let minutos1a1 = 0;
        sesionesData.forEach((s) => {
          minutos1a1 += s.duracion_min && s.duracion_min > 0 ? s.duracion_min : minutosEntre(s.hora_inicio, s.hora_fin);
        });

        // Calificación promedio
        const vals: number[] = [];
        ((califRes.data ?? []) as { claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null }[]).forEach((c) => {
          [c.claridad, c.didactica, c.practico, c.desenvolvimiento].forEach((v) => { if (typeof v === "number") vals.push(v); });
        });
        const califPromedio = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
        const califCount = (califRes.data ?? []).length;

        // Mensajes solo a estudiantes (chats donde la contraparte es usuario)
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
        const tH = tarifaHora(califPromedio);
        const t1 = tarifaSesion(califPromedio);
        const bonos = ((bonosRes.data ?? []) as { monto: number }[]).reduce((a,b)=>a + Number(b.monto), 0);
        const total = Math.round(((minutosClase / 60) * tH + (minutos1a1 / 60) * t1 + bonos) * 100) / 100;

        const pago = pagoMap.get(pid);

        return {
          id: pid,
          nombre: formatNombre(p.nombre_completo) || p.email,
          email: p.email,
          rol: map.get(pid) ?? "soporte",
          tema: temaDe(p),
          minutosClase, tarifaHora: tH,
          sesiones1a1, minutos1a1, tarifa1a1: t1,
          mensajesEstudiantes,
          califPromedio, califCount,
          bonos,
          total,
          estado: (pago?.estado === "pagado" ? "pagado" : "por_pagar") as "pagado" | "por_pagar",
          pagoId: pago?.id,
        };
      }));
      setStaff(rows.filter(Boolean).sort((a,b) => b.total - a.total));

      // Historial de meses cerrados
      const { data: hist } = await supabase.from("pagos_mensuales")
        .select("*").order("anio",{ascending:false}).order("mes",{ascending:false}).limit(24);
      setHistorial((hist as PagoHist[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [mes, anio]);

  const tot = useMemo(() => {
    const minutos = staff.reduce((a,b) => a + b.minutosClase + b.minutos1a1, 0);
    const sesiones = staff.reduce((a,b) => a + b.sesiones1a1, 0);
    const pagar = staff.filter(s => s.estado === "por_pagar").reduce((a,b) => a + b.total, 0);
    const pendCount = staff.filter(s => s.estado === "por_pagar").length;
    const califs = staff.filter(s => s.califCount > 0).map(s => s.califPromedio);
    const califEq = califs.length ? califs.reduce((a,b)=>a+b,0)/califs.length : 0;
    return { minutos, sesiones, pagar, pendCount, califEq };
  }, [staff]);

  const marcarPagado = async (row: StaffRow) => {
    if (!confirm(`¿Marcar como pagado a ${row.nombre} por $${row.total.toFixed(2)}?`)) return;
    const payload = {
      profesor_id: row.id, mes, anio,
      total_horas: horasDecimal(row.minutosClase + row.minutos1a1), total_bonos: row.bonos,
      monto_total: row.total, estado: "pagado",
      fecha_pago: new Date().toISOString(),
    };
    if (row.pagoId) {
      // update
      const { error } = await supabase.from("pagos_mensuales").update(payload).eq("id", row.pagoId);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("pagos_mensuales").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Marcado como pagado");
    cargar();
  };

  const cerrarMes = async () => {
    const pendientes = staff.filter(s => s.estado === "por_pagar");
    if (!pendientes.length) return toast.info("No hay pagos pendientes");
    if (!confirm(`Generar ${pendientes.length} pagos por un total de $${tot.pagar.toFixed(2)}?`)) return;
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

  if (role !== "admin" && role !== "soporte") {
    return <div className="p-8 text-center text-muted-foreground">Solo el equipo puede ver esta sección.</div>;
  }

  if (detalleId) {
    const row = staff.find(s => s.id === detalleId);
    if (!row) return null;
    return <DetalleProfesor row={row} profile={profiles[detalleId]} mes={mes} anio={anio} onBack={() => setDetalleId(null)} onSelect={(id) => setDetalleId(id)} staff={staff} />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={`${anio}-${mes}`} onChange={(e) => { const [a,m] = e.target.value.split("-").map(Number); setAnio(a); setMes(m); }} className="px-3 py-2 rounded-lg border bg-card text-sm font-medium">
          {listaMeses().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className="px-3 py-2 rounded-lg border bg-card text-sm flex items-center gap-1.5" onClick={() => {
          if (!staff.length) return toast.info("Sin datos para exportar");
          exportarPagosExcel({ mes, anio, rows: staff });
        }}>
          📊 Exportar Excel
        </button>
        <button className="px-3 py-2 rounded-lg border bg-card text-sm flex items-center gap-1.5" onClick={() => {
          if (!staff.length) return toast.info("Sin datos para exportar");
          generarPagosPDF({ mes, anio, rows: staff });
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0F1431,#1B1F4A)" }}>
          <div aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(124,107,255,.5), transparent 70%)" }} />
          <div className="text-[10px] uppercase tracking-wider opacity-70">Total a pagar · {MESES[mes-1]}</div>
          <div className="text-3xl font-bold mt-1 tabular-nums">${tot.pagar.toFixed(2)}</div>
          <div className="text-xs opacity-80 mt-1">{tot.pendCount} {tot.pendCount === 1 ? "profesor" : "profesores"} · pendiente</div>
        </div>
        <KPI label="Tiempo dictado" value={formatHM(tot.minutos)} sub={`${staff.length} miembros activos`} />
        <KPI label="Sesiones 1:1" value={String(tot.sesiones)} sub="reservadas" />
        <KPI label="Calif. equipo" value={tot.califEq ? tot.califEq.toFixed(2) : "—"} sub={tot.califEq ? "promedio del equipo" : "Sin calificaciones"} />
      </div>

      {/* Tabla */}
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="text-lg font-semibold">Resumen del equipo · {MESES[mes-1]} {anio}</h2>
        <span className="text-xs text-muted-foreground">Click en el nombre para ver el detalle</span>
      </div>
      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-4 py-3 font-semibold">Profesor</th>
              <th className="text-left px-3 py-3 font-semibold">Tiempo clase</th>
              <th className="text-left px-3 py-3 font-semibold">Sesiones 1:1</th>
              <th className="text-left px-3 py-3 font-semibold">Chats</th>
              <th className="text-left px-3 py-3 font-semibold">Calif.</th>
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
                    <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white" style={{ background: colorDe(s.id) }}>
                      {(s.nombre).slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold">{s.nombre}</div>
                      <div className="text-[11px] text-muted-foreground">{s.tema}</div>
                    </div>
                  </button>
                </td>
                <td className="px-3 py-3">{formatHM(s.minutosClase)} <span className="text-muted-foreground text-xs">× ${s.tarifaHora}/h</span></td>
                <td className="px-3 py-3">{s.sesiones1a1} <span className="text-muted-foreground text-xs">· {formatHM(s.minutos1a1)} × ${s.tarifa1a1}/h</span></td>
                <td className="px-3 py-3">{s.mensajesEstudiantes}</td>
                <td className="px-3 py-3">
                  {s.califCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-medium">{s.califPromedio.toFixed(1)}</span>
                    </span>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="px-3 py-3 text-right font-bold tabular-nums">${s.total.toFixed(2)}</td>
                <td className="px-3 py-3">
                  {s.estado === "pagado"
                    ? <span className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Pagado</span>
                    : <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Por pagar</span>}
                </td>
                <td className="px-3 py-3 text-right">
                  {role === "admin" && s.estado === "por_pagar" && (
                    <button onClick={() => marcarPagado(s)} className="px-3 py-1.5 rounded-lg bg-violet-gradient text-white text-xs font-semibold">Marcar pagado</button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && staff.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin actividad este mes.</td></tr>}
            {!loading && staff.length > 0 && (
              <tr className="bg-muted/40 border-t">
                <td className="px-4 py-3" colSpan={5} />
                <td className="px-3 py-3 text-right text-xs uppercase tracking-wider font-semibold">Total a pagar</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: "var(--violet)" }}>${tot.pagar.toFixed(2)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Historial */}
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

// ===================== DETALLE PROFESOR =====================

function DetalleProfesor({ row, profile, mes, anio, onBack, onSelect, staff }: {
  row: StaffRow; profile?: Profile; mes: number; anio: number;
  onBack: () => void; onSelect: (id: string) => void; staff: StaffRow[];
}) {
  const [califs, setCalifs] = useState<Array<{ claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null; comentario: string|null; created_at: string; alumna_id: string }>>([]);
  const [bitacora, setBitacora] = useState<Array<{ fecha: string; tipo: string; detalle: string; monto: number }>>([]);
  const [alumnaNombres, setAlumnaNombres] = useState<Record<string, string>>({});

  useEffect(() => {
    const ini = `${anio}-${String(mes).padStart(2,"0")}-01`;
    const finDate = new Date(anio, mes, 0);
    const fin = `${anio}-${String(mes).padStart(2,"0")}-${String(finDate.getDate()).padStart(2,"0")}`;

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

      // Bitácora: clases + sesiones del mes
      const [clasesRes, sesionesRes] = await Promise.all([
        supabase.from("clases_en_vivo").select("fecha,titulo,hora_inicio,hora_fin,duracion_min").eq("profesor_id", row.id).gte("fecha", ini).lte("fecha", fin),
        supabase.from("sesiones_1a1").select("fecha,alumna_id,hora_inicio,hora_fin,duracion_min").eq("profesor_id", row.id).gte("fecha", ini).lte("fecha", fin),
      ]);
      const items: Array<{ fecha: string; tipo: string; detalle: string; monto: number }> = [];
      ((clasesRes.data ?? []) as { fecha: string; titulo: string; hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[]).forEach((c) => {
        const min = c.duracion_min && c.duracion_min > 0 ? c.duracion_min : minutosEntre(c.hora_inicio, c.hora_fin);
        items.push({ fecha: c.fecha, tipo: "Clase en vivo", detalle: `${c.titulo} · ${formatHM(min)}`, monto: (min / 60) * row.tarifaHora });
      });
      const aidSess = Array.from(new Set(((sesionesRes.data ?? []) as { alumna_id: string }[]).map((s) => s.alumna_id)));
      if (aidSess.length) {
        const { data: ps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", aidSess);
        const m: Record<string,string> = {};
        ((ps ?? []) as Profile[]).forEach((p) => { m[p.id] = formatNombre(p.nombre_completo) || p.email; });
        ((sesionesRes.data ?? []) as { fecha: string; alumna_id: string; hora_inicio: string; hora_fin: string | null; duracion_min: number | null }[]).forEach((s) => {
          const min = s.duracion_min && s.duracion_min > 0 ? s.duracion_min : minutosEntre(s.hora_inicio, s.hora_fin);
          items.push({ fecha: s.fecha, tipo: "Sesión 1:1", detalle: `${m[s.alumna_id] || "Estudiante"} · ${formatHM(min)}`, monto: (min / 60) * row.tarifa1a1 });
        });
      }
      items.sort((a,b) => b.fecha.localeCompare(a.fecha));
      setBitacora(items.slice(0, 10));
    })();
  }, [row.id, mes, anio, row.tarifa1a1, row.tarifaHora]);

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
        <div className="text-xs text-muted-foreground">{MESES[mes-1]} {anio}</div>
      </div>

      {/* Resumen + actividad */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Resumen económico</div>
          <div className="space-y-3">
            <Linea titulo="Clases grupales" sub={`${formatHM(row.minutosClase)} × $${row.tarifaHora}/h`} monto={(row.minutosClase / 60) * row.tarifaHora} />
            <Linea titulo="Sesiones 1:1" sub={`${row.sesiones1a1} sesiones · ${formatHM(row.minutos1a1)} × $${row.tarifa1a1}/h`} monto={(row.minutos1a1 / 60) * row.tarifa1a1} />
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
            <Item icon="💬" titulo={`${row.mensajesEstudiantes} mensajes a estudiantes`} sub="canal privado" />
            <Item icon="⭐" titulo={`${row.califCount} calificaciones recibidas`} sub={row.califCount ? `Promedio ${row.califPromedio.toFixed(2)}` : "Sin respuestas"} />
          </div>
        </div>
      </div>

      {/* Calificaciones + bitácora */}
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

      {/* Selector otros profes */}
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