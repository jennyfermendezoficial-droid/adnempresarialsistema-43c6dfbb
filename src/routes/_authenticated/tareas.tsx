import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  FileText, Plus, Upload, Trash2, Download, Loader2, X,
  CheckCircle2, Clock, ChevronDown, ChevronUp, Users, Pencil,
  Search, AlertCircle, Award, ClipboardList, TrendingUp,
  Calendar, Star, UserCircle2,
} from "lucide-react";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function getAllFiles(e: Entrega): ArchivoEntrega[] {
  const extra = Array.isArray(e.archivos) ? e.archivos : [];
  if (extra.length > 0) return extra;
  if (e.archivo_url) return [{ url: e.archivo_url, nombre: e.archivo_nombre, tipo: e.archivo_tipo }];
  return [];
}

export const Route = createFileRoute("/_authenticated/tareas")({ component: Page });

interface Tarea {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha_limite: string | null;
  curso_id: string | null;
  created_by: string;
  created_at: string;
}
interface Entrega {
  id: string;
  tarea_id: string;
  alumna_id: string;
  archivo_url: string;
  archivo_nombre: string;
  archivo_tipo: string | null;
  comentario: string | null;
  calificacion: number | null;
  feedback: string | null;
  created_at: string;
  archivos?: ArchivoEntrega[] | null;
}
export interface ArchivoEntrega { url: string; nombre: string; tipo?: string | null; size?: number; [k: string]: unknown }
interface Curso { id: string; nombre: string }
interface Profile { id: string; nombre_completo: string; email: string; avatar_url: string | null }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";

  if (!uid) return null;
  return isStaff ? <StaffDashboard uid={uid} /> : <StudentView uid={uid} />;
}

/* ============================================================
   STUDENT VIEW — only upload / see own grade
   ============================================================ */
