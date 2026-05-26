// Generación de PDF profesional de reportes mensuales (Mi casa / Mi negocio / Mi agenda)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface MovRow { id: string; ambito: string; tipo: string; categoria: string | null; monto: number; descripcion: string | null; fecha: string }
export interface ActRow { id: string; titulo: string; descripcion: string | null; fecha: string; hora_inicio: string; duracion_min: number; ubicacion: string | null }

export interface ReportInput {
  anio: number;
  mes: number; // 0–11
  nombreUsuario: string;
  nombreNegocio?: string | null;
  fotoNegocioUrl?: string | null;
  avatarUrl?: string | null;
  movimientos: MovRow[];
  actividades: ActRow[];
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const COLORS = {
  violet: [124, 107, 255] as [number, number, number],
  violetDark: [86, 70, 200] as [number, number, number],
  gold: [220, 180, 80] as [number, number, number],
  green: [122, 139, 111] as [number, number, number],
  red: [194, 117, 107] as [number, number, number],
  ink: [30, 28, 50] as [number, number, number],
  muted: [120, 118, 145] as [number, number, number],
  cream: [250, 247, 240] as [number, number, number],
};

async function loadImageAsDataURL(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
    const dims: { w: number; h: number } = await new Promise((r) => { const im = new Image(); im.onload = () => r({ w: im.width, h: im.height }); im.onerror = () => r({ w: 0, h: 0 }); im.src = dataUrl; });
    return { dataUrl, ...dims };
  } catch { return null; }
}

function money(n: number) { return `$${n.toFixed(2)}`; }
function sum(arr: MovRow[], f: (m: MovRow) => boolean) { return arr.filter(f).reduce((s, m) => s + Number(m.monto), 0); }

