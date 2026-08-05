import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatThread } from "./ChatThread";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SEEN_KEY = "general-last-seen";

class ChatErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div className="h-full grid place-items-center p-4 text-center text-sm text-muted-foreground">
          No se pudo cargar el chat. Cierra y vuelve a abrir el panel.
        </div>
      );
    }
    return this.props.children;
  }
}

export function GeneralChatPopover() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [authorMap, setAuthorMap] = useState<Record<string, { name: string; avatar?: string | null }>>({});
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    supabase.from("profiles").select("id,nombre_completo,email,avatar_url").then(({ data }) => {
      const m: Record<string, { name: string; avatar?: string | null }> = {};
      (data ?? []).forEach((p) => { m[p.id] = { name: p.nombre_completo || p.email, avatar: p.avatar_url }; });
      setAuthorMap(m);
    });
  }, []);

  // Punto de no leídos
  useEffect(() => {
    let active = true;
    const lastSeen = localStorage.getItem(SEEN_KEY);
    (async () => {
      const q = supabase
        .from("canal_general_mensajes")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);
      const { data } = await q;
      const latest = data?.[0]?.created_at as string | undefined;
      if (!active || !latest) return;
      if (!lastSeen || new Date(latest) > new Date(lastSeen)) setUnread(true);
    })();

    const channel = supabase
      .channel(`general-popover-unread-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "canal_general_mensajes" },
        () => { if (!openRef.current) setUnread(true); },
      )
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setUnread(false);
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        title="Canal general"
        aria-label="Canal general"
        className="relative w-9 h-9 grid place-items-center rounded-full transition hover:bg-white/10 outline-none"
        style={{ color: "var(--violet-light)" }}
      >
        <MessageSquare className="w-[18px] h-[18px]" />
        {unread && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: "var(--violet)" }}
          />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold"># General</span>
        </div>
        <div className="h-[420px]">
          <ChatErrorBoundary>
            <ChatThread table="canal_general_mensajes" authorMap={authorMap} height="100%" />
          </ChatErrorBoundary>
        </div>
      </PopoverContent>
    </Popover>
  );
}