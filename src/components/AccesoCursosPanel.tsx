import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { formatNombre } from "@/lib/nombres";

interface Profile { id: string; nombre_completo: string; email: string; avatar_url: string | null }
interface Curso { id: string; nombre: string; color_cover: string | null }
interface Perm { id: string; usuario_id: string; curso_id: string }

interface Props { tipo: "curso" | "clase_en_vivo"; titulo: string; plural: string }

export function AccesoCursosPanel({ tipo, titulo, plural }: Props) {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const isStaff = role === "admin" || role === "soporte";

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: c }, { data: pc }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,nombre_completo,email,avatar_url").order("nombre_completo"),
        supabase.from("cursos").select("id,nombre,color_cover").eq("tipo", tipo).order("orden"),
        supabase.from("permisos_cursos").select("id,usuario_id,curso_id"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      // Excluir admin/soporte de la lista (solo asignar acceso a alumnos)
      const staffIds = new Set(
        (roles ?? [])
          .filter((r: { role: string }) => r.role === "admin" || r.role === "soporte")
          .map((r: { user_id: string }) => r.user_id),
      );
      setProfiles(((p as Profile[]) ?? []).filter((x) => !staffIds.has(x.id)));
      setCursos((c as Curso[]) ?? []);
      const ids = new Set((((c as Curso[]) ?? [])).map((x) => x.id));
      setPerms((((pc as Perm[]) ?? [])).filter((x) => ids.has(x.curso_id)));
      setLoading(false);
    })();
  }, [tipo]);

  const filtered = useMemo(
    () => profiles.filter((p) => (p.nombre_completo + " " + p.email).toLowerCase().includes(q.toLowerCase())),
    [profiles, q],
  );

  const toggle = async (usuario_id: string, curso_id: string) => {
    const existing = perms.find((p) => p.usuario_id === usuario_id && p.curso_id === curso_id);
    if (existing) {
      const { error } = await supabase.from("permisos_cursos").delete().eq("id", existing.id);
      if (error) return toast.error(error.message);
      setPerms((ps) => ps.filter((x) => x.id !== existing.id));
    } else {
      const { data, error } = await supabase
        .from("permisos_cursos")
        .insert({ usuario_id, curso_id, otorgado_por: uid })
        .select()
        .single();
      if (error) return toast.error(error.message);
      setPerms((ps) => [...ps, data as Perm]);
    }
  };

  const grantAll = async (usuario_id: string) => {
    const missing = cursos.filter((c) => !perms.some((p) => p.usuario_id === usuario_id && p.curso_id === c.id));
    if (!missing.length) return;
    const { data, error } = await supabase
      .from("permisos_cursos")
      .insert(missing.map((c) => ({ usuario_id, curso_id: c.id, otorgado_por: uid })))
      .select();
    if (error) return toast.error(error.message);
    setPerms((ps) => [...ps, ...((data as Perm[]) ?? [])]);
    toast.success("Acceso concedido");
  };

  const revokeAll = async (usuario_id: string) => {
    const ids = perms.filter((p) => p.usuario_id === usuario_id).map((p) => p.id);
    if (!ids.length) return;
    const { error } = await supabase.from("permisos_cursos").delete().in("id", ids);
    if (error) return toast.error(error.message);
    setPerms((ps) => ps.filter((p) => !ids.includes(p.id)));
    toast.success("Acceso revocado");
  };

  if (!isStaff) {
    return <div className="p-8 text-center text-muted-foreground">Solo administradores o soporte.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="rounded-3xl p-6 mb-6 bg-violet-gradient text-white shadow-xl">
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Administración</div>
        <h1 className="text-3xl font-bold mt-1">{titulo}</h1>
        <p className="text-sm opacity-90 mt-1">
          Marca {plural} que cada alumno puede ver. Los cambios son inmediatos.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar alumno por nombre o email…"
          className="w-full pl-10 pr-3 py-2.5 rounded-xl border bg-background"
        />
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">Cargando…</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => {
            const userPerms = perms.filter((p) => p.usuario_id === u.id);
            const allGranted = cursos.length > 0 && userPerms.length === cursos.length;
            return (
              <div key={u.id} className="p-4 rounded-2xl border bg-card">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} className="w-10 h-10 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-full grid place-items-center text-white font-semibold bg-violet-gradient">
                      {(formatNombre(u.nombre_completo) || u.email).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{formatNombre(u.nombre_completo) || u.email}</div>
                    <div className="text-xs opacity-70 truncate">
                      {u.email} · {userPerms.length}/{cursos.length}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => grantAll(u.id)}
                      disabled={allGranted}
                      className="px-3 py-1.5 rounded-lg text-xs bg-violet-gradient text-white disabled:opacity-40"
                    >
                      Dar todos
                    </button>
                    <button
                      onClick={() => revokeAll(u.id)}
                      disabled={userPerms.length === 0}
                      className="px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40"
                    >
                      Quitar todos
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {cursos.map((c) => {
                    const ok = userPerms.some((p) => p.curso_id === c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggle(u.id, c.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition ${
                          ok ? "bg-violet-gradient text-white border-transparent" : "hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded grid place-items-center border ${ok ? "bg-white/20 border-white/40" : "border-current opacity-40"}`}
                        >
                          {ok && <Check className="w-3 h-3" />}
                        </span>
                        <span className="truncate">{c.nombre}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-12 text-center text-muted-foreground border rounded-2xl">No hay alumnos.</div>
          )}
        </div>
      )}
    </div>
  );
}