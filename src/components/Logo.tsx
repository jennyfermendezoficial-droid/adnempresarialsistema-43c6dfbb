export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, borderRadius: 9 }}
      className="inline-grid place-items-center text-white font-bold"
    >
      <div
        className="grid place-items-center text-white"
        style={{
          width: "100%", height: "100%", borderRadius: 9,
          background: "linear-gradient(135deg,#E8C66A 0%,#D4AF37 50%,#A88528 100%)",
          boxShadow: "0 4px 14px rgba(212,175,55,.35)",
          fontFamily: "var(--font-display)",
          fontSize: size * 0.45,
        }}
      >
        A
      </div>
    </div>
  );
}

export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`text-gold-gradient font-bold tracking-wider ${className}`} style={{ fontFamily: "var(--font-display)" }}>
      ADN EMPRESARIAL
    </span>
  );
}