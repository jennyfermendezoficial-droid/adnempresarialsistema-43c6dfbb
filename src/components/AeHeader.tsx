export function AeHeader() {
  const hoy = new Date().toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="mb-4">
      <div className="ae-eyebrow" style={{ letterSpacing: "0.18em" }}>{hoy.toUpperCase()}</div>
      <div className="ae-divider mt-3" />
    </div>
  );
}