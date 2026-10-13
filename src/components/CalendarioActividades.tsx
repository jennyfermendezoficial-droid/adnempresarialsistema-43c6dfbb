import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type ActCal = { id: string; fecha: string; titulo: string; descripcion: string | null; horas: number; archivo_path: string | null; archivo_tipo?: string | null; hora_inicio?: string | null; hora_fin?: string | null; valor?: number | null; observacion_lider?: string | null };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const hhmm = (a: ActCal) => (a.hora_inicio && a.hora_fin ? `${a.hora_inicio.slice(0, 5)}–${a.hora_fin.slice(0, 5)}` : "");
export const fechaLarga = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };

/** Calendario semanal / mensual de actividades. Si `editable`, el líder puede poner valor y observación a cada actividad. */
export function CalendarioActividades({ acts, mes, anio, editable, porActividad, valorDefecto = 0, onChange }: {
  acts: ActCal[]; mes: number; anio: number; editable?: boolean; porActividad?: boolean; valorDefecto?: number; onChange?: () => Promise<void>;
}) {
  const [vista, setVista] = useState<"semana" | "mes">("semana");
  const [semana, setSemana] = useState(0);
  const [finde, setFinde] = useState(false);
  const [dia, setDia] = useState<string | null>(null);

  const semanas = useMemo(() => {
    const first = new Date(anio, mes - 1, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const out: string[][] = [];
    const cur = new Date(start);
    while (cur.getMonth() <= mes - 1 && cur.getFullYear() <= anio || out.length === 0) {
      const w: string[] = []; for (let i = 0; i < 7; i++) { w.push(ymd(cur)); cur.setDate(cur.getDate() + 1); }
      out.push(w);
      if (cur.getMonth() !== mes - 1) break;
    }
    return out;
  }, [mes, anio]);
  const verFinde = finde || acts.some((a) => { const d = new Date(a.fecha + "T12:00"); return d.getDay() === 0 || d.getDay() === 6; });
  const filas = vista === "mes" ? semanas : [semanas[Math.min(semana, semanas.length - 1)]];
  const enMes = (d: string) => Number(d.slice(5, 7)) === mes;

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <b>Calendario de actividades</b>
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {(["semana", "mes"] as const).map((v) => <button key={v} onClick={() => setVista(v)} className={`px-3 py-1.5 ${vista === v ? "bg-primary text-primary-foreground" : ""}`}>{v === "semana" ? "Semanal" : "Mensual"}</button>)}
          </div>
          {vista === "semana" && <>
            <button onClick={() => setSemana(Math.max(0, semana - 1))} className="p-1.5 rounded-lg border"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs">Semana {semana + 1} de {semanas.length}</span>
            <button onClick={() => setSemana(Math.min(semanas.length - 1, semana + 1))} className="p-1.5 rounded-lg border"><ChevronRight className="w-4 h-4" /></button>
          </>}
        </div>
        <label className="text-xs inline-flex gap-1 items-center"><input type="checkbox" checked={verFinde} onChange={(e) => setFinde(e.target.checked)} />Sábado y domingo (opcional)</label>
      </div>
      <div className={`grid ${verFinde ? "grid-cols-7" : "grid-cols-5"} gap-2`}>
        {DIAS.slice(0, verFinde ? 7 : 5).map((d) => <div key={d} className="text-[11px] font-semibold text-muted-foreground text-center">{d}</div>)}
        {filas.flatMap((w) => w.slice(0, verFinde ? 7 : 5)).map((d) => {
          const del = acts.filter((a) => a.fecha === d);
          const h = del.reduce((s, a) => s + Number(a.horas), 0);
          return (
            <button key={d} onClick={() => setDia(d)} disabled={!enMes(d)} className={`text-left rounded-xl border p-2 ${vista === "mes" ? "min-h-20" : "min-h-28"} ${enMes(d) ? "hover:bg-muted/50" : "opacity-30"}`}>
              <div className="text-xs text-muted-foreground">{Number(d.slice(8))}</div>
              <div className="font-bold">{h ? `${h} h` : "—"}</div>
              {del.length > 0 && <div className="text-[11px] text-muted-foreground">{del.length} act.</div>}
              {vista === "semana" && del.slice(0, 3).map((a) => <div key={a.id} className="text-[11px] truncate">• {a.titulo}</div>)}
              {del.some((a) => a.observacion_lider) && <MessageSquare className="w-3 h-3 text-primary mt-1" />}
            </button>
          );
        })}
      </div>
      {dia && <DiaDetalle fecha={dia} acts={acts.filter((a) => a.fecha === dia)} editable={editable} porActividad={porActividad} valorDefecto={valorDefecto} onClose={() => setDia(null)} onChange={onChange} />}
    </div>
  );
}

