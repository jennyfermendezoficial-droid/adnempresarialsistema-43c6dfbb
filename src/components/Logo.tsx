import { useEffect, useState } from "react";
import logoSrc from "@/assets/adn-logo.png";
import { cargarBranding, type BrandingConfig } from "@/lib/branding";

function useBrandingLogo(tipo: "system" | "community") {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const cfg = await cargarBranding();
      if (!vivo) return;
      setSrc(tipo === "community" ? (cfg.comunidadLogoUrl || cfg.systemLogoUrl) : cfg.systemLogoUrl);
    };
    void cargar();

    const actualizar = (e: Event) => {
      const cfg = (e as CustomEvent<BrandingConfig>).detail;
      if (!cfg) return void cargar();
      setSrc(tipo === "community" ? (cfg.comunidadLogoUrl || cfg.systemLogoUrl) : cfg.systemLogoUrl);
    };
    window.addEventListener("adn:branding-actualizado", actualizar);
    return () => {
      vivo = false;
      window.removeEventListener("adn:branding-actualizado", actualizar);
    };
  }, [tipo]);

  return src || logoSrc;
}

function ImagenMarca({ size, tipo }: { size: number; tipo: "system" | "community" }) {
  const src = useBrandingLogo(tipo);
  return (
    <img
      src={src}
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
      loading="eager"
    />
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return <ImagenMarca size={size} tipo="system" />;
}

export function CommunityLogo({ size = 56 }: { size?: number }) {
  return <ImagenMarca size={size} tipo="community" />;
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
