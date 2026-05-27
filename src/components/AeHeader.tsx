import { useAuth } from "@/lib/auth-context";

export function AeHeader() {
  const { profile } = useAuth();
  const nombre = (profile?.nombre_completo || "").split(" ")[0] || "amiga";
  const hoy = new Date().toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="mb-4">
      <div className="ae-eyebrow mb-1" style={{ letterSpacing: "0.18em" }}>{hoy.toUpperCase()}</div>
      <h1 className="ae-h1">Hola, <em>{nombre}</em></h1>
      <div className="ae-divider mt-4" />
    </div>
  );
}