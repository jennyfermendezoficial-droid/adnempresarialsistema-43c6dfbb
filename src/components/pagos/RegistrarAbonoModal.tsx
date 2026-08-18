import { useEffect, useRef, useState } from "react";
import { X, Upload, Loader2, Trash2, Landmark, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useServerFn } from "@tanstack/react-start";
import { leerComprobante } from "@/lib/comprobante-ocr.functions";

export interface CuentaEmpresa {
  id: string; nombre: string; tipo: string; numero_cuenta: string; titular: string | null; activo: boolean; imagen_url?: string | null;
}
export interface Abono {
  id: string; profesor_id: string; mes: number; anio: number; fecha_pago: string; monto: number;
  tipo_pago: string; numero_comprobante: string | null; cuenta_id: string | null; banco_texto: string | null;
  observacion: string | null; archivo_url: string | null;
  datos_ocr?: Json | null; es_descuento?: boolean; motivo_descuento?: string | null;
}

type DestinoProfesor = {
  avatarUrl: string | null;
  cedula: string | null;
  banco: string | null;
  bancoLogo: string | null;
  tipoCuenta: string | null;
  numeroCuenta: string | null;
  titular: string | null;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

export function RegistrarAbonoModal({
  profesorId, profesorNombre, mes, anio, total, abonos, cuentas, onClose, onSaved,
}: {
  profesorId: string; profesorNombre: string; mes: number; anio: number; total: number;
  abonos: Abono[]; cuentas: CuentaEmpresa[];
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
  const [datosOcr, setDatosOcr] = useState<Json | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [descuentoMonto, setDescuentoMonto] = useState("");
  const [descuentoMotivo, setDescuentoMotivo] = useState("");
  const [guardandoDescuento, setGuardandoDescuento] = useState(false);
  const [destino, setDestino] = useState<DestinoProfesor>({ avatarUrl: null, cedula: null, banco: null, bancoLogo: null, tipoCuenta: null, numeroCuenta: null, titular: null });
  const inputRef = useRef<HTMLInputElement>(null);

  const pagos = abonos.filter((a) => !a.es_descuento);
  const descuentos = abonos.filter((a) => a.es_descuento);
  const abonado = pagos.reduce((a, b) => a + Number(b.monto), 0);
  const descuentosTotal = descuentos.reduce((a, b) => a + Number(b.monto), 0);
  const saldo = Math.max(0, Math.round((total - abonado - descuentosTotal) * 100) / 100);
  const cuentaOrigen = cuentas.find((c) => c.id === cuentaId) ?? null;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: perfil } = await supabase.from("profiles").select("avatar_url").eq("id", profesorId).maybeSingle();
      if (!cancelado && perfil) setDestino((d) => ({ ...d, avatarUrl: (perfil as { avatar_url: string | null }).avatar_url }));

      // Estas tablas se crean en la rama de perfiles. Si todavía no se ha integrado esa rama,
      // el modal sigue funcionando con la información existente sin bloquear Pagos.
      try {
        const { data: datos } = await supabase.from("profesor_datos").select("cedula").eq("usuario_id", profesorId).maybeSingle();
        const { data: cuenta } = await supabase.from("profesor_cuentas_bancarias")
          .select("tipo_cuenta,numero_cuenta,titular,banco_id")
          .eq("usuario_id", profesorId).eq("activo", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (cancelado) return;
        if (datos) setDestino((d) => ({ ...d, cedula: (datos as { cedula: string | null }).cedula }));
        if (cuenta) {
          const c = cuenta as { tipo_cuenta: string | null; numero_cuenta: string | null; titular: string | null; banco_id: string | null };
          let banco: string | null = null;
          let bancoLogo: string | null = null;
          if (c.banco_id) {
            const { data: b } = await supabase.from("bancos_catalogo").select("nombre,logo_url").eq("id", c.banco_id).maybeSingle();
            if (b) { banco = (b as { nombre: string }).nombre; bancoLogo = (b as { logo_url: string | null }).logo_url; }
          }
          if (!cancelado) setDestino((d) => ({ ...d, banco, bancoLogo, tipoCuenta: c.tipo_cuenta, numeroCuenta: c.numero_cuenta, titular: c.titular }));
        }
      } catch {
        // Compatibilidad mientras las ramas todavía están separadas.
      }
    })();
    return () => { cancelado = true; };
  }, [profesorId]);

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
      setDatosOcr(JSON.parse(JSON.stringify(d)) as Json);
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
      setDatosOcr(null);
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
      const ext = archivo.name.split(".").pop() || "jpg";
      const path = `${anio}/${String(mes).padStart(2, "0")}/${profesorId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("comprobantes").upload(path, archivo, { upsert: false });
      if (upErr) { setGuardando(false); return toast.error(upErr.message); }
      archivoUrl = path;
    }
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    const { error } = await supabase.from("pagos_comprobantes").insert({
      profesor_id: profesorId, mes, anio, fecha_pago: fecha, monto: valor,
      tipo_pago: tipoPago, numero_comprobante: numero.trim() || null,
      cuenta_id: cuentaId || null, banco_texto: cuenta ? `${cuenta.nombre} · ${cuenta.numero_cuenta}` : null,
      observacion: observacion.trim() || null, archivo_url: archivoUrl,
      datos_ocr: datosOcr ?? {}, es_descuento: false, motivo_descuento: null,
    } as never);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Abono registrado");
    setMonto(""); setNumero(""); setObservacion(""); setArchivo(null); setPreview(null); setDatosOcr(null);
    onSaved();
  };

  const crearDescuento = async () => {
    const valor = Number(descuentoMonto);
    const motivo = descuentoMotivo.trim();
    if (!Number.isFinite(valor) || valor <= 0) return toast.error("Escribe el monto del descuento");
    if (!motivo) return toast.error("Escribe el motivo del descuento");
    if (valor > saldo + 0.009) return toast.error("El descuento no puede superar el saldo pendiente");
    setGuardandoDescuento(true);
    const { error } = await supabase.from("pagos_comprobantes").insert({
      profesor_id: profesorId, mes, anio, fecha_pago: hoyISO(), monto: valor,
      tipo_pago: "descuento", numero_comprobante: null, cuenta_id: null, banco_texto: null,
      observacion: motivo, archivo_url: null, datos_ocr: {},
      es_descuento: true, motivo_descuento: motivo,
    } as never);
    setGuardandoDescuento(false);
    if (error) return toast.error(error.message);
    setDescuentoMonto("");
    setDescuentoMotivo("");
    toast.success("Descuento aplicado al mes");
    onSaved();
  };

  const borrar = async (a: Abono) => {
    if (!confirm(a.es_descuento ? "¿Borrar este descuento?" : "¿Borrar este abono?")) return;
    const { error } = await supabase.from("pagos_comprobantes").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    if (a.archivo_url) await supabase.storage.from("comprobantes").remove([a.archivo_url]);
    toast.success(a.es_descuento ? "Descuento borrado" : "Abono borrado");
    onSaved();
  };

  const verComprobante = async (a: Abono) => {
    if (!a.archivo_url) return;
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(a.archivo_url, 3600);
    if (error || !data) return toast.error("No se pudo abrir el comprobante");
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-card border shadow-xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 rounded-t-2xl text-white" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
          <div className="min-w-0">
            <div className="font-semibold truncate">Pago a {profesorNombre}</div>
            <div className="text-xs opacity-85 truncate">Periodo {String(mes).padStart(2, "0")}/{anio}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center bg-white/20"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-3 p-4 border-b bg-muted/20">
          <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
            {destino.avatarUrl ? <img src={destino.avatarUrl} alt={profesorNombre} className="w-14 h-14 rounded-full object-cover border" /> : <div className="w-14 h-14 rounded-full grid place-items-center bg-violet-gradient text-white"><UserRound className="w-6 h-6" /></div>}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cuenta destino · Profesor</div>
              <div className="font-semibold truncate">{profesorNombre}</div>
              <div className="text-xs text-muted-foreground">Cédula: {destino.cedula || "Sin registrar"}</div>
              <div className="text-xs text-muted-foreground truncate">{destino.banco ? `${destino.banco} · ${destino.tipoCuenta || "Cuenta"} · ${destino.numeroCuenta || "Sin número"}` : "Datos bancarios pendientes de registrar"}</div>
              {destino.titular && <div className="text-xs text-muted-foreground truncate">Titular: {destino.titular}</div>}
            </div>
            {destino.bancoLogo && <img src={destino.bancoLogo} alt={destino.banco || "Banco"} className="w-12 h-12 rounded-xl object-contain border bg-white p-1" />}
          </div>
          <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
            {cuentaOrigen?.imagen_url ? <img src={cuentaOrigen.imagen_url} alt={cuentaOrigen.nombre} className="w-14 h-14 rounded-xl object-contain border bg-white p-1" /> : <div className="w-14 h-14 rounded-xl grid place-items-center bg-muted"><Landmark className="w-6 h-6" /></div>}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cuenta de origen · Administración</div>
              <div className="font-semibold truncate">{cuentaOrigen?.nombre || "Selecciona una cuenta"}</div>
              <div className="text-xs text-muted-foreground truncate">{cuentaOrigen ? `${cuentaOrigen.tipo} · ${cuentaOrigen.numero_cuenta}${cuentaOrigen.titular ? ` · ${cuentaOrigen.titular}` : ""}` : "Sin cuenta seleccionada"}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border-b">
          <Tot label="Total" value={total} color="var(--foreground)" />
          <Tot label="Abonado" value={abonado} color="#2563eb" />
          <Tot label="Descuentos" value={descuentosTotal} color="#d97706" />
          <Tot label="Saldo" value={saldo} color={saldo > 0 ? "#dc2626" : "#16a34a"} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-5">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Fecha *"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
              <Campo label="Monto ($) *"><input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-right tabular-nums" /></Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tipo de pago *"><select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="deposito">Depósito</option><option value="otro">Otro</option></select></Campo>
              <Campo label="N° comprobante"><input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. AB-2026-000074" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
            </div>
            <Campo label="Cuenta bancaria de origen">
              {cuentas.length === 0 ? <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2">Crea tus cuentas en la pestaña “Cuentas bancarias”.</div> : <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm"><option value="">— Sin cuenta —</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.tipo} · N° {c.numero_cuenta}{c.titular ? ` · ${c.titular}` : ""}</option>)}</select>}
            </Campo>

            <div className="rounded-xl border p-3 space-y-2" style={{ background: "color-mix(in oklab, #d97706 5%, transparent)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Descuento del mes</div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <input type="number" step="0.01" min="0" value={descuentoMonto} onChange={(e) => setDescuentoMonto(e.target.value)} placeholder="$ 0.00" className="px-3 py-2 rounded-lg border bg-background text-sm text-right" />
                <input value={descuentoMotivo} onChange={(e) => setDescuentoMotivo(e.target.value)} placeholder="Motivo del descuento" className="px-3 py-2 rounded-lg border bg-background text-sm" />
              </div>
              <button onClick={crearDescuento} disabled={guardandoDescuento || saldo <= 0} className="w-full px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50">{guardandoDescuento ? "Guardando…" : "+ Aplicar descuento"}</button>
              {descuentos.map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-xs rounded-lg border bg-background px-3 py-2">
                  <span className="font-semibold tabular-nums">-${Number(d.monto).toFixed(2)}</span>
                  <span className="flex-1 text-muted-foreground truncate">{d.motivo_descuento || d.observacion || "Sin motivo"}</span>
                  <button onClick={() => borrar(d)} className="text-destructive opacity-70 hover:opacity-100" aria-label="Borrar descuento"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            <Campo label="Observación"><textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" /></Campo>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 text-center">Imagen del comprobante</div>
            <button onClick={() => inputRef.current?.click()} className="w-full max-w-[240px] aspect-square mx-auto rounded-xl border-2 border-dashed grid place-items-center text-sm overflow-hidden p-2" style={{ borderColor: "var(--violet)", background: "color-mix(in oklab, var(--violet) 6%, transparent)" }}>
              {preview ? <img src={preview} alt="Comprobante subido" className="w-full h-full object-contain" /> : leyendo ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leyendo…</span> : <span className="inline-flex flex-col items-center gap-2 text-muted-foreground text-center"><Upload className="w-5 h-5" /> Subir o pegar comprobante<br />con Ctrl+V</span>}
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesar(f); }} />
            {leyendo && preview && <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Detectando monto, fecha y número…</div>}
          </div>
        </div>

        <div className="flex justify-center gap-3 pb-5">
          <button onClick={guardar} disabled={guardando || leyendo} className="px-5 py-2 rounded-full bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">{guardando ? "Guardando…" : "+ Registrar abono"}</button>
          <button onClick={onClose} className="px-5 py-2 rounded-full border text-sm font-semibold">Cerrar</button>
        </div>

        {pagos.length > 0 && <div className="border-t p-5 space-y-2"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Abonos registrados</div>{pagos.map((a) => <div key={a.id} className="flex items-center gap-3 text-sm border rounded-xl p-3 flex-wrap"><div className="text-xs text-muted-foreground w-24">{a.fecha_pago}</div><div className="font-semibold tabular-nums w-20">${Number(a.monto).toFixed(2)}</div><div className="capitalize w-28">{a.tipo_pago}</div><div className="flex-1 min-w-[140px] text-xs text-muted-foreground inline-flex items-center gap-1"><Landmark className="w-3 h-3" /> {a.banco_texto || "—"}{a.numero_comprobante ? ` · ${a.numero_comprobante}` : ""}</div>{a.archivo_url && <button onClick={() => verComprobante(a)} className="text-xs font-semibold underline">Ver comprobante</button>}<button onClick={() => borrar(a)} className="p-1.5 text-destructive opacity-70 hover:opacity-100" aria-label="Borrar abono"><Trash2 className="w-4 h-4" /></button></div>)}</div>}
      </div>
    </div>
  );
}

function Tot({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-xl border bg-background p-3 text-center"><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div><div className="text-lg font-bold tabular-nums" style={{ color }}>${value.toFixed(2)}</div></div>;
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>{children}</div>;
}
