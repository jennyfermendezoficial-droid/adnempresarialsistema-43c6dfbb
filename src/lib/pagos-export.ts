// Exportación de la nómina mensual: PDF (jsPDF) y Excel (xlsx, sin imágenes).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatHM } from "@/lib/tiempo";
import { supabase } from "@/integrations/supabase/client";

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
  mes: number;
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
  tipo: string;
  con: string;
  estado: string;
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
      r.nombre, r.tema, formatHM(r.minutosClase), String(r.sesiones1a1), formatHM(r.minutos1a1),
      r.ajusteMin ? `${r.ajusteMin > 0 ? "+" : "-"}${formatHM(Math.abs(r.ajusteMin))}` : "-",
      r.califCount ? r.califPromedio.toFixed(1) : "-", `$${r.bonos.toFixed(2)}`, `$${r.total.toFixed(2)}`,
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
      columnStyles: { 6: { halign: "right" } }, margin: { left: 40, right: 40 },
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
      alternateRowStyles: { fillColor: [255, 248, 248] }, margin: { left: 40, right: 40 },
    });
  }

  doc.setFontSize(8); doc.setTextColor(140, 138, 160);
  doc.text(`Generado el ${new Date().toLocaleString("es-EC")} · ADN Empresarial`, 40, doc.internal.pageSize.getHeight() - 24);
  doc.save(nombreArchivo(mes, anio, "pdf"));
}

