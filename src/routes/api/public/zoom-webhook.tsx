import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHmac, timingSafeEqual } from "crypto";

// Zoom webhook: meeting.ended → marca la sesión 1a1 como finalizada
// para que el alumno reciba el modal de calificación al volver a la app.
// También maneja la "URL validation" (endpoint.url_validation) de Zoom.
export const Route = createFileRoute("/api/public/zoom-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: any = {};
        try { payload = JSON.parse(body); } catch {}

        const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "";

        // 1) Zoom URL validation handshake
        if (payload?.event === "endpoint.url_validation") {
          const plainToken = payload?.payload?.plainToken ?? "";
          const encryptedToken = createHmac("sha256", secret).update(plainToken).digest("hex");
          return new Response(JSON.stringify({ plainToken, encryptedToken }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }

        // Verify HMAC signature on every other event
        const timestamp = request.headers.get("x-zm-request-timestamp") ?? "";
        const signature = request.headers.get("x-zm-signature") ?? "";
        if (!secret || !timestamp || !signature) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Reject events older than 5 minutes (replay protection)
        const tsNum = Number(timestamp);
        if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum * 1000) > 5 * 60 * 1000) {
          return new Response("Unauthorized", { status: 401 });
        }
        const expected = "v0=" + createHmac("sha256", secret)
          .update(`v0:${timestamp}:${body}`)
          .digest("hex");
        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // 2) meeting.ended → marcar sesión como finalizada
        if (payload?.event === "meeting.ended") {
          const meetingId = String(payload?.payload?.object?.id ?? "");
          if (meetingId) {
            await supabaseAdmin
              .from("sesiones_1a1")
              .update({ estado: "finalizada", finalizada_at: new Date().toISOString() })
              .eq("zoom_meeting_id", meetingId);
          }
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok"),
    },
  },
});
