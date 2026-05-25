import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatThread } from "@/components/ChatThread";

export const Route = createFileRoute("/_authenticated/general")({ component: Page });

function Page() {
  const [authorMap, setAuthorMap] = useState<Record<string, { name: string; avatar?: string | null }>>({});

  useEffect(() => {
    supabase.from("profiles").select("id,nombre_completo,email,avatar_url").then(({ data }) => {
      const m: Record<string, { name: string; avatar?: string | null }> = {};
      (data ?? []).forEach((p) => { m[p.id] = { name: p.nombre_completo || p.email, avatar: p.avatar_url }; });
      setAuthorMap(m);
    });
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto h-screen flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold"># General</h1>
        <p className="text-sm text-muted-foreground">Canal abierto de la comunidad. Texto, imágenes, audio y video (hasta 25 MB).</p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatThread table="canal_general_mensajes" authorMap={authorMap} height="100%" />
      </div>
    </div>
  );
}
