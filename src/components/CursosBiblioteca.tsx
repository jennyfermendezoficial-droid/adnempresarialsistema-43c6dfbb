import { subirImagen } from "@/lib/cloudinary";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BookOpen, Plus, Trash2, ImagePlus, Loader2, Pencil, X, ArrowRight } from "lucide-react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Curso { id: string; nombre: string; descripcion: string | null; color_cover: string | null; image_url: string | null; orden: number; grupo_id?: string | null }

interface Grupo {
  id: string;
  nombre: string;
  image_url: string | null;
  orden: number;
}

interface Props {
  tipo: "curso" | "clase_en_vivo";
  titulo: string;
  subtitulo: string;
  etiqueta: string;
  grupoId?: string;
  onGrupo?: (id: string | null) => void;
}

const SIN_GRUPO = "otros";

export function CursosBiblioteca({ tipo, titulo, subtitulo, etiqueta, grupoId, onGrupo }: Props) {
  const { session, role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const uid = session?.user.id;
  const navigate = useNavigate();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [uploadingCover, setUploadingCover] = useState<string | null>(null);
  const [editing, setEditing] = useState<Curso | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCursoId = useRef<string | null>(null);
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [grupoLocal, setGrupoLocal] = useState<string | null>(null);
  const [editGrupo, setEditGrupo] = useState<Grupo | null>(null);
  const [savingGrupo, setSavingGrupo] = useState(false);
  const [subiendoPortadaGrupo, setSubiendoPortadaGrupo] = useState(false);
  const grupoFileRef = useRef<HTMLInputElement>(null);

  const reloadGrupos = () =>
    supabase
      .from("grupos_cursos")
      .select("*")
      .order("orden")
      .then(({ data, error }) => setGrupos(error ? null : ((data as Grupo[]) ?? [])));

  useEffect(() => {
    if (tipo === "curso") reloadGrupos();
  }, [tipo]);

  // Agrupación por módulos (solo en Cursos y cuando ya existen módulos creados)
  const agrupar = tipo === "curso" && !!grupos && grupos.length > 0;
  const grupoSel = onGrupo ? (grupoId ?? null) : grupoLocal;
  const abrirGrupo = (id: string | null) => (onGrupo ? onGrupo(id) : setGrupoLocal(id));
  const sinGrupo = cursos.filter((c) => !c.grupo_id || !grupos?.some((g) => g.id === c.grupo_id));
  const grupoActual: Grupo | null =
    !agrupar || !grupoSel
      ? null
      : grupoSel === SIN_GRUPO
        ? { id: SIN_GRUPO, nombre: "Otros cursos", image_url: null, orden: 9999 }
        : (grupos?.find((g) => g.id === grupoSel) ?? null);
  const visibles = !agrupar
    ? cursos
    : grupoActual
      ? grupoActual.id === SIN_GRUPO
        ? sinGrupo
        : cursos.filter((c) => c.grupo_id === grupoActual.id)
      : [];
  const tarjetasGrupo: Grupo[] = agrupar
    ? [
        ...(grupos ?? []),
        ...(sinGrupo.length
          ? [{ id: SIN_GRUPO, nombre: "Otros cursos", image_url: null, orden: 9999 }]
          : []),
      ]
    : [];
  const cursosDe = (g: Grupo) =>
    g.id === SIN_GRUPO ? sinGrupo : cursos.filter((c) => c.grupo_id === g.id);

  const crearGrupo = async () => {
    const nombre = prompt("Nombre del módulo (ej: Módulo 0)")?.trim();
    if (!nombre) return;
    const { data, error } = await supabase
      .from("grupos_cursos")
      .insert({ nombre, orden: grupos?.length ?? 0 })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setGrupos((gs) => [...(gs ?? []), data as Grupo]);
  };

  const guardarGrupo = async () => {
    if (!editGrupo) return;
    const nombre = editGrupo.nombre.trim();
    if (!nombre) return toast.error("El módulo necesita un nombre");
    setSavingGrupo(true);
    const { error } = await supabase
      .from("grupos_cursos")
      .update({ nombre, image_url: editGrupo.image_url })
      .eq("id", editGrupo.id);
    setSavingGrupo(false);
    if (error) return toast.error(error.message);
    setGrupos((gs) =>
      (gs ?? []).map((g) => (g.id === editGrupo.id ? { ...editGrupo, nombre } : g)),
    );
    toast.success("Módulo actualizado");
    setEditGrupo(null);
  };

  const borrarGrupo = async (g: Grupo) => {
    const aviso = `¿Eliminar el módulo «${g.nombre}»? Sus cursos no se borran: pasan a «Otros cursos».`;
    if (!confirm(aviso)) return;
    const { error } = await supabase.from("grupos_cursos").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    setGrupos((gs) => (gs ?? []).filter((x) => x.id !== g.id));
    setCursos((cs) => cs.map((c) => (c.grupo_id === g.id ? { ...c, grupo_id: null } : c)));
    setEditGrupo(null);
    if (grupoSel === g.id) abrirGrupo(null);
  };

  const onPortadaGrupo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editGrupo) return;
    try {
      setSubiendoPortadaGrupo(true);
      const url = await subirImagen(file, "adn/cursos");
      setEditGrupo((g) => (g ? { ...g, image_url: url } : g));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubiendoPortadaGrupo(false);
    }
  };

  // Reordena una lista guardando la posición nueva de cada elemento que cambió
  const reordenar = async <T extends { id: string; orden: number }>(
    lista: T[],
    id: string,
    dir: -1 | 1,
    tabla: "cursos" | "grupos_cursos",
    aplicar: (orden: Map<string, number>) => void,
  ) => {
    const idx = lista.findIndex((x) => x.id === id);
    const dest = idx + dir;
    if (idx < 0 || dest < 0 || dest >= lista.length) return;
    const nueva = [...lista];
    [nueva[idx], nueva[dest]] = [nueva[dest], nueva[idx]];
    const orden = new Map(nueva.map((x, i) => [x.id, i + 1]));
    const cambiados = nueva.filter((x) => x.orden !== orden.get(x.id));
    aplicar(orden);
    const res = await Promise.all(
      cambiados.map((x) =>
        supabase
          .from(tabla)
          .update({ orden: orden.get(x.id) })
          .eq("id", x.id),
      ),
    );
    const err = res.find((r) => r.error)?.error;
    if (err) {
      toast.error(err.message);
      if (tabla === "cursos") reloadCursos();
      else reloadGrupos();
    }
  };

  const moverCurso = (c: Curso, dir: -1 | 1) =>
    reordenar(visibles, c.id, dir, "cursos", (orden) =>
      setCursos((cs) =>
        cs
          .map((x) => (orden.has(x.id) ? { ...x, orden: orden.get(x.id)! } : x))
          .sort((a, b) => a.orden - b.orden),
      ),
    );

  const moverGrupo = (g: Grupo, dir: -1 | 1) =>
    reordenar(grupos ?? [], g.id, dir, "grupos_cursos", (orden) =>
      setGrupos((gs) =>
        (gs ?? [])
          .map((x) => (orden.has(x.id) ? { ...x, orden: orden.get(x.id)! } : x))
          .sort((a, b) => a.orden - b.orden),
      ),
    );

  const reloadCursos = () =>
    supabase.from("cursos").select("*").eq("tipo", tipo).order("orden").then(({ data }) => setCursos((data as Curso[]) ?? []));

  useEffect(() => {
    reloadCursos();
    if (uid) supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid).then(({ data }) => {
      setPermisos(new Set(((data ?? []) as { curso_id: string }[]).map((p) => p.curso_id)));
    });
  }, [uid, tipo]);

  const crearCurso = async () => {
    const nombre = prompt(`Nombre de${etiqueta === "curso" ? "l curso" : " la clase en vivo"}`);
    if (!nombre) return;
    const enGrupo = grupoActual && grupoActual.id !== SIN_GRUPO ? { grupo_id: grupoActual.id } : {};
    const { data, error } = await supabase.from("cursos").insert({ nombre, orden: cursos.length, tipo, ...enGrupo }).select().single();
    if (error) return toast.error(error.message);
    setCursos((c) => [...c, data as Curso]);
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
      .update({
        nombre: editing.nombre,
        descripcion: editing.descripcion,
        ...(agrupar ? { grupo_id: editing.grupo_id ?? null } : {}),
      })
      .eq("id", editing.id);
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    setCursos((cs) => cs.map((c) => (c.id === editing.id ? { ...c, nombre: editing.nombre, descripcion: editing.descripcion, grupo_id: editing.grupo_id } : c)));
    toast.success("Actualizado");
    setEditing(null);
  };

  const tieneAcceso = (c: Curso) => isStaff || permisos.has(c.id);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onCoverChosen} />
      <input ref={grupoFileRef} type="file" accept="image/*" hidden onChange={onPortadaGrupo} />
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          {grupoActual && (
            <button
              onClick={() => abrirGrupo(null)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="w-4 h-4" /> Volver a módulos
            </button>
          )}
          <h1 className="text-3xl font-semibold">{grupoActual ? grupoActual.nombre : titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {grupoActual
              ? `${visibles.length} ${visibles.length === 1 ? "curso" : "cursos"} en este módulo`
              : agrupar
                ? "Elige un módulo para ver sus cursos."
                : subtitulo}
          </p>
        </div>
        {isStaff && agrupar && !grupoActual && (
          <button
            onClick={crearGrupo}
            className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nuevo módulo
          </button>
        )}
        {isStaff && (!agrupar || grupoActual) && <button onClick={crearCurso} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4"/>Nuev{etiqueta === "curso" ? "o curso" : "a clase en vivo"}</button>}
      </div>

      {agrupar && !grupoActual && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tarjetasGrupo.map((g, i) => {
            const total = cursosDe(g).length;
            const real = g.id !== SIN_GRUPO;
            return (
              <div key={g.id} className="rounded-2xl border bg-card overflow-hidden">
                <div className="relative aspect-square">
                  <button onClick={() => abrirGrupo(g.id)} className="block w-full h-full">
                    {g.image_url ? (
                      <img
                        src={g.image_url}
                        alt={g.nombre}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{ background: "linear-gradient(135deg, #7C6BFF, var(--violet-2))" }}
                      />
                    )}
                  </button>
                  {isStaff && real && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        onClick={() => moverGrupo(g, -1)}
                        disabled={i === 0}
                        title="Mover antes"
                        className="px-1.5 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs hover:bg-black/80 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moverGrupo(g, 1)}
                        disabled={i === (grupos?.length ?? 0) - 1}
                        title="Mover después"
                        className="px-1.5 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs hover:bg-black/80 disabled:opacity-40"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditGrupo(g)}
                        title="Editar módulo"
                        className="px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1 hover:bg-black/80"
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{g.nombre}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {total} {total === 1 ? "curso" : "cursos"}
                  </p>
                  <button
                    onClick={() => abrirGrupo(g.id)}
                    className="mt-3 w-full px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center justify-center gap-1"
                  >
                    <BookOpen className="w-4 h-4" /> Ver cursos
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibles.map((c, i) => {
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
                    {agrupar && (
                      <>
                        <button
                          onClick={() => moverCurso(c, -1)}
                          disabled={i === 0}
                          title="Mover antes"
                          className="px-1.5 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs hover:bg-black/80 disabled:opacity-40"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moverCurso(c, 1)}
                          disabled={i === visibles.length - 1}
                          title="Mover después"
                          className="px-1.5 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs hover:bg-black/80 disabled:opacity-40"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => cambiarPortada(c.id)}
                      disabled={uploadingCover === c.id}
                      title="Cambiar portada (1:1)"
                      className="px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1 hover:bg-black/80"
                    >
                      {uploadingCover === c.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImagePlus className="w-3 h-3"/>}
                    </button>
                    <button
                      onClick={() => setEditing(c)}
                      title="Editar curso"
                      className="px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1 hover:bg-black/80"
                    >
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
                  <Link
                    to="/cursos/$cursoId"
                    params={{ cursoId: c.id }}
                    className="mt-3 w-full px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center justify-center gap-1"
                  >
                    <BookOpen className="w-4 h-4" /> Entrar
                  </Link>
                ) : (
                  <button disabled className="mt-3 w-full px-3 py-2 rounded-lg border text-sm opacity-40">Sin acceso</button>
                )}
              </div>
            </div>
          );
        })}
        {visibles.length === 0 && (!agrupar || grupoActual) && <div className="col-span-full text-center text-muted-foreground py-12">No hay contenido todavía.</div>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-card border rounded-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">Editar {etiqueta}</h3>
              <button onClick={() => setEditing(null)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-4 items-start">
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border shrink-0 bg-muted">
                  {editing.image_url ? (
                    <img src={editing.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${editing.color_cover || "#7C6BFF"}, var(--violet-2))` }} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Portada cuadrada (1:1). Recomendado: 800×800px.</p>
                  <button
                    onClick={() => cambiarPortada(editing.id)}
                    disabled={uploadingCover === editing.id}
                    className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"
                  >
                    {uploadingCover === editing.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImagePlus className="w-3 h-3"/>}
                    Subir imagen
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Nombre</label>
                <input
                  value={editing.nombre}
                  onChange={(e) => setEditing({ ...editing, nombre: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Descripción</label>
                <textarea
                  value={editing.descripcion ?? ""}
                  onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none"
                  placeholder="Descripción del curso, objetivos, a quién va dirigido…"
                />
              </div>
              {agrupar && (
                <div>
                  <label className="text-xs font-medium">Módulo</label>
                  <select
                    value={editing.grupo_id ?? ""}
                    onChange={(e) => setEditing({ ...editing, grupo_id: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm"
                  >
                    <option value="">Sin módulo (Otros cursos)</option>
                    {(grupos ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                Para añadir clases, módulos, links y archivos entra al curso desde "Entrar al curso".
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border text-sm">Cancelar</button>
              <button
                onClick={() => { const id = editing.id; setEditing(null); navigate({ to: "/cursos/$cursoId", params: { cursoId: id } }); }}
                className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"
              >
                <ArrowRight className="w-3 h-3"/> Entrar al curso
              </button>
              <button
                onClick={guardarEdicion}
                disabled={savingEdit}
                className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"
              >
                {savingEdit && <Loader2 className="w-3 h-3 animate-spin"/>}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {editGrupo && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setEditGrupo(null)}
        >
          <div
            className="bg-card border rounded-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold">Editar módulo</h3>
              <button onClick={() => setEditGrupo(null)} className="opacity-60 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-4 items-start">
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border shrink-0 bg-muted">
                  {editGrupo.image_url ? (
                    <img src={editGrupo.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: "linear-gradient(135deg, #7C6BFF, var(--violet-2))" }}
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Portada cuadrada (1:1). Recomendado: 800×800px.
                  </p>
                  <button
                    onClick={() => grupoFileRef.current?.click()}
                    disabled={subiendoPortadaGrupo}
                    className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"
                  >
                    {subiendoPortadaGrupo ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3 h-3" />
                    )}
                    Subir imagen
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Nombre</label>
                <input
                  value={editGrupo.nombre}
                  onChange={(e) => setEditGrupo({ ...editGrupo, nombre: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm"
                />
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                Para poner un curso dentro de este módulo, abre el curso con «Editar» y elige el
                módulo.
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-between gap-2">
              <button
                onClick={() => borrarGrupo(editGrupo)}
                className="px-3 py-2 rounded-lg border text-sm text-red-500 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Eliminar
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditGrupo(null)}
                  className="px-3 py-2 rounded-lg border text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarGrupo}
                  disabled={savingGrupo || subiendoPortadaGrupo}
                  className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"
                >
                  {savingGrupo && <Loader2 className="w-3 h-3 animate-spin" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
