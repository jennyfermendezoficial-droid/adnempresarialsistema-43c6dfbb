import { useEffect, useState } from "react";
import {
  AlertTriangle, BadgeDollarSign, BellRing, CheckCircle2,
  Landmark, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { puedeVerPagos } from "@/lib/roles";

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
  duracion_min: number | null;
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
    && p.titular_cuenta?.trim()
    && p.banco_logo_url,
  );
}

export function PagosControlPanel() {
  const { role, session } = useAuth();
  const puedeGestionar = puedeVerPagos(role, session?.user.id);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cuentas, setCuentas] = useState<CuentaProfesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [descuento, setDescuento] = useState<Pendiente | null>(null);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");

  const cargar = async () => {
    if (!puedeGestionar) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Compatibilidad con la base ya publicada: no depende de las funciones
      // nuevas detalle_horas_pendientes / estado_cuentas_profesores.
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "soporte");

      if (roleError) {
        toast.error(`Profesores: ${roleError.message}`);
        setPendientes([]);
        setCuentas([]);
        return;
      }

      const ids = Array.from(new Set(((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id)));
      if (!ids.length) {
        setPendientes([]);
        setCuentas([]);
        return;
      }

      const perfiles = new Map<string, PerfilPago>();
      const rpc = supabase.rpc as unknown as Rpc;

      // Primero usa la función histórica de Pagos, que ya existe en versiones anteriores.
      const perfilesRpc = await rpc<PerfilPago[]>("perfiles_pagos", { _ids: ids });
      ((perfilesRpc.data ?? []) as PerfilPago[]).forEach((p) => perfiles.set(p.id, p));

      // Si algún profesor no regresó por RPC, intenta leer su perfil directamente.
      const faltantes = ids.filter((id) => !perfiles.has(id));
      if (faltantes.length) {
        const { data: directos } = await supabase
          .from("profiles")
          .select("id,nombre_completo,email,banco,tipo_cuenta,numero_cuenta,titular_cuenta,banco_logo_url")
          .in("id", faltantes);
        ((directos ?? []) as PerfilPago[]).forEach((p) => perfiles.set(p.id, p));
      }

      // Último respaldo para nombre/email: listar_profesores es una función antigua.
      const aunFaltan = ids.filter((id) => !perfiles.has(id));
      if (aunFaltan.length) {
        const lista = await rpc<PerfilPago[]>("listar_profesores", {});
        ((lista.data ?? []) as PerfilPago[])
          .filter((p) => aunFaltan.includes(p.id))
          .forEach((p) => perfiles.set(p.id, p));
      }

      setCuentas(ids.map((id) => {
        const p = perfiles.get(id) ?? { id, nombre_completo: "Profesor", email: "" };
        return {
          profesor_id: id,
          nombre: p.nombre_completo?.trim() || p.email || "Profesor",
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
          .in("profesor_id", ids)
          .lte("fecha", hoy)
          .order("fecha", { ascending: true }),
        supabase
          .from("sesiones_1a1")
          .select("id,profesor_id,alumna_id,fecha,hora_inicio,hora_fin,estado,duracion_min")
          .in("profesor_id", ids)
          .lte("fecha", hoy)
          .order("fecha", { ascending: true }),
      ]);

      if (clasesRes.error) toast.error(`Clases: ${clasesRes.error.message}`);
      if (sesionesRes.error) toast.error(`Sesiones 1 a 1: ${sesionesRes.error.message}`);

      const sesiones = ((sesionesRes.data ?? []) as SesionRow[]).filter((s) => {
        const estado = (s.estado || "confirmada").toLowerCase();
        return Number(s.duracion_min ?? 0) <= 0
          && !["cancelada", "cancelado", "anulada"].includes(estado)
          && termino(s.fecha, s.hora_fin, s.hora_inicio);
      });

      const alumnaIds = Array.from(new Set(sesiones.map((s) => s.alumna_id).filter(Boolean)));
      const alumnas = new Map<string, string>();
      if (alumnaIds.length) {
        const r = await rpc<Array<{ id: string; nombre_completo: string; email: string }>>("perfiles_basicos", { _ids: alumnaIds });
        ((r.data ?? []) as Array<{ id: string; nombre_completo: string; email: string }>).forEach((p) => {
          alumnas.set(p.id, p.nombre_completo?.trim() || p.email || "Estudiante");
        });
      }

      const faltas: Pendiente[] = [
        ...((clasesRes.data ?? []) as ClaseRow[])
          .filter((c) => Boolean(c.profesor_id) && Number(c.duracion_min ?? 0) <= 0 && termino(c.fecha, c.hora_fin, c.hora_inicio))
          .map((c) => ({
            tipo: "clase" as const,
            referencia_id: c.id,
            profesor_id: c.profesor_id as string,
            profesor_nombre: perfiles.get(c.profesor_id as string)?.nombre_completo || perfiles.get(c.profesor_id as string)?.email || "Profesor",
            fecha: c.fecha,
            hora_inicio: c.hora_inicio,
            hora_fin: c.hora_fin || "",
            contexto: c.titulo?.trim() || "Clase en vivo",
            dias_pendiente: diasDesde(c.fecha),
            notificada: false,
            descuento_aplicado: false,
          })),
        ...sesiones.map((s) => ({
          tipo: "1a1" as const,
          referencia_id: s.id,
          profesor_id: s.profesor_id,
          profesor_nombre: perfiles.get(s.profesor_id)?.nombre_completo || perfiles.get(s.profesor_id)?.email || "Profesor",
          fecha: s.fecha,
          hora_inicio: s.hora_inicio,
          hora_fin: s.hora_fin || "",
          contexto: alumnas.get(s.alumna_id) || "Estudiante",
          dias_pendiente: diasDesde(s.fecha),
          notificada: false,
          descuento_aplicado: false,
        })),
      ].sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio));

      setPendientes(faltas);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
    const onFocus = () => void cargar();
    window.addEventListener("focus", onFocus);
    window.addEventListener("adn:horas-actualizadas", onFocus);
    window.addEventListener("adn:datos-pago-actualizados", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("adn:horas-actualizadas", onFocus);
      window.removeEventListener("adn:datos-pago-actualizados", onFocus);
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
            <p className="text-xs text-muted-foreground mt-1">
              Se leen directamente las clases y sesiones existentes; no depende de una migración nueva.
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300">
            {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Revisando registros…
          </div>
        ) : pendientes.length === 0 ? (
          <div className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> No hay clases ni sesiones terminadas sin duración registrada.
          </div>
        ) : (
          <div className="divide-y">
            {pendientes.map((p) => {
              const key = `${p.tipo}:${p.referencia_id}`;
              const busyNotify = working === `n:${p.referencia_id}`;
              return (
                <div key={key} className="p-4 md:px-5 flex flex-col xl:flex-row xl:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.profesor_nombre}</span>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-300">
                        Duración no registrada
                      </span>
                    </div>
                    <div className="text-sm mt-1">
                      {p.tipo === "clase" ? "Clase en vivo" : "Sesión 1 a 1"} · {fechaEC(p.fecha)} · {hora(p.hora_inicio)}
                      {p.hora_fin ? ` – ${hora(p.hora_fin)}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.tipo === "clase" ? "Clase / tema" : "Con"}: <span className="font-medium text-foreground">{p.contexto}</span>
                      {p.dias_pendiente > 0 ? ` · ${p.dias_pendiente} día${p.dias_pendiente === 1 ? "" : "s"} pendiente` : " · pendiente de hoy"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      onClick={() => void notificar(p)}
                      disabled={busyNotify}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-background text-sm font-semibold disabled:opacity-50"
                    >
                      {busyNotify ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                      {p.notificada ? "Notificado" : "Notificar profesor"}
                    </button>
                    <button
                      onClick={() => abrirDescuento(p)}
                      disabled={p.descuento_aplicado}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold text-red-600 disabled:opacity-45"
                    >
                      <BadgeDollarSign className="w-4 h-4" />
                      {p.descuento_aplicado ? "Descuento aplicado" : "Aplicar descuento"}
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
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-violet" />
              <h2 className="text-lg font-semibold">Datos bancarios de profesores</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Revisa quién ya registró todos los datos necesarios para recibir su pago.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">{completas}/{cuentas.length} completos</div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Cargando cuentas…</div>
        ) : cuentas.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No se encontraron cuentas con rol Profesor.</div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {cuentas.map((c) => (
              <div key={c.profesor_id} className="rounded-xl border p-3 flex items-center gap-3 min-w-0">
                {c.banco_logo_url ? (
                  <img src={c.banco_logo_url} alt={c.banco || "Banco"} className="w-11 h-11 rounded-xl object-cover border shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-muted grid place-items-center shrink-0"><Landmark className="w-5 h-5 text-muted-foreground" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{c.nombre}</div>
                  {c.completa ? (
                    <div className="text-xs text-muted-foreground truncate">{c.banco} · {c.tipo_cuenta} · {c.numero_cuenta}</div>
                  ) : (
                    <div className="text-xs text-amber-600 dark:text-amber-300">Faltan datos bancarios</div>
                  )}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${c.completa ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                  {c.completa ? "Completa" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {descuento && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setDescuento(null)}>
          <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-lg">Aplicar descuento</h3>
                <p className="text-xs text-muted-foreground mt-1">{descuento.profesor_nombre} · {fechaEC(descuento.fecha)}</p>
              </div>
              <button onClick={() => setDescuento(null)} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border bg-amber-500/5 p-3 text-xs text-muted-foreground">
                El valor se guarda en <strong>Descuentos</strong> del mes correspondiente y se resta del pago. No se aplica nada hasta confirmar aquí.
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor del descuento *</label>
                <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background tabular-nums" autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Motivo *</label>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background resize-y" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDescuento(null)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
                <button onClick={() => void aplicarDescuento()} disabled={working === `d:${descuento.referencia_id}`} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">
                  {working === `d:${descuento.referencia_id}` && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar descuento
                </button>
              </div>
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
