import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildPushPayload, type PushSubscription as WPSubscription } from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  title: z.string().min(1).max(200),
  body: z.string().max(500).default(""),
  url: z.string().max(500).optional(),
  tag: z.string().max(120).optional(),
});

export const sendPushToUsers = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "mailto:admin@adnempresarial.com";
    if (!publicKey || !privateKey) return { sent: 0, error: "VAPID keys missing" };

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .in("user_id", data.userIds);
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