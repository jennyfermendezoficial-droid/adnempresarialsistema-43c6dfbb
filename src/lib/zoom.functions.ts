import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getZoomToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom no está configurado. Falta ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET.");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } }
  );
  if (!res.ok) throw new Error(`Zoom OAuth ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export const createZoomMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { topic: string; start_time: string; duration: number; agenda?: string }) =>
    z
      .object({
        topic: z.string().min(1).max(200),
        start_time: z.string().min(10),
        duration: z.number().int().min(15).max(480),
        agenda: z.string().max(2000).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    const token = await getZoomToken();
    const res = await fetch(`https://api.zoom.us/v2/users/me/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: data.topic,
        type: 2,
        start_time: data.start_time,
        duration: data.duration,
        timezone: "America/Lima",
        agenda: data.agenda ?? "",
        settings: {
          join_before_host: true,
          waiting_room: false,
          host_video: true,
          participant_video: true,
        },
      }),
    });
    if (!res.ok) throw new Error(`Zoom create meeting ${res.status}: ${await res.text()}`);
    const meeting = (await res.json()) as { id: number; join_url: string };
    return { meeting_id: String(meeting.id), join_url: meeting.join_url };
  });