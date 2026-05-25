import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ChatThread } from "@/components/ChatThread";

export const Route = createFileRoute("/_authenticated/chat-profesores")({ component: Page });

function Page() {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "soporte";
  const [authorMap, setAuthorMap] = useState<Record<string, { name: string; avatar?: string | null }>>({});

  useEffect(() => {
    supabase.from("profiles").select("id,nombre_completo,email,avatar_url").then(({ data }) => {
      const m: Record<string, { name: string; avatar?: string | null }> = {};
      (data ?? []).forEach((p) => { m[p.id] = { name: p.nombre_completo || p.email, avatar: p.avatar_url }; });
      setAuthorMap(m);
    });
  }, []);

  if (!isStaff) return <Navigate to="/inicio" />;

  return (
    <div className="p-6 max-w-5xl mx-auto h-screen flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold"># Chat profesores</h1>
        <p className="text-sm text-muted-foreground">Canal privado solo para admin y soporte. Coordinen aquí lo de las alumnas.</p>
      </div>
      <div className="flex-1 min-h-0">
        <ChatThread table="chat_profesores_mensajes" authorMap={authorMap} height="100%" />
      </div>
    </div>
  );
}