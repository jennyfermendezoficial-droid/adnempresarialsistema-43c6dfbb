import { useEffect, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  cargarBranding,
  guardarBranding,
  prepararImagenBranding,
  subirImagenBranding,
  type BrandingConfig,
} from "@/lib/branding";

interface CampoImagen {
  key: keyof BrandingConfig;
  titulo: string;
  descripcion: string;
  tamano: number;
}

const CAMPOS: CampoImagen[] = [
  {
    key: "systemLogoUrl",
    titulo: "Logo principal del sistema",
    descripcion: "Se muestra en la barra superior, menú lateral, acceso y espacios internos de ADN Empresarial.",
    tamano: 512,
  },
  {
    key: "faviconUrl",
    titulo: "Icono de pestaña / Google Chrome",
    descripcion: "Es la imagen pequeña que aparece junto al nombre de la página en el navegador.",
    tamano: 192,
  },
  {
    key: "appIconUrl",
    titulo: "Icono de la aplicación / PWA",
    descripcion: "Se utiliza como icono cuando la plataforma se instala como aplicación.",
    tamano: 512,
  },
  {
    key: "comunidadLogoUrl",
    titulo: "Logo de Comunidad",
    descripcion: "Aparece en el recuadro morado de Comunidad junto al nombre ADN Empresarial.",
    tamano: 512,
  },
];

const VACIO: BrandingConfig = {
  systemLogoUrl: null,
  faviconUrl: null,
  appIconUrl: null,
  comunidadLogoUrl: null,
};

type Formato = "1:1" | "original";

export function BrandingPanel() {
  const [cfg, setCfg] = useState<BrandingConfig>(VACIO);
  const [formatos, setFormatos] = useState<Record<keyof BrandingConfig, Formato>>({
    systemLogoUrl: "1:1",
    faviconUrl: "1:1",
    appIconUrl: "1:1",
    comunidadLogoUrl: "1:1",
  });
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState<keyof BrandingConfig | null>(null);

  useEffect(() => {
    let vivo = true;
    void cargarBranding().then((data) => {
      if (!vivo) return;
      setCfg(data);
      setLoading(false);
    });
    return () => { vivo = false; };
  }, []);

  const seleccionar = async (campo: CampoImagen, file?: File) => {
    if (!file) return;
    setSubiendo(campo.key);
    try {
      const preparado = await prepararImagenBranding(file, formatos[campo.key], campo.tamano);
      const url = await subirImagenBranding(preparado);
      setCfg((c) => ({ ...c, [campo.key]: url }));
      toast.success("Imagen preparada. Pulsa Guardar cambios para aplicarla.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo preparar la imagen");
    } finally {
      setSubiendo(null);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarBranding(cfg);
      toast.success("Imágenes del sistema actualizadas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la configuración");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Cargando imágenes del sistema…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet" />
              <h2 className="text-xl font-semibold">Imágenes del sistema</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Cambia las imágenes principales de ADN Empresarial desde un solo lugar. Puedes elegir formato 1:1 para que la imagen quede centrada y no deforme los menús.
            </p>
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando || !!subiendo}
            className="px-4 py-2.5 rounded-xl bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4 p-4 md:p-5">
          {CAMPOS.map((campo) => {
            const actual = cfg[campo.key];
            const ocupado = subiendo === campo.key;
            return (
              <div key={campo.key} className="rounded-2xl border p-4 bg-background/50">
                <div className="flex gap-4">
                  <div
                    className="w-24 h-24 rounded-2xl border overflow-hidden shrink-0 grid place-items-center"
                    style={{ background: "linear-gradient(135deg,#17132f,#4d3db5)" }}
                  >
                    {actual ? (
                      <img src={actual} alt={campo.titulo} className="w-full h-full object-contain" />
                    ) : (
                      <ImagePlus className="w-8 h-8 text-white/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{campo.titulo}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{campo.descripcion}</p>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <select
                        value={formatos[campo.key]}
                        onChange={(e) => setFormatos((f) => ({ ...f, [campo.key]: e.target.value as Formato }))}
                        className="px-2.5 py-2 rounded-lg border bg-card text-xs"
                      >
                        <option value="1:1">Formato 1:1 cuadrado</option>
                        <option value="original">Mantener proporción</option>
                      </select>

                      <label className="px-3 py-2 rounded-lg border bg-card cursor-pointer text-xs font-semibold inline-flex items-center gap-2 hover:bg-muted">
                        {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                        {ocupado ? "Procesando…" : actual ? "Cambiar imagen" : "Subir imagen"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          disabled={ocupado || guardando}
                          onChange={(e) => {
                            void seleccionar(campo, e.target.files?.[0]);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>

                      {actual && (
                        <button
                          type="button"
                          onClick={() => setCfg((c) => ({ ...c, [campo.key]: null }))}
                          className="px-3 py-2 rounded-lg border text-xs inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Predeterminada
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-5 text-xs text-muted-foreground">
          Las imágenes se optimizan antes de guardarse. Si Cloudinary está configurado se almacenan en <strong>adn/sistema</strong>; mientras no lo esté, el editor mantiene un respaldo compatible para que la función no quede bloqueada.
        </div>
      </div>
    </div>
  );
}
