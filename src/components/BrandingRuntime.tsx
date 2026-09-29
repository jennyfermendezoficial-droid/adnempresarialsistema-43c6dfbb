import { useEffect } from "react";
import { cargarBranding, type BrandingConfig } from "@/lib/branding";

function asegurarLink(rel: string, selectorExtra = "") {
  let link = document.querySelector(`link[rel='${rel}']${selectorExtra}`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function aplicar(cfg: BrandingConfig) {
  if (cfg.faviconUrl) {
    const icon = asegurarLink("icon");
    icon.href = cfg.faviconUrl;
    icon.type = "image/webp";
  }

  const appIcon = cfg.appIconUrl || cfg.faviconUrl;
  if (appIcon) {
    asegurarLink("apple-touch-icon").href = appIcon;

    const manifest = {
      name: "ADN Empresarial · Jennyfer Méndez",
      short_name: "ADN Empresarial",
      description: "Plataforma de mentoría ADN Empresarial: cursos, sesiones 1 a 1 y comunidad.",
      id: "/",
      start_url: "/inicio",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#1a1330",
      theme_color: "#7C6BFF",
      lang: "es",
      icons: [
        { src: appIcon, sizes: "512x512", type: "image/webp", purpose: "any" },
        { src: appIcon, sizes: "512x512", type: "image/webp", purpose: "maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    const link = asegurarLink("manifest");
    const anterior = link.dataset.adnBlobUrl;
    link.href = url;
    link.dataset.adnBlobUrl = url;
    if (anterior) URL.revokeObjectURL(anterior);
  }
}

export function BrandingRuntime() {
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const cfg = await cargarBranding();
      if (vivo) aplicar(cfg);
    };
    void cargar();

    const actualizar = (e: Event) => {
      const cfg = (e as CustomEvent<BrandingConfig>).detail;
      if (cfg) aplicar(cfg);
      else void cargar();
    };
    window.addEventListener("adn:branding-actualizado", actualizar);
    window.addEventListener("focus", cargar);
    return () => {
      vivo = false;
      window.removeEventListener("adn:branding-actualizado", actualizar);
      window.removeEventListener("focus", cargar);
    };
  }, []);

  return null;
}
