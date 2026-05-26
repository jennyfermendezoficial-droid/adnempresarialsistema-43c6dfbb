import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calificar")({ component: Page });

interface Profile { id: string; nombre_completo: string; email: string; avatar_url: string | null }

const CRITERIOS = [
  { key: "claridad", label: "Claridad" },
  { key: "didactica", label: "Didáctica" },
  { key: "desenvolvimiento", label: "Desenvolvimiento" },
  { key: "practico", label: "Aplicación práctica" },
] as const;

type Criterio = (typeof CRITERIOS)[number]["key"];
type Form = Record<Criterio, number> & { comentario: string };

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const [profs, setProfs] = useState<Profile[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [yaCalificados, setYaCalificados] = useState<Set<string>>(new Set());

  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  useEffect(() => {
    if (role !== "usuario" || !uid) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "soporte"]);
      const ids = Array.from(new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)));
      if (!ids.length) return;
      const { data: ps } = await supabase
        .from("profiles")
        .select("id,nombre_completo,email,avatar_url")
        .in("id", ids);
      setProfs((ps as Profile[]) ?? []);

      const { data: ya } = await supabase
        .from("calificaciones_mensuales")
        .select("profesor_id")
        .eq("alumna_id", uid)
        .eq("mes", mes)
        .eq("anio", anio);
      setYaCalificados(new Set((ya ?? []).map((x: { profesor_id: string }) => x.profesor_id)));
    })();
  }, [role, uid, mes, anio]);

  const getForm = (id: string): Form => forms[id] ?? { claridad: 0, didactica: 0, desenvolvimiento: 0, practico: 0, comentario: "" };

  const setVal = (id: string, key: keyof Form, val: number | string) => {
    setForms((f) => ({ ...f, [id]: { ...getForm(id), [key]: val } }));
  };

  const enviar = async (profId: string) => {
    if (!uid) return;
    const f = getForm(profId);
    if (!f.claridad || !f.didactica || !f.desenvolvimiento || !f.practico) {
      toast.error("Califica los 4 criterios (1 a 5).");
      return;
    }
    setSaving(profId);
    const { error } = await supabase.from("calificaciones_mensuales").insert({
      profesor_id: profId,
      alumna_id: uid,
      mes, anio,
      claridad: f.claridad,
      didactica: f.didactica,
      desenvolvimiento: f.desenvolvimiento,
      practico: f.practico,
      comentario: f.comentario || null,
    });
    setSaving(null);
    if (error) {
      toast.error(error.message.includes("sesiones_1a1") ? "Necesitas haber tenido al menos una sesión 1a1 con este profesor." : error.message);
      return;
    }
    toast.success("¡Calificación enviada!");
    setYaCalificados((s) => new Set(s).add(profId));
  };

  if (role !== "usuario") {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold mb-2">Calificar profesores</h1>
        <div className="mt-6 p-6 rounded-2xl border bg-card text-center text-muted-foreground">
          Esta sección es solo para alumnos.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Calificar profesores</h1>
      <p className="text-sm text-muted-foreground mb-6">Tu opinión cuenta. Califica del 1 al 5 en cada criterio · {mes}/{anio}</p>

      <div className="grid gap-4">
        {profs.map((p) => {
          const f = getForm(p.id);
          const done = yaCalificados.has(p.id);
          return (
            <div key={p.id} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-violet-gradient grid place-items-center text-white font-semibold">
                  {(p.nombre_completo || p.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{p.nombre_completo || p.email}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </div>
                {done && <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">Calificado este mes</span>}
              </div>
              {!done && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    {CRITERIOS.map((c) => (
                      <div key={c.key} className="p-3 rounded-lg border">
                        <div className="text-xs font-medium opacity-80 mb-1.5">{c.label}</div>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setVal(p.id, c.key, n)}
                              className="p-1 transition"
                              aria-label={`${c.label} ${n}`}
                            >
                              <Star className={`w-6 h-6 ${n <= (f[c.key] as number) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <textarea
                    placeholder="Comentario (opcional)"
                    value={f.comentario}
                    onChange={(e) => setVal(p.id, "comentario", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border bg-background mb-3"
                  />
                  <button
                    disabled={saving === p.id}
                    onClick={() => enviar(p.id)}
                    className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm disabled:opacity-50"
                  >
                    {saving === p.id ? "Enviando…" : "Enviar calificación"}
                  </button>
                </>
              )}
            </div>
          );
        })}
        {profs.length === 0 && (
          <div className="p-8 text-center text-muted-foreground border rounded-2xl">No hay profesores para calificar.</div>
        )}
      </div>
    </div>
  );
}