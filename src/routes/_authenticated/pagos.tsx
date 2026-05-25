import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/pagos")({ component: Page });

interface Pago { id: string; profesor_id: string; mes: number; anio: number; total_horas: number; total_bonos: number; monto_total: number; estado: string; fecha_pago: string | null }
interface Profile { id: string; nombre_completo: string; email: string }

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function Page() {
  const { role } = useAuth();
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [profs, setProfs] = useState<Record<string, Profile>>({});

  useEffect(() => {
    supabase.from("pagos_mensuales").select("*").order("anio", { ascending: false }).order("mes", { ascending: false })
      .then(({ data }) => setPagos((data as Pago[]) ?? []));
    supabase.from("profiles").select("id,nombre_completo,email").then(({ data }) => {
      const m: Record<string, Profile> = {};
      (data ?? []).forEach((p: Profile) => { m[p.id] = p; });
      setProfs(m);
    });
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
