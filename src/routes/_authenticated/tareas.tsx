import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  FileText, Plus, Upload, Trash2, Download, Loader2, Calendar, X,
  CheckCircle2, Clock, ChevronDown, ChevronUp, Users, Pencil,
} from "lucide-react";

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
}
interface Curso { id: string; nombre: string }
interface Profile { id: string; nombre_completo: string; email: string; avatar_url: string | null }

function Page() {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const isStaff = role === "admin" || role === "soporte";

  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Tarea | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = async () => {
    if (!uid) return;
    setLoading(true);
    const [{ data: t }, { data: e }, { data: c }] = await Promise.all([
      supabase.from("tareas").select("*").order("created_at", { ascending: false }),
      supabase.from("tareas_entregas").select("*").order("created_at", { ascending: false }),
      supabase.from("cursos").select("id,nombre").order("nombre"),
    ]);
    setTareas((t as Tarea[]) ?? []);
    setEntregas((e as Entrega[]) ?? []);
    setCursos((c as Curso[]) ?? []);

    // load profiles for alumnas con entregas (staff sees names)
    const ids = Array.from(new Set((e as Entrega[] | null)?.map((x) => x.alumna_id) ?? []));
    if (ids.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id,nombre_completo,email,avatar_url")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      (ps as Profile[] | null)?.forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, [uid]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg-2)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl grid place-items-center"
              style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>Tareas</h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {isStaff ? "Crea tareas y revisa las entregas de las alumnas" : "Sube tus tareas en PDF, Word o Excel"}
              </p>
            </div>
          </div>
          {isStaff && (
            <button
              onClick={() => { setEditing(null); setShowCreate(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-white text-sm"
              style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
            >
              <Plus className="w-4 h-4" /> Nueva tarea
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--violet)" }} /></div>
        ) : tareas.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: "var(--violet)" }} />
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {isStaff ? "Aún no has creado tareas. ¡Crea la primera!" : "Aún no hay tareas asignadas."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tareas.map((t) => (
              <TareaCard
                key={t.id}
                tarea={t}
                cursos={cursos}
                entregas={entregas.filter((x) => x.tarea_id === t.id)}
                profiles={profiles}
                myUid={uid!}
                isStaff={isStaff}
                expanded={expanded === t.id}
                onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                onEdit={() => { setEditing(t); setShowCreate(true); }}
                onChanged={reload}
              />
            ))}
          </div>
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

function TareaCard({
  tarea, cursos, entregas, profiles, myUid, isStaff, expanded, onToggle, onEdit, onChanged,
}: {
  tarea: Tarea;
  cursos: Curso[];
  entregas: Entrega[];
  profiles: Record<string, Profile>;
  myUid: string;
  isStaff: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const myEntrega = entregas.find((e) => e.alumna_id === myUid);
  const curso = cursos.find((c) => c.id === tarea.curso_id);
  const dueDate = tarea.fecha_limite ? new Date(tarea.fecha_limite) : null;
  const isLate = dueDate && dueDate < new Date() && !myEntrega;

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
              {!isStaff && myEntrega && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(34,197,94,.12)", color: "#16a34a" }}>
                  <CheckCircle2 className="w-3 h-3" /> Entregada
                </span>
              )}
              {!isStaff && !myEntrega && isLate && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(239,68,68,.12)", color: "#dc2626" }}>
                  Vencida
                </span>
              )}
            </div>
            {tarea.descripcion && (
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{tarea.descripcion}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs flex-wrap" style={{ color: "var(--muted)" }}>
              {dueDate && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Entrega: {dueDate.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
              {isStaff && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {entregas.length} entrega{entregas.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStaff && (
              <button onClick={onEdit} className="p-2 rounded-lg hover:bg-black/5" title="Editar">
                <Pencil className="w-4 h-4" style={{ color: "var(--muted)" }} />
              </button>
            )}
            {isStaff && (
              <button
                onClick={async () => {
                  if (!confirm("¿Eliminar tarea y todas sus entregas?")) return;
                  const { error } = await supabase.from("tareas").delete().eq("id", tarea.id);
                  if (error) return toast.error(error.message);
                  toast.success("Tarea eliminada");
                  onChanged();
                }}
                className="p-2 rounded-lg hover:bg-red-50"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            )}
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "rgba(124,107,255,.1)", color: "var(--violet)" }}
            >
              {isStaff ? "Entregas" : myEntrega ? "Mi entrega" : "Subir"} {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 md:px-5 py-4" style={{ borderColor: "var(--line)" }}>
          {isStaff ? (
            <StaffEntregasList entregas={entregas} profiles={profiles} onChanged={onChanged} />
          ) : (
            <StudentUploader tarea={tarea} myEntrega={myEntrega} myUid={myUid} onChanged={onChanged} />
          )}
        </div>
      )}
    </div>
  );
}

function StudentUploader({
  tarea, myEntrega, myUid, onChanged,
}: { tarea: Tarea; myEntrega: Entrega | undefined; myUid: string; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [comentario, setComentario] = useState(myEntrega?.comentario ?? "");
  const [progress, setProgress] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return toast.error("El archivo no puede superar 50 MB");
    try {
      setUploading(true);
      setProgress(20);
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${myUid}/${tarea.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tareas").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      setProgress(70);
      // Delete previous entrega + file
      if (myEntrega) {
        try { await supabase.storage.from("tareas").remove([myEntrega.archivo_url]); } catch {}
        await supabase.from("tareas_entregas").delete().eq("id", myEntrega.id);
      }
      const { error: insErr } = await supabase.from("tareas_entregas").insert({
        tarea_id: tarea.id,
        alumna_id: myUid,
        archivo_url: path,
        archivo_nombre: file.name,
        archivo_tipo: file.type || ext,
        comentario: comentario || null,
      });
      if (insErr) throw insErr;
      setProgress(100);
      toast.success("Tarea entregada");
      onChanged();
    } catch (err: any) {
      toast.error(err.message ?? "Error al subir");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const eliminarMia = async () => {
    if (!myEntrega || !confirm("¿Eliminar tu entrega?")) return;
    try { await supabase.storage.from("tareas").remove([myEntrega.archivo_url]); } catch {}
    const { error } = await supabase.from("tareas_entregas").delete().eq("id", myEntrega.id);
    if (error) return toast.error(error.message);
    toast.success("Entrega eliminada");
    onChanged();
  };

  const descargar = async () => {
    if (!myEntrega) return;
    const { data, error } = await supabase.storage.from("tareas").createSignedUrl(myEntrega.archivo_url, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-3">
      {myEntrega ? (
        <div className="flex items-center justify-between p-3 rounded-lg border gap-3 flex-wrap"
          style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 flex-shrink-0" style={{ color: "var(--violet)" }} />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>{myEntrega.archivo_nombre}</div>
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                Entregada el {new Date(myEntrega.created_at).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={descargar} className="p-2 rounded-lg hover:bg-black/5" title="Descargar">
              <Download className="w-4 h-4" style={{ color: "var(--violet)" }} />
            </button>
            <button onClick={eliminarMia} className="p-2 rounded-lg hover:bg-red-50" title="Eliminar">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      ) : null}

      {myEntrega?.calificacion != null && (
        <div className="p-3 rounded-lg border" style={{ background: "rgba(124,107,255,.05)", borderColor: "var(--line)" }}>
          <div className="text-xs font-semibold mb-1" style={{ color: "var(--violet)" }}>Calificación</div>
          <div className="text-2xl font-bold" style={{ color: "var(--ink)" }}>{myEntrega.calificacion}</div>
          {myEntrega.feedback && <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{myEntrega.feedback}</p>}
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
      </div>

      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.png,.jpg,.jpeg" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-white text-sm border-2 border-dashed"
        style={{ background: uploading ? "var(--muted)" : "linear-gradient(135deg,var(--violet),var(--violet-2))", borderColor: "transparent" }}
      >
        {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo {progress}%...</> : <><Upload className="w-4 h-4" /> {myEntrega ? "Reemplazar archivo" : "Subir archivo"}</>}
      </button>
      <p className="text-[11px] text-center" style={{ color: "var(--muted)" }}>
        PDF, Word, Excel, PowerPoint, imágenes o ZIP. Máx 50 MB.
      </p>
    </div>
  );
}

function StaffEntregasList({
  entregas, profiles, onChanged,
}: { entregas: Entrega[]; profiles: Record<string, Profile>; onChanged: () => void }) {
  if (entregas.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>Aún no hay entregas</p>;
  }
  return (
    <div className="space-y-2">
      {entregas.map((e) => (
        <EntregaRow key={e.id} entrega={e} profile={profiles[e.alumna_id]} onChanged={onChanged} />
      ))}
    </div>
  );
}

function EntregaRow({
  entrega, profile, onChanged,
}: { entrega: Entrega; profile: Profile | undefined; onChanged: () => void }) {
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

  const initials = (profile?.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="p-3 rounded-lg border" style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-full grid place-items-center text-white text-sm font-semibold flex-shrink-0"
          style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            : initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
            {profile?.nombre_completo || profile?.email || "Alumna"}
          </div>
          <div className="text-[11px] flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3 h-3" /> {entrega.archivo_nombre}
            </span>
            <span>·</span>
            <span>{new Date(entrega.created_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}</span>
            {entrega.calificacion != null && (
              <>
                <span>·</span>
                <span className="font-semibold" style={{ color: "var(--violet)" }}>Calif: {entrega.calificacion}</span>
              </>
            )}
          </div>
          {entrega.comentario && (
            <div className="text-xs mt-1 italic" style={{ color: "var(--muted)" }}>"{entrega.comentario}"</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={descargar} className="p-2 rounded-lg hover:bg-black/5" title="Descargar">
            <Download className="w-4 h-4" style={{ color: "var(--violet)" }} />
          </button>
          <button onClick={() => setShowGrade(!showGrade)} className="p-2 rounded-lg hover:bg-black/5" title="Calificar">
            <Pencil className="w-4 h-4" style={{ color: "var(--muted)" }} />
          </button>
          <button onClick={eliminar} className="p-2 rounded-lg hover:bg-red-50" title="Eliminar">
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
      {showGrade && (
        <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "var(--line)" }}>
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-2">
            <input
              type="number" step="0.1" placeholder="Calif."
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
          <button
            onClick={guardarCal} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
          >
            {saving ? "Guardando..." : "Guardar calificación"}
          </button>
        </div>
      )}
    </div>
  );
}

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
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Descripción</label>
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