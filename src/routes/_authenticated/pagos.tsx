import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/pagos")({ component: Page });

interface Pago { id: string; profesor_id: string; mes: number; anio: number; total_horas: number; total_bonos: number; monto_total: number; estado: string; fecha_pago: string | null }
interface Profile { id: string; nombre_completo: string; email: string }

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

interface StaffRow {
  id: string;
  nombre: string;
  rol: string;
  reservas: number;
  mensajes: number;
  bonos: number;
}

function Page() {
  const { role } = useAuth();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [profs, setProfs] = useState<Record<string, Profile>>({});
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  useEffect(() => {
    supabase.from("pagos_mensuales").select("*").order("anio", { ascending: false }).order("mes", { ascending: false })
      .then(({ data }) => setPagos((data as Pago[]) ?? []));
    supabase.from("profiles").select("id,nombre_completo,email").then(({ data }) => {
      const m: Record<string, Profile> = {};
      (data ?? []).forEach((p: Profile) => { m[p.id] = p; });
      setProfs(m);
    });
    (async () => {
      // Staff = admin + soporte
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "soporte"]);
      const map = new Map<string, string>();
      (roles ?? []).forEach((r: { user_id: string; role: string }) => {
        const prev = map.get(r.user_id);
        // admin tiene prioridad sobre soporte
        if (!prev || r.role === "admin") map.set(r.user_id, r.role);
      });
      const ids = Array.from(map.keys());
      if (!ids.length) { setStaff([]); return; }
      const { data: ps } = await supabase.from("profiles").select("id,nombre_completo,email").in("id", ids);

      // Rango del mes actual
      const ini = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const finDate = new Date(anio, mes, 0);
      const fin = `${anio}-${String(mes).padStart(2, "0")}-${String(finDate.getDate()).padStart(2, "0")}`;
      const iniTs = `${ini}T00:00:00`;
      const finTs = `${fin}T23:59:59`;

      const rows: StaffRow[] = await Promise.all(
        (ps ?? []).map(async (p: Profile) => {
          const [reservasRes, mGeneral, mPriv, mSop, bonosRes] = await Promise.all([
            supabase.from("sesiones_1a1").select("id", { count: "exact", head: true })
              .eq("profesor_id", p.id).gte("fecha", ini).lte("fecha", fin),
            supabase.from("canal_general_mensajes").select("id", { count: "exact", head: true })
              .eq("autor_id", p.id).gte("created_at", iniTs).lte("created_at", finTs),
            supabase.from("mensajes_chat_1a1").select("id", { count: "exact", head: true })
              .eq("autor_id", p.id).gte("created_at", iniTs).lte("created_at", finTs),
            supabase.from("soporte_privado_mensajes").select("id", { count: "exact", head: true })
              .eq("autor_id", p.id).gte("created_at", iniTs).lte("created_at", finTs),
            supabase.from("bonos").select("monto").eq("profesor_id", p.id).eq("mes", mes).eq("anio", anio),
          ]);
          const totalBonos = (bonosRes.data ?? []).reduce((a: number, b: { monto: number }) => a + Number(b.monto), 0);
          return {
            id: p.id,
            nombre: p.nombre_completo || p.email,
            rol: map.get(p.id) ?? "soporte",
            reservas: reservasRes.count ?? 0,
            mensajes: (mGeneral.count ?? 0) + (mPriv.count ?? 0) + (mSop.count ?? 0),
            bonos: totalBonos,
          };
        })
      );
      setStaff(rows.sort((a, b) => b.reservas + b.mensajes - (a.reservas + a.mensajes)));
    })();
  }, []);

  const total = pagos.reduce((a, b) => a + Number(b.monto_total), 0);
  const pendiente = pagos.filter((p) => p.estado === "por_pagar").reduce((a, b) => a + Number(b.monto_total), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Pagos e informes</h1>
      <p className="text-sm text-muted-foreground mb-6">{role === "admin" ? "Resumen de pagos del equipo." : "Tus pagos mensuales."}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card label="Total" value={`S/ ${total.toFixed(2)}`} />
        <Card label="Por pagar" value={`S/ ${pendiente.toFixed(2)}`} />
        <Card label="Registros" value={String(pagos.length)} />
      </div>

      {(role === "admin" || role === "soporte") && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Actividad del equipo · {MESES[mes - 1]} {anio}</h2>
          <p className="text-xs text-muted-foreground mb-3">Incluye admins y soporte: reservas 1a1 atendidas, mensajes enviados y bonos del mes.</p>
          <div className="rounded-2xl border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Miembro</th>
                  <th className="text-left px-3 py-2">Rol</th>
                  <th className="text-right px-3 py-2">Reservas 1a1</th>
                  <th className="text-right px-3 py-2">Mensajes</th>
                  <th className="text-right px-3 py-2">Bonos</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{s.nombre}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs bg-violet/10 text-violet capitalize">{s.rol}</span></td>
                    <td className="text-right px-3 py-2">{s.reservas}</td>
                    <td className="text-right px-3 py-2">{s.mensajes}</td>
                    <td className="text-right px-3 py-2 font-semibold">S/ {s.bonos.toFixed(2)}</td>
                  </tr>
                ))}
                {staff.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sin actividad.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {role === "admin" && <th className="text-left px-3 py-2">Profesor</th>}
              <th className="text-left px-3 py-2">Periodo</th>
              <th className="text-right px-3 py-2">Horas</th>
              <th className="text-right px-3 py-2">Bonos</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-left px-3 py-2">Fecha pago</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="border-t">
                {role === "admin" && <td className="px-3 py-2">{profs[p.profesor_id]?.nombre_completo || profs[p.profesor_id]?.email || "—"}</td>}
                <td className="px-3 py-2">{MESES[p.mes - 1]} {p.anio}</td>
                <td className="text-right px-3 py-2">{p.total_horas}</td>
                <td className="text-right px-3 py-2">S/ {Number(p.total_bonos).toFixed(2)}</td>
                <td className="text-right px-3 py-2 font-semibold">S/ {Number(p.monto_total).toFixed(2)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${p.estado === "pagado" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{p.estado}</span></td>
                <td className="px-3 py-2">{p.fecha_pago ? new Date(p.fecha_pago).toLocaleDateString("es-PE") : "—"}</td>
              </tr>
            ))}
            {pagos.length === 0 && <tr><td colSpan={role === "admin" ? 7 : 6} className="text-center py-8 text-muted-foreground">Sin pagos registrados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-2xl border bg-card">
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
