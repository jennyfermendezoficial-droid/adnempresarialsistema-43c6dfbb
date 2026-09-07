import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BadgeDollarSign, BellRing, CheckCircle2,
  Landmark, Loader2, Star, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";
import { esCuentaEspecialFicha } from "@/lib/ficha-profesor";
import { formatNombre } from "@/lib/nombres";

interface Pendiente {
  tipo: "clase" | "1a1";
  referencia_id: string;
  profesor_id: string;
  profesor_nombre: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  contexto: string;
  dias_pendiente: number;
  notificada: boolean;
  descuento_aplicado: boolean;
}

interface CuentaProfesor {
  profesor_id: string;
  nombre: string;
  email: string;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  titular_cuenta: string | null;
  banco_logo_url: string | null;
  completa: boolean;
}

interface PerfilPago {
  id: string;
  nombre_completo: string;
  email: string;
  banco?: string | null;
  tipo_cuenta?: string | null;
  numero_cuenta?: string | null;
  titular_cuenta?: string | null;
  banco_logo_url?: string | null;
}

interface ClaseRow {
  id: string;
  profesor_id: string | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  titulo: string | null;
  duracion_min: number | null;
}

interface SesionRow {
  id: string;
  profesor_id: string;
  alumna_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  estado: string | null;
  motivo: string | null;
  duracion_min: number | null;
}

interface CalificacionEquipo {
  profesor_id: string;
  profesor: string;
  promedio: number;
  cantidad: number;
}

type RpcResult<T = unknown> = Promise<{ data: T | null; error: { message: string } | null }>;
type Rpc = <T = unknown>(fn: string, args?: Record<string, unknown>) => RpcResult<T>;

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function horaLocal() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function termino(fecha: string, fin: string | null, inicio: string) {
  const hoy = hoyLocal();
  if (fecha < hoy) return true;
  if (fecha > hoy) return false;
  return (fin || inicio || "23:59").slice(0, 5) <= horaLocal();
}

function diasDesde(fecha: string) {
  const f = new Date(`${fecha}T00:00:00`);
  const h = new Date(`${hoyLocal()}T00:00:00`);
  return Math.max(0, Math.floor((h.getTime() - f.getTime()) / 86_400_000));
}

function cuentaCompleta(p: PerfilPago) {
  return Boolean(
    p.banco?.trim()
    && p.tipo_cuenta?.trim()
    && p.numero_cuenta?.trim()
    && p.titular_cuenta?.trim(),
  );
}

function mesAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { mes: d.getMonth() + 1, anio: d.getFullYear() };
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function PagosControlPanel() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cuentas, setCuentas] = useState<CuentaProfesor[]>([]);
  const [calificaciones, setCalificaciones] = useState<CalificacionEquipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [descuento, setDescuento] = useState<Pendiente | null>(null);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const periodoCalif = useMemo(mesAnterior, []);

  const cargar = async () => {
    if (!puedeGestionar) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rpc = supabase.rpc as unknown as Rpc;

      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id,role");

      if (roleError) toast.error(`Roles del equipo: ${roleError.message}`);

      const roles = ((roleRows ?? []) as { user_id: string; role: string }[]);
      const rolesPorUsuario = new Map<string, Set<string>>();
      roles.forEach((r) => {
        const set = rolesPorUsuario.get(r.user_id) ?? new Set<string>();
        set.add(r.role);
        rolesPorUsuario.set(r.user_id, set);
      });
      const todosIds = Array.from(rolesPorUsuario.keys());

      const perfiles = new Map<string, PerfilPago>();
      if (todosIds.length) {
        const privados = await rpc<PerfilPago[]>("perfiles_pagos", { _ids: todosIds });
        ((privados.data ?? []) as PerfilPago[]).forEach((p) => perfiles.set(p.id, p));

        const faltantes = todosIds.filter((id) => !perfiles.has(id));
        if (faltantes.length) {
          const basicos = await rpc<PerfilPago[]>("perfiles_basicos", { _ids: faltantes });
          ((basicos.data ?? []) as PerfilPago[]).forEach((p) => perfiles.set(p.id, p));
        }
      }

      const objetivoCuentaIds = todosIds.filter((id) => {
        const rs = rolesPorUsuario.get(id);
        const p = perfiles.get(id);
        return Boolean(rs?.has("soporte") || esCuentaEspecialFicha(p?.nombre_completo));
      });

      setCuentas(objetivoCuentaIds.map((id) => {
        const p = perfiles.get(id) ?? { id, nombre_completo: "Profesor", email: "" };
        return {
          profesor_id: id,
          nombre: formatNombre(p.nombre_completo) || p.email || "Profesor",
          email: p.email || "",
          banco: p.banco ?? null,
          tipo_cuenta: p.tipo_cuenta ?? null,
          numero_cuenta: p.numero_cuenta ?? null,
          titular_cuenta: p.titular_cuenta ?? null,
          banco_logo_url: p.banco_logo_url ?? null,
          completa: cuentaCompleta(p),
        };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));

      const hoy = hoyLocal();
      const [clasesRes, sesionesRes] = await Promise.all([
        supabase
          .from("clases_en_vivo")
          .select("id,profesor_id,fecha,hora_inicio,hora_fin,titulo,duracion_min")
          .lte("fecha", hoy)
          .order("fecha", { ascending: true }),
        supabase
          .from("sesiones_1a1")
          .select("id,profesor_id,alumna_id,fecha,hora_inicio,hora_fin,estado,motivo,duracion_min")
          .lte("fecha", hoy)
          .order("fecha", { ascending: true }),
      ]);

      if (clasesRes.error) toast.error(`Clases: ${clasesRes.error.message}`);
      if (sesionesRes.error) toast.error(`Sesiones 1 a 1: ${sesionesRes.error.message}`);

      const clasesPendientes = ((clasesRes.data ?? []) as ClaseRow[])
        .filter((c) => Boolean(c.profesor_id) && Number(c.duracion_min ?? 0) <= 0 && termino(c.fecha, c.hora_fin, c.hora_inicio));

      const sesionesPendientes = ((sesionesRes.data ?? []) as SesionRow[]).filter((s) => {
        const estado = (s.estado || "confirmada").toLowerCase();
        return Number(s.duracion_min ?? 0) <= 0
          && !["cancelada", "cancelado", "anulada", "anulado", "no_realizada", "no realizado"].includes(estado)
          && termino(s.fecha, s.hora_fin, s.hora_inicio);
      });

      const profIdsPendientes = Array.from(new Set([
        ...clasesPendientes.map((c) => c.profesor_id).filter(Boolean) as string[],
        ...sesionesPendientes.map((s) => s.profesor_id),
      ]));
      const faltanProfes = profIdsPendientes.filter((id) => !perfiles.has(id));
      if (faltanProfes.length) {
        const r = await rpc<PerfilPago[]>("perfiles_basicos", { _ids: faltanProfes });
        ((r.data ?? []) as PerfilPago[]).forEach((p) => perfiles.set(p.id, p));
      }

      const alumnaIds = Array.from(new Set(sesionesPendientes.map((s) => s.alumna_id).filter(Boolean)));
      const alumnas = new Map<string, string>();
      if (alumnaIds.length) {
        const r = await rpc<Array<{ id: string; nombre_completo: string; email: string }>>("perfiles_basicos", { _ids: alumnaIds });
        ((r.data ?? []) as Array<{ id: string; nombre_completo: string; email: string }>).forEach((p) => {
          alumnas.set(p.id, formatNombre(p.nombre_completo) || p.email || "Estudiante");
        });
      }

      const faltas: Pendiente[] = [
        ...clasesPendientes.map((c) => ({
          tipo: "clase" as const,
          referencia_id: c.id,
          profesor_id: c.profesor_id as string,
          profesor_nombre: formatNombre(perfiles.get(c.profesor_id as string)?.nombre_completo) || perfiles.get(c.profesor_id as string)?.email || "Profesor",
          fecha: c.fecha,
          hora_inicio: c.hora_inicio,
          hora_fin: c.hora_fin || "",
          contexto: c.titulo?.trim() || "Clase en vivo",
          dias_pendiente: diasDesde(c.fecha),
          notificada: false,
          descuento_aplicado: false,
        })),
        ...sesionesPendientes.map((s) => ({
          tipo: "1a1" as const,
          referencia_id: s.id,
          profesor_id: s.profesor_id,
          profesor_nombre: formatNombre(perfiles.get(s.profesor_id)?.nombre_completo) || perfiles.get(s.profesor_id)?.email || "Profesor",
          fecha: s.fecha,
          hora_inicio: s.hora_inicio,
          hora_fin: s.hora_fin || "",
          contexto: `${alumnas.get(s.alumna_id) || "Estudiante"}${s.motivo?.trim() ? ` · Tema: ${s.motivo.trim()}` : ""}`,
          dias_pendiente: diasDesde(s.fecha),
          notificada: false,
          descuento_aplicado: false,
        })),
      ].sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio));
      setPendientes(faltas);

      const profesoresIds = Array.from(new Set([
        ...todosIds.filter((id) => rolesPorUsuario.get(id)?.has("soporte")),
        ...profIdsPendientes,
      ]));
      const { data: califs } = await supabase
        .from("calificaciones_mensuales")
        .select("profesor_id,claridad,didactica,practico,desenvolvimiento")
        .eq("mes", periodoCalif.mes)
        .eq("anio", periodoCalif.anio);

      const porProfesor = new Map<string, { suma: number; valores: number; filas: number }>();
      ((califs ?? []) as Array<{ profesor_id: string; claridad: number | null; didactica: number | null; practico: number | null; desenvolvimiento: number | null }>).forEach((c) => {
        const ac = porProfesor.get(c.profesor_id) ?? { suma: 0, valores: 0, filas: 0 };
        [c.claridad, c.didactica, c.practico, c.desenvolvimiento].forEach((v) => {
          if (typeof v === "number") { ac.suma += v; ac.valores += 1; }
        });
        ac.filas += 1;
        porProfesor.set(c.profesor_id, ac);
      });

      const faltanNombresCalif = profesoresIds.filter((id) => !perfiles.has(id));
      if (faltanNombresCalif.length) {
        const r = await rpc<PerfilPago[]>("perfiles_basicos", { _ids: faltanNombresCalif });
        ((r.data ?? []) as PerfilPago[]).forEach((p) => perfiles.set(p.id, p));
      }

      setCalificaciones(profesoresIds.map((id) => {
        const c = porProfesor.get(id);
        const p = perfiles.get(id);
        return {
          profesor_id: id,
          profesor: formatNombre(p?.nombre_completo) || p?.email || "Profesor",
          promedio: c && c.valores ? c.suma / c.valores : 0,
          cantidad: c?.filas ?? 0,
        };
      }).sort((a, b) => a.profesor.localeCompare(b.profesor, "es")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
    const refrescar = () => void cargar();
    window.addEventListener("focus", refrescar);
    window.addEventListener("adn:horas-actualizadas", refrescar);
    window.addEventListener("adn:datos-pago-actualizados", refrescar);
    window.addEventListener("adn:clase-historica-registrada", refrescar);
    return () => {
      window.removeEventListener("focus", refrescar);
      window.removeEventListener("adn:horas-actualizadas", refrescar);
      window.removeEventListener("adn:datos-pago-actualizados", refrescar);
      window.removeEventListener("adn:clase-historica-registrada", refrescar);
    };
  }, [puedeGestionar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!puedeGestionar) return null;

  const notificar = async (p: Pendiente) => {
    if (!session?.user.id) return;
    setWorking(`n:${p.referencia_id}`);
    const cuerpo = `Falta registrar la duración de tu ${p.tipo === "clase" ? "clase en vivo" : "sesión 1 a 1"} del ${fechaEC(p.fecha)} · ${p.contexto}.`;
    const { error } = await supabase.rpc("notificar", {
      _actor: session.user.id,
      _cuerpo: cuerpo,
      _referencia: p.referencia_id,
      _tipo: "registro_horas_pendiente",
      _titulo: "Registro de horas pendiente",
      _url: "/mis-clases-asignadas",
      _usuarios: [p.profesor_id],
    });
    setWorking(null);
    if (error) return toast.error(error.message);
    setPendientes((arr) => arr.map((x) => x.referencia_id === p.referencia_id ? { ...x, notificada: true } : x));
    toast.success(`Notificación enviada a ${p.profesor_nombre}.`);
  };

  const abrirDescuento = (p: Pendiente) => {
    setDescuento(p);
    setMonto("");
    setMotivo(`No registró las horas de ${p.tipo === "clase" ? "clase en vivo" : "sesión 1 a 1"} del ${fechaEC(p.fecha)}`);
  };

  const aplicarDescuento = async () => {
    if (!descuento || !session?.user.id) return;
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Escribe un valor de descuento válido.");
    if (motivo.trim().length < 3) return toast.error("Escribe el motivo del descuento.");

    const [anio, mes] = descuento.fecha.slice(0, 7).split("-").map(Number);
    setWorking(`d:${descuento.referencia_id}`);
    const { error } = await supabase.from("pagos_descuentos").insert({
      profesor_id: descuento.profesor_id,
      mes,
      anio,
      monto: valor,
      motivo: motivo.trim(),
      creado_por: session.user.id,
    });
    if (error) {
      setWorking(null);
      return toast.error(error.message);
    }

    await supabase.rpc("notificar", {
      _actor: session.user.id,
      _cuerpo: `Se registró un descuento de $${valor.toFixed(2)}. Motivo: ${motivo.trim()}.`,
      _referencia: descuento.referencia_id,
      _tipo: "descuento_horas",
      _titulo: "Descuento registrado",
      _url: "/mis-clases-asignadas",
      _usuarios: [descuento.profesor_id],
    });

    setWorking(null);
    toast.success(`Descuento de $${valor.toFixed(2)} registrado y profesor notificado.`);
    setPendientes((arr) => arr.map((x) => x.referencia_id === descuento.referencia_id ? { ...x, descuento_aplicado: true } : x));
    setDescuento(null);
    setMonto("");
    setMotivo("");
  };

  const completas = cuentas.filter((c) => c.completa).length;

  return (
    <div className="p-4 md:px-6 md:pt-6 md:pb-0 max-w-7xl mx-auto space-y-5">
      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Alertas de registro de clases y sesiones</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Todo registro terminado sin duración real aparece aquí hasta que el profesor lo resuelva.</p>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300">
            {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Revisando registros…</div>
        ) : pendientes.length === 0 ? (
          <div className="p-6 flex items-center gap-3 text-sm text-muted-foreground"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> No hay clases ni sesiones terminadas sin duración registrada.</div>
        ) : (
          <div className="divide-y">
            {pendientes.map((p) => {
              const busyNotify = working === `n:${p.referencia_id}`;
              return (
                <div key={`${p.tipo}:${p.referencia_id}`} className="p-4 md:px-5 flex flex-col xl:flex-row xl:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.profesor_nombre}</span>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-300">Duración no registrada</span>
                    </div>
                    <div className="text-sm mt-1">{p.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1"} · {fechaEC(p.fecha)} · {hora(p.hora_inicio)}{p.hora_fin ? ` – ${hora(p.hora_fin)}` : ""}</div>
                    <div className="text-xs text-muted-foreground mt-1">{p.tipo === "clase" ? "Tema" : "Con / tema"}: <span className="font-medium text-foreground">{p.contexto}</span>{p.dias_pendiente > 0 ? ` · ${p.dias_pendiente} día${p.dias_pendiente === 1 ? "" : "s"} pendiente` : " · pendiente de hoy"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button onClick={() => void notificar(p)} disabled={busyNotify} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-background text-sm font-semibold disabled:opacity-50">
                      {busyNotify ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                      {p.notificada ? "Notificado" : "Notificar profesor"}
                    </button>
                    <button onClick={() => abrirDescuento(p)} disabled={p.descuento_aplicado} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold text-red-600 disabled:opacity-45">
                      <BadgeDollarSign className="w-4 h-4" /> {p.descuento_aplicado ? "Descuento aplicado" : "Aplicar descuento"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Landmark className="w-5 h-5 text-violet" /><h2 className="text-lg font-semibold">Datos bancarios de profesores</h2></div>
            <p className="text-xs text-muted-foreground mt-1">Profesores y cuentas especiales que deben tener datos listos para pagos.</p>
          </div>
          <div className="text-xs font-semibold">{completas}/{cuentas.length} completos</div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Cargando cuentas…</div>
        ) : cuentas.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No se encontraron cuentas objetivo.</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {cuentas.map((c) => (
              <div key={c.profesor_id} className="rounded-xl border p-3 flex items-center gap-3 min-w-0">
                {c.banco_logo_url ? <img src={c.banco_logo_url} alt={c.banco || "Banco"} className="w-11 h-11 rounded-xl object-cover border shrink-0" /> : <div className="w-11 h-11 rounded-xl bg-muted grid place-items-center shrink-0"><Landmark className="w-5 h-5 text-muted-foreground" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{c.nombre}</div>
                  {c.completa ? <div className="text-xs text-muted-foreground truncate">{c.banco} · {c.tipo_cuenta} · {c.numero_cuenta}</div> : <div className="text-xs text-amber-600 dark:text-amber-300">Faltan datos bancarios</div>}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${c.completa ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{c.completa ? "Completa" : "Pendiente"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="flex items-center gap-2"><Star className="w-5 h-5 text-amber-500" /><h2 className="text-lg font-semibold">Calificación del equipo · {MESES[periodoCalif.mes - 1]} {periodoCalif.anio}</h2></div>
          <p className="text-xs text-muted-foreground mt-1">Cierre del mes anterior. Se muestran todos los profesores, incluso quienes todavía no recibieron una calificación.</p>
        </div>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Cargando calificaciones…</div>
        ) : calificaciones.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No hay profesores disponibles para este resumen.</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {calificaciones.map((c) => (
              <div key={c.profesor_id} className="rounded-xl border p-4">
                <div className="font-semibold text-sm">{c.profesor}</div>
                {c.cantidad > 0 ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-xl font-bold tabular-nums">{c.promedio.toFixed(2)}</div>
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs text-muted-foreground">{c.cantidad} evaluación{c.cantidad === 1 ? "" : "es"}</span>
                  </div>
                ) : <div className="mt-2 text-xs text-muted-foreground">Sin calificaciones registradas</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {descuento && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setDescuento(null)}>
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
              <div><h3 className="font-semibold text-lg">Aplicar descuento</h3><p className="text-xs text-muted-foreground mt-1">{descuento.profesor_nombre} · {fechaEC(descuento.fecha)}</p></div>
              <button onClick={() => setDescuento(null)} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border bg-amber-500/5 p-3 text-xs text-muted-foreground">El descuento se resta del pago del mes correspondiente solo después de confirmar.</div>
              <div><label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor del descuento *</label><input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background tabular-nums" autoFocus /></div>
              <div><label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motivo *</label><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background resize-y" /></div>
              <div className="flex justify-end gap-2"><button onClick={() => setDescuento(null)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button><button onClick={() => void aplicarDescuento()} disabled={working === `d:${descuento.referencia_id}`} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">{working === `d:${descuento.referencia_id}` && <Loader2 className="w-4 h-4 animate-spin" />}Confirmar descuento</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fechaEC(fecha: string) {
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

function hora(valor: string) {
  return valor ? valor.slice(0, 5) : "—";
}
