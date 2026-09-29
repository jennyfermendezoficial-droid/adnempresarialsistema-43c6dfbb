import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, ChevronLeft, ChevronRight, FolderTree, ImagePlus,
  Layers3, Loader2, Pencil, Plus, Radio, Trash2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CursoDetalle } from "@/components/CursoDetalle";
import { subirImagen } from "@/lib/cloudinary";
import { parseContenidoEquipo, serializarContenidoEquipo } from "@/lib/contenido-equipo";
import { toast } from "sonner";

type TipoContenido = "curso" | "clase_en_vivo";

type CursoRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoContenido;
  image_url: string | null;
  color_cover: string | null;
  orden: number;
};

type Bloque = CursoRow & {
  descripcionVisible: string;
  parentId: string | null;
  nested: boolean;
};

type FormState = {
  nombre: string;
  descripcion: string;
  nested: boolean;
  imageUrl: string | null;
};

const FORM_VACIO: FormState = { nombre: "", descripcion: "", nested: false, imageUrl: null };

function convertir(row: CursoRow): Bloque | null {
  const parsed = parseContenidoEquipo(row.descripcion);
  if (!parsed.meta) return null;
  return {
    ...row,
    descripcionVisible: parsed.descripcion,
    parentId: parsed.meta.parentId,
    nested: parsed.meta.nested,
  };
}

