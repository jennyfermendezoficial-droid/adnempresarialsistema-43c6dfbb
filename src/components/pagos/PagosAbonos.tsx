import { esUrlAbsoluta } from "@/lib/cloudinary";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Abono } from "./RegistrarAbonoModal";

export function PagosAbonos({ abonos, nombres, totales, mes, anio }: {
  abonos: Abono[]; nombres: Record<string, string>; totales: Record<string, number>; mes: number; anio: number;
}) {
  const totalAbonado = abonos.reduce((a, b) => a + Number(b.monto), 0);
  const totalMes = Object.values(totales).reduce((a, b) => a + b, 0);

  const ver = async (a: Abono) => {
    if (!a.archivo_url) return;
    if (esUrlAbsoluta(a.archivo_url)) { window.open(a.archivo_url, "_blank", "noreferrer"); return; }
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(a.archivo_url, 3600);
    if (error || !data) return toast.error("No se pudo abrir el comprobante");
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Pagos realizados · {String(mes).padStart(2, "0")}/{anio}</h2>
          <p className="text-xs text-muted-foreground">Abonos con su comprobante, banco y número.</p>
        </div>
        <div className="text-sm">
          Abonado <span className="font-bold tabular-nums text-emerald-600">${totalAbonado.toFixed(2)}</span>
          <span className="text-muted-foreground"> de ${totalMes.toFixed(2)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b">
              <th className="text-left px-3 py-2 font-semibold">Fecha</th>
              <th className="text-left px-3 py-2 font-semibold">Profesor</th>
              <th className="text-right px-3 py-2 font-semibold">Monto</th>
              <th className="text-left px-3 py-2 font-semibold">Tipo</th>
              <th className="text-left px-3 py-2 font-semibold">Cuenta / Banco</th>
              <th className="text-left px-3 py-2 font-semibold">N° comprobante</th>
              <th className="text-left px-3 py-2 font-semibold">Observación</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {abonos.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{a.fecha_pago}</td>
                <td className="px-3 py-2">{nombres[a.profesor_id] || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">${Number(a.monto).toFixed(2)}</td>
                <td className="px-3 py-2 capitalize">{a.tipo_pago}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.banco_texto || "—"}</td>
                <td className="px-3 py-2">{a.numero_comprobante || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.observacion || "—"}</td>
                <td className="px-3 py-2 text-right">
                  {a.archivo_url && <button onClick={() => ver(a)} className="text-xs font-semibold underline">Ver</button>}
                </td>
              </tr>
            ))}
            {abonos.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Aún no hay pagos registrados este mes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
