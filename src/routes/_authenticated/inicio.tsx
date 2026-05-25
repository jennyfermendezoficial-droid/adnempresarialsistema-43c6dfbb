import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/inicio")({ component: Page });

function Page() {
  const { profile } = useAuth();
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>
        Bienvenido{profile?.nombre ? `, ${profile.nombre}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground">Tu espacio ADN Empresarial está listo. Pronto verás aquí tu progreso, próximas clases y novedades.</p>
    </div>
  );
}
