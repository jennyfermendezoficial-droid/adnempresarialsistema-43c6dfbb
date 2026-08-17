import { subirImagen, esImagen, esUrlAbsoluta } from "@/lib/cloudinary";
import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, Trash2, Landmark } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { leerComprobante } from "@/lib/comprobante-ocr.functions";

export interface CuentaEmpresa {
  id: string; nombre: string; tipo: string; numero_cuenta: string; titular: string | null; activo: boolean;
}
export interface Abono {
  id: string; profesor_id: string; mes: number; anio: number; fecha_pago: string; monto: number;
  tipo_pago: string; numero_comprobante: string | null; cuenta_id: string | null; banco_texto: string | null;
  observacion: string | null; archivo_url: string | null;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

export function RegistrarAbonoModal({
  profesorId, profesorNombre, mes, anio, total, abonos, cuentas, onClose, onSaved,
  bonos = [], descuentos = [],
}: {
  profesorId: string; profesorNombre: string; mes: number; anio: number; total: number;
  abonos: Abono[]; cuentas: CuentaEmpresa[];
  bonos?: { id: string; monto: number; motivo: string | null }[];
  descuentos?: { id: string; monto: number; motivo: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const leer = useServerFn(leerComprobante);
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState("");
  const [tipoPago, setTipoPago] = useState("transferencia");
  const [numero, setNumero] = useState("");
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [observacion, setObservacion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [descMonto, setDescMonto] = useState("");
  const [descMotivo, setDescMotivo] = useState("");

  const abonado = abonos.reduce((a, b) => a + Number(b.monto), 0);
  const totalDesc = descuentos.reduce((a, d) => a + Number(d.monto), 0);
  const totalBonos = bonos.reduce((a, b) => a + Number(b.monto), 0);
  const saldo = Math.round((total - abonado) * 100) / 100;
  const montoNum = Number(monto || 0);
  const coincide = montoNum > 0 && Math.abs(montoNum - saldo) < 0.01;

  const agregarDescuento = async () => {
    const v = Number(descMonto);
    if (!Number.isFinite(v) || v <= 0) return toast.error("Escribe el valor del descuento");
    if (descMotivo.trim().length < 3) return toast.error("El motivo del descuento es obligatorio");
    const { error } = await supabase.from("pagos_descuentos").insert({
      profesor_id: profesorId, mes, anio, monto: v, motivo: descMotivo.trim(),
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Descuento registrado");
    setDescMonto(""); setDescMotivo("");
    onSaved();
  };

  const borrarDescuento = async (id: string) => {
    const { error } = await supabase.from("pagos_descuentos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onSaved();
  };

  const procesar = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Sube una imagen del comprobante");
    setArchivo(file);
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(file);
    });
    setPreview(dataUrl);
    setLeyendo(true);
    try {
      const d = await leer({ data: { imagenBase64: dataUrl } });
      if (d.monto) setMonto(String(d.monto));
      if (d.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) setFecha(d.fecha);
      if (d.numero_comprobante) setNumero(d.numero_comprobante);
      if (d.tipo_pago && ["transferencia","efectivo","cheque","deposito","otro"].includes(d.tipo_pago)) setTipoPago(d.tipo_pago);
      if (d.banco) {
        const c = cuentas.find((x) => (x.nombre + " " + x.numero_cuenta).toLowerCase().includes(d.banco!.toLowerCase().split(" ")[0]));
        if (c) setCuentaId(c.id);
      }
      if (d.observacion && !observacion) setObservacion(d.observacion);
      toast.success("Comprobante leído · revisa los datos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el comprobante");
    } finally {
      setLeyendo(false);
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (file) void procesar(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }); // eslint-disable-line

  const guardar = async () => {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Escribe el monto pagado");
    setGuardando(true);
    let archivoUrl: string | null = null;
    if (archivo) {
      if (esImagen(archivo)) {
        try {
          archivoUrl = await subirImagen(archivo, "adn/comprobantes");
        } catch (err) { setGuardando(false); return toast.error((err as Error).message); }
      } else {
        const ext = archivo.name.split(".").pop() || "jpg";
        const path = `${anio}/${String(mes).padStart(2, "0")}/${profesorId}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("comprobantes").upload(path, archivo, { upsert: false });
        if (upErr) { setGuardando(false); return toast.error(upErr.message); }
        archivoUrl = path;
      }
    }
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    const { error } = await supabase.from("pagos_comprobantes").insert({
      profesor_id: profesorId, mes, anio, fecha_pago: fecha, monto: valor,
      tipo_pago: tipoPago, numero_comprobante: numero.trim() || null,
      cuenta_id: cuentaId || null, banco_texto: cuenta ? `${cuenta.nombre} · ${cuenta.numero_cuenta}` : null,
      observacion: observacion.trim() || null, archivo_url: archivoUrl,
    });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Abono registrado");
    setMonto(""); setNumero(""); setObservacion(""); setArchivo(null); setPreview(null);
    onSaved();
  };

  const borrar = async (a: Abono) => {
    if (!confirm("¿Borrar este abono?")) return;
    const { error } = await supabase.from("pagos_comprobantes").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    if (a.archivo_url && !esUrlAbsoluta(a.archivo_url)) {
      await supabase.storage.from("comprobantes").remove([a.archivo_url]);
    }
    toast.success("Abono borrado");
    onSaved();
  };

  const verComprobante = async (a: Abono) => {
    if (!a.archivo_url) return;
    if (esUrlAbsoluta(a.archivo_url)) { window.open(a.archivo_url, "_blank", "noreferrer"); return; }
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(a.archivo_url, 3600);
    if (error || !data) return toast.error("No se pudo abrir el comprobante");
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-card border shadow-xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 rounded-t-2xl text-white" style={{ background: "linear-gradient(135deg,#166534,#15803d)" }}>
          <div className="min-w-0">
            <div className="font-semibold truncate">Pago a {profesorNombre}</div>
            <div className="text-xs opacity-85 truncate">Periodo {String(mes).padStart(2, "0")}/{anio}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center bg-white/20"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border-b">
          <Tot label="Total" value={total} color="var(--foreground)" />
          <Tot label="Abonado" value={abonado} color="#2563eb" />
          <Tot label="Descuentos" value={totalDesc} color="#d97706" />
          <Tot label="Saldo" value={saldo} color={saldo > 0 ? "#dc2626" : "#16a34a"} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-5">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha *"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
              <Campo label="Monto ($) *"><input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-right tabular-nums" /></Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tipo de pago *">
                <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="deposito">Depósito</option>
                  <option value="otro">Otro</option>
                </select>
              </Campo>
              <Campo label="N° comprobante"><input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. AB-2026-000074" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
            </div>
            <Campo label="Cuenta bancaria de origen">
              {cuentas.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2">Crea las cuentas con el botón “Cuentas bancarias” de la parte superior.</div>
              ) : (
                <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
                  <option value="">— Sin cuenta —</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} · {c.tipo} · N° {c.numero_cuenta}{c.titular ? ` · ${c.titular}` : ""}</option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo label="Observación"><textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Imagen del comprobante</div>
            <button
              onClick={() => inputRef.current?.click()}
              className="w-[168px] h-[168px] rounded-xl border-2 border-dashed grid place-items-center text-xs overflow-hidden"
              style={{ borderColor: "var(--violet)", background: "color-mix(in oklab, var(--violet) 6%, transparent)" }}>
              {preview ? (
                <img src={preview} alt="Comprobante subido" className="w-full h-full object-contain" />
              ) : leyendo ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo…</span>
              ) : (
                <span className="inline-flex flex-col items-center gap-1 text-muted-foreground px-3 text-center"><Upload className="w-4 h-4" /> Subir o pegar (Ctrl+V)</span>
              )}
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesar(f); }} />
            {leyendo && preview && <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Detectando monto, fecha y número…</div>}
            {montoNum > 0 && (
              <div className={`text-xs mt-2 font-medium ${coincide ? "text-emerald-600" : "text-amber-600"}`}>
                {coincide
                  ? "El monto del comprobante cuadra con el saldo de clases y sesiones."
                  : `El monto no cuadra con el saldo ($${saldo.toFixed(2)}). Revisa antes de guardar.`}
              </div>
            )}

            {/* Bonos y descuentos */}
            <div className="mt-4 rounded-xl border p-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bonos del mes · +${totalBonos.toFixed(2)}</div>
              {bonos.length === 0
                ? <div className="text-xs text-muted-foreground">Sin bonos. Agrégalos con el botón “Bono” del resumen.</div>
                : bonos.map((b) => (
                    <div key={b.id} className="flex justify-between text-xs">
                      <span className="truncate text-muted-foreground">{b.motivo || "Sin motivo"}</span>
                      <span className="font-semibold tabular-nums text-emerald-600">+${Number(b.monto).toFixed(2)}</span>
                    </div>
                  ))}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-2 border-t">Descuentos · −${totalDesc.toFixed(2)}</div>
              {descuentos.map((d) => (
                <div key={d.id} className="flex justify-between items-center text-xs gap-2">
                  <span className="truncate text-muted-foreground">{d.motivo}</span>
                  <span className="font-semibold tabular-nums text-red-600">−${Number(d.monto).toFixed(2)}</span>
                  <button onClick={() => borrarDescuento(d.id)} className="text-destructive opacity-70 hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <input type="number" step="0.01" min="0" value={descMonto} onChange={(e) => setDescMonto(e.target.value)}
                  placeholder="0.00" className="px-2 py-1.5 rounded-lg border bg-background text-xs text-right tabular-nums" />
                <input value={descMotivo} maxLength={140} onChange={(e) => setDescMotivo(e.target.value)}
                  placeholder="Motivo del descuento (obligatorio)" className="px-2 py-1.5 rounded-lg border bg-background text-xs" />
              </div>
              <button onClick={agregarDescuento} className="w-full px-3 py-1.5 rounded-lg border text-xs font-semibold">Agregar descuento</button>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-3 pb-5">
          <button onClick={guardar} disabled={guardando || leyendo}
            className="px-5 py-2 rounded-full bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">
            {guardando ? "Guardando…" : "+ Registrar abono"}
          </button>
          <button onClick={onClose} className="px-5 py-2 rounded-full border text-sm font-semibold">Cerrar</button>
        </div>

        {abonos.length > 0 && (
          <div className="border-t p-5 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Abonos registrados</div>
            {abonos.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm border rounded-xl p-3 flex-wrap">
                <div className="text-xs text-muted-foreground w-24">{a.fecha_pago}</div>
                <div className="font-semibold tabular-nums w-20">${Number(a.monto).toFixed(2)}</div>
                <div className="capitalize w-28">{a.tipo_pago}</div>
                <div className="flex-1 min-w-[140px] text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Landmark className="w-3 h-3" /> {a.banco_texto || "—"}{a.numero_comprobante ? ` · ${a.numero_comprobante}` : ""}
                </div>
                {a.archivo_url && <button onClick={() => verComprobante(a)} className="text-xs font-semibold underline">Ver comprobante</button>}
                <button onClick={() => borrar(a)} className="p-1.5 text-destructive opacity-70 hover:opacity-100" aria-label="Borrar abono"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tot({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border bg-background p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>${value.toFixed(2)}</div>
    </div>
  );
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
