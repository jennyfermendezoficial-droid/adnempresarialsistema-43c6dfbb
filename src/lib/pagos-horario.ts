const JORNADAS_LABORALES: Array<[number, number]> = [
  [7 * 60, 13 * 60],
  [14 * 60 + 30, 17 * 60 + 30],
];

function minutosDesdeHora(hora: string) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function horaDesdeMinutos(total: number) {
  const normalizado = ((Math.round(total) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalizado / 60);
  const m = normalizado % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type SegmentoHorario = {
  laboral: boolean;
  minutos: number;
  horaInicio: string;
  horaFin: string;
};

export function segmentarHorarioLaboral(horaInicio: string, duracionMin: number): SegmentoHorario[] {
  const duracion = Math.max(0, Math.round(Number(duracionMin) || 0));
  if (!duracion) return [];

  const inicio = minutosDesdeHora(horaInicio);
  const fin = inicio + duracion;
  const cortes = new Set<number>([inicio, fin]);

  for (const offset of [0, 24 * 60]) {
    for (const [desde, hasta] of JORNADAS_LABORALES) {
      const a = desde + offset;
      const b = hasta + offset;
      if (a > inicio && a < fin) cortes.add(a);
      if (b > inicio && b < fin) cortes.add(b);
    }
  }

  const puntos = Array.from(cortes).sort((a, b) => a - b);
  const segmentos: SegmentoHorario[] = [];
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const desde = puntos[i];
    const hasta = puntos[i + 1];
    if (hasta <= desde) continue;
    const medio = desde + (hasta - desde) / 2;
    const laboral = JORNADAS_LABORALES.some(([a, b]) => {
      for (const offset of [0, 24 * 60]) {
        if (medio >= a + offset && medio < b + offset) return true;
      }
      return false;
    });
    segmentos.push({
      laboral,
      minutos: hasta - desde,
      horaInicio: horaDesdeMinutos(desde),
      horaFin: horaDesdeMinutos(hasta),
    });
  }
  return segmentos;
}

export function dividirHorarioLaboral(horaInicio: string, duracionMin: number) {
  const segmentos = segmentarHorarioLaboral(horaInicio, duracionMin);
  const laboral = segmentos.filter((s) => s.laboral).reduce((a, s) => a + s.minutos, 0);
  const fuera = segmentos.filter((s) => !s.laboral).reduce((a, s) => a + s.minutos, 0);
  return { laboral, fuera };
}

function refTarifaInterna(profesorId: string, mes: number, anio: number, marcaHex: string) {
  const hex = profesorId.replace(/-/g, "").toLowerCase().padEnd(32, "0").slice(0, 32).split("");
  const periodo = `${anio.toString(16).padStart(4, "0")}${mes.toString(16).padStart(2, "0")}${marcaHex}`;
  for (let i = 0; i < periodo.length; i += 1) hex[24 + i] = periodo[i];
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// pagos_items_precio ya guarda valores por profesor/mes y no exige FK sobre
// referencia_id. Estas referencias deterministas reservan filas internas para
// tarifas mensuales adicionales sin crear tablas ni migraciones nuevas.
export function refTarifa1a1Fuera(profesorId: string, mes: number, anio: number) {
  return refTarifaInterna(profesorId, mes, anio, "fa");
}

export function refTarifaCoach(profesorId: string, mes: number, anio: number) {
  return refTarifaInterna(profesorId, mes, anio, "c0");
}
