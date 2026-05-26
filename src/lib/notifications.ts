// Helper para notificaciones del sistema + sonidos en móvil/escritorio.
// Estrategia:
//  - Si hay Service Worker activo + permiso → notificación visible aunque la
//    pestaña esté en segundo plano (móvil).
//  - Si la pestaña está enfocada → solo sonido + toast (toast lo maneja el caller).

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

export function playSound(kind: "ping" | "ring" | "soft" = "ping") {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  if (kind === "ring") {
    o.type = "sine";
    o.frequency.setValueAtTime(660, now);
    o.frequency.exponentialRampToValueAtTime(990, now + 0.18);
    o.frequency.exponentialRampToValueAtTime(660, now + 0.36);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.start(now); o.stop(now + 0.62);
  } else if (kind === "soft") {
    o.type = "triangle";
    o.frequency.setValueAtTime(520, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    o.start(now); o.stop(now + 0.3);
  } else {
    o.type = "sine";
    o.frequency.setValueAtTime(880, now);
    o.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.start(now); o.stop(now + 0.4);
  }
  try { navigator.vibrate?.([80, 40, 80]); } catch { /* noop */ }
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}

function isPreviewHost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}
function isInIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

let swRegPromise: Promise<ServiceWorkerRegistration | null> | null = null;
export function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (isPreviewHost() || isInIframe()) {
    // Limpiar SWs anteriores en preview para evitar shells obsoletos.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    return Promise.resolve(null);
  }
  if (!swRegPromise) {
    swRegPromise = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => null);
  }
  return swRegPromise;
}

export interface NotifyOpts {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
  sound?: "ping" | "ring" | "soft";
  silent?: boolean;
}

export async function notify(opts: NotifyOpts) {
  if (!opts.silent) playSound(opts.sound ?? "ping");
  try {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      // Si la pestaña está visible no spammeamos con notificación del SO.
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const reg = await registerSW();
    if (reg) {
      reg.active?.postMessage({ type: "SHOW_NOTIFICATION", payload: opts });
    } else {
      new Notification(opts.title, { body: opts.body, tag: opts.tag, icon: "/icon-512.png" });
    }
  } catch { /* noop */ }
}