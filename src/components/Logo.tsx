import logoSrc from "@/assets/adn-logo.png";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src={logoSrc}
      alt="ADN Empresarial"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        objectFit: "contain",
        boxShadow: "0 4px 14px rgba(124,107,255,.35)",
      }}
      loading="lazy"
    />
  );
}

export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-bold tracking-wider ${className}`}
      style={{
        fontFamily: "var(--font-display)",
        background: "linear-gradient(135deg,#FFFFFF 0%,#C4B5FD 55%,#8B7BFF 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      }}
    >
      ADN EMPRESARIAL
    </span>
  );
}