import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mi-calendario")({ component: Page });

function Page() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [mapDots, setMapDots] = useState<Record<string, string[]>>({});

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Lun=0

  useEffect(() => {
    if (!uid) return;
    const ini = firstDay.toISOString().slice(0, 10);
    const fin = lastDay.toISOString().slice(0, 10);
    supabase.from("ae_actividades").select("fecha,color").eq("usuario_id", uid).gte("fecha", ini).lte("fecha", fin)
      .then(({ data }) => {
        const m: Record<string, string[]> = {};
        (data ?? []).forEach((a: any) => { (m[a.fecha] ??= []).push(a.color || "#7C6BFF"); });
        setMapDots(m);
      });
  }, [uid, year, month]); // eslint-disable-line

  const dias = useMemo(() => {
    const cells: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, key: "e" + i });
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dt = new Date(year, month, d);
      cells.push({ date: dt, key: dt.toISOString() });
    }
    return cells;
  }, [year, month, startOffset, lastDay]);

  const cambiar = (n: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); setCursor(d); };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mi Agenda Emprendedora</div>
      <h1 className="text-3xl font-semibold mb-5">Calendario mensual</h1>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => cambiar(-1)} className="p-2 rounded-lg border"><ChevronLeft className="w-4 h-4"/></button>
        <div className="text-lg font-semibold capitalize">{cursor.toLocaleDateString("es-EC", { month: "long", year: "numeric" })}</div>
        <button onClick={() => cambiar(1)} className="p-2 rounded-lg border"><ChevronRight className="w-4 h-4"/></button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["L","M","M","J","V","S","D"].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dias.map(({ date, key }) => {
          if (!date) return <div key={key} className="aspect-square" />;
          const iso = date.toISOString().slice(0, 10);
          const dots = mapDots[iso] || [];
          const hoy = iso === new Date().toISOString().slice(0, 10);
          return (
            <Link key={key} to="/mi-agenda" search={{}}
              className="aspect-square rounded-lg border bg-card p-2 flex flex-col hover:border-violet transition"
              style={hoy ? { borderColor: "var(--violet)", background: "rgba(124,107,255,.08)" } : {}}
            >
              <div className="text-sm font-semibold">{date.getDate()}</div>
              <div className="flex gap-0.5 mt-auto flex-wrap">
                {dots.slice(0, 4).map((c, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
