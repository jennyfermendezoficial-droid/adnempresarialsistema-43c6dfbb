import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, BadgeDollarSign, BellRing, Clock3, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

interface NotificacionPago {
  id: string;
  tipo: "registro_horas_pendiente" | "descuento_horas";
  titulo: string;
  cuerpo: string;
  url: string | null;
  created_at: string;
}

export function AlertaRegistroProfesor() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [alerta, setAlerta] = useState<NotificacionPago | null>(null);

  const cargar = async () => {
    if (!uid || role !== "soporte") {
      setAlerta(null);
      return;
    }
    const { data } = await supabase
      .from("notificaciones")
      .select("id,tipo,titulo,cuerpo,url,created_at")
      .eq("usuario_id", uid)
      .eq("leida", false)
      .in("tipo", ["registro_horas_pendiente", "descuento_horas"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAlerta((data as NotificacionPago | null) ?? null);
  };

  useEffect(() => {
    void cargar();
    if (!uid || role !== "soporte") return;
    const timer = window.setInterval(() => void cargar(), 60_000);
    return () => window.clearInterval(timer);
  }, [uid, role, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (role !== "soporte" || !alerta) return null;

  const cerrar = async () => {
    await supabase.from("notificaciones").update({ leida: true }).eq("id", alerta.id).eq("usuario_id", uid);
    setAlerta(null);
  };

  const irARegistrar = async () => {
    await cerrar();
    navigate({ to: "/mis-clases-asignadas" });
  };

  const descuento = alerta.tipo === "descuento_horas";

  return (
    <div className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden">
        <div
          className="p-5 text-white relative"
          style={{ background: descuento ? "linear-gradient(135deg,#7f1d1d,#b91c1c)" : "linear-gradient(135deg,var(--deep-2),var(--violet))" }}
        >
          <button onClick={() => void cerrar()} className="absolute top-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20" aria-label="Cerrar alerta">
            <X className="w-4 h-4" />
          </button>
          <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center mb-3">
            {descuento ? <BadgeDollarSign className="w-6 h-6" /> : <BellRing className="w-6 h-6" />}
          </div>
          <div className="text-xs uppercase tracking-wider opacity-80">Aviso de Pagos e informes</div>
          <h2 className="text-xl font-bold mt-1">{alerta.titulo}</h2>
        </div>

        <div className="p-5">
          <div className="rounded-xl border p-4 flex items-start gap-3">
            {descuento ? <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /> : <Clock3 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
            <p className="text-sm leading-relaxed">{alerta.cuerpo}</p>
          </div>

          {descuento ? (
            <button onClick={() => void cerrar()} className="mt-4 w-full px-4 py-2.5 rounded-xl bg-violet-gradient text-white text-sm font-semibold">
              Entendido
            </button>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => void cerrar()} className="px-4 py-2.5 rounded-xl border text-sm font-semibold">Después</button>
              <button onClick={() => void irARegistrar()} className="px-4 py-2.5 rounded-xl bg-violet-gradient text-white text-sm font-semibold">Registrar ahora</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
