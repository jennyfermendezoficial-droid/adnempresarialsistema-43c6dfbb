import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Logo, BrandName } from "@/components/Logo";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");

  useEffect(() => {
    if (!loading && session) navigate({ to: "/inicio", replace: true });
  }, [session, loading, navigate]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--bg-2)" }}>
      {/* Hero side */}
      <aside
        className="relative overflow-hidden p-14 hidden lg:flex flex-col justify-between"
        style={{ background: "var(--deep-2)", color: "var(--violet-light)" }}
      >
        <div
          aria-hidden className="absolute pointer-events-none"
          style={{ width: 700, height: 700, top: -250, right: -250, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,107,255,.25), transparent 60%)" }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <Logo /> <BrandName className="text-lg" />
          </div>
          <div
            className="inline-flex items-center gap-2 text-[11.5px] tracking-[0.18em] uppercase font-semibold px-3.5 py-1.5 rounded-full mb-7"
            style={{
              color: "var(--gold-soft)",
              border: "1px solid rgba(212,175,55,.35)",
              background: "rgba(212,175,55,.08)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)", boxShadow: "0 0 12px var(--gold)" }} />
            Mentoría Jennyfer Méndez
          </div>
          <h1 className="text-white text-5xl font-medium leading-[1.05] mb-5" style={{ fontFamily: "var(--font-display)" }}>
            Construye el <em className="not-italic text-gold-gradient">ADN</em> de tu empresa.
          </h1>
          <p className="max-w-md text-[15px]" style={{ color: "var(--violet-light)" }}>
            Mentoría privada, cursos, agenda 1 a 1 y comunidad. Todo en un solo lugar.
          </p>
        </div>
        <div className="relative z-10 text-xs uppercase tracking-[0.12em] font-semibold" style={{ color: "var(--violet-soft)" }}>
          Acceso exclusivo de alumnas
        </div>
      </aside>

      {/* Form side */}
      <main className="flex items-center justify-center p-8 lg:p-14 bg-card">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <Logo /> <BrandName />
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-6" style={{ background: "var(--bg-2)" }}>
            <TabBtn active={tab === "login"} onClick={() => setTab("login")}>Iniciar sesión</TabBtn>
            <TabBtn active={tab === "signup"} onClick={() => setTab("signup")}>Crear cuenta</TabBtn>
          </div>

          {tab === "login" ? <LoginForm /> : <SignupForm onDone={() => setTab("login")} />}
        </div>
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="py-2.5 text-sm font-semibold rounded-lg transition"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: active ? "0 1px 2px rgba(15,11,34,.06)" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="mb-4">
      <label className="block text-[11.5px] font-bold tracking-[0.08em] uppercase mb-2" style={{ color: "var(--foreground)" }}>
        {label}
      </label>
      <input
        {...props}
        className="w-full px-3.5 py-3 text-[14.5px] rounded-lg border bg-card outline-none transition focus:ring-2"
        style={{ borderColor: "var(--border)" }}
      />
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (val: string) => void; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mb-4">
      <label className="block text-[11.5px] font-bold tracking-[0.08em] uppercase mb-2" style={{ color: "var(--foreground)" }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full px-3.5 py-3 pr-10 text-[14.5px] rounded-lg border bg-card outline-none transition focus:ring-2"
          style={{ borderColor: "var(--border)" }}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
          tabIndex={-1}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

function PrimaryBtn({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className="w-full py-3 rounded-lg text-white font-semibold text-[14.5px] transition disabled:opacity-60 bg-violet-gradient shadow-violet-glow hover:-translate-y-px"
    >
      {children}
    </button>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error("Email o contraseña incorrectos"); return; }
    toast.success("Bienvenida");
    navigate({ to: "/inicio" });
  };

  return (
    <form onSubmit={submit}>
      <h2 className="text-2xl font-semibold mb-1">Hola de nuevo</h2>
      <p className="text-sm text-muted-foreground mb-7">Ingresa para continuar tu mentoría.</p>
      <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <PasswordField label="Contraseña" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="flex items-center justify-between mb-6 text-[13px]">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-[var(--violet)]" />
          <span className="text-muted-foreground">Mantener sesión</span>
        </label>
        <Link to="/forgot-password" className="font-semibold" style={{ color: "var(--violet)" }}>
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <PrimaryBtn type="submit" disabled={loading}>{loading ? "Ingresando…" : "Iniciar sesión"}</PrimaryBtn>
    </form>
  );
}

function SignupForm({ onDone }: { onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pass2, setPass2] = useState("");
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== pass2) { toast.error("Las contraseñas no coinciden"); return; }
    if (password.length < 8) { toast.error("La contraseña debe tener al menos 8 caracteres"); return; }
    if (!terms) { toast.error("Debes aceptar los términos"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nombre_completo: nombre },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cuenta creada. Está pendiente de aprobación por el administrador.");
    await supabase.auth.signOut();
    onDone();
  };

  return (
    <form onSubmit={submit}>
      <h2 className="text-2xl font-semibold mb-1">Crear cuenta</h2>
      <p className="text-sm text-muted-foreground mb-7">Tu acceso será activado por el administrador.</p>
      <Field label="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      <Field label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <Field label="Contraseña" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <Field label="Confirmar contraseña" type="password" required value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
      <label className="flex items-start gap-2 mb-6 text-[13px] text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-[var(--violet)]" />
        Acepto los términos y la política de privacidad.
      </label>
      <PrimaryBtn type="submit" disabled={loading}>{loading ? "Creando…" : "Crear cuenta"}</PrimaryBtn>
    </form>
  );
}