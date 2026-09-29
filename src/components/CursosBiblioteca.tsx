import { subirImagen } from "@/lib/cloudinary";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { esContenidoEquipo } from "@/lib/contenido-equipo";
import { BookOpen, Plus, Trash2, ImagePlus, Loader2, Pencil, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Curso {
  id: string;
  nombre: string;
  descripcion: string | null;
  color_cover: string | null;
  image_url: string | null;
  orden: number;
  solo_equipo?: boolean | null;
  parent_curso_id?: string | null;
}

interface Props { tipo: "curso" | "clase_en_vivo"; titulo: string; subtitulo: string; etiqueta: string }

export function CursosBiblioteca({ tipo, titulo, subtitulo, etiqueta }: Props) {
  const { session, role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const uid = session?.user.id;
  const navigate = useNavigate();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [uploadingCover, setUploadingCover] = useState<string | null>(null);
  const [editing, setEditing] = useState<Curso | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCursoId = useRef<string | null>(null);

  const reloadCursos = () =>
    supabase.from("cursos").select("*").eq("tipo", tipo).order("orden").then(({ data }) => {
      const visibles = ((data ?? []) as Curso[]).filter(
        (c) => c.solo_equipo !== true && !c.parent_curso_id && !esContenidoEquipo(c.descripcion),
      );
      setCursos(visibles);
    });

  useEffect(() => {
    reloadCursos();
    if (uid) supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid).then(({ data }) => {
      setPermisos(new Set(((data ?? []) as { curso_id: string }[]).map((p) => p.curso_id)));
    });
  }, [uid, tipo]);

  const abrirCrearCurso = () => {
    setNuevoNombre("");
    setCreating(true);
  };

  const cerrarCrearCurso = () => {
    if (savingCreate) return;
    setCreating(false);
    setNuevoNombre("");
  };

  const crearCurso = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return toast.error(`Escribe el nombre de${etiqueta === "curso" ? "l curso" : " la clase en vivo"}.`);
    setSavingCreate(true);
    const { data, error } = await supabase.from("cursos").insert({ nombre, orden: cursos.length, tipo }).select().single();
    setSavingCreate(false);
    if (error) return toast.error(error.message);
    setCursos((c) => [...c, data as Curso]);
    setCreating(false);
    setNuevoNombre("");
    toast.success(`${etiqueta === "curso" ? "Curso" : "Clase en vivo"} cread${etiqueta === "curso" ? "o" : "a"}`);
  };

  const borrarCurso = async (id: string) => {
    if (!confirm(`¿Eliminar ${etiqueta} (y sus módulos/lecciones)?`)) return;
    const { error } = await supabase.from("cursos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setCursos((c) => c.filter((x) => x.id !== id));
  };

  const cambiarPortada = (cursoId: string) => {
    pendingCursoId.current = cursoId;
    fileInputRef.current?.click();
  };

  const onCoverChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const cursoId = pendingCursoId.current;
    if (!file || !cursoId) return;
    try {
      setUploadingCover(cursoId);
      const publicUrl = await subirImagen(file, "adn/cursos");
      const { error } = await supabase.from("cursos").update({ image_url: publicUrl }).eq("id", cursoId);
      if (error) throw error;
      setCursos((cs) => cs.map((c) => (c.id === cursoId ? { ...c, image_url: publicUrl } : c)));
      setEditing((e) => (e && e.id === cursoId ? { ...e, image_url: publicUrl } : e));
      toast.success("Portada actualizada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingCover(null);
      pendingCursoId.current = null;
    }
  };

  const guardarEdicion = async () => {
    if (!editing) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from("cursos")
      .update({ nombre: editing.nombre, descripcion: editing.descripcion })
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    setCursos((cs) => cs.map((c) => (c.id === editing.id ? { ...c, nombre: editing.nombre, descripcion: editing.descripcion } : c)));
    toast.success("Actualizado");
    setEditing(null);
  };

  const tieneAcceso = (c: Curso) => isStaff || permisos.has(c.id);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onCoverChosen} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        {isStaff && <button onClick={abrirCrearCurso} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4"/>Nuev{etiqueta === "curso" ? "o curso" : "a clase en vivo"}</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cursos.map((c) => {
          const acceso = tieneAcceso(c);
          return (
            <div key={c.id} className="rounded-2xl border bg-card overflow-hidden group">
              <div className="relative aspect-square">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.nombre} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${c.color_cover || "#7C6BFF"}, var(--violet-2))` }} />
                )}
                {isStaff && (
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button onClick={() => cambiarPortada(c.id)} disabled={uploadingCover === c.id} title="Cambiar portada (1:1)" className="px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1 hover:bg-black/80">
                      {uploadingCover === c.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImagePlus className="w-3 h-3"/>}
                    </button>
                    <button onClick={() => setEditing(c)} title="Editar curso" className="px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1 hover:bg-black/80">
                      <Pencil className="w-3 h-3"/> Editar
                    </button>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{c.nombre}</h3>
                  {isStaff && <button onClick={() => borrarCurso(c.id)} className="opacity-50 hover:opacity-100"><Trash2 className="w-4 h-4"/></button>}
                </div>
                {c.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descripcion}</p>}
                {acceso ? (
                  <Link to="/cursos/$cursoId" params={{ cursoId: c.id }} className="mt-3 w-full px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center justify-center gap-1">
                    <BookOpen className="w-4 h-4" /> Entrar
                  </Link>
                ) : (
                  <button disabled className="mt-3 w-full px-3 py-2 rounded-lg border text-sm opacity-40">Sin acceso</button>
                )}
              </div>
            </div>
          );
        })}
        {cursos.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12">No hay contenido todavía.</div>}
      </div>

      {creating && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-card border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-semibold">Nuev{etiqueta === "curso" ? "o curso" : "a clase en vivo"}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Este formulario se mantiene abierto aunque cambies de pestaña.</p>
              </div>
              <button onClick={cerrarCrearCurso} disabled={savingCreate} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre *</label>
              <input
                autoFocus
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void crearCurso(); }}
                placeholder={etiqueta === "curso" ? "Nombre del curso" : "Nombre de la clase en vivo"}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
              />
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button onClick={cerrarCrearCurso} disabled={savingCreate} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={() => void crearCurso()} disabled={savingCreate || !nuevoNombre.trim()} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
                {savingCreate && <Loader2 className="w-4 h-4 animate-spin"/>}{savingCreate ? "Guardando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-card border rounded-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">Editar {etiqueta}</h3>
              <button onClick={() => setEditing(null)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-4 items-start">
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border shrink-0 bg-muted">
                  {editing.image_url ? <img src={editing.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${editing.color_cover || "#7C6BFF"}, var(--violet-2))` }} />}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Portada cuadrada (1:1). Recomendado: 800×800px.</p>
                  <button onClick={() => cambiarPortada(editing.id)} disabled={uploadingCover === editing.id} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1">
                    {uploadingCover === editing.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImagePlus className="w-3 h-3"/>} Subir imagen
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Nombre</label>
                <input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Descripción</label>
                <textarea value={editing.descripcion ?? ""} onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })} rows={4} className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none" placeholder="Descripción del curso, objetivos, a quién va dirigido…" />
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Para añadir clases, módulos, links y archivos entra al curso desde "Entrar al curso".</div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={() => { const id = editing.id; setEditing(null); navigate({ to: "/cursos/$cursoId", params: { cursoId: id } }); }} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"><ArrowRight className="w-3 h-3"/> Entrar al curso</button>
              <button onClick={guardarEdicion} disabled={savingEdit} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1">
                {savingEdit && <Loader2 className="w-3 h-3 animate-spin"/>} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
