import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { generarReporteMensualPDF, downloadBlob, type MovRow, type ActRow } from "@/lib/pdf-reports";
import { listaMeses } from "@/lib/pagos-export";
import { AeHeader } from "@/components/AeHeader";

export const Route = createFileRoute("/_authenticated/mis-reportes")({ component: Page });

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function Page() {
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [movs, setMovs] = useState<MovRow[]>([]);
  const [acts, setActs] = useState<ActRow[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ negocio_nombre: string | null; negocio_foto_url: string | null }>({ negocio_nombre: null, negocio_foto_url: null });

  const anio = cursor.getFullYear();
  const mes = cursor.getMonth();
  const ini = new Date(anio, mes, 1).toISOString().slice(0, 10);
  const fin = new Date(anio, mes + 1, 0).toISOString().slice(0, 10);

  useEffect(() => {
    if (!uid) return;
    Promise.all([
      supabase.from("ae_movimientos").select("*").eq("usuario_id", uid).gte("fecha", ini).lte("fecha", fin),
      supabase.from("ae_actividades").select("*").eq("usuario_id", uid).gte("fecha", ini).lte("fecha", fin),
      supabase.from("profiles").select("negocio_nombre,negocio_foto_url").eq("id", uid).maybeSingle(),
    ]).then(([m, a, p]) => {
      setMovs((m.data as MovRow[]) ?? []);
      setActs((a.data as ActRow[]) ?? []);
      setMeta((p.data as never) ?? { negocio_nombre: null, negocio_foto_url: null });
    });
  }, [uid, ini, fin]);

  const tot = useMemo(() => {
    const f = (amb: string, tipo: string) => movs.filter(m => m.ambito === amb && m.tipo === tipo).reduce((s, m) => s + Number(m.monto), 0);
    return {
      negIng: f("negocio", "ingreso"), negGas: f("negocio", "gasto"),
      casaIng: f("casa", "ingreso"), casaGas: f("casa", "gasto"),
      horas: acts.reduce((s, a) => s + a.duracion_min, 0) / 60,
    };
  }, [movs, acts]);

  // Horas por semana del mes (S1..S4/S5)
  const semanas = useMemo(() => {
    const buckets: number[] = [0, 0, 0, 0, 0];
    acts.forEach(a => {
      const dia = new Date(a.fecha + "T00:00").getDate();
      const idx = Math.min(4, Math.floor((dia - 1) / 7));
      buckets[idx] += a.duracion_min / 60;
    });
    const ultima = new Date(anio, mes + 1, 0).getDate();
    const n = ultima > 28 ? 5 : 4;
    return buckets.slice(0, n);
  }, [acts, anio, mes]);
  const maxSem = Math.max(1, ...semanas);
  const horasTotal = tot.horas;
  const horasMaxMes = new Date(anio, mes + 1, 0).getDate() * 8; // 8h/día referencia
  const sinRegistrar = Math.max(0, horasMaxMes - horasTotal);

  const utilMes = (tot.negIng - tot.negGas) + (tot.casaIng - tot.casaGas);

  const descargar = async (rango: "diario" | "semanal" | "mensual") => {
    if (downloading) return;
    setDownloading(rango);
    try {
      let movsF = movs, actsF = acts, sufijo = `${MESES[mes]}_${anio}`;
      const hoy = new Date();
      if (rango === "diario") {
        const iso = hoy.toISOString().slice(0, 10);
        movsF = movs.filter(m => m.fecha === iso);
        actsF = acts.filter(a => a.fecha === iso);
        sufijo = `Diario_${iso}`;
      } else if (rango === "semanal") {
        const dow = (hoy.getDay() + 6) % 7;
        const lun = new Date(hoy); lun.setDate(hoy.getDate() - dow); lun.setHours(0,0,0,0);
        const dom = new Date(lun); dom.setDate(lun.getDate() + 6);
        const i = lun.toISOString().slice(0,10), f = dom.toISOString().slice(0,10);
        movsF = movs.filter(m => m.fecha >= i && m.fecha <= f);
        actsF = acts.filter(a => a.fecha >= i && a.fecha <= f);
        sufijo = `Semanal_${i}_${f}`;
      }
      const blob = await generarReporteMensualPDF({
        anio, mes,
        nombreUsuario: profile?.nombre_completo || profile?.email || "Usuaria",
        nombreNegocio: meta.negocio_nombre,
        fotoNegocioUrl: meta.negocio_foto_url,
        avatarUrl: profile?.avatar_url || null,
        movimientos: movsF, actividades: actsF,
      });
      downloadBlob(blob, `Reporte_ADN_${sufijo}.pdf`);
      toast.success("PDF descargado");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error generando PDF";
      toast.error(msg);
    } finally {
      setDownloading(null);
    }
  };

  const cambiar = (n: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); setCursor(d); };

  return (
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
      <AeHeader />

      {/* Selector de mes */}
      <div className="ae-card p-4 mb-5 flex items-center justify-between">
        <button onClick={() => cambiar(-1)} className="ae-btn-ghost !p-2 !px-3"><ChevronLeft className="w-4 h-4"/></button>
        <div className="text-center">
          <div className="ae-eyebrow">Reporte de</div>
          <select
            value={`${anio}-${mes}`}
            onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); setCursor(new Date(a, m, 1)); }}
            className="text-xl font-semibold capitalize bg-transparent text-center outline-none cursor-pointer"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {listaMeses().map((o) => {
              const [a, m] = o.value.split("-").map(Number);
              return <option key={o.value} value={`${a}-${m - 1}`}>{o.label}</option>;
            })}
          </select>
        </div>
        <button onClick={() => cambiar(1)} className="ae-btn-ghost !p-2 !px-3"><ChevronRight className="w-4 h-4"/></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <Block title="Mi negocio">
          <Row label="Ingresos" v={`$${tot.negIng.toFixed(2)}`} color="var(--ae-sage)" />
          <Row label="Gastos" v={`$${tot.negGas.toFixed(2)}`} color="var(--ae-rose)" />
          <Row label="Utilidad" v={`$${(tot.negIng - tot.negGas).toFixed(2)}`} color="var(--ae-gold-deep)" bold />
        </Block>
        <Block title="Mi casa">
          <Row label="Ingresos" v={`$${tot.casaIng.toFixed(2)}`} color="var(--ae-sage)" />
          <Row label="Gastos" v={`$${tot.casaGas.toFixed(2)}`} color="var(--ae-rose)" />
          <Row label="Balance" v={`$${(tot.casaIng - tot.casaGas).toFixed(2)}`} color="var(--ae-gold-deep)" bold />
        </Block>
      </div>

      {/* Tiempo del mes */}
      <div className="ae-card p-5 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ae-ink)" }}/>
          <div className="text-sm font-semibold">Tiempo sin registrar</div>
        </div>
        <div className="text-lg tabular-nums" style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>{sinRegistrar.toFixed(0)} h</div>
      </div>

      {/* Barras semanales */}
      <div className="ae-card p-4 mb-3">
        <div className="flex items-end justify-around h-32 gap-2">
          {semanas.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="w-full rounded-t-lg" style={{ background: "var(--ae-gold)", height: `${Math.max(8, (h / maxSem) * 100)}%`, minHeight: 8 }}/>
              <div className="text-[10px] mt-1 font-semibold" style={{ color: "var(--ae-ink-soft)" }}>S{i+1}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tres descargas */}
      <div className="ae-card mb-5 overflow-hidden">
        {([
          { k: "diario" as const, label: "Reporte diario", sub: "PDF · hoy" },
          { k: "semanal" as const, label: "Reporte semanal", sub: "PDF · esta semana" },
          { k: "mensual" as const, label: "Reporte mensual", sub: `PDF · ${MESES[mes].toLowerCase()} ${anio}` },
        ]).map((r, i) => (
          <button key={r.k} onClick={() => descargar(r.k)} disabled={downloading !== null}
            className={`w-full flex items-center justify-between p-4 text-left hover:bg-[var(--ae-paper)] disabled:opacity-60 ${i > 0 ? "border-t" : ""}`}
            style={{ borderColor: "var(--ae-line)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "var(--ae-gold-deep)" }} />
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{r.label}</div>
                <div className="text-[11px]" style={{ color: "var(--ae-ink-soft)" }}>{r.sub}</div>
              </div>
            </div>
            <span className="text-sm font-semibold flex items-center gap-1" style={{ color: "var(--ae-gold-deep)" }}>
              <Download className="w-3.5 h-3.5"/> {downloading === r.k ? "Generando…" : "Descargar"}
            </span>
          </button>
        ))}
      </div>

      {/* Resultado del mes */}
      <div className="ae-eyebrow mb-2">💼 Negocio + Casa — {MESES[mes].toLowerCase()} {anio}</div>
      <div className="ae-balance">
        <div className="ae-balance-label">Resultado del mes</div>
        <div className="ae-balance-value" style={{ color: utilMes >= 0 ? "#A8D547" : "#E94B8C" }}>
          {utilMes >= 0 ? "+" : "−"} ${Math.abs(utilMes).toFixed(2)}
        </div>
        <div className="ae-balance-grid">
          <div><small>Negocio</small><strong>${(tot.negIng - tot.negGas).toFixed(2)}</strong></div>
          <div><small>Casa</small><strong>${(tot.casaIng - tot.casaGas).toFixed(2)}</strong></div>
        </div>
      </div>

      {!meta.negocio_foto_url && (
        <div className="mt-4 text-xs rounded-xl border border-dashed p-3" style={{ color: "var(--ae-ink-soft)", borderColor: "var(--ae-line)" }}>
          💡 Sube la <b>foto y nombre de tu negocio</b> desde <b>Mi perfil</b> para que salga en la portada del PDF.
        </div>
      )}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="ae-card p-5"><div className="ae-eyebrow mb-3">{title}</div><div className="space-y-1.5">{children}</div></div>;
}
function Row({ label, v, color, bold }: { label: string; v: string; color: string; bold?: boolean }) {
  return <div className="flex justify-between text-sm"><span style={{ color: "var(--ae-ink-soft)" }}>{label}</span><span className="tabular-nums" style={{ color, fontFamily: bold ? "Fraunces, serif" : undefined, fontWeight: bold ? 700 : 500 }}>{v}</span></div>;
}
