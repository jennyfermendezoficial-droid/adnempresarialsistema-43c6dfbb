import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Star, X } from "lucide-react";
import { toast } from "sonner";
import { fetchPerfiles } from "@/lib/perfiles";

interface Pending {
  id: string;
  profesor_id: string;
  profesor_nombre: string;
  fecha: string;
  hora_inicio: string;
  obligatorio: boolean;
}

const CRITERIOS = [
  { key: "claridad", label: "Claridad" },
  { key: "didactica", label: "Didáctica" },
  { key: "desenvolvimiento", label: "Desenvolvimiento" },
  { key: "practico", label: "Aplicación práctica" },
] as const;

type CK = (typeof CRITERIOS)[number]["key"];

const monthRange = (d: Date) => {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, mes: m + 1, anio: y };
};

export function PostClassRatingModal() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const [pending, setPending] = useState<Pending | null>(null);
  const [vals, setVals] = useState<Record<CK, number>>({ claridad: 0, didactica: 0, desenvolvimiento: 0, practico: 0 });
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const STORAGE_KEY = `adn_calif_skip_${uid ?? "anon"}`;
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const [confirmSkip, setConfirmSkip] = useState(false);

  const persistDismissed = (next: Set<string>) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!uid || role !== "usuario" || pending) return;
    let alive = true;
    let timer: number | undefined;

    const setProfesor = async (profesorId: string, id: string, fecha: string, hora: string, obligatorio: boolean) => {
      const [prof] = await fetchPerfiles([profesorId]);
      if (!alive) return;
      setPending({ id, profesor_id: profesorId, profesor_nombre: prof?.nombre_completo || "Tu profesor", fecha, hora_inicio: hora, obligatorio });
    };

    const check = async () => {
      if (!alive || pending) return;
      const today = new Date();
      const dStr = today.toISOString().slice(0, 10);
      const nowHHMM = today.toTimeString().slice(0, 8);
      const { start, end, mes, anio } = monthRange(today);

      // Desde el día 28 se exige completar cualquier evaluación mensual pendiente.
      if (today.getDate() >= 28) {
        const profesores = new Set<string>();
        const { data: sesiones } = await supabase.from("sesiones_1a1")
          .select("profesor_id,estado")
          .eq("alumna_id", uid).gte("fecha", start).lte("fecha", end);
        ((sesiones ?? []) as { profesor_id: string; estado: string | null }[]).forEach((s) => {
          if (!['cancelada','cancelado','anulada'].includes(String(s.estado ?? '').toLowerCase())) profesores.add(s.profesor_id);
        });

        const { data: permisos } = await supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid);
        const cursoIds = ((permisos ?? []) as { curso_id: string }[]).map((p) => p.curso_id);
        if (cursoIds.length) {
          const { data: clases } = await supabase.from("clases_en_vivo")
            .select("profesor_id").in("curso_id", cursoIds).gte("fecha", start).lte("fecha", end);
          ((clases ?? []) as { profesor_id: string | null }[]).forEach((c) => { if (c.profesor_id) profesores.add(c.profesor_id); });
        }

        if (profesores.size) {
          const { data: hechas } = await supabase.from("calificaciones_mensuales")
            .select("profesor_id").eq("alumna_id", uid).eq("mes", mes).eq("anio", anio);
          const ya = new Set(((hechas ?? []) as { profesor_id: string }[]).map((x) => x.profesor_id));
          const faltante = Array.from(profesores).find((id) => !ya.has(id));
          if (faltante) {
            await setProfesor(faltante, `mensual-${anio}-${mes}-${faltante}`, end, "", true);
            return;
          }
        }
      }

      // Recordatorio inmediato tras una sesión terminada; este sí se puede posponer.
      const { data: ses } = await supabase.from("sesiones_1a1")
        .select("id, profesor_id, fecha, hora_inicio, hora_fin, estado, finalizada_at")
        .eq("alumna_id", uid).eq("fecha", dStr).order("hora_inicio", { ascending: false });
      const candidatas = (ses ?? []).filter((s: any) => s.estado === "finalizada" || s.finalizada_at || (s.hora_fin && s.hora_fin <= nowHHMM));
      for (const s of candidatas) {
        if (dismissed.has(s.id)) continue;
        const { data: ya } = await supabase.from("calificaciones_mensuales").select("id")
          .eq("alumna_id", uid).eq("profesor_id", s.profesor_id).eq("mes", mes).eq("anio", anio).maybeSingle();
        if (ya) continue;
        await setProfesor(s.profesor_id, s.id, s.fecha, s.hora_inicio, false);
        return;
      }
    };

    void check();
    timer = window.setInterval(check, 60_000);
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [uid, role, dismissed, pending]);

  if (!pending) return null;

  const enviar = async () => {
    if (!uid) return;
    if (!vals.claridad || !vals.didactica || !vals.desenvolvimiento || !vals.practico) {
      toast.error("Califica los 4 criterios");
      return;
    }
    setSaving(true);
    const now = new Date();
    const { error } = await supabase.from("calificaciones_mensuales").insert({
      profesor_id: pending.profesor_id, alumna_id: uid,
      mes: now.getMonth() + 1, anio: now.getFullYear(), ...vals,
      comentario: comentario.trim() || null,
    });
    setSaving(false);
    if (error && (error as any).code !== "23505") return toast.error(error.message);
    toast.success("¡Gracias por tu calificación!");
    if (!pending.obligatorio) {
      setDismissed((s) => { const next = new Set(s).add(pending.id); persistDismissed(next); return next; });
    }
    setPending(null);
    setVals({ claridad: 0, didactica: 0, desenvolvimiento: 0, practico: 0 });
    setComentario("");
  };

  const intentarCerrar = () => {
    if (pending.obligatorio) return toast.info("La evaluación mensual está pendiente y debe completarse.");
    setConfirmSkip(true);
  };

  const omitir = () => {
    if (pending.obligatorio) return;
    setDismissed((s) => { const next = new Set(s).add(pending.id); persistDismissed(next); return next; });
    setConfirmSkip(false); setPending(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-[100] p-4">
      <div className="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {!pending.obligatorio && <button onClick={intentarCerrar} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>}
        <div className="text-xs uppercase tracking-wider text-violet font-semibold mb-1">{pending.obligatorio ? "Evaluación mensual pendiente" : "Tu sesión acaba de terminar"}</div>
        <h3 className="text-xl font-semibold mb-1">¿Cómo te fue con {pending.profesor_nombre}?</h3>
        <p className="text-sm text-muted-foreground mb-5">Queremos saber tu opinión para seguir mejorando. ¿Qué calificación le darías a este profesor y en qué podría mejorar?</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {CRITERIOS.map((c) => (
            <div key={c.key} className="p-3 rounded-lg border">
              <div className="text-xs font-medium opacity-80 mb-1.5">{c.label}</div>
              <div className="flex gap-1">{[1,2,3,4,5].map((n) => (
                <button key={n} onClick={() => setVals((v) => ({ ...v, [c.key]: n }))} className="p-0.5 transition hover:scale-110">
                  <Star className={`w-5 h-5 ${n <= vals[c.key] ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
                </button>
              ))}</div>
            </div>
          ))}
        </div>

        <textarea placeholder="¿En qué podría mejorar? (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border bg-background mb-4 text-sm" />

        <div className="flex gap-2 justify-end">
          {!pending.obligatorio && <button onClick={intentarCerrar} className="px-4 py-2 rounded-lg border text-sm">Ahora no</button>}
          <button onClick={enviar} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm disabled:opacity-50">{saving ? "Enviando…" : "Enviar calificación"}</button>
        </div>

        {confirmSkip && !pending.obligatorio && (
          <div className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl grid place-items-center p-6">
            <div className="text-center max-w-sm">
              <div className="text-2xl mb-2">⏰</div><h4 className="text-lg font-semibold mb-2">¿Calificar después?</h4>
              <p className="text-sm text-muted-foreground mb-5">Puedes posponer este aviso de la sesión. Al cierre del mes, cualquier evaluación pendiente volverá a solicitarse obligatoriamente.</p>
              <div className="flex gap-2 justify-center"><button onClick={omitir} className="px-4 py-2 rounded-lg border text-sm">Después</button><button onClick={() => setConfirmSkip(false)} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm">Calificar ahora</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