export async function generarReporteMensualPDF(input: ReportInput): Promise<Blob> {
  const { anio, mes, nombreUsuario, nombreNegocio, fotoNegocioUrl, movimientos, actividades } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  // ---------- PORTADA ----------
  // Fondo violeta degradado simulado
  doc.setFillColor(...COLORS.violetDark);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...COLORS.violet);
  doc.rect(0, 0, W, H * 0.55, "F");

  // Acento dorado
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, H * 0.55 - 4, W, 4, "F");

  // Marca
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("ADN EMPRESARIAL · MI AGENDA EMPRENDEDORA", M, 60);

  doc.setFontSize(34);
  doc.text("Reporte mensual", M, H * 0.35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(20);
  doc.text(`${MESES[mes]} ${anio}`, M, H * 0.35 + 28);

  // Foto del negocio (si existe)
  if (fotoNegocioUrl) {
    const img = await loadImageAsDataURL(fotoNegocioUrl);
    if (img?.dataUrl) {
      const boxW = 220, boxH = 220;
      const x = W - M - boxW, y = H * 0.6;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x - 6, y - 6, boxW + 12, boxH + 12, 12, 12, "F");
      try { doc.addImage(img.dataUrl, "JPEG", x, y, boxW, boxH, undefined, "FAST"); }
      catch { try { doc.addImage(img.dataUrl, "PNG", x, y, boxW, boxH, undefined, "FAST"); } catch { /* noop */ } }
    }
  }

  // Bloque de identidad
  doc.setFillColor(...COLORS.cream);
  doc.roundedRect(M, H * 0.62, W * 0.45, 130, 12, 12, "F");
  doc.setTextColor(...COLORS.ink);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("EMPRENDEDORA", M + 18, H * 0.62 + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.text(nombreUsuario || "—", M + 18, H * 0.62 + 46);
  if (nombreNegocio) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("NEGOCIO", M + 18, H * 0.62 + 76);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text(nombreNegocio, M + 18, H * 0.62 + 96);
  }

  // Footer portada
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(`Generado el ${new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}`, M, H - 30);
  doc.text("adnempresarialsistema.lovable.app", W - M - 200, H - 30, { align: "left" });

  // ---------- PÁGINA 2: RESUMEN EJECUTIVO ----------
  doc.addPage();
  drawHeader(doc, W, M, anio, mes, "Resumen ejecutivo");

  const negIng = sum(movimientos, m => m.ambito === "negocio" && m.tipo === "ingreso");
  const negGas = sum(movimientos, m => m.ambito === "negocio" && m.tipo === "gasto");
  const casaIng = sum(movimientos, m => m.ambito === "casa" && m.tipo === "ingreso");
  const casaGas = sum(movimientos, m => m.ambito === "casa" && m.tipo === "gasto");
  const horas = actividades.reduce((s, a) => s + a.duracion_min, 0) / 60;

  let y = 130;
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    `Resumen del mes de ${MESES[mes]} de ${anio} para ${nombreUsuario}.` +
    ` Este documento contiene el detalle profesional de los movimientos del hogar, del negocio y la dedicación de tiempo.`,
    M, y, { maxWidth: W - M * 2 }
  );
  y += 50;

  // KPI cards
  drawKpi(doc, M, y, (W - M * 2 - 30) / 4, "Utilidad negocio", money(negIng - negGas), COLORS.violet);
  drawKpi(doc, M + ((W - M * 2 - 30) / 4 + 10), y, (W - M * 2 - 30) / 4, "Balance casa", money(casaIng - casaGas), COLORS.green);
  drawKpi(doc, M + ((W - M * 2 - 30) / 4 + 10) * 2, y, (W - M * 2 - 30) / 4, "Total ingresos", money(negIng + casaIng), COLORS.gold);
  drawKpi(doc, M + ((W - M * 2 - 30) / 4 + 10) * 3, y, (W - M * 2 - 30) / 4, "Horas invertidas", `${horas.toFixed(1)} h`, COLORS.violetDark);

  y += 110;

  // Tabla resumen
  autoTable(doc, {
    startY: y,
    head: [["Categoría", "Ingresos", "Gastos", "Balance"]],
    body: [
      ["Mi negocio", money(negIng), money(negGas), money(negIng - negGas)],
      ["Mi casa", money(casaIng), money(casaGas), money(casaIng - casaGas)],
      ["TOTAL", money(negIng + casaIng), money(negGas + casaGas), money(negIng + casaIng - negGas - casaGas)],
    ],
    headStyles: { fillColor: COLORS.violet, textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 10, cellPadding: 8 },
    alternateRowStyles: { fillColor: [248, 246, 252] as never },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.row.index === 2) { data.cell.styles.fillColor = COLORS.cream as never; data.cell.styles.fontStyle = "bold"; }
    },
    margin: { left: M, right: M },
  });

  // ---------- PÁGINA: MI CASA ----------
  const casaMovs = movimientos.filter(m => m.ambito === "casa");
  doc.addPage();
  drawHeader(doc, W, M, anio, mes, "Mi casa");
  drawSectionDescription(doc, M, 130, W,
    `Reporte completo de movimientos del hogar durante ${MESES[mes]} ${anio}. Aquí se incluyen todos los ingresos familiares (sueldos, aportes, otros) y los gastos del hogar (comida, servicios, transporte, educación, salud, entretenimiento). El balance es la diferencia entre lo que entra y lo que sale.`
  );
  drawTotals(doc, M, 200, W, casaIng, casaGas);
  autoTable(doc, {
    startY: 290,
    head: [["Fecha", "Tipo", "Categoría", "Descripción", "Monto"]],
    body: casaMovs.length
      ? casaMovs.map(m => [
          new Date(m.fecha).toLocaleDateString("es-EC"),
          m.tipo === "ingreso" ? "Ingreso" : "Gasto",
          m.categoria || "—",
          m.descripcion || "—",
          (m.tipo === "ingreso" ? "+" : "−") + money(Number(m.monto)),
        ])
      : [["—", "—", "—", "Sin movimientos en este mes", "—"]],
    headStyles: { fillColor: COLORS.green, textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [248, 250, 246] as never },
    columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
  });

  // ---------- PÁGINA: MI NEGOCIO ----------
  const negMovs = movimientos.filter(m => m.ambito === "negocio");
  doc.addPage();
  drawHeader(doc, W, M, anio, mes, "Mi negocio");
  drawSectionDescription(doc, M, 130, W,
    `Reporte detallado de ${nombreNegocio || "tu negocio"} durante ${MESES[mes]} ${anio}. Incluye todos los ingresos por ventas/servicios y los gastos operativos (insumos, sueldos, alquiler, marketing, impuestos). La utilidad es lo que realmente queda después de pagar todo.`
  );
  drawTotals(doc, M, 200, W, negIng, negGas, "Utilidad");
  autoTable(doc, {
    startY: 290,
    head: [["Fecha", "Tipo", "Categoría", "Descripción", "Monto"]],
    body: negMovs.length
      ? negMovs.map(m => [
          new Date(m.fecha).toLocaleDateString("es-EC"),
          m.tipo === "ingreso" ? "Ingreso" : "Gasto",
          m.categoria || "—",
          m.descripcion || "—",
          (m.tipo === "ingreso" ? "+" : "−") + money(Number(m.monto)),
        ])
      : [["—", "—", "—", "Sin movimientos en este mes", "—"]],
    headStyles: { fillColor: COLORS.violet, textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [248, 246, 252] as never },
    columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
  });

  // ---------- PÁGINA: MI TIEMPO ----------
  doc.addPage();
  drawHeader(doc, W, M, anio, mes, "Mi tiempo · Agenda");
  drawSectionDescription(doc, M, 130, W,
    `Registro de ${actividades.length} actividades agendadas durante ${MESES[mes]} ${anio}, sumando ${horas.toFixed(1)} horas de dedicación. Esto te ayuda a ver dónde estás invirtiendo tu tiempo y a tomar mejores decisiones para tu negocio y tu vida.`
  );

  autoTable(doc, {
    startY: 220,
    head: [["Fecha", "Hora", "Duración", "Actividad", "Ubicación"]],
    body: actividades.length
      ? actividades.map(a => [
          new Date(a.fecha).toLocaleDateString("es-EC"),
          a.hora_inicio.slice(0, 5),
          `${a.duracion_min} min`,
          a.titulo + (a.descripcion ? ` · ${a.descripcion}` : ""),
          a.ubicacion || "—",
        ])
      : [["—", "—", "—", "Sin actividades en este mes", "—"]],
    headStyles: { fillColor: COLORS.violetDark, textColor: 255 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [248, 246, 252] as never },
    margin: { left: M, right: M },
  });

  // Pie de cada página
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(`ADN Empresarial · ${nombreUsuario} · Página ${i} de ${pages}`, M, H - 20);
  }

  return doc.output("blob");
}

