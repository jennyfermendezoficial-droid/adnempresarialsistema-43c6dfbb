// Resumen PDF mensual de un freelancer. Separado de pagos-export.ts para no
// alterar los informes de profesores. Las secciones sin datos no se imprimen.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatHM } from "@/lib/tiempo";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

export interface ResumenFreelanceTrabajo {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  actividad: string;
  minutos: number;
  minutosLaboral: number;
  minutosFuera: number;
  tarifa: number;
  valor: number;
}

export interface ResumenFreelanceAjuste {
  tipo: string;
  motivo: string;
  efecto: number;
}

export interface ResumenFreelanceAbono {
  fecha: string;
  monto: number;
  tipo: string;
  numero: string;
}

export interface ResumenFreelanceInput {
  nombre: string;
  area: string;
  tarifa: number;
  mes: number;
  anio: number;
  trabajos: ResumenFreelanceTrabajo[];
  ajustes: ResumenFreelanceAjuste[];
  abonos: ResumenFreelanceAbono[];
  generado: number;
  total: number;
}

function diaDe(fecha: string) {
  const d = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : DIAS[d.getDay()];
}

function dinero(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function dineroConSigno(n: number) {
  return `${n < 0 ? "-" : "+"}${dinero(Math.abs(n))}`;
}

export function generarResumenFreelancePDF(input: ResumenFreelanceInput) {
  const { nombre, area, tarifa, mes, anio, trabajos, ajustes, abonos, generado, total } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const pagado = abonos.reduce((a, b) => a + Number(b.monto), 0);
  const pendiente = Math.max(0, Math.round((total - pagado) * 100) / 100);
  const minutos = trabajos.reduce((a, t) => a + t.minutos, 0);
  const minFuera = trabajos.reduce((a, t) => a + t.minutosFuera, 0);

  doc.setFillColor(15, 20, 49);
  doc.rect(0, 0, W, 100, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("ADN Empresarial", 40, 38);
  doc.setFontSize(14);
  doc.text(nombre, 40, 62);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(200, 195, 235);
  doc.text(`${area ? `${area} · ` : ""}Freelance · ${dinero(tarifa)}/hora · ${MESES[mes - 1]} ${anio}`, 40, 80);

  const cards: [string, string][] = [
    ["Pago generado", dinero(generado)],
    ["Horas trabajadas", formatHM(minutos)],
    ["Total a pagar", dinero(total)],
    ["Pendiente de pago", dinero(pendiente)],
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
  const titulo = (t: string) => {
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
    doc.text(t, 40, y + 16);
    doc.setFont("helvetica", "normal");
  };
  const estilos = {
    styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] as [number, number, number] },
    alternateRowStyles: { fillColor: [250, 249, 255] as [number, number, number] },
    margin: { left: 40, right: 40 },
  };

  if (trabajos.length) {
    titulo("Trabajos realizados");
    // La columna "Fuera de horario" solo aparece si hubo tiempo fuera de horario.
    const conFuera = minFuera > 0;
    autoTable(doc, {
      ...estilos,
      startY: y + 26,
      head: [["Fecha", "Día", "Horario", "Actividad", "Horas", ...(conFuera ? ["Fuera de horario"] : []), "Valor"]],
      body: trabajos.map((t) => [
        t.fecha, diaDe(t.fecha), `${t.horaInicio.slice(0, 5)} - ${t.horaFin.slice(0, 5)}`, t.actividad,
        formatHM(t.minutos), ...(conFuera ? [t.minutosFuera ? formatHM(t.minutosFuera) : "-"] : []), dinero(t.valor),
      ]),
      foot: [["", "", "", "Subtotal", formatHM(minutos), ...(conFuera ? [formatHM(minFuera)] : []), dinero(generado)]],
      headStyles: { fillColor: [124, 107, 255], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 238, 250], textColor: [30, 28, 50], fontStyle: "bold" },
      columnStyles: { [conFuera ? 6 : 5]: { halign: "right" } },
    });
    y = siguienteY();
  }

  const conceptos: string[][] = [["Pago generado", `${formatHM(minutos)} × ${dinero(tarifa)}/h`, dinero(generado)]];
  ajustes.forEach((a) => conceptos.push([a.tipo, a.motivo, dineroConSigno(a.efecto)]));
  conceptos.push(["TOTAL A PAGAR", "", dinero(total)]);
  if (abonos.length) conceptos.push(["PAGADO", `${abonos.length} pago(s)`, dinero(pagado)]);
  conceptos.push(["PENDIENTE DE PAGO", "", dinero(pendiente)]);

  titulo("Resumen económico");
  autoTable(doc, {
    ...estilos,
    startY: y + 26,
    head: [["Concepto", "Detalle", "Monto"]],
    body: conceptos,
    styles: { ...estilos.styles, fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 20, 49], textColor: 255, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
  });
  y = siguienteY();

  if (abonos.length) {
    titulo("Pagos realizados");
    autoTable(doc, {
      ...estilos,
      startY: y + 26,
      head: [["Fecha", "Método", "N.º comprobante", "Monto"]],
      body: abonos.map((a) => [a.fecha, a.tipo, a.numero || "-", dinero(a.monto)]),
      headStyles: { fillColor: [34, 160, 107], textColor: 255, fontStyle: "bold" },
      columnStyles: { 3: { halign: "right" } },
    });
  }

  doc.save(`Freelance_${nombre.replace(/[^\p{L}\p{N}]+/gu, "_")}_${MESES[mes - 1]}_${anio}.pdf`);
}
