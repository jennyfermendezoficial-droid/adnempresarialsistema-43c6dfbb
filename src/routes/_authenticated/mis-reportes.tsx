import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/mis-reportes")({ component: Page });

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [movs, setMovs] = useState<any[]>([]);
  const [acts, setActs] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    const ini = new Date(); ini.setDate(ini.getDate() - 30);
    const iniStr = ini.toISOString().slice(0, 10);
    Promise.all([
      supabase.from("ae_movimientos").select("*").eq("usuario_id", uid).gte("fecha", iniStr),
      supabase.from("ae_actividades").select("*").eq("usuario_id", uid).gte("fecha", iniStr),
    ]).then(([m, a]) => { setMovs(m.data ?? []); setActs(a.data ?? []); });
  }, [uid]);

  const sum = (arr: any[], f: (x: any) => number) => arr.reduce((s, x) => s + f(x), 0);
  const negIng = sum(movs.filter(m => m.ambito === "negocio" && m.tipo === "ingreso"), m => +m.monto);
  const negGas = sum(movs.filter(m => m.ambito === "negocio" && m.tipo === "gasto"), m => +m.monto);
  const casaIng = sum(movs.filter(m => m.ambito === "casa" && m.tipo === "ingreso"), m => +m.monto);
  const casaGas = sum(movs.filter(m => m.ambito === "casa" && m.tipo === "gasto"), m => +m.monto);
  const horas = sum(acts, a => a.duracion_min) / 60;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mi Agenda Emprendedora</div>
      <h1 className="text-3xl font-semibold mb-1">Reportes (últimos 30 días)</h1>
      <p className="text-sm text-muted-foreground mb-6">Resumen de tu tiempo, tu negocio y tu casa.</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Block title="Negocio">
          <Row label="Ingresos" v={`$${negIng.toFixed(2)}`} color="#7A8B6F" />
          <Row label="Gastos" v={`$${negGas.toFixed(2)}`} color="#C2756B" />
          <Row label="Utilidad" v={`$${(negIng - negGas).toFixed(2)}`} color="#7C6BFF" bold />
        </Block>
        <Block title="Casa">
          <Row label="Ingresos" v={`$${casaIng.toFixed(2)}`} color="#7A8B6F" />
          <Row label="Gastos" v={`$${casaGas.toFixed(2)}`} color="#C2756B" />
          <Row label="Balance" v={`$${(casaIng - casaGas).toFixed(2)}`} color="#7C6BFF" bold />
        </Block>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="text-sm font-semibold mb-1">Tu tiempo</div>
        <div className="text-3xl font-semibold tabular-nums" style={{ color: "var(--violet)" }}>{horas.toFixed(1)} h</div>
        <div className="text-xs text-muted-foreground mt-0.5">en {acts.length} actividades agendadas</div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-5"><div className="text-sm font-semibold mb-3">{title}</div><div className="space-y-1.5">{children}</div></div>;
}
function Row({ label, v, color, bold }: { label: string; v: string; color: string; bold?: boolean }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${bold ? "font-semibold" : ""}`} style={{ color }}>{v}</span></div>;
}
