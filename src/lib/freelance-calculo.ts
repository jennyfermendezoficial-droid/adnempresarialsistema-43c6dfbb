// Cálculo de pagos de freelancers. Reutiliza el mismo reparto por minutos
// reales que Profesores (07:00–13:00 y 14:30–17:30).
import { segmentarHorarioLaboral } from "@/lib/pagos-horario";

export interface RegistroHorasFreelance {
  id: string;
  freelancer_id: string;
  fecha: string;
  hora_inicio: string;
  duracion_min: number;
  tarea: string;
}

export interface TarifaFreelance {
  laboral: number;
  fuera: number;
}

export interface SegmentoFreelance {
  registroId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  tarea: string;
  laboral: boolean;
  minutos: number;
  monto: number;
}

export interface CalculoFreelance {
  segmentos: SegmentoFreelance[];
  minutosLaboral: number;
  minutosFuera: number;
  montoLaboral: number;
  montoFuera: number;
  bonos: number;
  descuentos: number;
  total: number;
}

export function red2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Tarifa efectiva: si la de fuera de horario no está definida se usa la laboral. */
export function tarifaEfectiva(laboral: number | null | undefined, fuera: number | null | undefined): TarifaFreelance {
  const lab = Number(laboral ?? 0) || 0;
  const fue = fuera == null ? lab : Number(fuera) || 0;
  return { laboral: lab, fuera: fue };
}

export function calcularFreelance(
  registros: RegistroHorasFreelance[],
  tarifa: TarifaFreelance,
  bonos: number,
  descuentos: number,
): CalculoFreelance {
  const segmentos: SegmentoFreelance[] = [];
  registros.forEach((r) => {
    segmentarHorarioLaboral(r.hora_inicio, r.duracion_min).forEach((s) => {
      segmentos.push({
        registroId: r.id,
        fecha: r.fecha,
        horaInicio: s.horaInicio,
        horaFin: s.horaFin,
        tarea: r.tarea,
        laboral: s.laboral,
        minutos: s.minutos,
        monto: red2((s.laboral ? tarifa.laboral : tarifa.fuera) * s.minutos / 60),
      });
    });
  });
  segmentos.sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));

  const lab = segmentos.filter((s) => s.laboral);
  const fue = segmentos.filter((s) => !s.laboral);
  const montoLaboral = red2(lab.reduce((a, s) => a + s.monto, 0));
  const montoFuera = red2(fue.reduce((a, s) => a + s.monto, 0));
  return {
    segmentos,
    minutosLaboral: lab.reduce((a, s) => a + s.minutos, 0),
    minutosFuera: fue.reduce((a, s) => a + s.minutos, 0),
    montoLaboral,
    montoFuera,
    bonos: red2(bonos),
    descuentos: red2(descuentos),
    total: Math.max(0, red2(montoLaboral + montoFuera + bonos - descuentos)),
  };
}

/** Minutos desde medianoche de una hora "HH:MM" o "HH:MM:SS". */
export function minutosDelDia(hora: string) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/** true si dos registros del mismo día o días contiguos se cruzan en el tiempo. */
export function seCruzan(a: { fecha: string; hora_inicio: string; duracion_min: number }, b: { fecha: string; hora_inicio: string; duracion_min: number }) {
  const inicio = (r: typeof a) => new Date(`${r.fecha}T00:00:00`).getTime() + minutosDelDia(r.hora_inicio) * 60000;
  const ai = inicio(a), bi = inicio(b);
  const af = ai + a.duracion_min * 60000, bf = bi + b.duracion_min * 60000;
  return ai < bf && bi < af;
}
