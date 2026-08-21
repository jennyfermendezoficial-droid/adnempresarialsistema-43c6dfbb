import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CursoDetalle } from "@/components/CursoDetalle";
import { parseModuloCard, serializarModuloCard } from "@/lib/modulo-card";
import { toast } from "sonner";

interface Curso {
  id: string;
  nombre: string;
  descripcion: string | null;
  image_url: string | null;
  color_cover: string | null;
}

interface ModuloRow {
  id: string;
  curso_id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

interface ModuloVisual extends ModuloRow {
  descripcionVisible: string;
  imageUrl: string | null;
}

interface FormState {
  nombre: string;
  descripcion: string;
  imageUrl: string | null;
}

const FORM_VACIO: FormState = { nombre: "", descripcion: "", imageUrl: null };

function convertirModulo(row: ModuloRow): ModuloVisual {
  const parsed = parseModuloCard(row.descripcion);
  return {
    ...row,
    descripcionVisible: parsed.descripcion,
    imageUrl: parsed.meta.imageUrl,
  };
}

export function ClasesEnVivoModulosTarjetas({
  cursoId,
  onVolverBiblioteca,
}: {
  cursoId: string;
  onVolverBiblioteca: () => void;
}) {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [curso, setCurso] = useState<Curso | null>(null);
  const [modulos, setModulos] = useState<ModuloVisual[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduloAbierto, setModuloAbierto] = useState<ModuloVisual | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ModuloVisual | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const [{ data: cursoData, error: cursoError }, { data: modData, error: modError }] = await Promise.all([
      supabase.from("cursos").select("id,nombre,descripcion,image_url,color_cover").eq("id", cursoId).maybeSingle(),
      supabase.from("modulos_curso").select("id,curso_id,nombre,descripcion,orden").eq("curso_id", cursoId).order("orden"),
    ]);

    if (cursoError || modError) {
      toast.error(cursoError?.message || modError?.message || "No se pudo cargar Clases en vivo");
      setLoading(false);
      return;
    }

    setCurso((cursoData as Curso | null) ?? null);
    setModulos(((modData ?? []) as ModuloRow[]).map(convertirModulo));
    setLoading(false);
  };

