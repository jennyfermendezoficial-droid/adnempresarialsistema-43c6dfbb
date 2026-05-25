import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo, BrandName } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPage });

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border bg-card">
        <div className="flex items-center gap-3 mb-6"><Logo /><BrandName /></div>
        <h2 className="text-2xl font-semibold mb-1">Recuperar contraseña</h2>
        <p className="text-sm text-muted-foreground mb-6">Te enviaremos un link para restablecerla.</p>
        {sent ? (
          <div className="text-sm">
            Revisa tu email <strong>{email}</strong>. <Link to="/login" className="text-[color:var(--violet)] font-semibold">Volver al login</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-3.5 py-3 rounded-lg border mb-4 outline-none"
              style={{ borderColor: "var(--border)" }}
            />
            <button type="submit" disabled={loading} className="w-full py-3 rounded-lg text-white font-semibold bg-violet-gradient shadow-violet-glow disabled:opacity-60">
              {loading ? "Enviando…" : "Enviar link"}
            </button>
            <div className="mt-4 text-center text-sm">
              <Link to="/login" className="text-muted-foreground">Volver al login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}