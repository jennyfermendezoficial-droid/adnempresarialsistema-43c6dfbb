import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Check, X, Pencil, Star, Video, Trash2, CalendarClock } from "lucide-react";
import { formatNombre } from "@/lib/nombres";
import { DisponibilidadAgendaModal } from "@/components/DisponibilidadAgendaModal";


interface Profile { id: string; nombre_completo: string; email: string; estado: string; actividad: string | null }
interface Role { user_id: string; role: string; id: string }
interface Curso { id: string; nombre: string }
interface PermCurso { id: string; usuario_id: string; curso_id: string }
interface Calif { id: string; profesor_id: string; alumna_id: string; claridad: number|null; didactica: number|null; practico: number|null; desenvolvimiento: number|null; created_at: string }
interface Sesion1a1 { id: string; profesor_id: string; alumna_id: string; fecha: string; hora_inicio: string; estado: string }

export function PermisosPanel() {
  const { role, session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [perms, setPerms] = useState<PermCurso[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [managing, setManaging] = useState<Profile | null>(null);
  const [availability, setAvailability] = useState<Profile | null>(null);

  const load = async () => {
    const [{ data: p }, { data: r }, { data: c }, { data: pc }] = await Promise.all([
      supabase.from("profiles").select("id,nombre_completo,email,estado,actividad"),
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

  const isAdmin = role === "admin";
  const isStaff = isAdmin || role === "soporte";
  const currentUid = session?.user.id;
  if (!isStaff) return <div className="p-8 text-center text-muted-foreground">Solo administradores o soporte.</div>;

  const setEstado = async (id: string, estado: "activo" | "pendiente_aprobacion" | "inactivo") => {
    const { error } = await supabase.from("profiles").update({ estado }).eq("id", id);
    if (error) return toast.error(error.message);
    setProfiles((ps) => ps.map((x) => (x.id === id ? { ...x, estado } : x)));
  };

  const setRole = async (uid: string, newRole: "admin" | "soporte" | "usuario") => {
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
      <p className="text-sm text-muted-foreground mb-6">Aprueba usuarios, edita su actividad, gestiona disponibilidad, reseñas y sesiones 1 a 1, y otorga acceso a cursos.</p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Usuario</th>
              <th className="text-left px-3 py-2">Estado</th>
              {isAdmin && <th className="text-left px-3 py-2">Rol</th>}
              <th className="text-left px-3 py-2">Acciones</th>
              {cursos.map((c) => <th key={c.id} className="text-center px-3 py-2 text-xs">{c.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const canManageAvailability = isAdmin || p.id === currentUid;
              const isMentor = userRole(p.id) === "soporte" || userRole(p.id) === "admin";
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium flex items-center gap-1.5">{formatNombre(p.nombre_completo) || "—"}</div>
                    <div className="text-xs opacity-60">{p.email}</div>
                    {p.actividad && <div className="text-[11px] mt-0.5 text-violet font-semibold">{p.actividad}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <select value={p.estado} onChange={(e) => setEstado(p.id, e.target.value as "activo" | "pendiente_aprobacion" | "inactivo")} className="px-2 py-1 rounded border bg-background text-xs">
                      <option value="pendiente_aprobacion">pendiente</option>
                      <option value="activo">activo</option>
                      <option value="inactivo">inactivo</option>
                    </select>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <select value={userRole(p.id)} onChange={(e) => setRole(p.id, e.target.value as "admin" | "soporte" | "usuario")} className="px-2 py-1 rounded border bg-background text-xs">
                        <option value="usuario">usuario</option>
                        <option value="soporte">soporte</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditing(p)} title="Editar nombre y actividad" className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5 text-violet" /></button>
                      <button onClick={() => setManaging(p)} title="Gestionar reseñas y sesiones 1 a 1" className="p-1.5 rounded hover:bg-muted"><Star className="w-3.5 h-3.5 text-violet" /></button>
                      {isMentor && canManageAvailability && <button onClick={() => setAvailability(p)} title="Configurar disponibilidad de Agenda 1 a 1" className="p-1.5 rounded hover:bg-muted"><CalendarClock className="w-3.5 h-3.5 text-violet" /></button>}
                    </div>
                  </td>
                  {cursos.map((c) => {
                    const ok = perms.some((x) => x.usuario_id === p.id && x.curso_id === c.id);
                    return <td key={c.id} className="text-center px-3 py-2"><button onClick={() => toggleCurso(p.id, c.id)} className={`w-6 h-6 rounded grid place-items-center ${ok ? "bg-violet-gradient text-white" : "border"}`}>{ok ? <Check className="w-3.5 h-3.5"/> : <X className="w-3.5 h-3.5 opacity-30"/>}</button></td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <EditProfileModal profile={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setProfiles((ps) => ps.map((x) => x.id === updated.id ? { ...x, ...updated } : x)); setEditing(null); }} />}
      {managing && <ManageReviewsModal profile={managing} onClose={() => setManaging(null)} />}
      {availability && <DisponibilidadAgendaModal profile={availability} onClose={() => setAvailability(null)} />}
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: (p: Profile) => void }) {
  const [nombre, setNombre] = useState(profile.nombre_completo || "");
  const [actividad, setActividad] = useState(profile.actividad || "");
  const [saving, setSaving] = useState(false);
  const guardar = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ nombre_completo: nombre.trim(), actividad: actividad.trim() || null }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil actualizado");
    onSaved({ ...profile, nombre_completo: nombre.trim(), actividad: actividad.trim() || null });
  };
  return <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}><div className="bg-card rounded-2xl p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}><h3 className="text-lg font-semibold">Editar usuario</h3><div><label className="text-xs opacity-70 mb-1 block">Nombre completo</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background" /></div><div><label className="text-xs opacity-70 mb-1 block">Actividad / Especialidad (se muestra en agenda 1a1 y en Zoom)</label><input value={actividad} onChange={(e) => setActividad(e.target.value)} placeholder="Ej: Meta Ads, IA y generación de imágenes" className="w-full px-3 py-2 rounded-lg border bg-background" /></div><div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancelar</button><button disabled={saving} onClick={guardar} className="px-4 py-2 rounded-lg bg-violet-gradient text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar"}</button></div></div></div>;
}

function ManageReviewsModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [califs, setCalifs] = useState<Calif[]>([]);
  const [sesiones, setSesiones] = useState<Sesion1a1[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("calificaciones_mensuales").select("*").eq("profesor_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("sesiones_1a1").select("*").eq("profesor_id", profile.id).order("fecha", { ascending: false }),
    ]);
    setCalifs((c as Calif[]) ?? []);
    setSesiones((s as Sesion1a1[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profile.id]);
  const eliminarCalif = async (id: string) => { if (!confirm("¿Eliminar esta reseña?")) return; const { error } = await supabase.from("calificaciones_mensuales").delete().eq("id", id); if (error) return toast.error(error.message); setCalifs((xs) => xs.filter((x) => x.id !== id)); toast.success("Reseña eliminada"); };
  const eliminarSesion = async (id: string) => { if (!confirm("¿Eliminar esta sesión 1 a 1?")) return; const { error } = await supabase.from("sesiones_1a1").delete().eq("id", id); if (error) return toast.error(error.message); setSesiones((xs) => xs.filter((x) => x.id !== id)); toast.success("Sesión eliminada"); };
  return <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={onClose}><div className="bg-card rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}><div className="flex justify-between items-start"><div><h3 className="text-lg font-semibold">{formatNombre(profile.nombre_completo) || profile.email}</h3><p className="text-xs text-muted-foreground">Gestionar reseñas y sesiones 1 a 1</p></div><button onClick={onClose} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button></div>{loading ? <p className="text-sm text-center py-6 opacity-60">Cargando…</p> : (<><section><h4 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2 flex items-center gap-1"><Star className="w-3.5 h-3.5"/> Reseñas ({califs.length})</h4>{califs.length === 0 ? <p className="text-sm opacity-60">Sin reseñas.</p> : <div className="space-y-1.5">{califs.map((c) => { const vals = [c.claridad, c.didactica, c.practico, c.desenvolvimiento].filter((v): v is number => typeof v === "number"); const prom = vals.length ? (vals.reduce((s,v) => s+v, 0)/vals.length).toFixed(1) : "—"; return <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30"><div className="text-xs"><span className="font-semibold">{prom}★</span> · {new Date(c.created_at).toLocaleDateString("es-PE")}<div className="opacity-60 text-[11px]">Alumna: {c.alumna_id.slice(0,8)}…</div></div><button onClick={() => eliminarCalif(c.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button></div>; })}</div>}</section><section><h4 className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2 flex items-center gap-1"><Video className="w-3.5 h-3.5"/> Sesiones 1 a 1 ({sesiones.length})</h4>{sesiones.length === 0 ? <p className="text-sm opacity-60">Sin sesiones.</p> : <div className="space-y-1.5">{sesiones.map((s) => <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/30"><div className="text-xs"><span className="font-semibold">{s.fecha}</span> · {s.hora_inicio.slice(0,5)} · <span className="opacity-60">{s.estado}</span><div className="opacity-60 text-[11px]">Alumna: {s.alumna_id.slice(0,8)}…</div></div><button onClick={() => eliminarSesion(s.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button></div>)}</div>}</section></>)}</div></div>;
}

