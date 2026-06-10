import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

export type AppRole = "admin" | "soporte" | "usuario";
export type UserEstado = "pendiente_aprobacion" | "activo" | "inactivo";

export interface Profile {
  id: string;
  email: string;
  nombre_completo: string;
  avatar_url: string | null;
  estado: UserEstado;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

const SESSION_KEY = "ae_device_session_id";

function getOrCreateDeviceSessionId(): string {
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, email, nombre_completo, avatar_url, estado").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile | null) ?? null);
    const priority: AppRole[] = ["admin", "soporte", "usuario"];
    const found = priority.find((r) => roles?.some((x) => x.role === r)) ?? null;
    setRole(found);
  };

  const registerDeviceSession = async () => {
    try {
      const sid = getOrCreateDeviceSessionId();
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "desconocido";
      
      await supabase.rpc("registrar_sesion", { _session_id: sid, _dispositivo: ua });
    } catch { /* noop */ }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          loadProfile(s.user.id);
          if (_e === "SIGNED_IN" || _e === "INITIAL_SESSION") registerDeviceSession();
        }, 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
        registerDeviceSession();
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Validar sesión cada 60s: si fue expulsada por superar 5 dispositivos, cerrar sesión.
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const check = async () => {
      try {
        const sid = localStorage.getItem(SESSION_KEY);
        if (!sid) return;
        
        const { data, error } = await supabase.rpc("validar_sesion", { _session_id: sid });
        if (cancelled || error) return;
        if (data === false) {
          toast.error("Tu sesión se cerró porque se superó el límite de 5 dispositivos activos.");
          try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
          await supabase.auth.signOut();
          setSession(null); setProfile(null); setRole(null);
        }
      } catch { /* noop */ }
    };
    const id = window.setInterval(check, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [session?.user?.id]);

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const signOut = async () => {
    try {
      const sid = localStorage.getItem(SESSION_KEY);
      if (sid) {
        
        await supabase.rpc("cerrar_sesion", { _session_id: sid });
        localStorage.removeItem(SESSION_KEY);
      }
    } catch { /* noop */ }
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setRole(null);
  };

  return <Ctx.Provider value={{ session, profile, role, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}