function DiaDetalle({ fecha, acts, editable, porActividad, valorDefecto, onClose, onChange }: { fecha: string; acts: ActCal[]; editable?: boolean; porActividad?: boolean; valorDefecto: number; onClose: () => void; onChange?: () => Promise<void> }) {
  const total = acts.reduce((s, a) => s + Number(a.horas), 0);
  const ver = async (p: string) => { const { data } = await supabase.storage.from("freelance").createSignedUrl(p, 3600); if (data) window.open(data.signedUrl, "_blank", "noreferrer"); };
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <div><b className="capitalize">{fechaLarga(fecha)}</b><div className="text-xs text-muted-foreground">{acts.length} registros · {total.toFixed(2)} h</div></div>
          <button onClick={onClose} className="p-2 rounded-lg border"><X className="w-4 h-4" /></button>
        </div>
        {acts.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sin actividades este día.</div>}
        {acts.map((a) => <FilaAct key={a.id} a={a} editable={editable} porActividad={porActividad} valorDefecto={valorDefecto} ver={ver} onChange={onChange} />)}
      </div>
    </div>
  );
}

function FilaAct({ a, editable, porActividad, valorDefecto, ver, onChange }: { a: ActCal; editable?: boolean; porActividad?: boolean; valorDefecto: number; ver: (p: string) => void; onChange?: () => Promise<void> }) {
  const [obs, setObs] = useState(a.observacion_lider ?? "");
  const [valor, setValor] = useState(a.valor != null ? String(a.valor) : "");
  const guardar = async () => {
    const { error } = await supabase.from("freelance_actividades").update({ observacion_lider: obs.trim() || null, valor: valor === "" ? null : Number(valor) }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Guardado"); await onChange?.();
  };
  return (
    <div className="px-5 py-3 border-b text-sm space-y-2">
      <div className="flex justify-between gap-3">
        <div><div className="font-semibold">{a.titulo}{hhmm(a) && ` · ${hhmm(a)}`}{Number(a.horas) > 0 && ` · ${a.horas} h`}</div>{a.descripcion && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{a.descripcion}</div>}</div>
        {a.archivo_path && <button onClick={() => ver(a.archivo_path!)} className="p-2 rounded-lg border h-fit" title="Ver archivo"><FileText className="w-4 h-4" /></button>}
      </div>
      {editable ? (
        <div className="grid sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
          <label><span className="text-[11px] text-muted-foreground">Observación del líder (la ve el freelance)</span><input value={obs} onChange={(e) => setObs(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" /></label>
          {porActividad ? <label><span className="text-[11px] text-muted-foreground">Valor ($)</span><input type="number" min="0" step="0.01" placeholder={String(valorDefecto)} value={valor} onChange={(e) => setValor(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" /></label> : <span />}
          <button onClick={guardar} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Guardar</button>
        </div>
      ) : a.observacion_lider ? <div className="text-xs rounded-lg bg-muted p-2"><b>Observación del líder:</b> {a.observacion_lider}</div> : null}
    </div>
  );
}
