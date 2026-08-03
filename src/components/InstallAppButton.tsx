import { useEffect, useState } from "react";
import { Download, Smartphone, X, Apple } from "lucide-react";
import { detectPlatform, isStandalone, installInstallListener, tryNativeInstall } from "@/lib/install-app";

let listenerInstalled = false;

export function InstallAppButton({ compact = false, variant = "default" }: { compact?: boolean; variant?: "default" | "icon" }) {
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<ReturnType<typeof detectPlatform>>("unknown");

  useEffect(() => {
    if (!listenerInstalled) { installInstallListener(); listenerInstalled = true; }
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  if (installed) return null;

  const click = async () => {
    const r = await tryNativeInstall();
    if (r === "accepted") { setInstalled(true); return; }
    setOpen(true);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={click}
          title="Descargar app"
          aria-label="Descargar app"
          className="w-9 h-9 grid place-items-center rounded-full transition hover:bg-white/10"
          style={{ color: "var(--violet-light)" }}
        >
          <Download className="w-[18px] h-[18px]" />
        </button>
      ) : (
      <button
        onClick={click}
        className={
          compact
            ? "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold transition"
            : "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
        }
        style={{
          background: "linear-gradient(135deg,var(--violet),var(--violet-2))",
          color: "white",
          boxShadow: "0 6px 18px -8px rgba(124,107,255,.55)",
        }}
      >
        <Download className="w-4 h-4" />
        Descargar app
      </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-card rounded-2xl p-6 max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl grid place-items-center text-white" style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}>
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <div className="text-lg font-semibold">Instala ADN Empresarial</div>
                <div className="text-xs text-muted-foreground">Acceso rápido + notificaciones</div>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <Step active={platform === "android"} title="Android (Chrome)" icon={<Smartphone className="w-4 h-4" />}>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Toca el menú <b>⋮</b> arriba a la derecha.</li>
                  <li>Selecciona <b>"Instalar app"</b> o <b>"Añadir a pantalla de inicio"</b>.</li>
                  <li>Confirma. El ícono aparecerá como una app normal.</li>
                </ol>
              </Step>

              <Step active={platform === "ios"} title="iPhone / iPad (Safari)" icon={<Apple className="w-4 h-4" />}>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Abre esta página en <b>Safari</b> (no Chrome).</li>
                  <li>Toca el botón <b>Compartir</b> (cuadrado con flecha ↑).</li>
                  <li>Desliza y elige <b>"Añadir a pantalla de inicio"</b>.</li>
                  <li>Toca <b>Añadir</b>. Listo.</li>
                </ol>
              </Step>

              <Step active={platform === "desktop"} title="Computador (Chrome / Edge)" icon={<Download className="w-4 h-4" />}>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Mira en la barra de direcciones el ícono de <b>instalar ⬇️</b>.</li>
                  <li>O ve a menú <b>⋮</b> → <b>"Instalar ADN Empresarial"</b>.</li>
                </ol>
              </Step>

              <div className="text-[11px] text-muted-foreground border-t pt-3">
                Una vez instalada, se ve como cualquier app del celular y recibe notificaciones aunque cierres el navegador.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ title, icon, active, children }: { title: string; icon: React.ReactNode; active?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3" style={active ? { borderColor: "var(--violet)", background: "rgba(124,107,255,.06)" } : {}}>
      <div className="flex items-center gap-2 font-semibold text-[13px] mb-2">
        <span style={{ color: "var(--violet)" }}>{icon}</span>
        {title}
        {active && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: "var(--violet)" }}>TÚ</span>}
      </div>
      {children}
    </div>
  );
}