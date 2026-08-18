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
  mes: number;
  anio: number;
  obligatorio: boolean;
}

const CRITERIOS = [
  { key: "claridad", label: "Claridad" },
  { key: "didactica", label: "Didáctica" },
  { key: "desenvolvimiento", label: "Desenvolvimiento" },
  { key: "practico", label: "Aplicación práctica" },
] as const;

type CK = (typeof CRITERIOS)[number]["key"];

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
    if (!uid || role !== "usuario") return;
    let timer: number | undefined;

    const check = async () => {
      if (pending) return;

      const today = new Date();
      const dStr = today.toISOString().slice(0, 10);
      const nowHHMM = today.toTimeString().slice(0, 8);
      const mes = today.getMonth() + 1;
      const anio = today.getFullYear();
      const iniMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mes, 0).getDate();
      const finMes = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

      // Al cierre del mes solo se exige evaluar profesores con los que la alumna
      // realmente tuvo una sesión en el periodo.
      if (today.getDate() >= 28) {
        const [{ data: sesionesMes }, { data: hechas }] = await Promise.all([
          supabase.from("sesiones_1a1")
            .select("profesor_id,fecha,hora_inicio,estado")
            .eq("alumna_id", uid)
            .gte("fecha", iniMes)
            .lte("fecha", finMes),
          supabase.from("calificaciones_mensuales")
            .select("profesor_id")
            .eq("alumna_id", uid)
            .eq("mes", mes)
            .eq("anio", anio),
        ]);

        const calificados = new Set(((hechas ?? []) as { profesor_id: string }[]).map((c) => c.profesor_id));
        const actividad = ((sesionesMes ?? []) as Array<{ profesor_id: string; fecha: string; hora_inicio: string; estado: string | null }>)
          .filter((s) => s.profesor_id && (s.estado ?? "") !== "cancelada");
        const faltante = actividad.find((s) => !calificados.has(s.profesor_id));

        if (faltante) {
          const [prof] = await fetchPerfiles([faltante.profesor_id]);
          setPending({
            id: `mensual:${anio}-${mes}:${faltante.profesor_id}`,
            profesor_id: faltante.profesor_id,
            profesor_nombre: prof?.nombre_completo || "Tu profesor",
            fecha: faltante.fecha,
            hora_inicio: faltante.hora_inicio,
            mes,
            anio,
            obligatorio: true,
          });
          return;
        }
      }

      // Aviso inmediato después de terminar una sesión 1 a 1. Este sí puede
      // posponerse; si queda pendiente, reaparecerá como obligatorio al cierre.
      const { data: sesionesHoy } = await supabase
        .from("sesiones_1a1")
        .select("id,profesor_id,fecha,hora_inicio,hora_fin,estado,finalizada_at")
        .eq("alumna_id", uid)
        .eq("fecha", dStr)
        .order("hora_inicio", { ascending: false });

      const candidatas = (sesionesHoy ?? []).filter((s: any) =>
        (s.estado === "finalizada" || s.finalizada_at || (s.hora_fin && s.hora_fin <= nowHHMM))
        && s.estado !== "cancelada",
      );

      for (const s of candidatas) {
        if (dismissed.has(s.id)) continue;
        const { data: ya } = await supabase
          .from("calificaciones_mensuales")
          .select("id")
          .eq("alumna_id", uid)
          .eq("profesor_id", s.profesor_id)
          .eq("mes", mes)
          .eq("anio", anio)
          .maybeSingle();
        if (ya) continue;

        const [prof] = await fetchPerfiles([s.profesor_id]);
        setPending({
          id: s.id,
          profesor_id: s.profesor_id,
          profesor_nombre: prof?.nombre_completo || "Tu profesor",
          fecha: s.fecha,
          hora_inicio: s.hora_inicio,
          mes,
          anio,
          obligatorio: false,
        });
        return;
      }
    };

    void check();
    timer = window.setInterval(check, 60_000);
    return () => { if (timer) clearInterval(timer); };
  }, [uid, role, dismissed, pending]);

  if (!pending) return null;

  const limpiar = () => {
    setPending(null);
    setVals({ claridad: 0, didactica: 0, desenvolvimiento: 0, practico: 0 });
    setComentario("");
    setConfirmSkip(false);
  };

  const enviar = async () => {
    if (!uid) return;
    if (!vals.claridad || !vals.didactica || !vals.desenvolvimiento || !vals.practico) {
      toast.error("Califica los 4 criterios");
      return;
    }

    // Evita una segunda calificación del mismo profesor en el mismo mes incluso
    // si dos avisos se dispararon casi al mismo tiempo.
    const { data: existente } = await supabase
      .from("calificaciones_mensuales")
      .select("id")
      .eq("profesor_id", pending.profesor_id)
      .eq("alumna_id", uid)
      .eq("mes", pending.mes)
      .eq("anio", pending.anio)
      .maybeSingle();
    if (existente) {
      limpiar();
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("calificaciones_mensuales").insert({
      profesor_id: pending.profesor_id,
      alumna_id: uid,
      mes: pending.mes,
      anio: pending.anio,
      ...vals,
      comentario: comentario.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);

    toast.success("¡Gracias! Tu opinión nos ayuda a mejorar.");
    setDismissed((s) => {
      const next = new Set(s).add(pending.id);
      persistDismissed(next);
      return next;
    });
    limpiar();
  };

  const intentarCerrar = () => {
    if (pending.obligatorio) return;
    setConfirmSkip(true);
  };

  const omitirAhora = () => {
    if (pending.obligatorio) return;
    setDismissed((s) => {
      const next = new Set(s).add(pending.id);
      persistDismissed(next);
      return next;
    });
    limpiar();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-[100] p-4">
      <div className="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {!pending.obligatorio && (
          <button onClick={intentarCerrar} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted" aria-label="Calificar después">
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="text-xs uppercase tracking-wider text-violet font-semibold mb-1">
          {pending.obligatorio ? "Evaluación mensual obligatoria" : "Tu sesión acaba de terminar"}
        </div>
        <h3 className="text-xl font-semibold mb-1">
          {pending.obligatorio
            ? `Cuéntanos cómo fue tu experiencia con ${pending.profesor_nombre}`
            : `¿Cómo te fue con ${pending.profesor_nombre}?`}
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          {pending.obligatorio
            ? "Esta evaluación corresponde a un profesor con quien tuviste actividad este mes. Complétala para continuar."
            : "Puedes responder ahora o hacerlo al cierre del mes. Calificación del 1 al 5."}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {CRITERIOS.map((c) => (
            <div key={c.key} className="p-3 rounded-lg border">
              <div className="text-xs font-medium opacity-80 mb-1.5">{c.label}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setVals((v) => ({ ...v, [c.key]: n }))}
                    className="p-0.5 transition hover:scale-110"
                    aria-label={`${c.label}: ${n} de 5`}
                  >
                    <Star className={`w-5 h-5 ${n <= vals[c.key] ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <textarea
          placeholder="¿En qué podría mejorar este profesor? (opcional)"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border bg-background mb-4 text-sm"
        />

        <div className="flex gap-2 justify-end">
          {!pending.obligatorio && (
            <button onClick={intentarCerrar} className="px-4 py-2 rounded-lg border text-sm">Después</button>
          )}
          <button onClick={enviar} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm disabled:opacity-50">
            {saving ? "Enviando…" : "Enviar calificación"}
          </button>
        </div>

        {confirmSkip && !pending.obligatorio && (
          <div className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl grid place-items-center p-6">
            <div className="text-center max-w-sm">
              <div className="text-2xl mb-2">⭐</div>
              <h4 className="text-lg font-semibold mb-2">¿Calificar después?</h4>
              <p className="text-sm text-muted-foreground mb-5">
                Puedes posponer este aviso. Si al cierre del mes sigue pendiente, la evaluación será obligatoria.
              </p>
              <div className="flex gap-2 justify-center">
                <button onClick={omitirAhora} className="px-4 py-2 rounded-lg border text-sm">Sí, después</button>
                <button onClick={() => setConfirmSkip(false)} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm">Calificar ahora</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