export function exportarPagosExcel({ mes, anio, rows, canceladas = [], abonos = [] }: PagoExportInput) {
  const data = rows.map((r) => ({
    "Profesor": r.nombre, "Tema": r.tema, "Minutos clase": r.minutosClase, "Tiempo clase": formatHM(r.minutosClase),
    "Sesiones 1:1": r.sesiones1a1, "Minutos 1:1": r.minutos1a1, "Tiempo 1:1": formatHM(r.minutos1a1),
    "Ajuste (min)": r.ajusteMin, "Mensajes a estudiantes": r.mensajesEstudiantes,
    "Calificación": r.califCount ? Number(r.califPromedio.toFixed(2)) : "", "Bonos": Number(r.bonos.toFixed(2)),
    "A pagar": Number(r.total.toFixed(2)), "Estado": r.estado === "pagado" ? "Pagado" : "Por pagar",
  }));

  const totalMin = rows.reduce((a, r) => a + r.minutosClase + r.minutos1a1, 0);
  data.push({
    "Profesor": "TOTAL", "Tema": "", "Minutos clase": rows.reduce((a, r) => a + r.minutosClase, 0), "Tiempo clase": formatHM(totalMin),
    "Sesiones 1:1": rows.reduce((a, r) => a + r.sesiones1a1, 0), "Minutos 1:1": rows.reduce((a, r) => a + r.minutos1a1, 0),
    "Tiempo 1:1": "", "Ajuste (min)": rows.reduce((a, r) => a + r.ajusteMin, 0), "Mensajes a estudiantes": rows.reduce((a, r) => a + r.mensajesEstudiantes, 0),
    "Calificación": "", "Bonos": Number(rows.reduce((a, r) => a + r.bonos, 0).toFixed(2)), "A pagar": Number(rows.reduce((a, r) => a + r.total, 0).toFixed(2)), "Estado": "",
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${MESES[mes - 1]} ${anio}`);
  if (abonos.length) {
    const ws3 = XLSX.utils.json_to_sheet(abonos.map((a) => ({ "Fecha": a.fecha, "Profesor": a.profesor, "Monto": Number(a.monto.toFixed(2)), "Tipo de pago": a.tipo, "Banco / Cuenta": a.banco, "N° comprobante": a.numero, "Observación": a.observacion })));
    ws3["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 16 }, { wch: 34 }, { wch: 22 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Pagos realizados");
  }
  if (canceladas.length) {
    const ws2 = XLSX.utils.json_to_sheet(canceladas.map((c) => ({ "Fecha": c.fecha, "Profesor": c.profesor, "Tipo": c.tipo, "Con / Título": c.con, "Estado": c.estado, "Razón": c.razon, "Monto": 0 })));
    ws2["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 40 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Canceladas");
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombreArchivo(mes, anio, "xlsx"));
}

export function listaMeses(desdeAnio = 2025): { value: string; label: string }[] {
  const hoy = new Date();
  const out: { value: string; label: string }[] = [];
  for (let a = hoy.getFullYear(); a >= desdeAnio; a--) {
    const desde = a === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
    for (let m = desde; m >= 1; m--) out.push({ value: `${a}-${m}`, label: `${MESES[m - 1]} ${a}` });
  }
  return out;
}

// ===================== INFORME INDIVIDUAL DEL PROFESOR =====================

export type InformeCategoria = "clase" | "1a1_laboral" | "1a1_fuera" | "1a1" | "coach" | "pendiente";

export interface InformeItem {
  fecha: string;
  tipo: string;
  categoria?: InformeCategoria;
  detalle: string;
  tema?: string;
  horaInicio: string;
  horaFin: string;
  minutos: number;
  monto: number;
}

export interface InformeReemplazo { fecha: string; detalle: string; profesor: string; nota: string; }
export interface InformeMovimiento { motivo: string; monto: number; }

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
  bonosDetalle?: InformeMovimiento[];
  descuentos?: number;
  descuentosDetalle?: InformeMovimiento[];
  ajusteMin: number;
  total: number;
  estadoPago?: "pagado" | "parcial" | "por_pagar";
  califPromedio: number;
  califCount: number;
}

type CalifInforme = { fecha: string; estrellas: number; razon: string };

const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
function diaDe(fecha: string) { const d = new Date(fecha + "T00:00:00"); return DIAS[d.getDay()]; }
function normalizarNombre(v: string) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

async function calificacionesParaInforme(nombre: string, mes: number, anio: number): Promise<CalifInforme[]> {
  try {
    const { data: perfiles, error: pError } = await supabase.from("profiles").select("id,nombre_completo,email");
    if (pError) return [];
    const objetivo = normalizarNombre(nombre);
    const perfil = ((perfiles ?? []) as Array<{ id: string; nombre_completo: string | null; email: string | null }>).find((p) =>
      normalizarNombre(p.nombre_completo || p.email || "") === objetivo
    );
    if (!perfil) return [];

    const { data, error } = await supabase
      .from("calificaciones_mensuales")
      .select("claridad,didactica,desenvolvimiento,practico,comentario,created_at")
      .eq("profesor_id", perfil.id)
      .eq("mes", mes)
      .eq("anio", anio)
      .order("created_at", { ascending: true });
    if (error) return [];

    return ((data ?? []) as Array<{ claridad: number | null; didactica: number | null; desenvolvimiento: number | null; practico: number | null; comentario: string | null; created_at: string }>).
      map((c) => {
        const vals = [c.claridad, c.didactica, c.desenvolvimiento, c.practico].filter((v): v is number => typeof v === "number");
        return {
          fecha: new Date(c.created_at).toLocaleDateString("es-EC"),
          estrellas: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -1,
          razon: (c.comentario || "").trim(),
        };
      })
      .filter((c) => c.estrellas >= 0 && c.razon.length >= 3);
  } catch {
    return [];
  }
}

function categoriaInforme(i: InformeItem): InformeCategoria {
  if (i.minutos <= 0) return "pendiente";
  if (i.categoria) return i.categoria;
  const tipo = i.tipo.toLowerCase();
  if (tipo.includes("coach")) return "coach";
  if (tipo.includes("fuera")) return "1a1_fuera";
  if (tipo.includes("laboral")) return "1a1_laboral";
  if (tipo.includes("1:1") || tipo.includes("1 a 1")) return "1a1";
  return "clase";
}

const GRUPOS_INFORME: Array<{ categoria: InformeCategoria; titulo: string; color: [number, number, number] }> = [
  { categoria: "clase", titulo: "Clases en vivo", color: [124, 107, 255] },
  { categoria: "1a1_laboral", titulo: "Sesiones 1 a 1 · horario laboral", color: [22, 163, 74] },
  { categoria: "1a1_fuera", titulo: "Sesiones 1 a 1 · fuera de horario laboral", color: [217, 119, 6] },
  { categoria: "1a1", titulo: "Sesiones 1 a 1", color: [22, 163, 74] },
  { categoria: "coach", titulo: "Coach", color: [2, 132, 199] },
  { categoria: "pendiente", titulo: "Registros pendientes de duración", color: [100, 116, 139] },
];

export async function generarInformeProfesorPDF(input: InformeProfesorInput) {
  const {
    nombre, tema, mes, anio, items, canceladas = [], reemplazos = [], abonos = [],
    bonos, bonosDetalle = [], descuentos = 0, descuentosDetalle = [], ajusteMin, total,
    estadoPago, califPromedio, califCount,
  } = input;
  const calificacionesDetalle = await calificacionesParaInforme(nombre, mes, anio);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const abonado = abonos.reduce((a, b) => a + Number(b.monto), 0);
  const saldo = Math.max(0, total - abonado);
  const estado = estadoPago ?? (abonado <= 0 ? "por_pagar" : saldo <= 0.009 ? "pagado" : "parcial");
  const estadoLabel = estado === "pagado" ? "Pagado" : estado === "parcial" ? "Abono parcial" : "Por pagar";
  const minActividad = items.filter((i) => i.minutos > 0).reduce((a, i) => a + i.minutos, 0);

  doc.setFillColor(15, 20, 49); doc.rect(0, 0, W, 100, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("ADN Empresarial", 40, 38);
  doc.setFontSize(14); doc.text(nombre, 40, 62);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(200, 195, 235);
  doc.text(`${tema ? `${tema} · ` : ""}Informe de ${MESES[mes - 1]} ${anio}`, 40, 80);

  const promedioActual = calificacionesDetalle.length
    ? calificacionesDetalle.reduce((a, c) => a + c.estrellas, 0) / calificacionesDetalle.length
    : (califCount ? califPromedio : 0);
  const cards: [string, string][] = [
    ["Total a pagar", `$${total.toFixed(2)}`], ["Tiempo total", formatHM(Math.max(0, minActividad + ajusteMin))],
    ["Calificación", calificacionesDetalle.length || califCount ? `${promedioActual.toFixed(2)} / 5` : "Sin calificar"], ["Estado", estadoLabel],
  ];
  const cw = (W - 80 - 30) / 4;
  cards.forEach(([label, value], i) => {
    const x = 40 + i * (cw + 10);
    doc.setDrawColor(225, 222, 240); doc.setFillColor(250, 248, 255); doc.roundedRect(x, 120, cw, 54, 6, 6, "FD");
    doc.setTextColor(120, 118, 145); doc.setFontSize(8); doc.text(label.toUpperCase(), x + 10, 138);
    doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(value, x + 10, 160, { maxWidth: cw - 20 });
    doc.setFont("helvetica", "normal");
  });

  let y = 192;
  for (const grupo of GRUPOS_INFORME) {
    const rows = items.filter((i) => categoriaInforme(i) === grupo.categoria);
    if (!rows.length) continue;
    const minutos = rows.reduce((a, i) => a + Math.max(0, i.minutos), 0);
    const monto = rows.reduce((a, i) => a + Math.max(0, i.monto), 0);
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold"); doc.text(grupo.titulo, 40, y + 16); doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 26,
      head: [["Fecha", "Día", "Horario", "Con / Referencia", "Tema tratado", "Duración", "Valor"]],
      body: rows.map((i) => [i.fecha, diaDe(i.fecha), `${(i.horaInicio || "").slice(0, 5)} - ${(i.horaFin || "").slice(0, 5)}`, i.detalle || "-", i.tema || "-", i.minutos > 0 ? formatHM(i.minutos) : "Pendiente", `$${i.monto.toFixed(2)}`]),
      foot: grupo.categoria === "pendiente" ? undefined : [["", "", "", "", "Subtotal", formatHM(minutos), `$${monto.toFixed(2)}`]],
      styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] }, headStyles: { fillColor: grupo.color, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 238, 250], textColor: [30, 28, 50], fontStyle: "bold" }, alternateRowStyles: { fillColor: [250, 249, 255] },
      columnStyles: { 6: { halign: "right" }, 5: { halign: "center" } }, margin: { left: 40, right: 40 },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) + 14;
  }

  if (calificacionesDetalle.length) {
    doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold");
    doc.text("Calificaciones y razones del mes", 40, y + 16);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: y + 26,
      head: [["Fecha", "Calificación", "Razón"]],
      body: calificacionesDetalle.map((c) => [c.fecha, `${c.estrellas.toFixed(1)} / 5`, c.razon]),
      foot: [["", "Promedio", `${promedioActual.toFixed(2)} / 5`]],
      styles: { fontSize: 8.5, cellPadding: 5, textColor: [40, 38, 60] },
      headStyles: { fillColor: [234, 179, 8], textColor: [30, 28, 50], fontStyle: "bold" },
      footStyles: { fillColor: [254, 249, 195], textColor: [30, 28, 50], fontStyle: "bold" },
      columnStyles: { 1: { halign: "center" } }, margin: { left: 40, right: 40 },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) + 14;
  }

  const conceptos = GRUPOS_INFORME.filter((g) => g.categoria !== "pendiente").map((g) => {
    const rows = items.filter((i) => categoriaInforme(i) === g.categoria && i.minutos > 0);
    if (!rows.length) return null;
    return [g.titulo, formatHM(rows.reduce((a, i) => a + i.minutos, 0)), `$${rows.reduce((a, i) => a + i.monto, 0).toFixed(2)}`];
  }).filter(Boolean) as string[][];
  if (ajusteMin) conceptos.push(["Ajuste manual de tiempo", `${ajusteMin > 0 ? "+" : "-"}${formatHM(Math.abs(ajusteMin))}`, "-"]);
  if (bonos > 0) conceptos.push(["Bonos", `${bonosDetalle.length || 1} registro(s)`, `+$${bonos.toFixed(2)}`]);
  if (descuentos > 0) conceptos.push(["Descuentos", `${descuentosDetalle.length || 1} registro(s)`, `-$${descuentos.toFixed(2)}`]);
  conceptos.push(["TOTAL A PAGAR", "", `$${total.toFixed(2)}`]);
  conceptos.push(["TOTAL ABONADO", `${abonos.length} pago(s)`, `$${abonado.toFixed(2)}`]);
  conceptos.push(["SALDO PENDIENTE", estadoLabel, `$${saldo.toFixed(2)}`]);

  doc.setFontSize(11); doc.setTextColor(30, 28, 50); doc.setFont("helvetica", "bold"); doc.text("Resumen económico", 40, y + 16); doc.setFont("helvetica", "normal");
  autoTable(doc, { startY: y + 26, head: [["Concepto", "Detalle", "Monto"]], body: conceptos, styles: { fontSize: 9, cellPadding: 5, textColor: [40, 38, 60] }, headStyles: { fillColor: [30, 28, 60], textColor: 255, fontStyle: "bold" }, columnStyles: { 2: { halign: "right" } }, margin: { left: 40, right: 40 } });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  const movimientos = [
    ...bonosDetalle.map((b) => ({ tipo: "Bono", motivo: b.motivo || "Bono", monto: Math.abs(b.monto) })),
    ...descuentosDetalle.map((d) => ({ tipo: "Descuento", motivo: d.motivo || "Descuento", monto: -Math.abs(d.monto) })),
  ];
  if (movimientos.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50); doc.text("Bonos y descuentos", 40, y + 28); doc.setFont("helvetica", "normal");
    autoTable(doc, { startY: y + 38, head: [["Concepto", "Motivo", "Valor"]], body: movimientos.map((m) => [m.tipo, m.motivo, `${m.monto >= 0 ? "+" : "-"}$${Math.abs(m.monto).toFixed(2)}`]), styles: { fontSize: 8.5, cellPadding: 4, textColor: [40, 38, 60] }, headStyles: { fillColor: [124, 107, 255], textColor: 255, fontStyle: "bold" }, columnStyles: { 2: { halign: "right" } }, margin: { left: 40, right: 40 } });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  }

  if (abonos.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50); doc.text("Pagos / abonos realizados", 40, y + 28); doc.setFont("helvetica", "normal");
    autoTable(doc, { startY: y + 38, head: [["Fecha", "Tipo", "Banco / Cuenta", "N. comprobante", "Observación", "Monto"]], body: abonos.map((a) => [a.fecha, a.tipo, a.banco || "-", a.numero || "-", a.observacion || "-", `$${a.monto.toFixed(2)}`]), foot: [["", "", "", "", "Total abonado", `$${abonado.toFixed(2)}`]], styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] }, headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" }, footStyles: { fillColor: [235, 247, 238], textColor: [30, 28, 50], fontStyle: "bold" }, columnStyles: { 5: { halign: "right" } }, margin: { left: 40, right: 40 } });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  }

  if (reemplazos.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50); doc.text("Reemplazos reportados (informativo)", 40, y + 28); doc.setFont("helvetica", "normal");
    autoTable(doc, { startY: y + 38, head: [["Fecha", "Clase / Sesión", "Reemplazo a", "Nota"]], body: reemplazos.map((r) => [r.fecha, r.detalle, r.profesor, r.nota || "-"]), styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] }, headStyles: { fillColor: [60, 143, 231], textColor: 255, fontStyle: "bold" }, margin: { left: 40, right: 40 } });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  }

  if (canceladas.length) {
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 28, 50); doc.text("Sesiones canceladas / no registradas (no cuentan horas)", 40, y + 28); doc.setFont("helvetica", "normal");
    autoTable(doc, { startY: y + 38, head: [["Fecha", "Tipo", "Con / Título", "Estado", "Razón", "Monto"]], body: canceladas.map((c) => [c.fecha, c.tipo, c.con, c.estado, c.razon || "-", "$0.00"]), styles: { fontSize: 8, cellPadding: 4, textColor: [40, 38, 60] }, headStyles: { fillColor: [200, 70, 70], textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [255, 248, 248] }, margin: { left: 40, right: 40 } });
  }

  doc.setFontSize(8); doc.setTextColor(140, 138, 160);
  doc.text(`Generado el ${new Date().toLocaleString("es-EC")} · ADN Empresarial`, 40, doc.internal.pageSize.getHeight() - 24);
  const safe = nombre.normalize("NFD").replace(/[^\w]+/g, "_");
  doc.save(`Informe_${safe}_${MESES[mes - 1]}_${anio}.pdf`);
}


export interface InformeAlumnaAbonoPDF {
  fecha: string;
  monto: number;
  tipo: string;
  bancoOrigen?: string | null;
  cuentaOrigen?: string | null;
  titularOrigen?: string | null;
  referencia?: string | null;
  numeroComprobante?: string | null;
  observacion?: string | null;
}

export interface InformeAlumnaPDFInput {
  mes: number;
  anio: number;
  totalAlumnas: number;
  seleccionadas: number;
  pagadas: number;
  pendientes: number;
  totalFacturado: number;
  totalAbonado: number;
  totalFalta: number;
  filas: Array<{
    nombre: string;
    email: string;
    total: number;
    pagado: number;
    falta: number;
    estado: string;
    cuentaCompleta: boolean;
    acompanantes: number;
    abonos: InformeAlumnaAbonoPDF[];
  }>;
}

export function generarInformeAlumnasPDF(input: InformeAlumnaPDFInput) {
  const { mes, anio, totalAlumnas, seleccionadas, pagadas, pendientes, totalFacturado, totalAbonado, totalFalta, filas } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  doc.setFillColor(15, 20, 49);
  doc.rect(0, 0, W, 105, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ADN Empresarial", 40, 38);
  doc.setFontSize(14);
  doc.text("Informe de pagos · Alumnas", 40, 61);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 195, 235);
  doc.text(`Periodo · ${MESES[mes - 1]} ${anio}`, 40, 82);

  const cards: [string, string][] = [
    ["Alumnas seleccionadas", String(seleccionadas)],
    ["Total facturado", `$${totalFacturado.toFixed(2)}`],
    ["Total abonado", `$${totalAbonado.toFixed(2)}`],
    ["Deuda pendiente", `$${totalFalta.toFixed(2)}`],
  ];
  const cw = (W - 80 - 30) / 4;
  cards.forEach(([label, value], i) => {
    const x = 40 + i * (cw + 10);
    doc.setDrawColor(225, 222, 240);
    doc.setFillColor(250, 248, 255);
    doc.roundedRect(x, 123, cw, 55, 6, 6, "FD");
    doc.setTextColor(120, 118, 145);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, 141);
    doc.setTextColor(30, 28, 50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(value, x + 10, 162);
  });

  let y = 199;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 28, 50);
  doc.setFontSize(11);
  doc.text(`Estado del periodo · ${pagadas} pagadas · ${pendientes} pendientes · ${totalAlumnas} cuentas con rol Alumno`, 40, y);
  y += 12;

  if (!filas.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No existen alumnas seleccionadas para este periodo.", 40, y + 24);
  } else {
    autoTable(doc, {
      startY: y + 15,
      head: [["Alumna", "Total", "Pagado", "Falta", "Estado", "Cuenta bancaria", "Acomp."]],
      body: filas.map((f) => [
        f.nombre,
        `$${f.total.toFixed(2)}`,
        `$${f.pagado.toFixed(2)}`,
        `$${f.falta.toFixed(2)}`,
        f.estado === "pagado" ? "Pagado" : "Debe",
        f.cuentaCompleta ? "Completa" : "Pendiente",
        String(f.acompanantes),
      ]),
      styles: { fontSize: 8, cellPadding: 5, textColor: [40, 38, 60] },
      headStyles: { fillColor: [124, 107, 255], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 255] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 6: { halign: "center" } },
      margin: { left: 40, right: 40 },
    });

    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60) + 24;

    for (const f of filas) {
      if (!f.abonos.length) continue;
      if (y > H - 150) { doc.addPage(); y = 45; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 28, 50);
      doc.text(`${f.nombre} · movimientos del periodo`, 40, y);
      y += 8;
      autoTable(doc, {
        startY: y + 10,
        head: [["Fecha", "Monto", "Método", "Banco origen", "Cuenta / titular", "Referencia", "Comprobante", "Observación"]],
        body: f.abonos.map((a) => [
          a.fecha,
          `${Number(a.monto).toFixed(2)}`,
          a.tipo || "-",
          a.bancoOrigen || "-",
          [a.cuentaOrigen, a.titularOrigen ? `Tit. ${a.titularOrigen}` : null].filter(Boolean).join(" · ") || "-",
          a.referencia || a.numeroComprobante || "-",
          a.numeroComprobante || "-",
          a.observacion || "-",
        ]),
        styles: { fontSize: 7, cellPadding: 3.5, textColor: [40, 38, 60] },
        headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 252, 249] },
        columnStyles: { 1: { halign: "right" } },
        margin: { left: 40, right: 40 },
      });
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 50) + 18;
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 138, 160);
  doc.text(`Generado el ${new Date().toLocaleString("es-EC")} · ADN Empresarial`, 40, H - 24);
  doc.save(`Informe_Alumnas_${MESES[mes - 1]}_${anio}.pdf`);
}