export function GestionContenidosEquipo() {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [tipo, setTipo] = useState<TipoContenido>("curso");
  const [stack, setStack] = useState<Bloque[]>([]);
  const [todos, setTodos] = useState<Bloque[]>([]);
  const [leaf, setLeaf] = useState<Bloque | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bloque | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parent = stack.length ? stack[stack.length - 1] : null;
  const bloques = useMemo(
    () => todos.filter((b) => b.parentId === (parent?.id ?? null)),
    [todos, parent?.id],
  );

  const cargar = async () => {
    if (!isStaff) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("cursos")
      .select("id,nombre,descripcion,tipo,image_url,color_cover,orden")
      .eq("tipo", tipo)
      .order("orden");

    if (error) {
      setLoading(false);
      toast.error(error.message || "No se pudo cargar el contenido");
      return;
    }

    setTodos(((data ?? []) as CursoRow[]).map(convertir).filter(Boolean) as Bloque[]);
    setLoading(false);
  };

  useEffect(() => {
    void cargar();
  }, [tipo, isStaff]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const tituloTipo = tipo === "curso" ? "Cursos" : "Clases en vivo";
  const etiquetaNuevo = parent ? "Nuevo submódulo" : tipo === "curso" ? "Nuevo curso" : "Nueva biblioteca en vivo";

  const resetEditor = () => {
    setCreating(false);
    setEditing(null);
    setForm(FORM_VACIO);
    setImageFile(null);
    setImagePreview(null);
  };

  const abrirCrear = () => {
    setEditing(null);
    setForm(FORM_VACIO);
    setImageFile(null);
    setImagePreview(null);
    setCreating(true);
  };

  const abrirEditar = (b: Bloque) => {
    setCreating(false);
    setEditing(b);
    setForm({ nombre: b.nombre, descripcion: b.descripcionVisible, nested: b.nested, imageUrl: b.image_url });
    setImageFile(null);
    setImagePreview(b.image_url);
  };

  const onImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Selecciona una imagen válida");
    if (file.size > 8 * 1024 * 1024) return toast.error("La portada no puede superar 8 MB");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const validarCambioEstructura = async (b: Bloque, siguiente: boolean) => {
    if (b.nested === siguiente) return true;
    if (b.nested && !siguiente && todos.some((x) => x.parentId === b.id)) {
      toast.error("Primero elimina los submódulos que están dentro de este bloque.");
      return false;
    }
    if (!b.nested && siguiente) {
      const { data } = await supabase.from("modulos_curso").select("id").eq("curso_id", b.id).limit(1);
      if ((data ?? []).length) {
        toast.error("Este bloque ya tiene contenido directo. No se puede convertir sin mover primero ese contenido.");
        return false;
      }
    }
    return true;
  };

  const guardar = async () => {
    if (!isStaff) return toast.error("Solo Profesores y Líder/Dueño pueden gestionar este contenido.");
    const nombre = form.nombre.trim();
    if (nombre.length < 2) return toast.error("Escribe un nombre para el bloque.");

    setSaving(true);
    try {
      if (editing && !(await validarCambioEstructura(editing, form.nested))) return;

      let imageUrl = form.imageUrl;
      if (imageFile) imageUrl = await subirImagen(imageFile, "adn/cursos");

      const descripcion = serializarContenidoEquipo(
        form.descripcion,
        editing?.parentId ?? parent?.id ?? null,
        form.nested,
      );

      if (editing) {
        const { error } = await supabase.from("cursos").update({ nombre, descripcion, image_url: imageUrl }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Bloque actualizado");
      } else {
        const { error } = await supabase.from("cursos").insert({
          nombre,
          descripcion,
          image_url: imageUrl,
          orden: bloques.length,
          tipo,
        });
        if (error) throw error;
        toast.success(parent ? "Submódulo creado" : "Bloque creado");
      }

      resetEditor();
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const descendientes = (id: string): Bloque[] => {
    const directos = todos.filter((x) => x.parentId === id);
    return directos.flatMap((h) => [...descendientes(h.id), h]);
  };

  const borrar = async (b: Bloque) => {
    if (!confirm(b.nested ? "¿Eliminar este bloque y todos los submódulos que contiene?" : "¿Eliminar este bloque y su contenido?")) return;
    const ids = [...descendientes(b.id).map((x) => x.id), b.id];
    for (const id of ids) {
      const { error } = await supabase.from("cursos").delete().eq("id", id);
      if (error) return toast.error(error.message);
    }
    toast.success("Bloque eliminado");
    await cargar();
  };

  const abrirBloque = (b: Bloque) => {
    if (b.nested) {
      setStack((s) => [...s, b]);
      setLeaf(null);
    } else {
      setLeaf(b);
    }
  };

  const volverNivel = () => {
    setLeaf(null);
    setStack((s) => s.slice(0, -1));
  };

  const cambiarTipo = (next: TipoContenido) => {
    setTipo(next);
    setStack([]);
    setLeaf(null);
  };

  const breadcrumbs = useMemo(() => stack.map((b) => b.nombre), [stack]);

  if (!isStaff) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-2xl border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="text-sm text-muted-foreground mt-2">Esta sección es exclusiva para Profesores y Líder/Dueño.</p>
        </div>
      </div>
    );
  }

  if (leaf) {
    return <CursoDetalle cursoId={leaf.id} volver volverLabel={`Volver a ${parent?.nombre ?? tituloTipo}`} onVolver={() => setLeaf(null)} />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="rounded-3xl p-6 mb-5 text-white shadow-xl" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Solo equipo</div>
        <h1 className="text-3xl font-bold mt-1">Cursos y clases</h1>
        <p className="text-sm opacity-90 mt-1">Crea cursos con contenido directo o con submódulos internos. Solo Profesores y Líder/Dueño pueden ver esta zona.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="inline-flex rounded-xl border bg-card p-1">
          <button onClick={() => cambiarTipo("curso")} className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${tipo === "curso" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>
            <BookOpen className="w-4 h-4" /> Cursos
          </button>
          <button onClick={() => cambiarTipo("clase_en_vivo")} className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${tipo === "clase_en_vivo" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}>
            <Radio className="w-4 h-4" /> Clases en vivo
          </button>
        </div>
        <div className="flex-1" />
        <button onClick={abrirCrear} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> {etiquetaNuevo}
        </button>
      </div>

      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4 text-sm">
          <button onClick={volverNivel} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-card"><ChevronLeft className="w-4 h-4" /> Volver</button>
          <span className="text-muted-foreground">{tituloTipo}</span>
          {breadcrumbs.map((b, i) => (
            <span key={`${b}-${i}`} className="inline-flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className={i === breadcrumbs.length - 1 ? "font-semibold" : "text-muted-foreground"}>{b}</span>
            </span>
          ))}
        </div>
      )}

      {parent && (
        <div className="rounded-2xl border bg-card p-4 mb-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Dentro de</div>
          <div className="text-lg font-semibold mt-1">{parent.nombre}</div>
          {parent.descripcionVisible && <p className="text-sm text-muted-foreground mt-1">{parent.descripcionVisible}</p>}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Cargando…</div>
      ) : bloques.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <Layers3 className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <div className="font-semibold mt-3">Todavía no hay bloques aquí</div>
          <p className="text-sm text-muted-foreground mt-1">Crea uno y decide si tendrá contenido directo o submódulos.</p>
          <button onClick={abrirCrear} className="mt-4 px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold">{etiquetaNuevo}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {bloques.map((b) => (
            <article key={b.id} className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <div className="relative aspect-[16/9] bg-muted">
                {b.image_url ? <img src={b.image_url} alt={b.nombre} className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full grid place-items-center" style={{ background: `linear-gradient(135deg, ${b.color_cover || "#171124"}, #4a3500)` }}><ImagePlus className="w-10 h-10 text-white/40" /></div>
                )}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/65 text-white text-[11px] font-semibold backdrop-blur">{b.nested ? "Con submódulos" : "Contenido directo"}</div>
                <div className="absolute top-3 right-3 flex gap-1">
                  <button onClick={() => abrirEditar(b)} className="p-2 rounded-lg bg-black/65 text-white backdrop-blur" title="Editar"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => void borrar(b)} className="p-2 rounded-lg bg-black/65 text-white backdrop-blur" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="p-5 text-center">
                <h3 className="text-xl font-bold leading-tight">{b.nombre}</h3>
                <div className="h-1 rounded-full bg-violet-600 my-4" />
                <p className="text-sm text-muted-foreground min-h-[42px]">{b.descripcionVisible || (b.nested ? "Explora los submódulos de este contenido." : "Accede al contenido del curso.")}</p>
                <button onClick={() => abrirBloque(b)} className="mt-5 inline-flex items-center justify-center px-6 py-2.5 rounded-lg border-2 border-violet-600 text-violet-700 dark:text-violet-300 font-bold hover:bg-violet-600 hover:text-white transition-colors">Acceder</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => !saving && resetEditor()}>
          <div className="w-full max-w-xl rounded-2xl border bg-card shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-card z-10">
              <div>
                <div className="font-semibold">{editing ? "Editar bloque" : etiquetaNuevo}</div>
                <div className="text-xs text-muted-foreground">Visible únicamente para Profesores y Líder/Dueño.</div>
              </div>
              <button onClick={resetEditor} disabled={saving} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portada</label>
                <div className="mt-2 rounded-xl border overflow-hidden bg-muted">
                  <div className="aspect-[16/9] grid place-items-center">
                    {imagePreview ? <img src={imagePreview} alt="Vista previa" className="w-full h-full object-cover" /> : (
                      <div className="text-center text-muted-foreground"><ImagePlus className="w-9 h-9 mx-auto mb-2 opacity-50" /><div className="text-xs">Sube la imagen que aparecerá arriba del curso.</div></div>
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
                <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background" placeholder={parent ? "Ej. Módulo de bonos" : "Nombre del curso"} />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background resize-none" placeholder="Descripción que aparecerá debajo del nombre…" />
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estructura *</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm((f) => ({ ...f, nested: false }))} className={`rounded-xl border p-4 text-left ${!form.nested ? "ring-2 ring-violet border-violet" : ""}`}>
                    <BookOpen className="w-5 h-5 mb-2" /><div className="font-semibold text-sm">Contenido directo</div><div className="text-xs text-muted-foreground mt-1">Acceder abre directamente sus módulos, clases, videos, links y archivos.</div>
                  </button>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, nested: true }))} className={`rounded-xl border p-4 text-left ${form.nested ? "ring-2 ring-violet border-violet" : ""}`}>
                    <FolderTree className="w-5 h-5 mb-2" /><div className="font-semibold text-sm">Tiene submódulos</div><div className="text-xs text-muted-foreground mt-1">Acceder muestra nuevos recuadros internos antes de llegar al contenido.</div>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2 sticky bottom-0 bg-card">
              <button onClick={resetEditor} disabled={saving} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
