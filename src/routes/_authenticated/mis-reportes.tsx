import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { generarReporteMensualPDF, downloadBlob, type MovRow, type ActRow } from "@/lib/pdf-reports";

export const Route = createFileRoute("/_authenticated/mis-reportes")({ component: Page });

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function Page() {
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [movs, setMovs] = useState<MovRow[]>([]);
  const [acts, setActs] = useState<ActRow[]>([]);
  const [downloading, setDownloading] = useState(false);
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

  const descargar = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await generarReporteMensualPDF({
        anio, mes,
        nombreUsuario: profile?.nombre_completo || profile?.email || "Usuaria",
        nombreNegocio: meta.negocio_nombre,
        fotoNegocioUrl: meta.negocio_foto_url,
        avatarUrl: profile?.avatar_url || null,
        movimientos: movs, actividades: acts,
      });
      downloadBlob(blob, `Reporte_ADN_${MESES[mes]}_${anio}.pdf`);
      toast.success("PDF descargado");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error generando PDF";
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  const cambiar = (n: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); setCursor(d); };

  return (
    <div className="ae-app">
      <div className="max-w-[480px] mx-auto px-5 pt-8 pb-24">
      <div className="ae-eyebrow mb-1">Mi Agenda Emprendedora</div>
      <h1 className="ae-h1 mb-1">Reportes <em>mensuales</em></h1>
      <p className="ae-sub mb-5">Descarga tu reporte profesional, mes por mes.</p>

      {/* Selector de mes */}
      <div className="ae-card p-4 mb-5 flex items-center justify-between">
        <button onClick={() => cambiar(-1)} className="ae-btn-ghost !p-2 !px-3"><ChevronLeft className="w-4 h-4"/></button>
        <div className="text-center">
          <div className="ae-eyebrow">Reporte de</div>
          <div className="text-xl font-semibold capitalize" style={{ fontFamily: "Fraunces, serif" }}>{MESES[mes]} {anio}</div>
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

      <div className="ae-card p-5 mb-6">
        <div className="ae-eyebrow mb-1">Tu tiempo este mes</div>
        <div className="text-3xl tabular-nums" style={{ fontFamily: "Fraunces, serif", color: "var(--ae-gold-deep)", fontWeight: 600 }}>{tot.horas.toFixed(1)} h</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--ae-ink-soft)" }}>en {acts.length} actividades agendadas</div>
      </div>

      <div className="ae-balance">
        <div className="flex items-start gap-4 relative">
          <FileText className="w-10 h-10 opacity-90 flex-shrink-0" style={{ color: "var(--ae-gold)" }} />
          <div className="flex-1">
            <div className="text-lg font-semibold mb-1" style={{ fontFamily: "Fraunces, serif" }}>Reporte completo {MESES[mes]} {anio}</div>
            <div className="text-sm opacity-90 mb-4">Portada con tu marca, foto de tu negocio, resumen ejecutivo, KPIs y tablas detalladas.</div>
            <button onClick={descargar} disabled={downloading}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-60"
              style={{ background: "var(--ae-gold)", color: "var(--ae-ink)" }}>
              <Download className="w-4 h-4" />
              {downloading ? "Generando PDF…" : "Descargar PDF"}
            </button>
          </div>
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
