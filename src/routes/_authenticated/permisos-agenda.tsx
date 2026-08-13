import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { formatNombre } from "@/lib/nombres";
import { DisponibilidadAgendaModal } from "@/components/DisponibilidadAgendaModal";

export const Route = createFileRoute("/_authenticated/permisos-agenda")({ component: Page });
interface Profile { id: string; nombre_completo: string; email: string; estado: string }
interface Role { user_id: string; role: string }

function Page() {
  const { role, session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const uid = session?.user.id;
  const isAdmin = role === "admin";
  const isStaff = isAdmin || role === "soporte";

  useEffect(() => {
    if (!isStaff) return;
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id,nombre_completo,email,estado").order("nombre_completo"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      setProfiles((p as Profile[]) ?? []);
      setRoles((r as Role[]) ?? []);
    })();
  }, [isStaff]);

  const userRole = (id: string) => roles.find((r) => r.user_id === id)?.role ?? "usuario";
  const mentors = profiles.filter((p) => ["admin", "soporte"].includes(userRole(p.id)) && (isAdmin || p.id === uid));

  if (!isStaff) return <div className="p-8 text-center text-muted-foreground">Solo administradores o soporte.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-violet"><CalendarClock className="w-5 h-5"/><span className="text-xs font-bold uppercase tracking-wider">Agenda 1 a 1</span></div>
        <h1 className="text-3xl font-semibold mt-1">Disponibilidad</h1>
        <p className="text-sm text-muted-foreground mt-1">Horario base: 15:00–19:00, lunes a viernes. Puedes bloquear días concretos de cada profesor/soporte.</p>
      </div>
      <div className="rounded-2xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="text-left px-4 py-3">Profesor / Soporte</th><th className="text-left px-4 py-3">Rol</th><th className="text-right px-4 py-3">Configurar</th></tr></thead>
          <tbody>
            {mentors.map((p) => <tr key={p.id} className="border-t"><td className="px-4 py-3"><div className="font-semibold">{formatNombre(p.nombre_completo) || p.email}</div><div className="text-xs text-muted-foreground">{p.email}</div></td><td className="px-4 py-3 capitalize">{userRole(p.id)}</td><td className="px-4 py-3 text-right"><button onClick={() => setSelected(p)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-gradient text-white text-xs font-semibold"><CalendarClock className="w-3.5 h-3.5"/> Configurar disponibilidad</button></td></tr>)}
          </tbody>
        </table>
      </div>
      {selected && <DisponibilidadAgendaModal profile={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
