import { supabase } from "@/integrations/supabase/client";

// Clave pública VAPID — segura para estar en el cliente.
export const VAPID_PUBLIC_KEY = "BJBNkptXciPF0n-PaYpdMoLqNgJB_Zg4a48x51TX8XKnuCj9snzRjPTYdfI_nDhpRQLQEKVtK0UUX4Ig2LzIvTw";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function abToB64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Suscribe al usuario actual a Web Push y guarda el endpoint en Supabase. */
export async function subscribePushIfPossible(userId: string): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const endpoint = sub.endpoint;
    const p256dh = json.keys?.p256dh ?? abToB64(sub.getKey("p256dh"));
    const auth = json.keys?.auth ?? abToB64(sub.getKey("auth"));
    if (!endpoint || !p256dh || !auth) return false;
    await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint, p256dh, auth, user_agent: navigator.userAgent },
      { onConflict: "endpoint" }
    );
    return true;
  } catch (e) {
    console.warn("[push] subscribe failed", e);
    return false;
  }
}