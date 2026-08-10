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
  sesiones1a1: number;
  minutos1a1: number;
  ajusteMin: number;
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
  canceladas?: CanceladaExportRow[];
  abonos?: AbonoExportRow[];
}

export interface AbonoExportRow {
  fecha: string;
  profesor: string;
  monto: number;
  tipo: string;
  banco: string;
  numero: string;
  observacion: string;
}

export interface CanceladaExportRow {
  profesor: string;
  fecha: string;
  tipo: string;      // "1 a 1" | "Clase en vivo"
  con: string;       // estudiante o titulo
  estado: string;    // "Cancelada" | "No registrada"
  razon: string;
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

export function generarPagosPDF({ mes, anio, rows, canceladas = [], abonos = [] }: PagoExportInput) {
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
    head: [["Profesor", "Tema", "Tiempo clases", "1:1", "Tiempo 1:1", "Ajuste", "Calif.", "Bonos", "A pagar", "Estado"]],
    body: rows.map((r) => [
      r.nombre,
      r.tema,
      formatHM(r.minutosClase),
      String(r.sesiones1a1),
      formatHM(r.minutos1a1),
      r.ajusteMin ? `${r.ajusteMin > 0 ? "+" : "-"}${formatHM(Math.abs(r.ajusteMin))}` : "-",
      r.califCount ? r.califPromedio.toFixed(1) : "-",
      `$${r.bonos.toFixed(2)}`,
      `$${r.total.toFixed(2)}`,
      r.estado === "pagado" ? "Pagado" : "Por pagar",
    ]),
    foot: [["", "", "", "", "", "", "", "Total", `$${totPagar.toFixed(2)}`, ""]],
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [40, 38, 60] },
    headStyles: { fillColor: [124, 107, 255], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 238, 250], textColor: [30, 28, 50], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 249, 255] },
    columnStyles: { 8: { halign: "right" }, 7: { halign: "right" }, 3: { halign: "center" }, 6: { halign: "center" } },
    margin: { left: 40, right: 40 },
  });

  if (abonos.length) {
    const prevA = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
    doc.text("Pagos realizados", 40, prevA + 28);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: prevA + 38,
      head: [["Fecha", "Profesor", "Tipo", "Banco / Cuenta", "N. comprobante", "Observacion", "Monto"]],
      body: abonos.map((a) => [a.fecha, a.profesor, a.tipo, a.banco || "-", a.numero || "-", a.observacion || "-", `$${a.monto.toFixed(2)}`]),
      foot: [["", "", "", "", "", "Total abonado", `$${abonos.reduce((s, a) => s + a.monto, 0).toFixed(2)}`]],
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [235, 247, 238], textColor: [30, 28, 50], fontStyle: "bold" },
      columnStyles: { 6: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
  }

  if (canceladas.length) {
    const prevY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
    doc.text("Sesiones canceladas / no registradas (no cuentan horas)", 40, prevY + 28);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: prevY + 38,
      head: [["Fecha", "Profesor", "Tipo", "Con / Titulo", "Estado", "Razon", "Monto"]],
      body: canceladas.map((c) => [c.fecha, c.profesor, c.tipo, c.con, c.estado, c.razon || "-", "$0.00"]),
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: [200, 70, 70], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [255, 248, 248] },
      margin: { left: 40, right: 40 },
    });
  }

  doc.setFontSize(8); doc.setTextColor(140, 138, 160);
  doc.text(
    `Generado el ${new Date().toLocaleString("es-EC")} · ADN Empresarial`,
    40, doc.internal.pageSize.getHeight() - 24,
  );

  doc.save(nombreArchivo(mes, anio, "pdf"));
}

