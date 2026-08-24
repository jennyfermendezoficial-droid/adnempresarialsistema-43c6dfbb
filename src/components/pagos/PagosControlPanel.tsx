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

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

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
    const rpc = supabase.rpc as unknown as Rpc;
    const [p, c] = await Promise.all([
      rpc("detalle_horas_pendientes", {}),
      rpc("estado_cuentas_profesores", {}),
    ]);
    if (p.error) toast.error(`Alertas: ${p.error.message}`);
    if (c.error) toast.error(`Cuentas: ${c.error.message}`);
    setPendientes((p.data as Pendiente[] | null) ?? []);
    setCuentas((c.data as CuentaProfesor[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void cargar();
    // Revisa nuevamente al volver a la pestaña, sin alterar otras pantallas.
    const onFocus = () => void cargar();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [puedeGestionar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!puedeGestionar) return null;

  const notificar = async (p: Pendiente) => {
    setWorking(`n:${p.referencia_id}`);
    const rpc = supabase.rpc as unknown as Rpc;
    const { error } = await rpc("notificar_registro_pendiente", {
      _tipo: p.tipo,
      _referencia_id: p.referencia_id,
    });
    setWorking(null);
    if (error) return toast.error(error.message);
    toast.success(`Notificación enviada a ${p.profesor_nombre}.`);
    await cargar();
  };

  const abrirDescuento = (p: Pendiente) => {
    setDescuento(p);
    setMonto("");
    setMotivo(`No registró las horas de ${p.tipo === "clase" ? "clase en vivo" : "sesión 1 a 1"} del ${fechaEC(p.fecha)}`);
  };

  const aplicarDescuento = async () => {
    if (!descuento) return;
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Escribe un valor de descuento válido.");
    if (motivo.trim().length < 3) return toast.error("Escribe el motivo del descuento.");

    setWorking(`d:${descuento.referencia_id}`);
    const rpc = supabase.rpc as unknown as Rpc;
    const { error } = await rpc("aplicar_descuento_registro_pendiente", {
      _tipo: descuento.tipo,
      _referencia_id: descuento.referencia_id,
      _monto: valor,
      _motivo: motivo.trim(),
    });
    setWorking(null);
    if (error) return toast.error(error.message);
    toast.success(`Descuento de $${valor.toFixed(2)} registrado y profesor notificado.`);
    setDescuento(null);
    setMonto("");
    setMotivo("");
    await cargar();
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
              Clases y sesiones 1 a 1 que ya terminaron y todavía no tienen su duración real registrada.
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
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> No hay clases ni sesiones pendientes de registrar.
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
                      {p.notificada ? "Recordar al profesor" : "Notificar profesor"}
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
          <div className="p-6 text-sm text-muted-foreground">No se encontraron profesores activos.</div>
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
                El valor se registrará en <strong>Descuentos</strong> del mes correspondiente y se restará del total del profesor. No se aplica nada hasta que confirmes aquí.
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
