import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Plus, Trash2, Upload, Loader2, Play, CheckCircle2, Circle, Link as LinkIcon, Paperclip, FileText, Save, Pencil, Youtube } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createBunnyVideoForUpload, getBunnyPublicConfig, deleteBunnyVideo } from "@/lib/bunny.functions";

export const Route = createFileRoute("/_authenticated/cursos/$cursoId")({ component: Page });

interface Curso { id: string; nombre: string; descripcion: string | null; image_url: string | null; color_cover: string | null }
interface Modulo { id: string; curso_id: string; nombre: string; descripcion: string | null; orden: number }
interface Recurso { tipo: "link" | "archivo"; nombre: string; url: string }
interface Leccion { id: string; modulo_id: string; nombre: string; descripcion: string | null; bunny_video_id: string | null; orden: number; duracion_min: number | null; recursos_adjuntos: Recurso[] | null }

function Page() {
  const { cursoId } = Route.useParams();
  const { session, role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const uid = session?.user.id;

  const createBunny = useServerFn(createBunnyVideoForUpload);
  const getBunnyCfg = useServerFn(getBunnyPublicConfig);
  const removeBunny = useServerFn(deleteBunnyVideo);

  const [curso, setCurso] = useState<Curso | null>(null);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [lecciones, setLecciones] = useState<Leccion[]>([]);
  const [completadas, setCompletadas] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Leccion | null>(null);
  const [bunnyCfg, setBunnyCfg] = useState<{ libraryId: string; cdnHostname: string } | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [editLec, setEditLec] = useState<{ descripcion: string } | null>(null);
  const [savingLec, setSavingLec] = useState(false);
  const [uploadingRecurso, setUploadingRecurso] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingModId = useRef<string | null>(null);

  useEffect(() => { getBunnyCfg().then(setBunnyCfg).catch(() => {}); }, []); // eslint-disable-line

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("cursos").select("*").eq("id", cursoId).maybeSingle();
      setCurso((c as Curso) ?? null);
      const { data: mods } = await supabase.from("modulos_curso").select("*").eq("curso_id", cursoId).order("orden");
      const modList = (mods as Modulo[]) ?? [];
      setModulos(modList);
      const ids = modList.map((m) => m.id);
      if (ids.length) {
        const { data: lecs } = await supabase.from("lecciones").select("*").in("modulo_id", ids).order("orden");
        const lecList = (lecs as Leccion[]) ?? [];
        setLecciones(lecList);
        setActive((prev) => prev ?? lecList[0] ?? null);
        if (uid && lecList.length) {
          const { data: prog } = await supabase
            .from("progreso_lecciones")
            .select("leccion_id,completada")
            .eq("usuario_id", uid)
            .in("leccion_id", lecList.map((l) => l.id));
          setCompletadas(new Set(((prog ?? []) as { leccion_id: string; completada: boolean }[]).filter((p) => p.completada).map((p) => p.leccion_id)));
        }
      } else {
        setLecciones([]);
      }
    })();
  }, [cursoId, uid]);

  const crearModulo = async () => {
    const nombre = prompt("Nombre del módulo (ej: Módulo 1 - Fundamentos)");
    if (!nombre) return;
    const { data, error } = await supabase
      .from("modulos_curso")
      .insert({ curso_id: cursoId, nombre, orden: modulos.length })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setModulos((m) => [...m, data as Modulo]);
  };

  const borrarModulo = async (id: string) => {
    if (!confirm("¿Eliminar módulo y sus clases?")) return;
    const { error } = await supabase.from("modulos_curso").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setModulos((m) => m.filter((x) => x.id !== id));
    setLecciones((l) => l.filter((x) => x.modulo_id !== id));
  };

  const subirLeccion = (modId: string) => {
    pendingModId.current = modId;
    fileInputRef.current?.click();
  };

  const agregarLeccionURL = async (modId: string) => {
    const url = prompt("Pega la URL del video (YouTube o MP4 directo)");
    if (!url) return;
    const nombre = prompt("Nombre de la clase", "Nueva clase");
    if (!nombre) return;
    const orden = lecciones.filter((l) => l.modulo_id === modId).length;
    const { data, error } = await supabase
      .from("lecciones")
      .insert({ modulo_id: modId, nombre, bunny_video_id: url, orden })
      .select()
      .single();
    if (error) return toast.error(error.message);
    const nueva = data as Leccion;
    setLecciones((l) => [...l, nueva]);
    if (!active) setActive(nueva);
    toast.success("Clase agregada");
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const modId = pendingModId.current;
    if (!file || !modId) return;
    const nombre = prompt("Nombre de la clase", file.name.replace(/\.[^.]+$/, ""));
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
            LibraryId: String(cred.libraryId),
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
      const nueva = data as Leccion;
      setLecciones((l) => [...l, nueva]);
      if (!active) setActive(nueva);
      toast.success("Clase subida");
    } catch (err) {
      toast.error((err as Error).message || "Error subiendo el video");
    } finally {
      setUploadingFor(null);
      setUploadPct(0);
      pendingModId.current = null;
    }
  };

  const borrarLeccion = async (l: Leccion) => {
    if (!confirm("¿Eliminar clase y su video?")) return;
    try {
      if (l.bunny_video_id && /^[0-9a-f-]{20,}$/i.test(l.bunny_video_id)) {
        await removeBunny({ data: { videoId: l.bunny_video_id } }).catch(() => {});
      }
      const { error } = await supabase.from("lecciones").delete().eq("id", l.id);
      if (error) throw error;
      setLecciones((arr) => arr.filter((x) => x.id !== l.id));
      if (active?.id === l.id) setActive(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const marcarCompletada = async (lec: Leccion) => {
    if (!uid) return;
    const ya = completadas.has(lec.id);
    const nueva = !ya;
    setCompletadas((s) => {
      const n = new Set(s);
      if (nueva) n.add(lec.id); else n.delete(lec.id);
      return n;
    });
    await supabase.from("progreso_lecciones").upsert({
      usuario_id: uid,
      leccion_id: lec.id,
      completada: nueva,
      fecha_completada: nueva ? new Date().toISOString() : null,
    });
  };

  const updateActive = (patch: Partial<Leccion>) => {
    if (!active) return;
    const next = { ...active, ...patch } as Leccion;
    setActive(next);
    setLecciones((arr) => arr.map((l) => (l.id === next.id ? next : l)));
  };

  const guardarDescripcion = async () => {
    if (!active || !editLec) return;
    setSavingLec(true);
    const { error } = await supabase.from("lecciones").update({ descripcion: editLec.descripcion }).eq("id", active.id);
    setSavingLec(false);
    if (error) return toast.error(error.message);
    updateActive({ descripcion: editLec.descripcion });
    setEditLec(null);
    toast.success("Descripción guardada");
  };

  const addRecurso = async (r: Recurso) => {
    if (!active) return;
    const recursos = [...(active.recursos_adjuntos ?? []), r];
    const { error } = await supabase.from("lecciones").update({ recursos_adjuntos: recursos as unknown as never }).eq("id", active.id);
    if (error) return toast.error(error.message);
    updateActive({ recursos_adjuntos: recursos });
  };

  const removeRecurso = async (idx: number) => {
    if (!active) return;
    const recursos = (active.recursos_adjuntos ?? []).filter((_, i) => i !== idx);
    const { error } = await supabase.from("lecciones").update({ recursos_adjuntos: recursos as unknown as never }).eq("id", active.id);
    if (error) return toast.error(error.message);
    updateActive({ recursos_adjuntos: recursos });
  };

  const agregarLink = async () => {
    const url = prompt("URL del enlace (https://…)");
    if (!url) return;
    const nombre = prompt("Nombre del enlace", url) || url;
    await addRecurso({ tipo: "link", nombre, url });
  };

  const recursoFileRef = useRef<HTMLInputElement>(null);
  const onRecursoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !active) return;
    try {
      setUploadingRecurso(true);
      const path = `${cursoId}/${active.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("course-media").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage.from("course-media").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      await addRecurso({ tipo: "archivo", nombre: file.name, url: signed.signedUrl });
      toast.success("Archivo subido");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingRecurso(false);
    }
  };

  const totalLec = lecciones.length;
  const hechas = completadas.size;
  const pct = totalLec ? Math.round((hechas / totalLec) * 100) : 0;

  return (
    <div className="min-h-screen">
      <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={onFileChosen} />
      <input ref={recursoFileRef} type="file" hidden onChange={onRecursoFile} />

      {/* Header con portada */}
      <div className="relative h-56 overflow-hidden">
        {curso?.image_url ? (
          <img src={curso.image_url} alt={curso.nombre} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${curso?.color_cover || "#7C6BFF"}, var(--violet-2))` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
        <div className="absolute inset-x-0 bottom-0 p-6 max-w-6xl mx-auto">
          <Link to="/cursos" className="inline-flex items-center gap-1 text-sm text-white/90 hover:text-white mb-2">
            <ArrowLeft className="w-4 h-4" /> Volver a cursos
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow">{curso?.nombre || "Curso"}</h1>
          {curso?.descripcion && <p className="text-white/80 text-sm mt-1 max-w-2xl">{curso.descripcion}</p>}
          <div className="mt-3 flex items-center gap-3 text-xs text-white/90">
            <div className="h-1.5 w-48 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-violet-gradient" style={{ width: `${pct}%` }} />
            </div>
            <span>{hechas}/{totalLec} clases · {pct}%</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-3 gap-6">
        {/* Reproductor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl overflow-hidden bg-black aspect-video">
            {active?.bunny_video_id ? (
              /youtube\.com|youtu\.be/.test(active.bunny_video_id) ? (
                <iframe
                  src={active.bunny_video_id.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                  className="w-full h-full"
                  allowFullScreen
                />
              ) : /^[0-9a-f-]{20,}$/i.test(active.bunny_video_id) && bunnyCfg ? (
                <iframe
                  src={`https://iframe.mediadelivery.net/embed/${bunnyCfg.libraryId}/${active.bunny_video_id}?autoplay=false`}
                  className="w-full h-full"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                />
              ) : (
                <video src={active.bunny_video_id} controls className="w-full h-full" />
              )
            ) : (
              <div className="w-full h-full grid place-items-center text-white/60">
                {totalLec === 0 ? "Sin clases aún" : "Selecciona una clase"}
              </div>
            )}
          </div>

          {active && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{active.nombre}</h2>
                  {editLec ? (
                    <textarea
                      value={editLec.descripcion}
                      onChange={(e) => setEditLec({ descripcion: e.target.value })}
                      rows={4}
                      className="mt-2 w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none"
                      placeholder="Descripción de la clase…"
                    />
                  ) : (
                    active.descripcion && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{active.descripcion}</p>
                  )}
                </div>
                <button
                  onClick={() => marcarCompletada(active)}
                  className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-1 ${completadas.has(active.id) ? "bg-violet-gradient text-white" : "border"}`}
                >
                  {completadas.has(active.id) ? <CheckCircle2 className="w-4 h-4"/> : <Circle className="w-4 h-4"/>}
                  {completadas.has(active.id) ? "Completada" : "Marcar completada"}
                </button>
              </div>

              {isStaff && (
                <div className="mt-3 flex gap-2">
                  {editLec ? (
                    <>
                      <button onClick={guardarDescripcion} disabled={savingLec} className="text-xs px-3 py-1.5 rounded-lg bg-violet-gradient text-white flex items-center gap-1">
                        {savingLec ? <Loader2 className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>} Guardar
                      </button>
                      <button onClick={() => setEditLec(null)} className="text-xs px-3 py-1.5 rounded-lg border">Cancelar</button>
                    </>
                  ) : (
                    <button onClick={() => setEditLec({ descripcion: active.descripcion ?? "" })} className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1">
                      <Pencil className="w-3 h-3"/> Editar descripción
                    </button>
                  )}
                  <button onClick={agregarLink} className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1">
                    <LinkIcon className="w-3 h-3"/> Añadir link
                  </button>
                  <button onClick={() => recursoFileRef.current?.click()} disabled={uploadingRecurso} className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1">
                    {uploadingRecurso ? <Loader2 className="w-3 h-3 animate-spin"/> : <Paperclip className="w-3 h-3"/>} Subir archivo
                  </button>
                </div>
              )}

              {(active.recursos_adjuntos?.length ?? 0) > 0 && (
                <div className="mt-4 space-y-1.5">
                  <div className="text-xs uppercase tracking-wider opacity-60">Recursos</div>
                  {(active.recursos_adjuntos ?? []).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 text-sm">
                      {r.tipo === "link" ? <LinkIcon className="w-3.5 h-3.5 opacity-60"/> : <FileText className="w-3.5 h-3.5 opacity-60"/>}
                      <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{r.nombre}</a>
                      {isStaff && (
                        <button onClick={() => removeRecurso(i)} className="opacity-40 hover:opacity-100">
                          <Trash2 className="w-3 h-3"/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar de módulos */}
        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Contenido del curso</h3>
            {isStaff && (
              <button onClick={crearModulo} className="text-xs px-2 py-1 rounded border flex items-center gap-1">
                <Plus className="w-3 h-3"/>Módulo
              </button>
            )}
          </div>

          {modulos.length === 0 && (
            <div className="text-center text-sm text-muted-foreground border border-dashed rounded-xl p-6">
              Aún no hay módulos.
            </div>
          )}

          {modulos.map((m, idx) => {
            const lecs = lecciones.filter((l) => l.modulo_id === m.id);
            const done = lecs.filter((l) => completadas.has(l.id)).length;
            return (
              <div key={m.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider opacity-60">Módulo {idx + 1}</div>
                    <div className="font-semibold text-sm">{m.nombre}</div>
                    <div className="text-xs opacity-60">{done}/{lecs.length} clases</div>
                  </div>
                  {isStaff && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={uploadingFor !== null}
                        onClick={() => subirLeccion(m.id)}
                        title="Subir video (Bunny)"
                        className="p-1.5 rounded border hover:bg-muted disabled:opacity-50"
                      >
                        {uploadingFor === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Upload className="w-3.5 h-3.5"/>}
                      </button>
                      <button
                        onClick={() => agregarLeccionURL(m.id)}
                        title="Agregar clase por URL (YouTube/MP4)"
                        className="p-1.5 rounded border hover:bg-muted"
                      >
                        <Youtube className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={() => borrarModulo(m.id)} className="p-1.5 rounded opacity-50 hover:opacity-100">
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  )}
                </div>
                {uploadingFor === m.id && (
                  <div className="px-4 py-1 text-xs text-muted-foreground border-b">Subiendo… {uploadPct}%</div>
                )}
                <ul>
                  {lecs.map((l, i) => {
                    const isActive = active?.id === l.id;
                    const ok = completadas.has(l.id);
                    return (
                      <li key={l.id} className={`flex items-center gap-1 px-3 py-2 hover:bg-muted/50 ${isActive ? "bg-muted" : ""}`}>
                        <button onClick={() => setActive(l)} className="flex-1 text-left flex items-center gap-2 text-sm">
                          {ok ? <CheckCircle2 className="w-4 h-4 text-violet shrink-0"/> : <Play className="w-4 h-4 opacity-60 shrink-0"/>}
                          <span className="opacity-60 text-xs w-5">{i + 1}.</span>
                          <span className="truncate">{l.nombre}</span>
                        </button>
                        {isStaff && (
                          <button onClick={() => borrarLeccion(l)} className="p-1 opacity-40 hover:opacity-100">
                            <Trash2 className="w-3 h-3"/>
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {lecs.length === 0 && (
                    <li className="px-4 py-3 text-xs text-muted-foreground italic">Sin clases todavía</li>
                  )}
                </ul>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}