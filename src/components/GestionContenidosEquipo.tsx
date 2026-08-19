import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, FolderTree, Layers3, Pencil, Plus, Radio, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CursoDetalle } from "@/components/CursoDetalle";
import { toast } from "sonner";

type TipoContenido = "curso" | "clase_en_vivo";

type Bloque = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoContenido;
  image_url: string | null;
  color_cover: string | null;
  orden: number;
  parent_curso_id?: string | null;
  tiene_submodulos?: boolean | null;
  solo_equipo?: boolean | null;
};

type FormState = {
  nombre: string;
  descripcion: string;
  tieneSubmodulos: boolean;
};

const FORM_VACIO: FormState = { nombre: "", descripcion: "", tieneSubmodulos: false };

export function GestionContenidosEquipo() {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [tipo, setTipo] = useState<TipoContenido>("curso");
  const [stack, setStack] = useState<Bloque[]>([]);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [leaf, setLeaf] = useState<Bloque | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bloque | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  const parent = stack.length ? stack[stack.length - 1] : null;

  const cargar = async () => {
    if (!isStaff) return;
    setLoading(true);
    const { data, error } = await supabase.from("cursos").select("*").eq("tipo", tipo).order("orden");
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const rows = ((data ?? []) as Bloque[]).filter((b) => {
      const esEquipo = b.solo_equipo === true;
      const parentId = b.parent_curso_id ?? null;
      return esEquipo && parentId === (parent?.id ?? null);
    });
    setBloques(rows);
    setLoading(false);
  };

  useEffect(() => {
    void cargar();
  }, [tipo, parent?.id, isStaff]); // eslint-disable-line react-hooks/exhaustive-deps

  const tituloTipo = tipo === "curso" ? "Cursos" : "Clases en vivo";
  const etiquetaNuevo = parent ? "Nuevo submódulo" : tipo === "curso" ? "Nuevo curso" : "Nueva biblioteca en vivo";

  const abrirCrear = () => {
    setEditing(null);
    setForm(FORM_VACIO);
    setCreating(true);
  };

  const abrirEditar = (b: Bloque) => {
    setCreating(false);
    setEditing(b);
    setForm({
      nombre: b.nombre,
      descripcion: b.descripcion ?? "",
      tieneSubmodulos: b.tiene_submodulos === true,
    });
  };

  const cerrarEditor = () => {
    if (saving) return;
    setCreating(false);
    setEditing(null);
    setForm(FORM_VACIO);
  };

  const validarCambioEstructura = async (b: Bloque, siguiente: boolean) => {
    const actual = b.tiene_submodulos === true;
    if (actual === siguiente) return true;

    if (actual && !siguiente) {
      const { data } = await supabase.from("cursos").select("id").eq("tipo", b.tipo);
      const hijos = ((data ?? []) as Bloque[]).filter((x) => x.parent_curso_id === b.id && x.solo_equipo === true);
      if (hijos.length) {
        toast.error("Primero elimina o mueve los submódulos que están dentro de este bloque.");
        return false;
      }
    }

    if (!actual && siguiente) {
      const { data } = await supabase.from("modulos_curso").select("id").eq("curso_id", b.id).limit(1);
      if ((data ?? []).length) {
        toast.error("Este bloque ya tiene contenido directo. Déjalo como contenido directo para no ocultar lo existente.");
        return false;
      }
    }
    return true;
  };

  const guardar = async () => {
    const nombre = form.nombre.trim();
    if (nombre.length < 2) return toast.error("Escribe un nombre para el bloque.");
    if (!isStaff) return toast.error("Solo Profesores y Líder/Dueño pueden gestionar este contenido.");

    setSaving(true);
    try {
      if (editing) {
        if (!(await validarCambioEstructura(editing, form.tieneSubmodulos))) return;
        const { error } = await (supabase.from("cursos") as any)
          .update({
            nombre,
            descripcion: form.descripcion.trim() || null,
            tiene_submodulos: form.tieneSubmodulos,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Bloque actualizado");
      } else {
        const { error } = await (supabase.from("cursos") as any).insert({
          nombre,
          descripcion: form.descripcion.trim() || null,
          tipo,
          orden: bloques.length,
          parent_curso_id: parent?.id ?? null,
          tiene_submodulos: form.tieneSubmodulos,
          solo_equipo: true,
        });
        if (error) throw error;
        toast.success(parent ? "Submódulo creado" : "Bloque creado");
      }
      cerrarEditor();
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const borrar = async (b: Bloque) => {
    const texto = b.tiene_submodulos
      ? "¿Eliminar este bloque y todos los submódulos que contiene?"
      : "¿Eliminar este bloque y su contenido?";
    if (!confirm(texto)) return;
    const { error } = await supabase.from("cursos").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("Bloque eliminado");
    await cargar();
  };

  const abrirBloque = (b: Bloque) => {
    if (b.tiene_submodulos) {
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
    return (
      <CursoDetalle
        cursoId={leaf.id}
        volver
        volverLabel={`Volver a ${parent?.nombre ?? tituloTipo}`}
        onVolver={() => setLeaf(null)}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="rounded-3xl p-6 mb-5 text-white shadow-xl" style={{ background: "linear-gradient(135deg,var(--deep-2),var(--violet))" }}>
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-80">Solo equipo</div>
        <h1 className="text-3xl font-bold mt-1">Cursos y clases</h1>
        <p className="text-sm opacity-90 mt-1">Gestiona contenido directo o crea estructuras con módulos y submódulos. Los alumnos no ven esta sección.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="inline-flex rounded-xl border bg-card p-1">
          <button
            onClick={() => cambiarTipo("curso")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${tipo === "curso" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}
          >
            <BookOpen className="w-4 h-4" /> Cursos
          </button>
          <button
            onClick={() => cambiarTipo("clase_en_vivo")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2 ${tipo === "clase_en_vivo" ? "bg-violet-gradient text-white" : "text-muted-foreground"}`}
          >
            <Radio className="w-4 h-4" /> Clases en vivo
          </button>
        </div>

        <div className="flex-1" />
        <button onClick={abrirCrear} className="px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> {etiquetaNuevo}
        </button>
      </div>

      {(parent || breadcrumbs.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-4 text-sm">
          <button onClick={volverNivel} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-card">
            <ChevronLeft className="w-4 h-4" /> Volver
          </button>
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
          {parent.descripcion && <p className="text-sm text-muted-foreground mt-1">{parent.descripcion}</p>}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Cargando…</div>
      ) : bloques.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <Layers3 className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <div className="font-semibold mt-3">Todavía no hay bloques aquí</div>
          <p className="text-sm text-muted-foreground mt-1">Crea uno y decide si tendrá contenido directo o submódulos internos.</p>
          <button onClick={abrirCrear} className="mt-4 px-4 py-2 rounded-xl bg-violet-gradient text-white text-sm font-semibold">{etiquetaNuevo}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bloques.map((b) => (
            <div key={b.id} className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <div className="relative aspect-[16/9]">
                {b.image_url ? (
                  <img src={b.image_url} alt={b.nombre} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${b.color_cover || "#7C6BFF"}, var(--violet-2))` }} />
                )}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold backdrop-blur">
                  {b.tiene_submodulos ? "Con submódulos" : "Contenido directo"}
                </div>
                <div className="absolute top-3 right-3 flex gap-1">
                  <button onClick={() => abrirEditar(b)} className="p-2 rounded-lg bg-black/60 text-white backdrop-blur" title="Editar estructura">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => void borrar(b)} className="p-2 rounded-lg bg-black/60 text-white backdrop-blur" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center shrink-0">
                    {b.tiene_submodulos ? <FolderTree className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{b.nombre}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{b.descripcion || (b.tiene_submodulos ? "Contenedor de submódulos" : "Contenido directo")}</p>
                  </div>
                </div>
                <button onClick={() => abrirBloque(b)} className="mt-4 w-full px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
                  {b.tiene_submodulos ? <FolderTree className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                  {b.tiene_submodulos ? "Ver submódulos" : "Abrir contenido"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={cerrarEditor}>
          <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="font-semibold">{editing ? "Editar bloque" : etiquetaNuevo}</div>
                <div className="text-xs text-muted-foreground">Visible únicamente para Profesores y Líder/Dueño.</div>
              </div>
              <button onClick={cerrarEditor} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre *</label>
                <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background" placeholder={parent ? "Ej. Módulo de bonos" : "Nombre del bloque"} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descripción</label>
                <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-lg border bg-background resize-none" placeholder="Qué contiene este bloque…" />
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estructura *</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tieneSubmodulos: false }))}
                    className={`rounded-xl border p-4 text-left ${!form.tieneSubmodulos ? "ring-2 ring-violet border-violet" : ""}`}
                  >
                    <BookOpen className="w-5 h-5 mb-2" />
                    <div className="font-semibold text-sm">Contenido directo</div>
                    <div className="text-xs text-muted-foreground mt-1">Al abrir entra directamente a sus módulos, clases, videos, links y archivos.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tieneSubmodulos: true }))}
                    className={`rounded-xl border p-4 text-left ${form.tieneSubmodulos ? "ring-2 ring-violet border-violet" : ""}`}
                  >
                    <FolderTree className="w-5 h-5 mb-2" />
                    <div className="font-semibold text-sm">Tiene submódulos</div>
                    <div className="text-xs text-muted-foreground mt-1">Al abrir muestra nuevos recuadros internos. Cada uno puede ser directo o contener más submódulos.</div>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button onClick={cerrarEditor} disabled={saving} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={saving} className="px-4 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold disabled:opacity-60">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
