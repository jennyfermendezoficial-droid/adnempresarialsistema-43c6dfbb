// Informe PDF individual de un freelancer. Separado de pagos-export.ts para no
// alterar los informes de profesores.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatHM } from "@/lib/tiempo";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

export interface InformeFreelanceSegmento {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  tarea: string;
  minutos: number;
  monto: number;
}

export interface InformeFreelanceAjuste {
  motivo: string;
  monto: number;
}

export interface InformeFreelanceAbono {
  fecha: string;
  monto: number;
  tipo: string;
  numero: string;
  observacion: string;
}

export interface InformeFreelanceInput {
  nombre: string;
  servicio: string;
  mes: number;
  anio: number;
  tarifaLaboral: number;
  tarifaFuera: number;
  laboral: InformeFreelanceSegmento[];
  fuera: InformeFreelanceSegmento[];
  bonos: InformeFreelanceAjuste[];
  descuentos: InformeFreelanceAjuste[];
  abonos: InformeFreelanceAbono[];
  total: number;
}

function diaDe(fecha: string) {
  const d = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : DIAS[d.getDay()];
}

function dinero(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function generarInformeFreelancePDF(input: InformeFreelanceInput) {
  const { nombre, servicio, mes, anio, tarifaLaboral, tarifaFuera, laboral, fuera, bonos, descuentos, abonos, total } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const abonado = abonos.reduce((a, b) => a + Number(b.monto), 0);
  const saldo = Math.max(0, Math.round((total - abonado) * 100) / 100);
  const estadoLabel = total > 0 && saldo <= 0.009 ? "Pagado" : abonado > 0 ? "Abono parcial" : "Por pagar";
  const minLaboral = laboral.reduce((a, s) => a + s.minutos, 0);
  const minFuera = fuera.reduce((a, s) => a + s.minutos, 0);

  doc.setFillColor(15, 20, 49);
  doc.rect(0, 0, W, 100, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("ADN Empresarial", 40, 38);
  doc.setFontSize(14);
  doc.text(nombre, 40, 62);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(200, 195, 235);
  doc.text(`${servicio ? `${servicio} · ` : ""}Freelance · Informe de ${MESES[mes - 1]} ${anio}`, 40, 80);

  const cards: [string, string][] = [
    ["Total a pagar", dinero(total)],
    ["Tiempo total", formatHM(minLaboral + minFuera)],
    ["Total abonado", dinero(abonado)],
    ["Estado", estadoLabel],
  ];
  const cw = (W - 80 - 30) / 4;
  cards.forEach(([label, value], i) => {
    const x = 40 + i * (cw + 10);
    doc.setDrawColor(225, 222, 240); doc.setFillColor(250, 248, 255);
    doc.roundedRect(x, 120, cw, 54, 6, 6, "FD");
    doc.setTextColor(120, 118, 145); doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, 138);
    doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(value, x + 10, 160, { maxWidth: cw - 20 });
    doc.setFont("helvetica", "normal");
  });

  let y = 192;
  const siguienteY = () => ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) + 14;

  // Solo se imprimen las secciones con actividad.
  const grupos: Array<{ titulo: string; filas: InformeFreelanceSegmento[]; color: [number, number, number] }> = [
    { titulo: `Horario laboral (07:00–13:00 y 14:30–17:30) · ${dinero(tarifaLaboral)}/h`, filas: laboral, color: [124, 107, 255] },
    { titulo: `Fuera de horario laboral · ${dinero(tarifaFuera)}/h`, filas: fuera, color: [231, 138, 60] },
  ];
  for (const g of grupos) {
    if (!g.filas.length) continue;
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
    doc.text(g.titulo, 40, y + 16);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 26,
      head: [["Fecha", "Día", "Horario", "Tarea realizada", "Duración", "Valor"]],
      body: g.filas.map((s) => [
        s.fecha,
        diaDe(s.fecha),
        `${s.horaInicio.slice(0, 5)} - ${s.horaFin.slice(0, 5)}`,
        s.tarea || "-",
        formatHM(s.minutos),
        dinero(s.monto),
      ]),
      foot: [["", "", "", "Subtotal", formatHM(g.filas.reduce((a, s) => a + s.minutos, 0)), dinero(g.filas.reduce((a, s) => a + s.monto, 0))]],
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: g.color, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 238, 250], textColor: [30, 28, 50], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 255] },
      columnStyles: { 4: { halign: "center" }, 5: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
    y = siguienteY();
  }

  const conceptos: string[][] = [];
  if (minLaboral > 0) conceptos.push(["Horas en horario laboral", formatHM(minLaboral), dinero(laboral.reduce((a, s) => a + s.monto, 0))]);
  if (minFuera > 0) conceptos.push(["Horas fuera de horario", formatHM(minFuera), dinero(fuera.reduce((a, s) => a + s.monto, 0))]);
  bonos.forEach((b) => conceptos.push([`Bono · ${b.motivo}`, "", `+${dinero(b.monto)}`]));
  descuentos.forEach((d) => conceptos.push([`Descuento · ${d.motivo}`, "", `-${dinero(d.monto)}`]));
  conceptos.push(["TOTAL A PAGAR", "", dinero(total)]);
  if (abonos.length) conceptos.push(["TOTAL ABONADO", `${abonos.length} pago(s)`, dinero(abonado)]);
  conceptos.push(["SALDO PENDIENTE", estadoLabel, dinero(saldo)]);

  doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
  doc.text("Resumen económico", 40, y + 16);
  doc.setFont("helvetica", "normal");
  autoTable(doc, {
    startY: y + 26,
    head: [["Concepto", "Detalle", "Monto"]],
    body: conceptos,
    styles: { fontSize: 9, cellPadding: 5, textColor: [40, 38, 60] },
    headStyles: { fillColor: [15, 20, 49], textColor: 255, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });
  y = siguienteY();

  if (abonos.length) {
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
    doc.text("Pagos realizados", 40, y + 16);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 26,
      head: [["Fecha", "Método", "N.º comprobante", "Observación", "Monto"]],
      body: abonos.map((a) => [a.fecha, a.tipo, a.numero || "-", a.observacion || "-", dinero(a.monto)]),
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: [34, 160, 107], textColor: 255, fontStyle: "bold" },
      columnStyles: { 4: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
  }

  const archivo = `Informe_Freelance_${nombre.replace(/[^\p{L}\p{N}]+/gu, "_")}_${MESES[mes - 1]}_${anio}.pdf`;
  doc.save(archivo);
}