export function exportarPagosExcel({ mes, anio, rows, canceladas = [], abonos = [] }: PagoExportInput) {
  const data = rows.map((r) => ({
    "Profesor": r.nombre,
    "Tema": r.tema,
    "Minutos clase": r.minutosClase,
    "Tiempo clase": formatHM(r.minutosClase),
    "Sesiones 1:1": r.sesiones1a1,
    "Minutos 1:1": r.minutos1a1,
    "Tiempo 1:1": formatHM(r.minutos1a1),
    "Ajuste (min)": r.ajusteMin,
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
    "Sesiones 1:1": rows.reduce((a, r) => a + r.sesiones1a1, 0),
    "Minutos 1:1": rows.reduce((a, r) => a + r.minutos1a1, 0),
    "Tiempo 1:1": "",
    "Ajuste (min)": rows.reduce((a, r) => a + r.ajusteMin, 0),
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
  if (abonos.length) {
    const ws3 = XLSX.utils.json_to_sheet(abonos.map((a) => ({
      "Fecha": a.fecha,
      "Profesor": a.profesor,
      "Monto": Number(a.monto.toFixed(2)),
      "Tipo de pago": a.tipo,
      "Banco / Cuenta": a.banco,
      "N° comprobante": a.numero,
      "Observación": a.observacion,
    })));
    ws3["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 34 }, { wch: 22 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Pagos realizados");
  }
  if (canceladas.length) {
    const ws2 = XLSX.utils.json_to_sheet(canceladas.map((c) => ({
      "Fecha": c.fecha,
      "Profesor": c.profesor,
      "Tipo": c.tipo,
      "Con / Título": c.con,
      "Estado": c.estado,
      "Razón": c.razon,
      "Monto": 0,
    })));
    ws2["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Canceladas");
  }
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

// ===================== INFORME INDIVIDUAL DEL PROFESOR =====================

export interface InformeItem {
  fecha: string;
  tipo: string;        // "Clase en vivo" | "Sesión 1:1"
  detalle: string;     // tema o estudiante
  horaInicio: string;
  horaFin: string;
  minutos: number;
  monto: number;
}

export interface InformeReemplazo {
  fecha: string;
  detalle: string;
  profesor: string;    // a quién reemplazó
  nota: string;
}

export interface InformeProfesorInput {
  nombre: string;
  tema: string;
  mes: number;
  anio: number;
  items: InformeItem[];
  canceladas?: CanceladaExportRow[];
  reemplazos?: InformeReemplazo[];
  abonos?: AbonoExportRow[];
  bonos: number;
  ajusteMin: number;
  total: number;
  califPromedio: number;
  califCount: number;
}

const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
function diaDe(fecha: string) {
  const d = new Date(fecha + "T00:00:00");
  return DIAS[d.getDay()];
}

export function generarInformeProfesorPDF(input: InformeProfesorInput) {
  const { nombre, tema, mes, anio, items, canceladas = [], reemplazos = [], abonos = [], bonos, ajusteMin, total, califPromedio, califCount } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 20, 49);
  doc.rect(0, 0, W, 100, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text("ADN Empresarial", 40, 38);
  doc.setFontSize(14);
  doc.text(nombre, 40, 62);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(200, 195, 235);
  doc.text(`${tema} · Informe de ${MESES[mes - 1]} ${anio}`, 40, 80);

  const minClase = items.filter((i) => i.tipo !== "Sesión 1:1").reduce((a, i) => a + i.minutos, 0);
  const min1a1 = items.filter((i) => i.tipo === "Sesión 1:1").reduce((a, i) => a + i.minutos, 0);
  const cards: [string, string][] = [
    ["Total a pagar", `$${total.toFixed(2)}`],
    ["Tiempo dictado", formatHM(minClase + min1a1 + ajusteMin)],
    ["Clases / 1:1", `${items.filter((i) => i.tipo !== "Sesión 1:1").length} / ${items.filter((i) => i.tipo === "Sesión 1:1").length}`],
    ["Calificación", califCount ? califPromedio.toFixed(2) : "-"],
  ];
  const cw = (W - 80 - 30) / 4;
  cards.forEach(([label, value], i) => {
    const x = 40 + i * (cw + 10);
    doc.setDrawColor(225, 222, 240); doc.setFillColor(250, 248, 255);
    doc.roundedRect(x, 120, cw, 54, 6, 6, "FD");
    doc.setTextColor(120, 118, 145); doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, 138);
    doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(value, x + 10, 160);
    doc.setFont("helvetica", "normal");
  });

  doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
  doc.text("Detalle de clases y sesiones", 40, 198);
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: 208,
    head: [["Fecha", "Día", "Horario", "Tipo", "Con / Tema", "Duración", "Valor"]],
    body: items.length
      ? items.map((i) => [
          i.fecha, diaDe(i.fecha),
          `${(i.horaInicio || "").slice(0, 5)} - ${(i.horaFin || "").slice(0, 5)}`,
          i.tipo, i.detalle, formatHM(i.minutos), `$${i.monto.toFixed(2)}`,
        ])
      : [["-", "-", "-", "-", "Sin clases registradas este mes", "-", "$0.00"]],
    foot: [[
      "", "", "", "", "Subtotal clases y sesiones",
      formatHM(minClase + min1a1),
      `$${items.reduce((a, i) => a + i.monto, 0).toFixed(2)}`,
    ]],
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [40, 38, 60] },
    headStyles: { fillColor: [124, 107, 255], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [240, 238, 250], textColor: [30, 28, 50], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 249, 255] },
    columnStyles: { 6: { halign: "right" }, 5: { halign: "center" } },
    margin: { left: 40, right: 40 },
  });

  let y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 240;

  // Resumen económico
  autoTable(doc, {
    startY: y + 24,
    head: [["Concepto", "Detalle", "Monto"]],
    body: [
      ["Clases en vivo", formatHM(minClase), `$${items.filter((i) => i.tipo !== "Sesión 1:1").reduce((a, i) => a + i.monto, 0).toFixed(2)}`],
      ["Sesiones 1 a 1", formatHM(min1a1), `$${items.filter((i) => i.tipo === "Sesión 1:1").reduce((a, i) => a + i.monto, 0).toFixed(2)}`],
      ["Ajuste manual de tiempo", ajusteMin ? `${ajusteMin > 0 ? "+" : "-"}${formatHM(Math.abs(ajusteMin))}` : "Sin ajuste", "-"],
      ["Bonos", bonos ? "Otorgados por administracion" : "Sin bonos", `$${bonos.toFixed(2)}`],
      ["TOTAL A PAGAR", "", `$${total.toFixed(2)}`],
      ["Total abonado", abonos.length ? `${abonos.length} pago(s) registrado(s)` : "Sin pagos registrados", `$${abonos.reduce((a, b) => a + b.monto, 0).toFixed(2)}`],
      ["SALDO PENDIENTE", "", `$${(total - abonos.reduce((a, b) => a + b.monto, 0)).toFixed(2)}`],
    ],
    styles: { fontSize: 9, cellPadding: 5, textColor: [40, 38, 60] },
    headStyles: { fillColor: [30, 28, 60], textColor: 255, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    margin: { left: 40, right: 40 },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  if (abonos.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50);
    doc.text("Pagos realizados", 40, y + 28);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 38,
      head: [["Fecha", "Tipo", "Banco / Cuenta", "N. comprobante", "Observacion", "Monto"]],
      body: abonos.map((a) => [a.fecha, a.tipo, a.banco || "-", a.numero || "-", a.observacion || "-", `$${a.monto.toFixed(2)}`]),
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" },
      columnStyles: { 5: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  }

  if (reemplazos.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50);
    doc.text("Reemplazos reportados (informativo)", 40, y + 28);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 38,
      head: [["Fecha", "Clase / Sesion", "Reemplazo a", "Nota"]],
      body: reemplazos.map((r) => [r.fecha, r.detalle, r.profesor, r.nota || "-"]),
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: [60, 143, 231], textColor: 255, fontStyle: "bold" },
      margin: { left: 40, right: 40 },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  }

  if (canceladas.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50);
    doc.text("Sesiones canceladas / no registradas (no cuentan horas)", 40, y + 28);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 38,
      head: [["Fecha", "Tipo", "Con / Titulo", "Estado", "Razon", "Monto"]],
      body: canceladas.map((c) => [c.fecha, c.tipo, c.con, c.estado, c.razon || "-", "$0.00"]),
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] },
      headStyles: { fillColor: [200, 70, 70], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [255, 248, 248] },
      margin: { left: 40, right: 40 },
    });
  }

  doc.setFontSize(8); doc.setTextColor(140, 138, 160);
  doc.text(
    `Generado el ${new Date().toLocaleString("es-EC")} · ADN Empresarial`,
    40, doc.internal.pageSize.getHeight() - 24,
  );

  const safe = nombre.normalize("NFD").replace(/[^\w]+/g, "_");
  doc.save(`Informe_${safe}_${MESES[mes - 1]}_${anio}.pdf`);
}