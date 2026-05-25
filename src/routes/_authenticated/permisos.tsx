import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/permisos")({ component: Page });

interface Profile { id: string; nombre_completo: string; email: string; estado: string }
interface Role { user_id: string; role: string; id: string }
interface Curso { id: string; nombre: string }
interface PermCurso { id: string; usuario_id: string; curso_id: string }

function Page() {
  const { role } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [perms, setPerms] = useState<PermCurso[]>([]);

  const load = async () => {
    const [{ data: p }, { data: r }, { data: c }, { data: pc }] = await Promise.all([
      supabase.from("profiles").select("id,nombre_completo,email,estado"),
      supabase.from("user_roles").select("id,user_id,role"),
      supabase.from("cursos").select("id,nombre").order("orden"),
      supabase.from("permisos_cursos").select("id,usuario_id,curso_id"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    setRoles((r as Role[]) ?? []);
    setCursos((c as Curso[]) ?? []);
    setPerms((pc as PermCurso[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  if (role !== "admin") return <div className="p-8 text-center text-muted-foreground">Solo administradores.</div>;

  const setEstado = async (id: string, estado: "activo" | "pendiente_aprobacion" | "inactivo") => {
    const { error } = await supabase.from("profiles").update({ estado }).eq("id", id);
    if (error) return toast.error(error.message);
    setProfiles((ps) => ps.map((x) => (x.id === id ? { ...x, estado } : x)));
  };

  const setRole = async (uid: string, newRole: "admin" | "soporte" | "usuario") => {
    // delete existing roles, insert new one
    await supabase.from("user_roles").delete().eq("user_id", uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: newRole });
    if (error) return toast.error(error.message);
    await load();
    toast.success("Rol actualizado");
  };

  const toggleCurso = async (uid: string, cursoId: string) => {
    const existing = perms.find((p) => p.usuario_id === uid && p.curso_id === cursoId);
    if (existing) {
      await supabase.from("permisos_cursos").delete().eq("id", existing.id);
      setPerms((p) => p.filter((x) => x.id !== existing.id));
    } else {
      const { data, error } = await supabase.from("permisos_cursos").insert({ usuario_id: uid, curso_id: cursoId }).select().single();
      if (error) return toast.error(error.message);
      setPerms((p) => [...p, data as PermCurso]);
    }
  };

  const userRole = (uid: string) => roles.find((r) => r.user_id === uid)?.role || "usuario";

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Permisos</h1>
      <p className="text-sm text-muted-foreground mb-6">Aprueba usuarios, asigna roles y otorga acceso a cursos.</p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Usuario</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-left px-3 py-2">Rol</th>
              {cursos.map((c) => <th key={c.id} className="text-center px-3 py-2 text-xs">{c.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.nombre_completo || "—"}</div>
                  <div className="text-xs opacity-60">{p.email}</div>
                </td>
                <td className="px-3 py-2">
                  <select value={p.estado} onChange={(e) => setEstado(p.id, e.target.value as "activo" | "pendiente_aprobacion" | "inactivo")} className="px-2 py-1 rounded border bg-background text-xs">
                    <option value="pendiente_aprobacion">pendiente</option>
                    <option value="activo">activo</option>
                    <option value="inactivo">inactivo</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select value={userRole(p.id)} onChange={(e) => setRole(p.id, e.target.value as "admin" | "soporte" | "usuario")} className="px-2 py-1 rounded border bg-background text-xs">
                    <option value="usuario">usuario</option>
                    <option value="soporte">soporte</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                {cursos.map((c) => {
                  const ok = perms.some((x) => x.usuario_id === p.id && x.curso_id === c.id);
                  return (
                    <td key={c.id} className="text-center px-3 py-2">
                      <button onClick={() => toggleCurso(p.id, c.id)} className={`w-6 h-6 rounded grid place-items-center ${ok ? "bg-violet-gradient text-white" : "border"}`}>
                        {ok ? <Check className="w-3.5 h-3.5"/> : <X className="w-3.5 h-3.5 opacity-30"/>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
