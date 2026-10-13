import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({ meta: [
    { title: "ADN Empresarial · Academia y comunidad" },
    { name: "description", content: "Accede a tu academia, comunidad y actividades de ADN Empresarial." },
    { property: "og:title", content: "ADN Empresarial · Academia y comunidad" },
    { property: "og:description", content: "Tu espacio de aprendizaje y acompañamiento empresarial." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/inicio" : "/login", replace: true });
  }, [session, loading, navigate]);
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <div className="text-muted-foreground text-sm">Cargando…</div>
    </div>
  );
}
