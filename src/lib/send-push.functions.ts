import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildPushPayload, type PushSubscription as WPSubscription } from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  title: z.string().min(1).max(200),
  body: z.string().max(500).default(""),
  // Only relative same-origin paths are accepted to prevent phishing pushes to external sites.
  url: z.string().max(500).regex(/^\/[^\s]*$/, "url must be a relative path starting with /").optional(),
  tag: z.string().max(120).optional(),
});

export const sendPushToUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const callerId = context.userId;
    if (!callerId) return { sent: 0, error: "unauthorized" };

    // Staff (admin/soporte) may push to any list. Everyone else must be a
    // chat participant of each recipient via chats_1a1.
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "soporte");

    let allowedUserIds = data.userIds;
    if (!isStaff) {
      const { data: chats } = await supabaseAdmin
        .from("chats_1a1")
        .select("usuario_a_id,usuario_b_id")
        .or(`usuario_a_id.eq.${callerId},usuario_b_id.eq.${callerId}`);
      const peers = new Set<string>();
      for (const c of chats ?? []) {
        if (c.usuario_a_id !== callerId) peers.add(c.usuario_a_id);
        if (c.usuario_b_id !== callerId) peers.add(c.usuario_b_id);
      }
      allowedUserIds = data.userIds.filter((id) => peers.has(id));
      if (allowedUserIds.length === 0) return { sent: 0 };
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@adnempresarial.com";
    if (!publicKey || !privateKey) return { sent: 0, error: "VAPID keys missing" };

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", allowedUserIds);
    if (!subs || subs.length === 0) return { sent: 0 };

    const payloadJson = JSON.stringify({
      title: data.title,
      body: data.body,
      url: data.url ?? "/inicio",
      tag: data.tag ?? "adn-push",
    });

    let sent = 0;
    const expiredIds: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          const sub: WPSubscription = {
            endpoint: s.endpoint,
            expirationTime: null,
            keys: { p256dh: s.p256dh, auth: s.auth },
          };
          const message = await buildPushPayload(
            { data: payloadJson, options: { ttl: 60 } },
            sub,
            { subject, publicKey, privateKey },
          );
          const res = await fetch(sub.endpoint, {
            method: message.method,
            headers: message.headers as HeadersInit,
            body: new Uint8Array(message.body).buffer as ArrayBuffer,
          });
          if (res.status === 404 || res.status === 410) {
            expiredIds.push(s.id);
          } else if (res.ok || res.status === 201 || res.status === 202) {
            sent++;
          }
        } catch (e) {
          console.warn("[push] send failed", e);
        }
      }),
    );

    if (expiredIds.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", expiredIds);
    }
    return { sent };
  });