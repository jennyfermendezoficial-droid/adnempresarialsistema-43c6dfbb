// Exportación de la nómina mensual: PDF (jsPDF) y Excel (xlsx, sin imágenes).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatHM } from "@/lib/tiempo";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export interface PagoExportRow {
  nombre: string;
  tema: string;
  minutosClase: number;
  tarifaHora: number;
  sesiones1a1: number;
  minutos1a1: number;
  tarifa1a1: number;
  mensajesEstudiantes: number;
  califPromedio: number;
  califCount: number;
  bonos: number;
  total: number;
  estado: string;
}

export interface PagoExportInput {
  mes: number; // 1-12
  anio: number;
  rows: PagoExportRow[];
}

function nombreArchivo(mes: number, anio: number, ext: string) {
  return `Pagos_ADN_${MESES[mes - 1]}_${anio}.${ext}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function generarPagosPDF({ mes, anio, rows }: PagoExportInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Encabezado
  doc.setFillColor(15, 20, 49);
  doc.rect(0, 0, W, 92, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("ADN Empresarial", 40, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.setTextColor(200, 195, 235);
  doc.text(`Nomina del equipo · ${MESES[mes - 1]} ${anio}`, 40, 62);

  const totMin = rows.reduce((a, r) => a + r.minutosClase + r.minutos1a1, 0);
  const totPagar = rows.reduce((a, r) => a + r.total, 0);
  const totSes = rows.reduce((a, r) => a + r.sesiones1a1, 0);
  const califs = rows.filter((r) => r.califCount > 0).map((r) => r.califPromedio);
  const califEq = califs.length ? califs.reduce((a, b) => a + b, 0) / califs.length : 0;

  // Tarjetas resumen
  const cards: [string, string][] = [
    ["Total a pagar", `$${totPagar.toFixed(2)}`],
    ["Tiempo dictado", formatHM(totMin)],
    ["Sesiones 1:1", String(totSes)],
    ["Calif. equipo", califEq ? califEq.toFixed(2) : "-"],
  ];
  const cw = (W - 80 - 30) / 4;
  cards.forEach(([label, value], i) => {
    const x = 40 + i * (cw + 10);
    doc.setDrawColor(225, 222, 240); doc.setFillColor(250, 248, 255);
    doc.roundedRect(x, 112, cw, 54, 6, 6, "FD");
    doc.setTextColor(120, 118, 145); doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, 130);
    doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(value, x + 10, 152);
    doc.setFont("helvetica", "normal");
  });

  autoTable(doc, {
    startY: 186,
    head: [["Profesor", "Tema", "Clases", "1:1", "Tiempo 1:1", "Calif.", "Bonos", "A pagar", "Estado"]],
    body: rows.map((r) => [
      r.nombre,
      r.tema,
      `${formatHM(r.minutosClase)} x $${r.tarifaHora}/h`,
      String(r.sesiones1a1),
      `${formatHM(r.minutos1a1)} x $${r.tarifa1a1}/h`,
      r.califCount ? r.califPromedio.toFixed(1) : "-",
      `$${r.bonos.toFixed(2)}`,
      `$${r.total.toFixed(2)}`,
      r.estado === "pagado" ? "Pagado" : "Por pagar",
    ]),
    foot: [["", "", "", "", "", "", "Total", `$${totPagar.toFixed(2)}`, ""]],
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [40, 38, 60] },
    headStyles: { fillColor: [124, 107, 255], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 238, 250], textColor: [30, 28, 50], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 249, 255] },
    columnStyles: { 7: { halign: "right" }, 6: { halign: "right" }, 3: { halign: "center" }, 5: { halign: "center" } },
    margin: { left: 40, right: 40 },
  });

  doc.setFontSize(8); doc.setTextColor(140, 138, 160);
  doc.text(
    `Generado el ${new Date().toLocaleString("es-EC")} · ADN Empresarial`,
    40, doc.internal.pageSize.getHeight() - 24,
  );

  doc.save(nombreArchivo(mes, anio, "pdf"));
}

export function exportarPagosExcel({ mes, anio, rows }: PagoExportInput) {
  const data = rows.map((r) => ({
    "Profesor": r.nombre,
    "Tema": r.tema,
    "Minutos clase": r.minutosClase,
    "Tiempo clase": formatHM(r.minutosClase),
    "Tarifa hora clase": r.tarifaHora,
    "Sesiones 1:1": r.sesiones1a1,
    "Minutos 1:1": r.minutos1a1,
    "Tiempo 1:1": formatHM(r.minutos1a1),
    "Tarifa hora 1:1": r.tarifa1a1,
    "Mensajes a estudiantes": r.mensajesEstudiantes,
    "Calificación": r.califCount ? Number(r.califPromedio.toFixed(2)) : "",
    "Bonos": Number(r.bonos.toFixed(2)),
    "A pagar": Number(r.total.toFixed(2)),
    "Estado": r.estado === "pagado" ? "Pagado" : "Por pagar",
  }));

  const totalMin = rows.reduce((a, r) => a + r.minutosClase + r.minutos1a1, 0);
  data.push({
    "Profesor": "TOTAL",
    "Tema": "",
    "Minutos clase": rows.reduce((a, r) => a + r.minutosClase, 0),
    "Tiempo clase": formatHM(totalMin),
    "Tarifa hora clase": "" as unknown as number,
    "Sesiones 1:1": rows.reduce((a, r) => a + r.sesiones1a1, 0),
    "Minutos 1:1": rows.reduce((a, r) => a + r.minutos1a1, 0),
    "Tiempo 1:1": "",
    "Tarifa hora 1:1": "" as unknown as number,
    "Mensajes a estudiantes": rows.reduce((a, r) => a + r.mensajesEstudiantes, 0),
    "Calificación": "",
    "Bonos": Number(rows.reduce((a, r) => a + r.bonos, 0).toFixed(2)),
    "A pagar": Number(rows.reduce((a, r) => a + r.total, 0).toFixed(2)),
    "Estado": "",
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 26 }, { wch: 22 }, { wch: 13 }, { wch: 14 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 15 }, { wch: 20 },
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${MESES[mes - 1]} ${anio}`);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    nombreArchivo(mes, anio, "xlsx"),
  );
}

export function listaMeses(desdeAnio = 2025): { value: string; label: string }[] {
  const hoy = new Date();
  const out: { value: string; label: string }[] = [];
  for (let a = hoy.getFullYear(); a >= desdeAnio; a--) {
    const desde = a === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
    for (let m = desde; m >= 1; m--) {
      out.push({ value: `${a}-${m}`, label: `${MESES[m - 1]} ${a}` });
    }
  }
  return out;
}