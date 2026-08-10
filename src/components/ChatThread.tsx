import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Send, Paperclip, Mic, Square, Image as ImageIcon, Trash2, AtSign, X } from "lucide-react";
import { toast } from "sonner";
import { sendPushToUsers } from "@/lib/send-push.functions";

export interface ChatMessageRow {
  id: string;
  autor_id: string;
  contenido: string | null;
  tipo: string;
  media_url: string | null;
  created_at: string;
  eliminado?: boolean | null;
  menciones?: string[] | null;
  mencion_everyone?: boolean | null;
}

export interface ChatThreadProps {
  table:
    | "canal_general_mensajes"
    | "mensajes_chat_1a1"
    | "soporte_privado_mensajes"
    | "chat_profesores_mensajes";
  filter?: { column: string; value: string };
  extraInsert?: Record<string, unknown>;
  bucket?: string;
  height?: string;
  emptyHint?: string;
  authorMap?: Record<string, { name: string; avatar?: string | null }>;
  allowDelete?: boolean;
  pushRecipientIds?: string[];
  pushTitle?: string;
  pushUrl?: string;
  /** Personas que se pueden etiquetar (solo canal general) */
  mentionables?: { id: string; name: string }[];
  mentionHint?: string;
}

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export function ChatThread({
  table,
  filter,
  extraInsert = {},
  bucket = "chat-media",
  height = "calc(100vh - 220px)",
  emptyHint = "Sé el primero en escribir.",
  authorMap = {},
  allowDelete = true,
  pushRecipientIds,
  pushTitle,
  pushUrl,
  mentionables,
  mentionHint = "Elige a quién avisar. Sin etiqueta, nadie recibe notificación.",
}: ChatThreadProps) {
  const { session, role } = useAuth();
  const uid = session?.user.id;
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstLoadRef = useRef(true);
  const usaMenciones = table === "canal_general_mensajes" && !!mentionables;
  const [etiquetados, setEtiquetados] = useState<{ id: string; name: string }[]>([]);
  const [everyone, setEveryone] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [buscar, setBuscar] = useState("");

  // Sonido tipo notificación (web audio, sin assets)
  const playPing = () => {
    try {
      const Ctx: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 600);
    } catch { /* noop */ }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      let q = supabase.from(table).select("*").order("created_at", { ascending: true }).limit(200);
      if (filter) q = q.eq(filter.column, filter.value);
      const { data } = await q;
      if (mounted) {
        setMessages((data as ChatMessageRow[]) ?? []);
        firstLoadRef.current = false;
      }
    })();
    const channel = supabase
      .channel(`rt-${table}-${filter?.value ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          const old = payload.old as ChatMessageRow;
          if (filter && row && (row as unknown as Record<string, unknown>)[filter.column] !== filter.value) return;
          if (payload.eventType === "INSERT") {
            setMessages((m) => [...m, row]);
            const meMenciona =
              table !== "canal_general_mensajes" ||
              !!row.mencion_everyone ||
              (!!uid && (row.menciones ?? []).includes(uid));
            if (!firstLoadRef.current && row.autor_id !== uid && meMenciona) playPing();
          }
          if (payload.eventType === "UPDATE") setMessages((m) => m.map((x) => (x.id === row.id ? row : x)));
          if (payload.eventType === "DELETE") setMessages((m) => m.filter((x) => x.id !== old.id));
        }
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter?.value]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // resolve signed URLs for media messages
  useEffect(() => {
    const missing = messages.filter((m) => m.media_url && !signedUrls[m.id]);
    if (!missing.length) return;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        missing.map(async (m) => {
          const path = m.media_url!;
          const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
          if (data?.signedUrl) next[m.id] = data.signedUrl;
        })
      );
      if (Object.keys(next).length) setSignedUrls((s) => ({ ...s, ...next }));
    })();
  }, [messages, bucket, signedUrls]);

  const send = async () => {
    if (!uid || !text.trim()) return;
    setSending(true);
    const payload: Record<string, unknown> = { autor_id: uid, tipo: "texto", contenido: text.trim(), ...extraInsert };
    if (usaMenciones) {
      payload.menciones = everyone ? [] : etiquetados.map((e) => e.id);
      payload.mencion_everyone = everyone;
    }
    const { error } = await supabase.from(table).insert(payload as never);
    setSending(false);
    if (error) return toast.error(error.message);
    const body = text.trim();
    setText("");
    if (usaMenciones) { setEtiquetados([]); setEveryone(false); }
    const destinos = usaMenciones
      ? (everyone ? (mentionables ?? []).map((m) => m.id) : etiquetados.map((e) => e.id))
      : pushRecipientIds;
    if (destinos && destinos.length) {
      sendPushToUsers({
        data: {
          userIds: destinos,
          title: pushTitle || "Nuevo mensaje",
          body: body.slice(0, 200),
          url: pushUrl || "/chats",
          tag: `chat-${table}`,
        },
      }).catch(() => {});
    }
  };

  const uploadAndSend = async (file: File, tipo: "imagen" | "video" | "audio" | "archivo") => {
    if (!uid) return;
    if (file.size > MAX_BYTES) return toast.error("Máx 25MB");
    const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (upErr) return toast.error(upErr.message);
    const { error } = await supabase.from(table).insert({
      autor_id: uid,
      tipo,
      contenido: tipo === "archivo" ? file.name : null,
      media_url: path,
      ...extraInsert,
    });
    if (error) toast.error(error.message);
    else if (pushRecipientIds && pushRecipientIds.length) {
      sendPushToUsers({
        data: {
          userIds: pushRecipientIds,
          title: pushTitle || "Nuevo mensaje",
          body: `Te envió ${tipo === "imagen" ? "una imagen" : tipo === "video" ? "un video" : tipo === "audio" ? "un audio" : "un archivo"}`,
          url: pushUrl || "/chats",
          tag: `chat-${table}`,
        },
      }).catch(() => {});
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const tipo: "imagen" | "video" | "audio" | "archivo" = f.type.startsWith("image/")
      ? "imagen"
      : f.type.startsWith("video/")
      ? "video"
      : f.type.startsWith("audio/")
      ? "audio"
      : "archivo";
    await uploadAndSend(f, tipo);
    e.target.value = "";
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunks.current = [];
      mr.ondataavailable = (e) => e.data.size && recChunks.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(recChunks.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        const f = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
        await uploadAndSend(f, "audio");
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  };
  const stopRec = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar mensaje?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="flex flex-col rounded-2xl border bg-card overflow-hidden" style={{ height }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">{emptyHint}</div>
        )}
        {messages.map((m) => {
          const mine = m.autor_id === uid;
          const author = authorMap[m.autor_id];
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && (
                <div
                  className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-semibold shrink-0"
                  style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
                >
                  {(author?.name || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm group relative ${
                  mine ? "bg-violet-gradient text-white" : "bg-muted text-foreground"
                }`}
              >
                {(author?.name || mine) && (
                  <div className="text-[11px] font-semibold opacity-80 mb-0.5">
                    {mine ? (author?.name ?? "Tú") : author?.name}
                  </div>
                )}
                {m.tipo === "texto" && <div className="whitespace-pre-wrap break-words">{m.contenido}</div>}
                {m.tipo === "imagen" && signedUrls[m.id] && (
                  <img src={signedUrls[m.id]} alt="" className="rounded-lg max-h-72" />
                )}
                {m.tipo === "video" && signedUrls[m.id] && (
                  <video src={signedUrls[m.id]} controls className="rounded-lg max-h-72" />
                )}
                {m.tipo === "audio" && signedUrls[m.id] && (
                  <audio src={signedUrls[m.id]} controls />
                )}
                {m.tipo === "archivo" && signedUrls[m.id] && (
                  <a href={signedUrls[m.id]} target="_blank" rel="noreferrer" className="underline">
                    {m.contenido || "Descargar archivo"}
                  </a>
                )}
                <div className="text-[10px] opacity-60 mt-1">
                  {new Date(m.created_at).toLocaleString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                </div>
                {allowDelete && (mine || role === "admin") && (
                  <button
                    onClick={() => remove(m.id)}
                    className="absolute -top-2 -right-2 opacity-60 hover:opacity-100 bg-background border rounded-full p-1 transition shadow"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {usaMenciones && (
        <div className="border-t px-2 pt-2 bg-background">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => { setPickerOpen((v) => !v); setBuscar(""); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold hover:bg-muted"
              title="Etiquetar"
            >
              <AtSign className="w-3.5 h-3.5" /> Etiquetar
            </button>
            {everyone && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
                style={{ background: "rgba(124,107,255,.14)", color: "var(--violet)" }}>
                @everyone
                <button onClick={() => setEveryone(false)}><X className="w-3 h-3" /></button>
              </span>
            )}
            {!everyone && etiquetados.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
                style={{ background: "rgba(124,107,255,.14)", color: "var(--violet)" }}>
                @{e.name}
                <button onClick={() => setEtiquetados((a) => a.filter((x) => x.id !== e.id))}><X className="w-3 h-3" /></button>
              </span>
            ))}
            {!everyone && etiquetados.length === 0 && (
              <span className="text-[11px] text-muted-foreground">{mentionHint}</span>
            )}
          </div>
          {pickerOpen && (
            <div className="mt-2 rounded-xl border bg-card p-2 max-h-56 overflow-y-auto">
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar persona…"
                className="w-full px-2 py-1.5 mb-2 rounded-lg border bg-background text-sm outline-none" />
              <button
                onClick={() => { setEveryone(true); setEtiquetados([]); setPickerOpen(false); }}
                className="w-full text-left px-2 py-2 rounded-lg hover:bg-muted"
              >
                <div className="text-sm font-semibold">@everyone</div>
                <div className="text-[11px] text-muted-foreground">Avisa a todas las personas del canal</div>
              </button>
              {(mentionables ?? [])
                .filter((m) => m.name.toLowerCase().includes(buscar.toLowerCase()))
                .map((m) => (
                  <button key={m.id}
                    onClick={() => {
                      setEveryone(false);
                      setEtiquetados((a) => (a.some((x) => x.id === m.id) ? a : [...a, m]));
                      setPickerOpen(false);
                    }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-muted text-sm"
                  >
                    @{m.name}
                  </button>
                ))}
              {(mentionables ?? []).length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">No hay personas para etiquetar.</div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="border-t p-2 flex items-end gap-2 bg-background">
        <input ref={fileRef} type="file" hidden onChange={onPickFile} accept="image/*,video/*,audio/*,application/pdf" />
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-lg hover:bg-muted transition"
          title="Adjuntar"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            const i = document.createElement("input");
            i.type = "file";
            i.accept = "image/*";
            i.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) uploadAndSend(f, "imagen");
            };
            i.click();
          }}
          className="p-2 rounded-lg hover:bg-muted transition"
          title="Imagen"
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button
          onClick={recording ? stopRec : startRec}
          className={`p-2 rounded-lg transition ${recording ? "bg-destructive text-destructive-foreground" : "hover:bg-muted"}`}
          title={recording ? "Detener" : "Grabar audio"}
        >
          {recording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Escribe un mensaje…"
          className="flex-1 resize-none px-3 py-2 rounded-lg border bg-background outline-none focus:ring-2 focus:ring-violet"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="p-2 rounded-lg bg-violet-gradient text-white disabled:opacity-50"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}