function drawHeader(doc: jsPDF, W: number, M: number, anio: number, mes: number, titulo: string) {
  doc.setFillColor(...COLORS.violet);
  doc.rect(0, 0, W, 70, "F");
  doc.setFillColor(...COLORS.gold);
  doc.rect(0, 70, W, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ADN EMPRESARIAL · REPORTE MENSUAL", M, 28);
  doc.setFontSize(20);
  doc.text(titulo, M, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${MESES[mes]} ${anio}`, W - M, 55, { align: "right" });
}

function drawSectionDescription(doc: jsPDF, M: number, y: number, W: number, txt: string) {
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text(txt, M, y, { maxWidth: W - M * 2, lineHeightFactor: 1.4 });
  doc.setFont("helvetica", "normal");
}

function drawTotals(doc: jsPDF, M: number, y: number, W: number, ing: number, gas: number, etiqueta = "Balance") {
  const cardW = (W - M * 2 - 20) / 3;
  drawKpi(doc, M, y, cardW, "Ingresos", money(ing), COLORS.green);
  drawKpi(doc, M + cardW + 10, y, cardW, "Gastos", money(gas), COLORS.red);
  drawKpi(doc, M + (cardW + 10) * 2, y, cardW, etiqueta, money(ing - gas), COLORS.violet);
}

function drawKpi(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, color: [number, number, number]) {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, 70, 8, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(label.toUpperCase(), x + 12, y + 22);
  doc.setFontSize(18);
  doc.text(value, x + 12, y + 50);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}