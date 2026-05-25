import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo, BrandName } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPage });

function ResetPage() {
  const navigate = useNavigate();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== pass2) { toast.error("Las contraseñas no coinciden"); return; }
    if (pass.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contraseña actualizada");
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border bg-card">
        <div className="flex items-center gap-3 mb-6"><Logo /><BrandName /></div>
        <h2 className="text-2xl font-semibold mb-1">Nueva contraseña</h2>
        <p className="text-sm text-muted-foreground mb-6">Elige una contraseña segura.</p>
        <form onSubmit={submit}>
          <input type="password" required placeholder="Nueva contraseña" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full px-3.5 py-3 rounded-lg border mb-3 outline-none" style={{ borderColor: "var(--border)" }} />
          <input type="password" required placeholder="Repetir contraseña" value={pass2} onChange={(e) => setPass2(e.target.value)} className="w-full px-3.5 py-3 rounded-lg border mb-4 outline-none" style={{ borderColor: "var(--border)" }} />
          <button disabled={loading} className="w-full py-3 rounded-lg text-white font-semibold bg-violet-gradient shadow-violet-glow disabled:opacity-60">
            {loading ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </div>
    </div>
  );
}