function StudentView({ uid }: { uid: string }) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [misEntregas, setMisEntregas] = useState<Entrega[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const [{ data: t }, { data: e }, { data: c }] = await Promise.all([
      supabase.from("tareas").select("*").order("created_at", { ascending: false }),
      supabase.from("tareas_entregas").select("*").eq("alumna_id", uid),
      supabase.from("cursos").select("id,nombre").order("nombre"),
    ]);
    setTareas((t as Tarea[]) ?? []);
    setMisEntregas((e as Entrega[]) ?? []);
    setCursos((c as Curso[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); }, [uid]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg-2)" }}>
      <div className="max-w-4xl mx-auto">
        <Header subtitle="Sube tus tareas en PDF, Word, Excel, PowerPoint o imágenes" />

        {loading ? (
          <Spinner />
        ) : tareas.length === 0 ? (
          <EmptyState text="Aún no hay tareas asignadas." />
        ) : (
          <div className="space-y-3">
            {tareas.map((t) => {
              const mine = misEntregas.find((e) => e.tarea_id === t.id);
              const curso = cursos.find((c) => c.id === t.curso_id);
              return (
                <StudentTareaCard
                  key={t.id}
                  tarea={t}
                  curso={curso}
                  mine={mine}
                  uid={uid}
                  expanded={expanded === t.id}
                  onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                  onChanged={reload}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentTareaCard({
  tarea, curso, mine, uid, expanded, onToggle, onChanged,
}: {
  tarea: Tarea; curso: Curso | undefined; mine: Entrega | undefined; uid: string;
  expanded: boolean; onToggle: () => void; onChanged: () => void;
}) {
  const dueDate = tarea.fecha_limite ? new Date(tarea.fecha_limite) : null;
  const isLate = dueDate && dueDate < new Date() && !mine;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-lg font-bold" style={{ color: "var(--ink)" }}>{tarea.titulo}</h3>
              {curso && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(124,107,255,.12)", color: "var(--violet)" }}>
                  {curso.nombre}
                </span>
              )}
              {mine && (
                <StatusBadge color="green" icon={<CheckCircle2 className="w-3 h-3" />}>
                  {mine.calificacion != null ? `Calificada · ${mine.calificacion}` : "Entregada"}
                </StatusBadge>
              )}
              {!mine && isLate && (
                <StatusBadge color="red">Vencida</StatusBadge>
              )}
            </div>
            {tarea.descripcion && (
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{tarea.descripcion}</p>
            )}
            {dueDate && (
              <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: "var(--muted)" }}>
                <Clock className="w-3.5 h-3.5" /> Entrega: {dueDate.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
          </div>
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "rgba(124,107,255,.1)", color: "var(--violet)" }}
          >
            {mine ? "Mi entrega" : "Subir"} {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 md:px-5 py-4" style={{ borderColor: "var(--line)" }}>
          <StudentUploader tarea={tarea} mine={mine} uid={uid} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function StudentUploader({
  tarea, mine, uid, onChanged,
}: { tarea: Tarea; mine: Entrega | undefined; uid: string; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [comentario, setComentario] = useState(mine?.comentario ?? "");
  const [progress, setProgress] = useState(0);

  const existing = mine ? getAllFiles(mine) : [];

  const uploadOne = async (file: File): Promise<ArchivoEntrega> => {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${uid}/${tarea.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("tareas").upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    return { url: path, nombre: file.name, tipo: file.type || ext, size: file.size };
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_FILES - existing.length;
    if (room <= 0) return toast.error(`Máximo ${MAX_FILES} archivos por entrega`);
    const toUpload = files.slice(0, room);
    if (files.length > room) toast.warning(`Solo se subirán ${room} (límite ${MAX_FILES})`);
    for (const f of toUpload) {
      if (f.size > MAX_FILE_SIZE) return toast.error(`"${f.name}" supera 50 MB`);
    }
    try {
      setUploading(true);
      setProgress(5);
      const uploaded: ArchivoEntrega[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        uploaded.push(await uploadOne(toUpload[i]));
        setProgress(Math.round(((i + 1) / toUpload.length) * 90));
      }
      const all = [...existing, ...uploaded];
      if (mine) {
        const { error } = await supabase.from("tareas_entregas").update({
          archivos: all as unknown as never,
          archivo_url: all[0].url,
          archivo_nombre: all[0].nombre,
          archivo_tipo: all[0].tipo ?? null,
          comentario: comentario || null,
        }).eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tareas_entregas").insert({
          tarea_id: tarea.id,
          alumna_id: uid,
          archivo_url: all[0].url,
          archivo_nombre: all[0].nombre,
          archivo_tipo: all[0].tipo ?? null,
          archivos: all as unknown as never,
          comentario: comentario || null,
        });
        if (error) throw error;
      }
      setProgress(100);
      toast.success(toUpload.length > 1 ? `${toUpload.length} archivos subidos` : "Archivo subido");
      onChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const removeFile = async (idx: number) => {
    if (!mine) return;
    const target = existing[idx];
    if (!target) return;
    if (!confirm(`¿Eliminar "${target.nombre}"?`)) return;
    const next = existing.filter((_, i) => i !== idx);
    try { await supabase.storage.from("tareas").remove([target.url]); } catch {}
    if (next.length === 0) {
      const { error } = await supabase.from("tareas_entregas").delete().eq("id", mine.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("tareas_entregas").update({
        archivos: next as unknown as never,
        archivo_url: next[0].url,
        archivo_nombre: next[0].nombre,
        archivo_tipo: next[0].tipo ?? null,
      }).eq("id", mine.id);
      if (error) return toast.error(error.message);
    }
    toast.success("Archivo eliminado");
    onChanged();
  };

  const downloadFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("tareas").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const saveComment = async () => {
    if (!mine) return;
    const { error } = await supabase.from("tareas_entregas").update({ comentario: comentario || null }).eq("id", mine.id);
    if (error) return toast.error(error.message);
    toast.success("Comentario guardado");
  };

  const canAdd = existing.length < MAX_FILES;

  return (
    <div className="space-y-3">
      {existing.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
              Archivos entregados ({existing.length}/{MAX_FILES})
            </div>
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              {mine && new Date(mine.created_at).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
          {existing.map((f, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-lg border gap-3"
              style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}>
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "var(--violet)" }} />
                <div className="text-sm truncate" style={{ color: "var(--ink)" }}>{f.nombre}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => downloadFile(f.url)} className="p-2 rounded-lg hover:bg-black/5" title="Descargar">
                  <Download className="w-4 h-4" style={{ color: "var(--violet)" }} />
                </button>
                <button onClick={() => removeFile(idx)} className="p-2 rounded-lg hover:bg-red-50" title="Eliminar">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mine?.calificacion != null && (
        <div className="p-4 rounded-xl border" style={{
          background: "linear-gradient(135deg, rgba(124,107,255,.08), rgba(124,107,255,.02))",
          borderColor: "var(--violet)",
        }}>
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4" style={{ color: "var(--violet)" }} />
            <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--violet)" }}>Calificación</div>
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--ink)" }}>{mine.calificacion}</div>
          {mine.feedback && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
              <div className="text-[11px] font-semibold uppercase mb-1" style={{ color: "var(--muted)" }}>Comentario del profesor</div>
              <p className="text-sm" style={{ color: "var(--ink)" }}>{mine.feedback}</p>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Comentario (opcional)</label>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
          style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--ink)" }}
          placeholder="Escribe un comentario para tu entrega..."
        />
        {mine && (
          <button onClick={saveComment} className="mt-1 text-[11px] font-semibold" style={{ color: "var(--violet)" }}>
            Guardar comentario
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg,.gif,.webp,.heic,.mp4,.mov,.webm,.m4v,.mp3,.wav,.m4a"
        onChange={handleFiles}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading || !canAdd}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white text-sm border-2 border-dashed disabled:opacity-60"
        style={{ background: uploading ? "var(--muted)" : "linear-gradient(135deg,var(--violet),var(--violet-2))", borderColor: "transparent" }}
      >
        {uploading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo {progress}%...</>
          : canAdd
            ? <><Upload className="w-4 h-4" /> {existing.length > 0 ? "Añadir más archivos" : "Subir archivos"}</>
            : <>Límite alcanzado ({MAX_FILES})</>}
      </button>
      <p className="text-[11px] text-center" style={{ color: "var(--muted)" }}>
        Imágenes, videos cortos, PDF, Word, Excel, PowerPoint o ZIP. Hasta {MAX_FILES} archivos, máx 50 MB cada uno.
      </p>
    </div>
  );
}

/* ============================================================
   STAFF DASHBOARD — professional admin/soporte panel
   ============================================================ */
type StaffTab = "tareas" | "entregas" | "alumnas";

function StaffDashboard({ uid: _uid }: { uid: string }) {
  const [tab, setTab] = useState<StaffTab>("tareas");
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [alumnas, setAlumnas] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Tarea | null>(null);

  const reload = async () => {
    setLoading(true);
    // alumnas = usuarios con rol "usuario"
    const { data: alumnaRoles } = await supabase.from("user_roles").select("user_id").eq("role", "usuario");
    const alumnaIds = (alumnaRoles ?? []).map((r: any) => r.user_id);
    const [{ data: t }, { data: e }, { data: c }, { data: ps }] = await Promise.all([
      supabase.from("tareas").select("*").order("created_at", { ascending: false }),
      supabase.from("tareas_entregas").select("*").order("created_at", { ascending: false }),
      supabase.from("cursos").select("id,nombre").order("nombre"),
      alumnaIds.length
        ? supabase.from("profiles").select("id,nombre_completo,email,avatar_url").in("id", alumnaIds)
        : Promise.resolve({ data: [] as Profile[] }),
    ]);
    setTareas((t as Tarea[]) ?? []);
    setEntregas((e as Entrega[]) ?? []);
    setCursos((c as Curso[]) ?? []);
    setAlumnas(((ps as Profile[]) ?? []).sort((a, b) => (a.nombre_completo || a.email).localeCompare(b.nombre_completo || b.email)));
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const profilesMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    alumnas.forEach((p) => { m[p.id] = p; });
    return m;
  }, [alumnas]);

  const stats = useMemo(() => {
    const total = entregas.length;
    const pend = entregas.filter((e) => e.calificacion == null).length;
    const calif = entregas.filter((e) => e.calificacion != null);
    const prom = calif.length ? (calif.reduce((s, e) => s + Number(e.calificacion), 0) / calif.length) : 0;
    return {
      tareas: tareas.length,
      entregas: total,
      pendientes: pend,
      promedio: prom,
      alumnas: alumnas.length,
    };
  }, [tareas, entregas, alumnas]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg-2)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <Header subtitle="Panel de tareas — revisa entregas y califica" />
          <button
            onClick={() => { setEditing(null); setShowCreate(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-white text-sm"
            style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
          >
            <Plus className="w-4 h-4" /> Nueva tarea
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Tareas" value={stats.tareas} />
          <StatCard icon={<Upload className="w-4 h-4" />} label="Entregas" value={stats.entregas} />
          <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Por calificar" value={stats.pendientes} highlight={stats.pendientes > 0} />
          <StatCard icon={<Star className="w-4 h-4" />} label="Promedio" value={stats.promedio ? stats.promedio.toFixed(1) : "—"} />
          <StatCard icon={<Users className="w-4 h-4" />} label="Alumnas" value={stats.alumnas} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-xl border w-fit" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
          {([
            ["tareas", "Por tarea", <ClipboardList key="i" className="w-4 h-4" />],
            ["entregas", "Todas las entregas", <TrendingUp key="i" className="w-4 h-4" />],
            ["alumnas", "Por alumna", <UserCircle2 key="i" className="w-4 h-4" />],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key as StaffTab)}
              className="inline-flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={
                tab === key
                  ? { background: "linear-gradient(135deg,var(--violet),var(--violet-2))", color: "white" }
                  : { color: "var(--muted)" }
              }
            >
              {icon} <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner />
        ) : tab === "tareas" ? (
          <TareasTab
            tareas={tareas} entregas={entregas} cursos={cursos} alumnas={alumnas}
            profiles={profilesMap}
            onEdit={(t) => { setEditing(t); setShowCreate(true); }}
            onChanged={reload}
          />
        ) : tab === "entregas" ? (
          <EntregasTab entregas={entregas} tareas={tareas} profiles={profilesMap} onChanged={reload} />
        ) : (
          <AlumnasTab alumnas={alumnas} entregas={entregas} tareas={tareas} onChanged={reload} />
        )}
      </div>

      {showCreate && (
        <TareaModal
          editing={editing}
          cursos={cursos}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSaved={() => { setShowCreate(false); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function TareasTab({
  tareas, entregas, cursos, alumnas, profiles, onEdit, onChanged,
}: {
  tareas: Tarea[]; entregas: Entrega[]; cursos: Curso[]; alumnas: Profile[];
  profiles: Record<string, Profile>;
  onEdit: (t: Tarea) => void; onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (tareas.length === 0) return <EmptyState text="Aún no hay tareas. ¡Crea la primera!" />;
  return (
    <div className="space-y-3">
      {tareas.map((t) => {
        const tEntregas = entregas.filter((e) => e.tarea_id === t.id);
        const calif = tEntregas.filter((e) => e.calificacion != null).length;
        const pct = alumnas.length ? Math.round((tEntregas.length / alumnas.length) * 100) : 0;
        const curso = cursos.find((c) => c.id === t.curso_id);
        const due = t.fecha_limite ? new Date(t.fecha_limite) : null;
        return (
          <div key={t.id} className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
            <div className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-lg font-bold" style={{ color: "var(--ink)" }}>{t.titulo}</h3>
                    {curso && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(124,107,255,.12)", color: "var(--violet)" }}>
                        {curso.nombre}
                      </span>
                    )}
                    {tEntregas.length - calif > 0 && (
                      <StatusBadge color="amber">{tEntregas.length - calif} por calificar</StatusBadge>
                    )}
                  </div>
                  {t.descripcion && (
                    <p className="text-sm whitespace-pre-wrap line-clamp-2" style={{ color: "var(--muted)" }}>{t.descripcion}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs flex-wrap" style={{ color: "var(--muted)" }}>
                    {due && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {due.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {tEntregas.length} / {alumnas.length} entregaron
                    </span>
                  </div>
                  {/* progress */}
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--violet),var(--violet-2))" }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <IconBtn onClick={() => onEdit(t)} title="Editar"><Pencil className="w-4 h-4" style={{ color: "var(--muted)" }} /></IconBtn>
                  <IconBtn
                    onClick={async () => {
                      if (!confirm("¿Eliminar tarea y todas sus entregas?")) return;
                      const { error } = await supabase.from("tareas").delete().eq("id", t.id);
                      if (error) return toast.error(error.message);
                      toast.success("Tarea eliminada");
                      onChanged();
                    }}
                    title="Eliminar"
                  ><Trash2 className="w-4 h-4 text-red-500" /></IconBtn>
                  <button
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: "rgba(124,107,255,.1)", color: "var(--violet)" }}
                  >
                    Entregas {expanded === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {expanded === t.id && (
              <div className="border-t px-4 md:px-5 py-4 space-y-2" style={{ borderColor: "var(--line)" }}>
                {/* Entregas */}
                {tEntregas.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>Aún no hay entregas</p>
                ) : (
                  tEntregas.map((e) => (
                    <EntregaRow key={e.id} entrega={e} profile={profiles[e.alumna_id]} onChanged={onChanged} />
                  ))
                )}
                {/* Pendientes (alumnas que no entregaron) */}
                {(() => {
                  const entregaronIds = new Set(tEntregas.map((e) => e.alumna_id));
                  const pendientes = alumnas.filter((a) => !entregaronIds.has(a.id));
                  if (pendientes.length === 0) return null;
                  return (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--line)" }}>
                      <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
                        Pendientes de entregar ({pendientes.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pendientes.map((p) => (
                          <div key={p.id} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border"
                            style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}>
                            <Avatar profile={p} size={20} />
                            <span className="text-xs" style={{ color: "var(--ink)" }}>{p.nombre_completo || p.email}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EntregasTab({
  entregas, tareas, profiles, onChanged,
}: { entregas: Entrega[]; tareas: Tarea[]; profiles: Record<string, Profile>; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todas" | "pendientes" | "calificadas">("todas");

  const filtered = useMemo(() => {
    return entregas.filter((e) => {
      if (filter === "pendientes" && e.calificacion != null) return false;
      if (filter === "calificadas" && e.calificacion == null) return false;
      if (q) {
        const p = profiles[e.alumna_id];
        const t = tareas.find((x) => x.id === e.tarea_id);
        const hay = `${p?.nombre_completo ?? ""} ${p?.email ?? ""} ${t?.titulo ?? ""} ${e.archivo_nombre}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [entregas, q, filter, profiles, tareas]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted)" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar alumna, tarea o archivo..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
            style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink)" }}
          />
        </div>
        <div className="inline-flex items-center gap-1 p-1 rounded-lg border" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
          {(["todas", "pendientes", "calificadas"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold capitalize"
              style={filter === f
                ? { background: "linear-gradient(135deg,var(--violet),var(--violet-2))", color: "white" }
                : { color: "var(--muted)" }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="No hay entregas que coincidan" />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const t = tareas.find((x) => x.id === e.tarea_id);
            return (
              <EntregaRow key={e.id} entrega={e} profile={profiles[e.alumna_id]} tareaTitulo={t?.titulo} onChanged={onChanged} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlumnasTab({
  alumnas, entregas, tareas, onChanged,
}: { alumnas: Profile[]; entregas: Entrega[]; tareas: Tarea[]; onChanged: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const list = alumnas.filter((a) =>
    !q || (a.nombre_completo || a.email).toLowerCase().includes(q.toLowerCase()),
  );

  const sel = selected ? alumnas.find((a) => a.id === selected) : null;
  const selEntregas = selected ? entregas.filter((e) => e.alumna_id === selected) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      {/* Lista */}
      <div className="rounded-2xl border p-2 max-h-[70vh] overflow-y-auto" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <div className="relative mb-2 px-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted)" }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar alumna..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
            style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--ink)" }}
          />
        </div>
        {list.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>Sin alumnas</p>
        ) : list.map((a) => {
          const aEntregas = entregas.filter((e) => e.alumna_id === a.id);
          const isSel = selected === a.id;
          return (
            <button key={a.id} onClick={() => setSelected(a.id)}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors"
              style={isSel ? { background: "rgba(124,107,255,.12)" } : {}}>
              <Avatar profile={a} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>{a.nombre_completo || a.email}</div>
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>{aEntregas.length} / {tareas.length} entregas</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle */}
      <div className="rounded-2xl border p-4 md:p-5" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        {!sel ? (
          <div className="text-center py-12">
            <UserCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: "var(--violet)" }} />
            <p className="text-sm" style={{ color: "var(--muted)" }}>Selecciona una alumna para ver sus entregas</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b" style={{ borderColor: "var(--line)" }}>
              <Avatar profile={sel} size={48} />
              <div className="flex-1 min-w-0">
                <div className="font-bold" style={{ color: "var(--ink)" }}>{sel.nombre_completo || sel.email}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{sel.email}</div>
              </div>
            </div>
            {tareas.length === 0 ? (
              <EmptyState text="No hay tareas" />
            ) : (
              <div className="space-y-2">
                {tareas.map((t) => {
                  const e = selEntregas.find((x) => x.tarea_id === t.id);
                  return (
                    <div key={t.id} className="p-3 rounded-lg border" style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <div className="font-semibold text-sm" style={{ color: "var(--ink)" }}>{t.titulo}</div>
                        {e ? (
                          e.calificacion != null
                            ? <StatusBadge color="green"><Award className="w-3 h-3" /> {e.calificacion}</StatusBadge>
                            : <StatusBadge color="amber">Por calificar</StatusBadge>
                        ) : (
                          <StatusBadge color="red">No entregada</StatusBadge>
                        )}
                      </div>
                      {e && (
                        <EntregaRow entrega={e} profile={sel} onChanged={onChanged} compact />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Entrega row + inline grading
   ============================================================ */
function EntregaRow({
  entrega, profile, tareaTitulo, onChanged, compact,
}: {
  entrega: Entrega; profile: Profile | undefined; tareaTitulo?: string;
  onChanged: () => void; compact?: boolean;
}) {
  const [showGrade, setShowGrade] = useState(false);
  const [cal, setCal] = useState(entrega.calificacion?.toString() ?? "");
  const [fb, setFb] = useState(entrega.feedback ?? "");
  const [saving, setSaving] = useState(false);

  const descargar = async () => {
    const { data, error } = await supabase.storage.from("tareas").createSignedUrl(entrega.archivo_url, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };
  const eliminar = async () => {
    if (!confirm("¿Eliminar esta entrega?")) return;
    try { await supabase.storage.from("tareas").remove([entrega.archivo_url]); } catch {}
    const { error } = await supabase.from("tareas_entregas").delete().eq("id", entrega.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminada");
    onChanged();
  };
  const guardarCal = async () => {
    setSaving(true);
    const calNum = cal.trim() === "" ? null : Number(cal);
    const { error } = await supabase.from("tareas_entregas").update({
      calificacion: calNum,
      feedback: fb || null,
    }).eq("id", entrega.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    setShowGrade(false);
    onChanged();
  };

  return (
    <div className="p-3 rounded-lg border" style={{ background: compact ? "var(--surface)" : "var(--bg-2)", borderColor: "var(--line)" }}>
      <div className="flex items-center gap-3 flex-wrap">
        {!compact && <Avatar profile={profile} size={36} />}
        <div className="flex-1 min-w-0">
          {!compact && (
            <div className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
              {profile?.nombre_completo || profile?.email || "Alumna"}
            </div>
          )}
          {tareaTitulo && (
            <div className="text-[11px] font-semibold" style={{ color: "var(--violet)" }}>{tareaTitulo}</div>
          )}
          <div className="text-[11px] flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
            <span className="inline-flex items-center gap-1 truncate">
              <FileText className="w-3 h-3" /> {entrega.archivo_nombre}
            </span>
            <span>·</span>
            <span>{new Date(entrega.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</span>
            {entrega.calificacion != null && (
              <>
                <span>·</span>
                <span className="font-bold inline-flex items-center gap-1" style={{ color: "var(--violet)" }}>
                  <Award className="w-3 h-3" /> {entrega.calificacion}
                </span>
              </>
            )}
          </div>
          {entrega.comentario && (
            <div className="text-xs mt-1 italic" style={{ color: "var(--muted)" }}>"{entrega.comentario}"</div>
          )}
          {entrega.feedback && !showGrade && (
            <div className="text-xs mt-1 px-2 py-1 rounded" style={{ background: "rgba(124,107,255,.08)", color: "var(--ink)" }}>
              <span className="font-semibold">Feedback:</span> {entrega.feedback}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={descargar} title="Descargar"><Download className="w-4 h-4" style={{ color: "var(--violet)" }} /></IconBtn>
          <button
            onClick={() => setShowGrade(!showGrade)}
            title="Calificar"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
          >
            <Award className="w-3.5 h-3.5" />
            {entrega.calificacion != null ? "Editar nota" : "Calificar"}
          </button>
          <IconBtn onClick={eliminar} title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></IconBtn>
        </div>
      </div>
      {showGrade && (
        <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "var(--line)" }}>
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-2">
            <input
              type="number" step="0.1" placeholder="Nota"
              value={cal} onChange={(e) => setCal(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
            <input
              placeholder="Feedback / comentario para la alumna"
              value={fb} onChange={(e) => setFb(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm"
              style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={guardarCal} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
            >
              {saving ? "Guardando..." : "Guardar calificación"}
            </button>
            <button onClick={() => setShowGrade(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: "var(--muted)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Modal: crear/editar tarea
   ============================================================ */
function TareaModal({
  editing, cursos, onClose, onSaved,
}: { editing: Tarea | null; cursos: Curso[]; onClose: () => void; onSaved: () => void }) {
  const { session } = useAuth();
  const [titulo, setTitulo] = useState(editing?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(editing?.descripcion ?? "");
  const [fechaLimite, setFechaLimite] = useState(
    editing?.fecha_limite ? new Date(editing.fecha_limite).toISOString().slice(0, 16) : "",
  );
  const [cursoId, setCursoId] = useState(editing?.curso_id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!titulo.trim()) return toast.error("Pon un título");
    setSaving(true);
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      fecha_limite: fechaLimite ? new Date(fechaLimite).toISOString() : null,
      curso_id: cursoId || null,
      created_by: session!.user.id,
    };
    const { error } = editing
      ? await supabase.from("tareas").update(payload).eq("id", editing.id)
      : await supabase.from("tareas").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Tarea actualizada" : "Tarea creada");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-5 md:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
            {editing ? "Editar tarea" : "Nueva tarea"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Título *</label>
            <input
              value={titulo} onChange={(e) => setTitulo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--ink)" }}
              placeholder="Ej: Análisis FODA de tu negocio"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Descripción / instrucciones</label>
            <textarea
              rows={4}
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--ink)" }}
              placeholder="Instrucciones de la tarea..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Fecha límite</label>
              <input
                type="datetime-local" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--ink)" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Curso (opcional)</label>
              <select
                value={cursoId} onChange={(e) => setCursoId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: "var(--bg-2)", borderColor: "var(--line)", color: "var(--ink)" }}
              >
                <option value="">— Ninguno —</option>
                {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={submit} disabled={saving}
            className="w-full mt-2 px-4 py-3 rounded-lg font-semibold text-white text-sm"
            style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
          >
            {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Reusable bits
   ============================================================ */
function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl grid place-items-center"
        style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
        <FileText className="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>Tareas</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="p-4 rounded-xl border" style={{
      background: highlight ? "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))" : "var(--surface)",
      borderColor: highlight ? "#f59e0b" : "var(--line)",
    }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1"
        style={{ color: highlight ? "#d97706" : "var(--muted)" }}>
        {icon} {label}
      </div>
      <div className="text-2xl font-bold" style={{ color: "var(--ink)" }}>{value}</div>
    </div>
  );
}

function StatusBadge({ color, icon, children }: { color: "green" | "red" | "amber"; icon?: React.ReactNode; children: React.ReactNode }) {
  const map = {
    green: { bg: "rgba(34,197,94,.12)", fg: "#16a34a" },
    red: { bg: "rgba(239,68,68,.12)", fg: "#dc2626" },
    amber: { bg: "rgba(245,158,11,.12)", fg: "#d97706" },
  }[color];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: map.bg, color: map.fg }}>
      {icon} {children}
    </span>
  );
}

function Avatar({ profile, size }: { profile: Profile | undefined; size: number }) {
  const initials = (profile?.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase();
  return (
    <div className="rounded-full grid place-items-center text-white font-semibold flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.4, background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
      {profile?.avatar_url
        ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
        : initials}
    </div>
  );
}

function IconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="p-2 rounded-lg hover:bg-black/5">{children}</button>;
}

function Spinner() {
  return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--violet)" }} /></div>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-16 rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: "var(--violet)" }} />
      <p className="text-sm" style={{ color: "var(--muted)" }}>{text}</p>
    </div>
  );
}