  useEffect(() => {
    void cargar();
  }, [cursoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const resetEditor = () => {
    if (saving) return;
    setCreating(false);
    setEditing(null);
    setForm(FORM_VACIO);
    setImageFile(null);
    setImagePreview(null);
  };

  const abrirCrear = () => {
    if (!isStaff) return;
    setEditing(null);
    setForm(FORM_VACIO);
    setImageFile(null);
    setImagePreview(null);
    setCreating(true);
  };

  const abrirEditar = (modulo: ModuloVisual) => {
    if (!isStaff) return;
    setCreating(false);
    setEditing(modulo);
    setForm({
      nombre: modulo.nombre,
      descripcion: modulo.descripcionVisible,
      imageUrl: modulo.imageUrl,
    });
    setImageFile(null);
    setImagePreview(modulo.imageUrl);
  };

  const onImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Selecciona una imagen válida");
    if (file.size > 8 * 1024 * 1024) return toast.error("La portada no puede superar 8 MB");
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const subirPortada = async (file: File) => {
    const extRaw = file.name.split(".").pop() || "jpg";
    const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const path = `modulos/${cursoId}/${Date.now()}-${uuid}.${ext}`;

    const { error } = await supabase.storage.from("course-covers").upload(path, file, {
      upsert: false,
      cacheControl: "3600",
      contentType: file.type || undefined,
    });
    if (error) throw new Error(`No se pudo subir la portada: ${error.message}`);

    const { data } = supabase.storage.from("course-covers").getPublicUrl(path);
    if (!data.publicUrl) throw new Error("No se pudo obtener la URL de la portada");
    return data.publicUrl;
  };

  const guardar = async () => {
    if (!isStaff) return toast.error("Solo Profesor y Líder/Dueño pueden administrar módulos.");
    const nombre = form.nombre.trim();
    if (nombre.length < 2) return toast.error("Escribe el nombre del módulo.");

    setSaving(true);
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) imageUrl = await subirPortada(imageFile);
      const descripcion = serializarModuloCard(form.descripcion, imageUrl);

      if (editing) {
        const { error } = await supabase
          .from("modulos_curso")
          .update({ nombre, descripcion })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Módulo actualizado");
      } else {
        const { error } = await supabase.from("modulos_curso").insert({
          curso_id: cursoId,
          nombre,
          descripcion,
          orden: modulos.length,
        });
        if (error) throw error;
        toast.success("Módulo creado");
      }

      setCreating(false);
      setEditing(null);
      setForm(FORM_VACIO);
      setImageFile(null);
      setImagePreview(null);
      await cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el módulo");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (modulo: ModuloVisual) => {
    if (!isStaff) return;
    if (!confirm(`¿Eliminar “${modulo.nombre}” y todas las clases que contiene?`)) return;
    const { error } = await supabase.from("modulos_curso").delete().eq("id", modulo.id);
    if (error) return toast.error(error.message);
    toast.success("Módulo eliminado");
    await cargar();
  };

  const descripcionCurso = useMemo(() => curso?.descripcion?.trim() || "", [curso?.descripcion]);

  if (moduloAbierto) {
    return (
      <div>
        <div className="max-w-6xl mx-auto px-6 pt-5">
          <button
            onClick={() => setModuloAbierto(null)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a módulos
          </button>
          <div className="mt-3 text-sm text-muted-foreground">
            Módulo seleccionado: <span className="font-semibold text-foreground">{moduloAbierto.nombre}</span>
          </div>
        </div>
        <CursoDetalle
          cursoId={cursoId}
          volver
          volverLabel="Volver a módulos"
          onVolver={() => setModuloAbierto(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <button
            onClick={onVolverBiblioteca}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a Clases en vivo
          </button>
          <h1 className="text-3xl font-bold">{curso?.nombre || "Clases en vivo"}</h1>
          {descripcionCurso && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{descripcionCurso}</p>}
          <p className="text-sm text-muted-foreground mt-2">Selecciona un módulo para acceder a sus clases.</p>
        </div>

        {isStaff && (
          <button
            onClick={abrirCrear}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-gradient text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Nuevo módulo
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Cargando módulos…</div>
      ) : modulos.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <div className="font-semibold">Aún no hay módulos</div>
          <p className="text-sm text-muted-foreground mt-1">
            {isStaff ? "Crea el primer módulo para organizar las clases." : "Todavía no hay contenido disponible."}
          </p>
          {isStaff && (
            <button onClick={abrirCrear} className="mt-4 px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold">
              Crear módulo
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {modulos.map((modulo) => (
            <article key={modulo.id} className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <div className="relative aspect-square bg-muted">
                {modulo.imageUrl ? (
                  <img src={modulo.imageUrl} alt={modulo.nombre} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-gradient-to-br from-violet-950 via-zinc-900 to-amber-950">
                    <ImagePlus className="w-12 h-12 text-white/25" />
                  </div>
                )}

                {isStaff && (
                  <div className="absolute top-3 right-3 flex gap-2">
                    <button
                      onClick={() => abrirEditar(modulo)}
                      title="Editar módulo"
                      className="p-2 rounded-lg bg-black/65 text-white backdrop-blur hover:bg-black/80"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void eliminar(modulo)}
                      title="Eliminar módulo"
                      className="p-2 rounded-lg bg-black/65 text-white backdrop-blur hover:bg-black/80"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5 text-center">
                <h2 className="text-lg font-bold leading-tight">{modulo.nombre}</h2>
                <div className="h-1 rounded-full bg-violet-600 my-4" />
                {modulo.descripcionVisible && (
                  <p className="text-sm text-muted-foreground line-clamp-3 min-h-[42px]">{modulo.descripcionVisible}</p>
                )}
                <button
                  onClick={() => setModuloAbierto(modulo)}
                  className="mt-5 inline-flex items-center justify-center px-7 py-2.5 rounded-lg border-2 border-violet-600 text-violet-700 dark:text-violet-300 font-bold hover:bg-violet-600 hover:text-white transition-colors"
                >
                  Acceder
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={resetEditor}>
          <div className="w-full max-w-xl rounded-2xl border bg-card shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-card z-10">
              <div>
                <div className="font-semibold">{editing ? "Editar módulo" : "Nuevo módulo"}</div>
                <div className="text-xs text-muted-foreground">Solo Profesor y Líder/Dueño pueden modificar esta información.</div>
              </div>
              <button onClick={resetEditor} disabled={saving} className="p-2 rounded-lg hover:bg-muted disabled:opacity-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portada</label>
                <div className="mt-2 rounded-xl border overflow-hidden bg-muted">
                  <div className="aspect-square max-h-[360px] grid place-items-center">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Vista previa" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <ImagePlus className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <div className="text-xs">Puedes añadir la portada ahora o después desde Editar.</div>
                      </div>
                    )}
                  </div>
                  <label className="flex items-center justify-center gap-2 p-3 border-t cursor-pointer text-sm font-semibold hover:bg-muted/60">
                    <ImagePlus className="w-4 h-4" /> {imagePreview ? "Cambiar portada" : "Subir portada"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onImage(e.target.files?.[0])} />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background"
                  placeholder="Nombre del módulo"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descripción opcional</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background resize-none"
                  placeholder="Puedes dejarla vacía"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2 sticky bottom-0 bg-card">
              <button onClick={resetEditor} disabled={saving} className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={() => void guardar()}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
