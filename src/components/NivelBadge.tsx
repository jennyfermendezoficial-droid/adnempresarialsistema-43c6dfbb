export function NivelBadge({ nivel, size = 18 }: { nivel: number; size?: number }) {
  return (
    <span
      title={`Nivel ${nivel}`}
      className="inline-grid place-items-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.55,
        background: "linear-gradient(135deg,var(--violet),var(--violet-2))",
        border: "2px solid var(--bg-2)",
      }}
    >
      {nivel}
    </span>
  );
}

export function Avatar({
  url, nombre, size = 40, nivel,
}: { url?: string | null; nombre?: string | null; size?: number; nivel?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <div
          className="w-full h-full rounded-full grid place-items-center text-white font-semibold"
          style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))", fontSize: size * 0.4 }}
        >
          {(nombre || "?").slice(0, 1).toUpperCase()}
        </div>
      )}
      {typeof nivel === "number" && (
        <span className="absolute -bottom-1 -right-1">
          <NivelBadge nivel={nivel} size={Math.max(16, size * 0.42)} />
        </span>
      )}
    </div>
  );
}
