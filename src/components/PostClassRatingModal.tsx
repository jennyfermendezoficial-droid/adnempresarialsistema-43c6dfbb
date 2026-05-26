import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Star, X } from "lucide-react";
import { toast } from "sonner";

interface Pending {
  id: string;
  profesor_id: string;
  profesor_nombre: string;
  fecha: string;
  hora_inicio: string;
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
      const today = new Date();
      const dStr = today.toISOString().slice(0, 10);
      const nowHHMM = today.toTimeString().slice(0, 8);

      // Sesiones de esta alumna terminadas hoy (por webhook o por hora_fin)
      const { data: ses } = await supabase
        .from("sesiones_1a1")
        .select("id, profesor_id, fecha, hora_inicio, hora_fin, estado, finalizada_at")
        .eq("alumna_id", uid)
        .eq("fecha", dStr)
        .order("hora_inicio", { ascending: false });

      const candidatas = (ses ?? []).filter((s: any) =>
        s.estado === "finalizada" || s.finalizada_at || s.hora_fin <= nowHHMM
      );
      if (!candidatas.length) return;

      const mes = today.getMonth() + 1;
      const anio = today.getFullYear();

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

        const { data: prof } = await supabase
          .from("profiles")
          .select("nombre_completo, email")
          .eq("id", s.profesor_id)
          .maybeSingle();

        setPending({
          id: s.id,
          profesor_id: s.profesor_id,
          profesor_nombre: prof?.nombre_completo || prof?.email || "Tu profesor",
          fecha: s.fecha,
          hora_inicio: s.hora_inicio,
        });
        return;
      }
    };

    check();
    timer = window.setInterval(check, 60_000);
    return () => { if (timer) clearInterval(timer); };
  }, [uid, role, dismissed]);

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
      profesor_id: pending.profesor_id,
      alumna_id: uid,
      mes: now.getMonth() + 1,
      anio: now.getFullYear(),
      ...vals,
      comentario: comentario || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("¡Gracias por tu calificación!");
    setDismissed((s) => new Set(s).add(pending.id));
    setPending(null);
    setVals({ claridad: 0, didactica: 0, desenvolvimiento: 0, practico: 0 });
    setComentario("");
  };

  const intentarCerrar = () => setConfirmSkip(true);

  const omitirDefinitivo = () => {
    setDismissed((s) => {
      const next = new Set(s).add(pending.id);
      persistDismissed(next);
      return next;
    });
    setConfirmSkip(false);
    setPending(null);
  };

  const volverACalificar = () => setConfirmSkip(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-[100] p-4">
      <div className="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={intentarCerrar} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
        <div className="text-xs uppercase tracking-wider text-violet font-semibold mb-1">Tu clase acaba de terminar</div>
        <h3 className="text-xl font-semibold mb-1">¿Cómo te fue con {pending.profesor_nombre}?</h3>
        <p className="text-sm text-muted-foreground mb-5">Tu opinión nos ayuda a mejorar. Calificación del 1 al 5.</p>

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
                  >
                    <Star className={`w-5 h-5 ${n <= vals[c.key] ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <textarea
          placeholder="Comentario (opcional)"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border bg-background mb-4 text-sm"
        />

        <div className="flex gap-2 justify-end">
          <button onClick={intentarCerrar} className="px-4 py-2 rounded-lg border text-sm">Ahora no</button>
          <button onClick={enviar} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm disabled:opacity-50">
            {saving ? "Enviando…" : "Enviar calificación"}
          </button>
        </div>

        {confirmSkip && (
          <div className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl grid place-items-center p-6">
            <div className="text-center max-w-sm">
              <div className="text-2xl mb-2">⚠️</div>
              <h4 className="text-lg font-semibold mb-2">¿Estás segura?</h4>
              <p className="text-sm text-muted-foreground mb-5">
                Calificar a tu mentor es <b>obligatorio</b> y nos ayuda a mejorar el sistema.
                Si omites ahora, no volveremos a mostrarte este aviso para esta sesión.
              </p>
              <div className="flex gap-2 justify-center">
                <button onClick={omitirDefinitivo} className="px-4 py-2 rounded-lg border text-sm">Sí, omitir</button>
                <button onClick={volverACalificar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm">Calificar ahora</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
