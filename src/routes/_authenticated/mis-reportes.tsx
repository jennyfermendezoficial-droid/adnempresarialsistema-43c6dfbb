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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mi Agenda Emprendedora</div>
      <h1 className="text-3xl font-semibold mb-1">Reportes mensuales</h1>
      <p className="text-sm text-muted-foreground mb-6">Descarga el reporte profesional de tu negocio y casa, mes por mes.</p>

      {/* Selector de mes */}
      <div className="rounded-2xl border bg-card p-4 mb-5 flex items-center justify-between">
        <button onClick={() => cambiar(-1)} className="p-2 rounded-lg border hover:bg-muted"><ChevronLeft className="w-4 h-4"/></button>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reporte de</div>
          <div className="text-xl font-semibold capitalize">{MESES[mes]} {anio}</div>
        </div>
        <button onClick={() => cambiar(1)} className="p-2 rounded-lg border hover:bg-muted"><ChevronRight className="w-4 h-4"/></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <Block title="Mi negocio">
          <Row label="Ingresos" v={`$${tot.negIng.toFixed(2)}`} color="#7A8B6F" />
          <Row label="Gastos" v={`$${tot.negGas.toFixed(2)}`} color="#C2756B" />
          <Row label="Utilidad" v={`$${(tot.negIng - tot.negGas).toFixed(2)}`} color="#7C6BFF" bold />
        </Block>
        <Block title="Mi casa">
          <Row label="Ingresos" v={`$${tot.casaIng.toFixed(2)}`} color="#7A8B6F" />
          <Row label="Gastos" v={`$${tot.casaGas.toFixed(2)}`} color="#C2756B" />
          <Row label="Balance" v={`$${(tot.casaIng - tot.casaGas).toFixed(2)}`} color="#7C6BFF" bold />
        </Block>
      </div>

      <div className="rounded-2xl border bg-card p-5 mb-6">
        <div className="text-sm font-semibold mb-1">Tu tiempo este mes</div>
        <div className="text-3xl font-semibold tabular-nums" style={{ color: "var(--violet)" }}>{tot.horas.toFixed(1)} h</div>
        <div className="text-xs text-muted-foreground mt-0.5">en {acts.length} actividades agendadas</div>
      </div>

      <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
        <div className="flex items-start gap-4">
          <FileText className="w-10 h-10 opacity-90 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-lg font-semibold mb-1">Reporte completo {MESES[mes]} {anio}</div>
            <div className="text-sm opacity-90 mb-4">
              Incluye portada con tu marca, foto de tu negocio, resumen ejecutivo, KPIs, tablas detalladas de casa, negocio y agenda. Listo para imprimir o enviar.
            </div>
            <button
              onClick={descargar}
              disabled={downloading}
              className="px-4 py-2.5 rounded-xl bg-white font-semibold text-sm flex items-center gap-2 disabled:opacity-60"
              style={{ color: "var(--violet-2)" }}
            >
              <Download className="w-4 h-4" />
              {downloading ? "Generando PDF…" : "Descargar PDF"}
            </button>
          </div>
        </div>
      </div>

      {!meta.negocio_foto_url && (
        <div className="mt-4 text-xs text-muted-foreground rounded-xl border border-dashed p-3">
          💡 Tip: sube la <b>foto y nombre de tu negocio</b> desde <b>Mi perfil</b> para que aparezcan en la portada del PDF.
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-5"><div className="text-sm font-semibold mb-3">{title}</div><div className="space-y-1.5">{children}</div></div>;
}
function Row({ label, v, color, bold }: { label: string; v: string; color: string; bold?: boolean }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${bold ? "font-semibold" : ""}`} style={{ color }}>{v}</span></div>;
}
