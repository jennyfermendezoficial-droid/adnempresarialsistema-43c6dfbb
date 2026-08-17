import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileUp, Landmark, MapPin, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { roleLabel } from "@/lib/roles";

interface ProfesorDatos {
  usuario_id: string;
  nombres: string;
  apellidos: string;
  cedula: string;
  fecha_nacimiento: string | null;
  whatsapp: string;
  direccion: string;
  google_place_id: string | null;
  latitud: number | null;
  longitud: number | null;
  cedula_archivo_path: string | null;
  perfil_completo: boolean;
}

interface Banco {
  id: string;
  nombre: string;
  imagen_url: string | null;
}

interface CuentaProfesor {
  id: string;
  banco_id: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular: string;
  principal: boolean;
}

function tituloPersona(valor: string) {
  return valor
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((p) => p ? p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es") : "")
    .join(" ");
}

function tieneDosPartes(valor: string) {
  return valor.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function soloDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export function ProfesorDatosObligatoriosModal() {
  const { role, session, profile, refresh } = useAuth();
  const uid = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [completo, setCompleto] = useState(true);
  const [datos, setDatos] = useState<ProfesorDatos | null>(null);
  const [cuenta, setCuenta] = useState<CuentaProfesor | null>(null);
  const [bancos, setBancos] = useState<Banco[]>([]);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [cedula, setCedula] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [direccion, setDireccion] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [latitud, setLatitud] = useState<number | null>(null);
  const [longitud, setLongitud] = useState<number | null>(null);
  const [bancoId, setBancoId] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState("ahorros");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cedulaFile, setCedulaFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [creandoBanco, setCreandoBanco] = useState(false);
  const [nuevoBanco, setNuevoBanco] = useState("");
  const [nuevoBancoImagen, setNuevoBancoImagen] = useState<File | null>(null);
  const direccionRef = useRef<HTMLInputElement>(null);

  const titular = useMemo(() => tituloPersona(`${nombres} ${apellidos}`), [nombres, apellidos]);

  useEffect(() => {
    if (role !== "soporte" || !uid) {
      setLoading(false);
      setCompleto(true);
      return;
    }
    let cancelado = false;
    (async () => {
      setLoading(true);
      const [{ data: d }, { data: c }, { data: bs }] = await Promise.all([
        supabase.from("profesor_datos").select("*").eq("usuario_id", uid).maybeSingle(),
        supabase.from("profesor_cuentas_bancarias").select("id,banco_id,tipo_cuenta,numero_cuenta,titular,principal").eq("usuario_id", uid).eq("principal", true).eq("activo", true).maybeSingle(),
        supabase.from("profesor_bancos_catalogo").select("id,nombre,imagen_url").eq("activo", true).order("nombre"),
      ]);
      if (cancelado) return;
      const pd = (d as ProfesorDatos | null) ?? null;
      const pc = (c as CuentaProfesor | null) ?? null;
      setDatos(pd);
      setCuenta(pc);
      setBancos((bs as Banco[] | null) ?? []);
      setNombres(pd?.nombres ?? "");
      setApellidos(pd?.apellidos ?? "");
      setCedula(pd?.cedula ?? "");
      setFechaNacimiento(pd?.fecha_nacimiento ?? "");
      setWhatsapp(pd?.whatsapp ?? "");
      setDireccion(pd?.direccion ?? "");
      setPlaceId(pd?.google_place_id ?? null);
      setLatitud(pd?.latitud ?? null);
      setLongitud(pd?.longitud ?? null);
      setBancoId(pc?.banco_id ?? "");
      setTipoCuenta(pc?.tipo_cuenta ?? "ahorros");
      setNumeroCuenta(pc?.numero_cuenta ?? "");
      setCompleto(Boolean(pd?.perfil_completo && pc && profile?.avatar_url));
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [role, uid, profile?.avatar_url]);

  // Autocomplete de Google Maps si VITE_GOOGLE_MAPS_API_KEY está configurada.
  useEffect(() => {
    if (completo || role !== "soporte" || !direccionRef.current) return;
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!key || typeof window === "undefined") return;

    const iniciar = () => {
      const w = window as typeof window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, opts: object) => { addListener: (event: string, cb: () => void) => void; getPlace: () => { formatted_address?: string; place_id?: string; geometry?: { location?: { lat: () => number; lng: () => number } } } } } } } };
      const Autocomplete = w.google?.maps?.places?.Autocomplete;
      if (!Autocomplete || !direccionRef.current) return;
      const ac = new Autocomplete(direccionRef.current, { fields: ["formatted_address", "place_id", "geometry"], types: ["address"] });
      ac.addListener("place_changed", () => {
        const p = ac.getPlace();
        if (p.formatted_address) setDireccion(p.formatted_address);
        setPlaceId(p.place_id ?? null);
        setLatitud(p.geometry?.location?.lat() ?? null);
        setLongitud(p.geometry?.location?.lng() ?? null);
      });
    };

    const existente = document.querySelector<HTMLScriptElement>('script[data-adn-google-maps="1"]');
    if (existente) {
      if (existente.dataset.loaded === "1") iniciar();
      else existente.addEventListener("load", iniciar, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=es&region=EC`;
    script.async = true;
    script.defer = true;
    script.dataset.adnGoogleMaps = "1";
    script.addEventListener("load", () => { script.dataset.loaded = "1"; iniciar(); }, { once: true });
    document.head.appendChild(script);
  }, [completo, role]);

  if (role !== "soporte" || loading || completo || !uid) return null;

  const subirAvatar = async () => {
    if (!avatarFile) return profile?.avatar_url ?? null;
    if (!avatarFile.type.startsWith("image/")) throw new Error("La foto del profesor debe ser una imagen.");
    const ext = avatarFile.name.split(".").pop() || "jpg";
    const path = `${uid}/profesor-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
    if (error) throw error;
    return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  };

  const subirCedula = async () => {
    if (!cedulaFile) return datos?.cedula_archivo_path ?? null;
    const ext = cedulaFile.name.split(".").pop() || "pdf";
    const path = `${uid}/cedula-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("profesor-documentos").upload(path, cedulaFile, { upsert: false });
    if (error) throw error;
    return path;
  };

  const crearBanco = async () => {
    const nombre = tituloPersona(nuevoBanco);
    if (!nombre) return toast.error("Escribe el nombre del banco o cooperativa.");
    if (!nuevoBancoImagen || !nuevoBancoImagen.type.startsWith("image/")) return toast.error("Agrega la imagen o logo del banco.");
    const ext = nuevoBancoImagen.name.split(".").pop() || "png";
    const path = `${uid}/${Date.now()}-${nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-")}.${ext}`;
    const { error: upError } = await supabase.storage.from("profesor-bancos").upload(path, nuevoBancoImagen, { upsert: false });
    if (upError) return toast.error(upError.message);
    const imagenUrl = supabase.storage.from("profesor-bancos").getPublicUrl(path).data.publicUrl;
    const { data, error } = await supabase.from("profesor_bancos_catalogo").insert({ nombre, imagen_url: imagenUrl, creado_por: uid, activo: true }).select("id,nombre,imagen_url").single();
    if (error) return toast.error(error.message);
    const b = data as Banco;
    setBancos((prev) => [...prev, b].sort((a, z) => a.nombre.localeCompare(z.nombre, "es")));
    setBancoId(b.id);
    setNuevoBanco("");
    setNuevoBancoImagen(null);
    setCreandoBanco(false);
    toast.success("Banco agregado");
  };

  const guardar = async () => {
    const n = tituloPersona(nombres);
    const a = tituloPersona(apellidos);
    const ci = soloDigitos(cedula);
    const tel = whatsapp.trim();
    const dir = direccion.trim();
    const num = numeroCuenta.trim();

    if (!tieneDosPartes(n)) return toast.error("Escribe los dos nombres del profesor.");
    if (!tieneDosPartes(a)) return toast.error("Escribe los dos apellidos del profesor.");
    if (ci.length !== 10) return toast.error("La cédula debe tener 10 dígitos.");
    if (!tel) return toast.error("WhatsApp / celular es obligatorio.");
    if (!dir) return toast.error("La dirección es obligatoria.");
    if (!bancoId) return toast.error("Selecciona o crea el banco a depositar.");
    if (!num) return toast.error("El número de cuenta es obligatorio.");
    if (!profile?.avatar_url && !avatarFile) return toast.error("La foto del profesor es obligatoria.");

    setSaving(true);
    try {
      const avatarUrl = await subirAvatar();
      const cedulaPath = await subirCedula();
      const nombreCompleto = tituloPersona(`${n} ${a}`);

      const { error: profileError } = await supabase.from("profiles").update({
        nombre_completo: nombreCompleto,
        avatar_url: avatarUrl,
      }).eq("id", uid);
      if (profileError) throw profileError;

      const { error: datosError } = await supabase.from("profesor_datos").upsert({
        usuario_id: uid,
        nombres: n,
        apellidos: a,
        cedula: ci,
        fecha_nacimiento: fechaNacimiento || null,
        whatsapp: tel,
        direccion: dir,
        google_place_id: placeId,
        latitud,
        longitud,
        cedula_archivo_path: cedulaPath,
        perfil_completo: true,
        completado_at: datos?.perfil_completo ? undefined : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "usuario_id" });
      if (datosError) throw datosError;

      const cuentaPayload = {
        usuario_id: uid,
        banco_id: bancoId,
        tipo_cuenta: tipoCuenta,
        numero_cuenta: num,
        titular: nombreCompleto,
        principal: true,
        activo: true,
        updated_at: new Date().toISOString(),
      };
      const cuentaError = cuenta
        ? (await supabase.from("profesor_cuentas_bancarias").update(cuentaPayload).eq("id", cuenta.id)).error
        : (await supabase.from("profesor_cuentas_bancarias").insert(cuentaPayload)).error;
      if (cuentaError) throw cuentaError;

      await refresh();
      setCompleto(true);
      toast.success("Datos del profesor registrados correctamente");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar los datos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm overflow-y-auto p-3 md:p-6">
      <div className="min-h-full grid place-items-center">
        <div className="w-full max-w-6xl rounded-3xl border bg-card shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b text-center" style={{ background: "linear-gradient(135deg, color-mix(in oklab,var(--violet) 11%,var(--card)), var(--card))" }}>
            <h2 className="text-2xl font-bold">Datos del profesor</h2>
            <p className="text-sm text-muted-foreground mt-1">Completa estos datos una sola vez. Se usarán en informes y gestión administrativa.</p>
          </div>

          <div className="grid lg:grid-cols-[230px_1fr] gap-6 p-5 md:p-7">
            <div className="space-y-4">
              <label className="rounded-2xl border-2 border-dashed min-h-[220px] grid place-items-center cursor-pointer overflow-hidden bg-background">
                {avatarPreview || profile?.avatar_url ? (
                  <img src={avatarPreview || profile?.avatar_url || ""} alt="Foto del profesor" className="w-full h-[220px] object-cover" />
                ) : (
                  <div className="text-center p-5 text-muted-foreground"><Camera className="w-9 h-9 mx-auto mb-3" /><div className="font-semibold text-foreground">FOTO DEL PROFESOR *</div><div className="text-xs mt-1">Obligatoria</div></div>
                )}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f)); }} />
              </label>

              <label className="rounded-2xl border-2 border-dashed min-h-[135px] grid place-items-center cursor-pointer bg-background">
                <div className="text-center p-4 text-muted-foreground"><FileUp className="w-7 h-7 mx-auto mb-2" /><div className="font-semibold text-foreground">CARGAR CÉDULA</div><div className="text-xs mt-1">PDF o imagen · opcional</div>{cedulaFile && <div className="text-xs mt-2 font-semibold" style={{ color: "var(--violet)" }}>{cedulaFile.name}</div>}</div>
                <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setCedulaFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 content-start">
              <Campo label="Nombres *" className="xl:col-span-1"><input value={nombres} onChange={(e) => setNombres(e.target.value)} onBlur={() => setNombres(tituloPersona(nombres))} placeholder="Ej. Juan Carlos" className="campo" /></Campo>
              <Campo label="Apellidos *"><input value={apellidos} onChange={(e) => setApellidos(e.target.value)} onBlur={() => setApellidos(tituloPersona(apellidos))} placeholder="Ej. Pérez López" className="campo" /></Campo>
              <Campo label="Cédula *"><input inputMode="numeric" maxLength={10} value={cedula} onChange={(e) => setCedula(soloDigitos(e.target.value).slice(0,10))} placeholder="10 dígitos" className="campo" /></Campo>
              <Campo label="Fecha de nacimiento · opcional"><input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className="campo" /></Campo>

              <Campo label="Correo electrónico *"><input value={profile?.email ?? ""} disabled className="campo opacity-70" /></Campo>
              <Campo label="WhatsApp / Celular *"><input inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="0991234567" className="campo" /></Campo>
              <Campo label="Dirección *" className="md:col-span-2">
                <div className="relative"><input ref={direccionRef} value={direccion} onChange={(e) => { setDireccion(e.target.value); setPlaceId(null); setLatitud(null); setLongitud(null); }} placeholder="Escribe y selecciona tu dirección" className="campo pr-11" /><MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /></div>
                <button type="button" onClick={() => direccion.trim() && window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion.trim())}`, "_blank", "noopener,noreferrer")} className="text-xs mt-1 underline text-muted-foreground">Verificar en Google Maps</button>
              </Campo>

              <Campo label="Banco a depositar *" className="md:col-span-2">
                <div className="flex gap-2">
                  <select value={bancoId} onChange={(e) => setBancoId(e.target.value)} className="campo flex-1">
                    <option value="">Seleccione banco...</option>
                    {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                  </select>
                  <button type="button" onClick={() => setCreandoBanco((v) => !v)} className="px-3 rounded-xl border hover:bg-muted" title="Crear banco"><Plus className="w-5 h-5" /></button>
                </div>
                {bancoId && <BancoSeleccionado banco={bancos.find((b) => b.id === bancoId) ?? null} />}
              </Campo>
              <Campo label="Tipo de cuenta *"><select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)} className="campo"><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option><option value="cooperativa">Cooperativa</option><option value="otro">Otro</option></select></Campo>
              <Campo label="Número de cuenta *"><input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))} placeholder="N° de cuenta" className="campo" /></Campo>

              {creandoBanco && (
                <div className="md:col-span-2 xl:col-span-4 rounded-2xl border p-4 bg-muted/30 grid md:grid-cols-[1fr_240px_auto] gap-3 items-end">
                  <Campo label="Nuevo banco / cooperativa"><input value={nuevoBanco} onChange={(e) => setNuevoBanco(e.target.value)} onBlur={() => setNuevoBanco(tituloPersona(nuevoBanco))} placeholder="Ej. Banco Pichincha" className="campo" /></Campo>
                  <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Imagen / logo *</span><div className="campo mt-1 flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" /><span className="truncate text-sm">{nuevoBancoImagen?.name || "Seleccionar imagen"}</span></div><input type="file" accept="image/*" hidden onChange={(e) => setNuevoBancoImagen(e.target.files?.[0] ?? null)} /></label>
                  <button type="button" onClick={crearBanco} className="h-[42px] px-4 rounded-xl bg-violet-gradient text-white font-semibold">Crear banco</button>
                </div>
              )}

              <Campo label="Titular" className="md:col-span-2"><input value={titular} disabled className="campo opacity-70" /></Campo>
              <Campo label="Rol" className="md:col-span-2"><input value={roleLabel(role)} disabled className="campo opacity-70" /></Campo>
            </div>
          </div>

          <div className="px-5 md:px-7 pb-7 flex justify-center">
            <button onClick={guardar} disabled={saving} className="px-8 py-3 rounded-full bg-violet-gradient text-white font-bold shadow-lg disabled:opacity-60">
              {saving ? "Guardando…" : "Registrar datos"}
            </button>
          </div>
        </div>
      </div>
      <style>{`.campo{width:100%;margin-top:.25rem;padding:.7rem .8rem;border-radius:.75rem;border:1px solid var(--border);background:var(--background);font-size:.875rem;outline:none}.campo:focus{box-shadow:0 0 0 2px color-mix(in oklab,var(--violet) 35%,transparent);border-color:var(--violet)}`}</style>
    </div>
  );
}

function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>{children}</div>;
}

function BancoSeleccionado({ banco }: { banco: Banco | null }) {
  if (!banco) return null;
  return <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">{banco.imagen_url ? <img src={banco.imagen_url} alt="" className="w-7 h-7 rounded-lg object-contain border bg-white" /> : <div className="w-7 h-7 rounded-lg border grid place-items-center"><Landmark className="w-4 h-4" /></div>}<span>{banco.nombre}</span></div>;
}
