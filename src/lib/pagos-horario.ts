const JORNADAS_LABORALES: Array<[number, number]> = [
  [7 * 60, 13 * 60],
  [14 * 60 + 30, 17 * 60 + 30],
];

function minutosDesdeHora(hora: string) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function dividirHorarioLaboral(horaInicio: string, duracionMin: number) {
  const duracion = Math.max(0, Number(duracionMin) || 0);
  if (!duracion) return { laboral: 0, fuera: 0 };

  const inicio = minutosDesdeHora(horaInicio);
  const fin = inicio + duracion;
  let laboral = 0;

  for (const offset of [0, 24 * 60]) {
    for (const [desde, hasta] of JORNADAS_LABORALES) {
      laboral += Math.max(
        0,
        Math.min(fin, hasta + offset) - Math.max(inicio, desde + offset),
      );
    }
  }

  laboral = Math.min(duracion, laboral);
  return { laboral, fuera: Math.max(0, duracion - laboral) };
}

// pagos_items_precio ya guarda valores por profesor/mes y no exige FK sobre
// referencia_id. Esta referencia determinista reserva una fila interna para la
// tarifa por hora de 1 a 1 fuera de horario sin crear una tabla/migración nueva.
export function refTarifa1a1Fuera(profesorId: string, mes: number, anio: number) {
  const hex = profesorId.replace(/-/g, "").toLowerCase().padEnd(32, "0").slice(0, 32).split("");
  const periodo = `${anio.toString(16).padStart(4, "0")}${mes.toString(16).padStart(2, "0")}fa`;
  for (let i = 0; i < periodo.length; i += 1) hex[24 + i] = periodo[i];
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
