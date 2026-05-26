// Detecta el SO y maneja el prompt de instalación de PWA
export type Platform = "android" | "ios" | "desktop" | "unknown";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)) return "ios";
  return "desktop";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let deferredPrompt: (Event & { prompt?: () => void; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> }) | null = null;

export function installInstallListener() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as never;
  });
}

export async function tryNativeInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt?.prompt) return "unavailable";
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice?.outcome ?? "dismissed";
}