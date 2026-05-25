import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { BookOpen, Plus, Trash2, ChevronRight, X, Play, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createBunnyVideoForUpload, getBunnyPublicConfig, deleteBunnyVideo } from "@/lib/bunny.functions";
import * as tus from "tus-js-client";

export const Route = createFileRoute("/_authenticated/cursos")({ component: Page });

interface Curso { id: string; nombre: string; descripcion: string | null; color_cover: string | null; orden: number }
interface Modulo { id: string; curso_id: string; nombre: string; descripcion: string | null; orden: number }
interface Leccion { id: string; modulo_id: string; nombre: string; descripcion: string | null; bunny_video_id: string | null; orden: number; duracion_min: number | null }

function Page() {
  const { session, role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const uid = session?.user.id;
  const createBunny = useServerFn(createBunnyVideoForUpload);
  const getBunnyCfg = useServerFn(getBunnyPublicConfig);
  const removeBunny = useServerFn(deleteBunnyVideo);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Curso | null>(null);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [lecciones, setLecciones] = useState<Leccion[]>([]);
  const [playing, setPlaying] = useState<Leccion | null>(null);
  const [bunnyCfg, setBunnyCfg] = useState<{ libraryId: string; cdnHostname: string } | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingModId = useRef<string | null>(null);

  useEffect(() => { getBunnyCfg().then(setBunnyCfg).catch(() => {}); }, []); // eslint-disable-line

  useEffect(() => {
    supabase.from("cursos").select("*").order("orden").then(({ data }) => setCursos((data as Curso[]) ?? []));
    if (uid) supabase.from("permisos_cursos").select("curso_id").eq("usuario_id", uid).then(({ data }) => {
      setPermisos(new Set(((data ?? []) as { curso_id: string }[]).map((p) => p.curso_id)));
    });
  }, [uid]);

  const openCurso = async (c: Curso) => {
    setOpen(c);
    const { data: mods } = await supabase.from("modulos_curso").select("*").eq("curso_id", c.id).order("orden");
    setModulos((mods as Modulo[]) ?? []);
    const modIds = (mods ?? []).map((m: Modulo) => m.id);
    if (modIds.length) {
      const { data: lecs } = await supabase.from("lecciones").select("*").in("modulo_id", modIds).order("orden");
      setLecciones((lecs as Leccion[]) ?? []);
    } else setLecciones([]);
  };

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
  const crearModulo = async () => {
    if (!open) return;
    const nombre = prompt("Nombre del módulo");
    if (!nombre) return;
    const { data, error } = await supabase.from("modulos_curso").insert({ curso_id: open.id, nombre, orden: modulos.length }).select().single();
    if (error) return toast.error(error.message);
    setModulos((m) => [...m, data as Modulo]);
  };
  const subirLeccion = (modId: string) => {
    pendingModId.current = modId;
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const modId = pendingModId.current;
    if (!file || !modId) return;
    const nombre = prompt("Nombre de la lección", file.name.replace(/\.[^.]+$/, ""));
    if (!nombre) return;

    try {
      setUploadingFor(modId);
      setUploadPct(0);
      const cred = await createBunny({ data: { title: nombre } });

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: "https://video.bunnycdn.com/tusupload",
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: cred.authorizationSignature,
            AuthorizationExpire: String(cred.authorizationExpire),
            VideoId: cred.videoId,
            LibraryId: cred.libraryId,
          },
          metadata: { filetype: file.type, title: nombre },
          onError: (err) => reject(err),
          onProgress: (sent, total) => setUploadPct(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        upload.start();
      });

      const orden = lecciones.filter((l) => l.modulo_id === modId).length;
      const { data, error } = await supabase
        .from("lecciones")
        .insert({ modulo_id: modId, nombre, bunny_video_id: cred.videoId, orden })
        .select()
        .single();
      if (error) throw error;
      setLecciones((l) => [...l, data as Leccion]);
      toast.success("Lección subida");
    } catch (err) {
      toast.error((err as Error).message || "Error subiendo el video");
    } finally {
      setUploadingFor(null);
      setUploadPct(0);
      pendingModId.current = null;
    }
  };

  const borrarLeccion = async (l: Leccion) => {
    if (!confirm("¿Eliminar lección y su video?")) return;
    try {
      if (l.bunny_video_id && /^[0-9a-f-]{20,}$/i.test(l.bunny_video_id)) {
        await removeBunny({ data: { videoId: l.bunny_video_id } }).catch(() => {});
      }
      const { error } = await supabase.from("lecciones").delete().eq("id", l.id);
      if (error) throw error;
      setLecciones((arr) => arr.filter((x) => x.id !== l.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const tieneAcceso = (c: Curso) => isStaff || permisos.has(c.id);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={onFileChosen} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold">Cursos</h1>
          <p className="text-sm text-muted-foreground">Tus cursos y clases en video.</p>
        </div>
        {isStaff && <button onClick={crearCurso} className="px-3 py-2 rounded-lg bg-violet-gradient text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4"/>Nuevo curso</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cursos.map((c) => {
          const acceso = tieneAcceso(c);
          return (
            <div key={c.id} className="rounded-2xl border bg-card overflow-hidden">
              <div className="h-32" style={{ background: `linear-gradient(135deg, ${c.color_cover || "#7C6BFF"}, var(--violet-2))` }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{c.nombre}</h3>
                  {isStaff && <button onClick={() => borrarCurso(c.id)} className="opacity-50 hover:opacity-100"><Trash2 className="w-4 h-4"/></button>}
                </div>
                {c.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descripcion}</p>}
                <button
                  disabled={!acceso}
                  onClick={() => openCurso(c)}
                  className="mt-3 w-full px-3 py-2 rounded-lg border hover:bg-muted text-sm flex items-center justify-center gap-1 disabled:opacity-40"
                >
                  <BookOpen className="w-4 h-4" /> {acceso ? "Entrar" : "Sin acceso"}
                </button>
              </div>
            </div>
          );
        })}
        {cursos.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12">No hay cursos todavía.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 grid place-items-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-card rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-xl font-semibold">{open.nombre}</h2>
              <div className="flex gap-2">
                {isStaff && <button onClick={crearModulo} className="text-sm px-2 py-1 rounded border flex items-center gap-1"><Plus className="w-3 h-3"/>Módulo</button>}
                <button onClick={() => setOpen(null)}><X className="w-5 h-5"/></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {modulos.map((m) => (
                <div key={m.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{m.nombre}</h3>
                    {isStaff && (
                      <button
                        disabled={uploadingFor !== null}
                        onClick={() => subirLeccion(m.id)}
                        className="text-xs px-2 py-1 rounded border flex items-center gap-1 disabled:opacity-50"
                      >
                        {uploadingFor === m.id ? (
                          <><Loader2 className="w-3 h-3 animate-spin"/>Subiendo {uploadPct}%</>
                        ) : (
                          <><Upload className="w-3 h-3"/>Subir lección</>
                        )}
                      </button>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {lecciones.filter((l) => l.modulo_id === m.id).map((l) => (
                      <li key={l.id} className="flex items-center gap-1">
                        <button onClick={() => setPlaying(l)} className="flex-1 text-left flex items-center gap-2 p-2 rounded hover:bg-muted text-sm">
                          <Play className="w-4 h-4 text-violet" /> {l.nombre}
                          <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
                        </button>
                        {isStaff && (
                          <button onClick={() => borrarLeccion(l)} className="p-1 opacity-50 hover:opacity-100" title="Eliminar"><Trash2 className="w-3.5 h-3.5"/></button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {modulos.length === 0 && <p className="text-center text-muted-foreground py-8">Aún sin módulos.</p>}
            </div>
          </div>
        </div>
      )}

      {playing && (
        <div className="fixed inset-0 bg-black/80 z-50 grid place-items-center p-4" onClick={() => setPlaying(null)}>
          <div className="bg-black rounded-2xl w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between p-3 text-white">
              <h3 className="font-semibold">{playing.nombre}</h3>
              <button onClick={() => setPlaying(null)}><X className="w-5 h-5"/></button>
            </div>
            <div className="aspect-video">
              {playing.bunny_video_id ? (
                /youtube\.com|youtu\.be/.test(playing.bunny_video_id) ? (
                  <iframe src={playing.bunny_video_id.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")} className="w-full h-full" allowFullScreen />
                ) : /^[0-9a-f-]{20,}$/i.test(playing.bunny_video_id) && bunnyCfg ? (
                  <iframe
                    src={`https://iframe.mediadelivery.net/embed/${bunnyCfg.libraryId}/${playing.bunny_video_id}?autoplay=true`}
                    className="w-full h-full"
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen
                  />
                ) : (
                  <video src={playing.bunny_video_id} controls autoPlay className="w-full h-full" />
                )
              ) : (
                <div className="grid place-items-center h-full text-white/70">Sin video asignado</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
