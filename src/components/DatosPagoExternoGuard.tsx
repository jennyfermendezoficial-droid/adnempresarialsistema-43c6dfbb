import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type Cuenta = { banco: string; tipo_cuenta: string; numero_cuenta: string; titular_cuenta: string; cedula_titular: string };
const VACIA: Cuenta = { banco: "", tipo_cuenta: "ahorros", numero_cuenta: "", titular_cuenta: "", cedula_titular: "" };
const cls = "w-full px-3 py-2 rounded-lg border bg-background text-sm";

/**
 * Obliga a las alumnas de mentoría y a los freelancers seleccionados a registrar
 * la cuenta bancaria (y las alumnas, sus acompañantes) antes de seguir.
 */
export function DatosPagoExternoGuard() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [modo, setModo] = useState<null | "alumna" | "freelance">(null);
  const [esFreelance, setEsFreelance] = useState(false);
  const [cuenta, setCuenta] = useState<Cuenta>(VACIA);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre_completo: string | null; email: string | null }[]>([]);
  const [acomp, setAcomp] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);

  const revisar = useCallback(async () => {
    if (!uid) return;
    try {
      const { data: al } = await supabase.rpc("obtener_datos_pago_alumna", { _alumna_id: uid });
      const fila = (al as { seleccionada: boolean; completo: boolean }[] | null)?.[0];
      if (fila?.seleccionada && !fila.completo) {
        const { data: us } = await supabase.rpc("listar_usuarios_acompanantes");
        setUsuarios(((us ?? []) as typeof usuarios).filter((u) => u.id !== uid));
        setModo("alumna");
        return;
      }
      const { data: fr } = await supabase.rpc("es_freelance", { _uid: uid });
      setEsFreelance(!!fr);
      if (fr) {
        const { data: dp } = await supabase.from("freelance_datos_pago").select("numero_cuenta").eq("usuario_id", uid).maybeSingle();
        if (!dp?.numero_cuenta) {
          // Si ya tiene datos de pago en su ficha, no se le vuelve a pedir.
          const { data: pf } = await supabase.rpc("perfiles_pagos", { _ids: [uid] });
          const tiene = ((pf ?? []) as { numero_cuenta: string | null }[])[0]?.numero_cuenta;
          if (!tiene) setModo("freelance");
        }
      }
    } catch {
      /* silencioso */
    }
  }, [uid]);

  useEffect(() => { void revisar(); }, [revisar]);

  const guardar = async () => {
    if (!uid) return;
    if (!cuenta.banco.trim() || !cuenta.numero_cuenta.trim() || !cuenta.titular_cuenta.trim()) {
      return toast.error("Completa banco, número de cuenta y titular.");
    }
    setBusy(true);
    let error: { message: string } | null = null;
    if (modo === "alumna") {
      ({ error } = await supabase.rpc("guardar_datos_pago_alumna", {
        _alumna_id: uid, _banco: cuenta.banco.trim(), _tipo_cuenta: cuenta.tipo_cuenta,
        _numero_cuenta: cuenta.numero_cuenta.trim(), _titular_cuenta: cuenta.titular_cuenta.trim(),
        _cedula_titular: cuenta.cedula_titular.trim(),
      }));
      if (!error) {
        ({ error } = await supabase.rpc("guardar_acompanantes_mentoria", { _alumna_id: uid, _acompanantes: acomp.filter(Boolean) }));
      }
    } else {
      ({ error } = await supabase.from("freelance_datos_pago").upsert({
        usuario_id: uid, banco: cuenta.banco.trim(), tipo_cuenta: cuenta.tipo_cuenta,
        numero_cuenta: cuenta.numero_cuenta.trim(), titular_cuenta: cuenta.titular_cuenta.trim(),
        cedula_titular: cuenta.cedula_titular.trim() || null, updated_at: new Date().toISOString(),
      }));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Datos guardados");
    setModo(null);
  };

  return (
    <>
      {esFreelance && !modo && (
        <Link to="/mis-actividades-freelance" className="fixed bottom-5 right-5 z-40 px-4 py-2.5 rounded-full bg-violet-gradient text-white text-sm font-semibold shadow-lg inline-flex items-center gap-2">
          <Briefcase className="w-4 h-4" /> Mis actividades
        </Link>
      )}
      {modo && (
        <div className="fixed inset-0 z-[60] bg-black/60 grid place-items-center p-3 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-card border shadow-xl">
            <div className="px-5 py-4 bg-violet-gradient text-white rounded-t-2xl">
              <div className="font-semibold flex items-center gap-2"><Landmark className="w-4 h-4" /> Datos de pago obligatorios</div>
              <div className="text-xs opacity-90 mt-1">
                {modo === "alumna" ? "Indica con qué cuenta vas a pagar tu mentoría y elige tus acompañantes." : "Registra la cuenta donde recibirás tus pagos como freelance."}
              </div>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-[11px] font-semibold text-muted-foreground">Banco</span><input value={cuenta.banco} onChange={(e) => setCuenta({ ...cuenta, banco: e.target.value })} className={cls} /></label>
              <label className="block"><span className="text-[11px] font-semibold text-muted-foreground">Tipo de cuenta</span>
                <select value={cuenta.tipo_cuenta} onChange={(e) => setCuenta({ ...cuenta, tipo_cuenta: e.target.value })} className={cls}><option value="ahorros">Ahorros</option><option value="corriente">Corriente</option></select></label>
              <label className="block"><span className="text-[11px] font-semibold text-muted-foreground">Número de cuenta</span><input value={cuenta.numero_cuenta} onChange={(e) => setCuenta({ ...cuenta, numero_cuenta: e.target.value })} className={cls} /></label>
              <label className="block"><span className="text-[11px] font-semibold text-muted-foreground">Titular</span><input value={cuenta.titular_cuenta} onChange={(e) => setCuenta({ ...cuenta, titular_cuenta: e.target.value })} className={cls} /></label>
              <label className="block sm:col-span-2"><span className="text-[11px] font-semibold text-muted-foreground">Cédula del titular</span><input value={cuenta.cedula_titular} onChange={(e) => setCuenta({ ...cuenta, cedula_titular: e.target.value })} className={cls} /></label>
              {modo === "alumna" && [0, 1].map((i) => (
                <label key={i} className="block"><span className="text-[11px] font-semibold text-muted-foreground">Acompañante {i + 1}</span>
                  <select value={acomp[i]} onChange={(e) => { const n = [...acomp]; n[i] = e.target.value; setAcomp(n); }} className={cls}>
                    <option value="">Ninguno</option>
                    {usuarios.filter((u) => u.id !== acomp[1 - i]).map((u) => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
                  </select></label>
              ))}
            </div>
            <div className="px-5 pb-5 flex justify-end">
              <button disabled={busy} onClick={guardar} className="px-5 py-2 rounded-lg bg-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
