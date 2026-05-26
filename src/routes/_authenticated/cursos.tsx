import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BookOpen, Plus, Trash2, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cursos")({ component: Page });

interface Curso { id: string; nombre: string; descripcion: string | null; color_cover: string | null; image_url: string | null; orden: number }

function Page() {
  const { session, role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const uid = session?.user.id;
  const navigate = useNavigate();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [uploadingCover, setUploadingCover] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCursoId = useRef<string | null>(null);

  const reloadCursos = () =>
    supabase.from("cursos").select("*").order("orden").then(({ data }) => setCursos((data as Curso[]) ?? []));

  useEffect(() => {
    reloadCursos();
    if (uid) supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid).then(({ data }) => {
      setPermisos(new Set(((data ?? []) as { curso_id: string }[]).map((p) => p.curso_id)));
    });
  }, [uid]);

  const crearCurso = async () => {
    const nombre = prompt("Nombre del curso");
    if (!nombre) return;
    const { data, error } = await supabase.from("cursos").insert({ nombre, orden: cursos.length }).select().single();
    if (error) return toast.error(error.message);
    setCursos((c) => [...c, data as Curso]);
  };
  const borrarCurso = async (id: string) => {
    if (!confirm("¿Eliminar curso (y sus módulos/lecciones)?")) return;
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
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${cursoId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("course-covers").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("course-covers").getPublicUrl(path);
      const { error } = await supabase.from("cursos").update({ image_url: pub.publicUrl }).eq("id", cursoId);
      if (error) throw error;
      setCursos((cs) => cs.map((c) => (c.id === cursoId ? { ...c, image_url: pub.publicUrl } : c)));
      toast.success("Portada actualizada");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingCover(null);
      pendingCursoId.current = null;
    }
  };

  const tieneAcceso = (c: Curso) => isStaff || permisos.has(c.id);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onCoverChosen} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold">Cursos</h1>
          <p className="text-sm text-muted-foreground">Entra a un curso para ver todos los módulos y clases.</p>
        </div>
        {isStaff && <button onClick={crearCurso} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4"/>Nuevo curso</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cursos.map((c) => {
          const acceso = tieneAcceso(c);
          return (
            <div key={c.id} className="rounded-2xl border bg-card overflow-hidden group">
              <div className="relative h-40">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.nombre} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${c.color_cover || "#7C6BFF"}, var(--violet-2))` }} />
                )}
                {isStaff && (
                  <button
                    onClick={() => cambiarPortada(c.id)}
                    disabled={uploadingCover === c.id}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1 hover:bg-black/80"
                  >
                    {uploadingCover === c.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <ImagePlus className="w-3 h-3"/>}
                    {c.image_url ? "Cambiar" : "Subir portada"}
                  </button>
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
                    <BookOpen className="w-4 h-4" /> Entrar al curso
                  </Link>
                ) : (
                  <button disabled className="mt-3 w-full px-3 py-2 rounded-lg border text-sm opacity-40">Sin acceso</button>
                )}
              </div>
            </div>
          );
        })}
        {cursos.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12">No hay cursos todavía.</div>}
      </div>
    </div>
  );
}
