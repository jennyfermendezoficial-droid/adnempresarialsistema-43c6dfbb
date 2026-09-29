// Cálculo de pagos de freelancers.
// Valor de cada trabajo = horas × tarifa acordada. El reparto laboral /
// fuera de horario (07:00–13:00 y 14:30–17:30, por minutos reales) es solo
// informativo y reutiliza el mismo cálculo que Profesores.
import { dividirHorarioLaboral } from "@/lib/pagos-horario";

export interface RegistroHorasFreelance {
  id: string;
  freelancer_id: string;
  fecha: string;
  hora_inicio: string;
  duracion_min: number;
  tarea: string;
  descripcion: string | null;
  observaciones: string | null;
  /** Tarifa vigente al registrar. null en registros anteriores a la tarifa acordada. */
  tarifa_hora: number | null;
}

export type TipoAjuste = "bonificacion" | "deduccion" | "multa" | "correccion" | "bono" | "descuento";

export interface AjusteFreelance {
  id: string;
  freelancer_id: string;
  tipo: TipoAjuste;
  monto: number;
  motivo: string;
}

export const AJUSTE_LABEL: Record<TipoAjuste, string> = {
  bonificacion: "Bonificación",
  deduccion: "Deducción",
  multa: "Multa",
  correccion: "Corrección de pago",
  bono: "Bonificación",
  descuento: "Deducción",
};

export interface TrabajoCalculado extends RegistroHorasFreelance {
  horaFin: string;
  tarifa: number;
  valor: number;
  minutosLaboral: number;
  minutosFuera: number;
}

export interface CalculoFreelance {
  trabajos: TrabajoCalculado[];
  minutos: number;
  minutosLaboral: number;
  minutosFuera: number;
  generado: number;
  ajustes: number;
  total: number;
}

export function red2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Efecto de un ajuste sobre el pago: suma o resta. */
export function efectoAjuste(a: Pick<AjusteFreelance, "tipo" | "monto">) {
  const m = Number(a.monto) || 0;
  if (a.tipo === "correccion") return m;
  if (a.tipo === "bonificacion" || a.tipo === "bono") return Math.abs(m);
  return -Math.abs(m);
}

/** Minutos desde medianoche de una hora "HH:MM" o "HH:MM:SS". */
export function minutosDelDia(hora: string) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

export function horaMas(hora: string, minutos: number) {
  const t = (((minutosDelDia(hora) + minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function calcularTrabajo(r: RegistroHorasFreelance, tarifaActual: number): TrabajoCalculado {
  const tarifa = r.tarifa_hora != null ? Number(r.tarifa_hora) : Number(tarifaActual) || 0;
  const minutos = Math.max(0, Number(r.duracion_min) || 0);
  const { laboral, fuera } = dividirHorarioLaboral(r.hora_inicio, minutos);
  return {
    ...r,
    horaFin: horaMas(r.hora_inicio, minutos),
    tarifa,
    valor: red2(tarifa * minutos / 60),
    minutosLaboral: laboral,
    minutosFuera: fuera,
  };
}

export function calcularFreelance(
  registros: RegistroHorasFreelance[],
  tarifaActual: number,
  ajustes: Array<Pick<AjusteFreelance, "tipo" | "monto">>,
): CalculoFreelance {
  const trabajos = registros
    .map((r) => calcularTrabajo(r, tarifaActual))
    .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio));
  const generado = red2(trabajos.reduce((s, t) => s + t.valor, 0));
  const totalAjustes = red2(ajustes.reduce((s, a) => s + efectoAjuste(a), 0));
  return {
    trabajos,
    minutos: trabajos.reduce((s, t) => s + t.duracion_min, 0),
    minutosLaboral: trabajos.reduce((s, t) => s + t.minutosLaboral, 0),
    minutosFuera: trabajos.reduce((s, t) => s + t.minutosFuera, 0),
    generado,
    ajustes: totalAjustes,
    total: Math.max(0, red2(generado + totalAjustes)),
  };
}

/** true si dos registros se cruzan en el tiempo. */
export function seCruzan(a: { fecha: string; hora_inicio: string; duracion_min: number }, b: { fecha: string; hora_inicio: string; duracion_min: number }) {
  const inicio = (r: typeof a) => new Date(`${r.fecha}T00:00:00`).getTime() + minutosDelDia(r.hora_inicio) * 60000;
  const ai = inicio(a), bi = inicio(b);
  const af = ai + a.duracion_min * 60000, bf = bi + b.duracion_min * 60000;
  return ai < bf && bi < af;
}

// ===================== FECHAS (calendario) =====================

export function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function desdeIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Lunes de la semana de la fecha. */
export function inicioSemana(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

export function sumarDias(d: Date, n: number) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** Rango que cubre la cuadrícula del mes completa (semanas de lunes a domingo). */
export function rangoCuadriculaMes(anio: number, mes: number) {
  const inicio = inicioSemana(new Date(anio, mes - 1, 1));
  const fin = sumarDias(inicioSemana(new Date(anio, mes, 0)), 6);
  return { inicio, fin };
}

/** Carpeta del freelancer en Storage: nombre legible + id corto (evita choques de nombres iguales). */
export function carpetaFreelancer(nombre: string, id: string) {
  const slug = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40) || "freelancer";
  return `${slug}-${id.replace(/-/g, "").slice(0, 8)}`;
}
