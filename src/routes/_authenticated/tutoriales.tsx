import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Play, Upload, Trash2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import {
  createBunnyVideoForUpload,
  getBunnyPublicConfig,
  deleteBunnyVideo,
  getBunnyVideoStatus,
} from "@/lib/bunny.functions";

export const Route = createFileRoute("/_authenticated/tutoriales")({ component: Page });

interface Cfg {
  tutorial_alumnos_url: string | null;
  tutorial_profesores_url: string | null;
}

function Page() {
  const { role } = useAuth();
  const getBunnyCfg = useServerFn(getBunnyPublicConfig);
  const [bunnyCfg, setBunnyCfg] = useState<{ libraryId: string; cdnHostname: string } | null>(null);
  const [cfg, setCfg] = useState<Cfg>({ tutorial_alumnos_url: null, tutorial_profesores_url: null });

  useEffect(() => { getBunnyCfg().then(setBunnyCfg).catch(() => {}); }, []); // eslint-disable-line

  useEffect(() => {
    supabase.from("app_config")
      .select("tutorial_alumnos_url,tutorial_profesores_url")
      .eq("id", true).maybeSingle()
      .then(({ data }) => { if (data) setCfg(data as Cfg); });
  }, []);

  const saveTutorial = async (kind: "alumnos" | "profesores", videoId: string | null) => {
    const payload = kind === "alumnos"
      ? { tutorial_alumnos_url: videoId }
      : { tutorial_profesores_url: videoId };
    const { error } = await supabase.from("app_config").update(payload).eq("id", true);
    if (error) { toast.error(error.message); return false; }
    setCfg((c) => ({ ...c, ...payload }) as Cfg);
    return true;
  };

  const isStaff = role === "admin" || role === "soporte";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-60 mb-1">Inicio</div>
        <h1 className="text-3xl md:text-4xl font-semibold mb-1 flex items-center gap-3">
          <GraduationCap className="w-8 h-8" style={{ color: "var(--violet)" }} /> Tutoriales
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">Aprende a usar la plataforma con estos videos.</p>
      </div>

      {!bunnyCfg ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className={`grid gap-4 ${isStaff ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
          <TutorialVideoCard
            title="Tutorial para alumnos"
            subtitle="Cómo aprovechar la plataforma como estudiante"
            videoId={cfg.tutorial_alumnos_url}
            bunnyCfg={bunnyCfg}
            canEdit={role === "admin"}
            onUploaded={(id) => saveTutorial("alumnos", id)}
            onDelete={() => saveTutorial("alumnos", null)}
          />
          {isStaff && (
            <TutorialVideoCard
              title="Tutorial para profesores"
              subtitle="Guía interna para soporte y profesores"
              videoId={cfg.tutorial_profesores_url}
              bunnyCfg={bunnyCfg}
              canEdit={role === "admin"}
              onUploaded={(id) => saveTutorial("profesores", id)}
              onDelete={() => saveTutorial("profesores", null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TutorialVideoCard({
  title, subtitle, videoId, bunnyCfg, canEdit, onUploaded, onDelete,
}: {
  title: string;
  subtitle: string;
  videoId: string | null;
  bunnyCfg: { libraryId: string; cdnHostname: string };
  canEdit: boolean;
  onUploaded: (videoId: string) => Promise<boolean> | boolean;
  onDelete: () => Promise<boolean> | boolean;
}) {
  const createBunny = useServerFn(createBunnyVideoForUpload);
  const removeBunny = useServerFn(deleteBunnyVideo);
  const getBunnyStatus = useServerFn(getBunnyVideoStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState<{ ready: boolean; failed: boolean; encodeProgress: number } | null>(null);

  useEffect(() => {
    setStatus(null);
    if (!videoId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getBunnyStatus({ data: { videoId } });
        if (cancelled) return;
        setStatus(s);
        if (!s.ready && !s.failed) setTimeout(tick, 4000);
      } catch { /* noop */ }
    };
    tick();
    return () => { cancelled = true; };
  }, [videoId]); // eslint-disable-line

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      setPct(0);
      const cred = await createBunny({ data: { title } });
      const tus = await import("tus-js-client");
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
          metadata: { filetype: file.type, title },
          onError: (err: Error) => reject(err),
          onProgress: (sent: number, total: number) => setPct(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
        });
        upload.start();
      });
      if (videoId && videoId !== cred.videoId) {
        removeBunny({ data: { videoId } }).catch(() => {});
      }
      const ok = await onUploaded(cred.videoId);
      if (ok) toast.success("Tutorial subido. Procesando…");
    } catch (err) {
      toast.error((err as Error).message || "Error subiendo el video");
    } finally {
      setUploading(false);
      setPct(0);
    }
  };

  const remove = async () => {
    if (!videoId) return;
    if (!confirm(`¿Eliminar "${title}"?`)) return;
    removeBunny({ data: { videoId } }).catch(() => {});
    const ok = await onDelete();
    if (ok) toast.success("Tutorial eliminado");
  };

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
      <div className="aspect-video bg-muted grid place-items-center relative">
        {videoId ? (
          status && !status.ready && !status.failed ? (
            <div className="text-center p-6 w-full max-w-sm">
              <p className="font-semibold mb-2 text-sm">Procesando… {status.encodeProgress}%</p>
              <div className="h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
                <div className="h-full bg-violet-gradient transition-all" style={{ width: `${status.encodeProgress}%` }} />
              </div>
            </div>
          ) : status?.failed ? (
            <div className="text-center p-6 text-destructive text-sm">Falló el procesamiento.</div>
          ) : (
            <iframe
              key={videoId}
              src={`https://iframe.mediadelivery.net/embed/${bunnyCfg.libraryId}/${videoId}?autoplay=false`}
              className="w-full h-full"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )
        ) : (
          <div className="text-center text-muted-foreground p-6">
            <Play className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aún no hay tutorial.</p>
            {canEdit && <p className="text-xs mt-1">Súbelo desde tu computadora.</p>}
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        {canEdit && (
          <div className="mt-3 flex items-center gap-2">
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 px-3 py-2 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? `Subiendo… ${pct}%` : (videoId ? "Reemplazar" : "Subir video")}
            </button>
            {videoId && (
              <button type="button" onClick={remove} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" title="Eliminar">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        {uploading && (
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-violet-gradient transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}