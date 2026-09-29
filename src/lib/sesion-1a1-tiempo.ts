const ECUADOR_TIME_ZONE = "America/Guayaquil";
const MINUTO_MS = 60_000;
const DIA_MS = 86_400_000;
const DURACION_PROGRAMADA_MIN = 60;

const ecuadorFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ECUADOR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partesEcuador(fecha: Date) {
  const partes = Object.fromEntries(
    ecuadorFormatter
      .formatToParts(fecha)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );

  return {
    year: partes.year,
    month: partes.month,
    day: partes.day,
    hour: partes.hour,
    minute: partes.minute,
    second: partes.second,
  };
}

function ordinalFechaHora(fecha: string, hora: string) {
  const [year, month, day] = fecha.split("-").map(Number);
  const [hour, minute, second = 0] = hora.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function ordinalAhoraEcuador(ahora = new Date()) {
  const p = partesEcuador(ahora);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function minutosHora(hora: string) {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function fechaHoyEcuador(ahora = new Date()) {
  const p = partesEcuador(ahora);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function sesion1a1Terminada(
  fecha: string,
  horaInicio: string,
  horaFin?: string | null,
  ahora = new Date(),
) {
  const inicio = ordinalFechaHora(fecha, horaInicio);
  let fin = horaFin
    ? ordinalFechaHora(fecha, horaFin)
    : inicio + DURACION_PROGRAMADA_MIN * MINUTO_MS;

  if (horaFin && fin < inicio) fin += DIA_MS;
  return fin <= ordinalAhoraEcuador(ahora);
}

export function horaFinProgramada1a1(horaInicio: string, horaFin?: string | null) {
  if (horaFin) return horaFin.slice(0, 5);
  const total = (minutosHora(horaInicio) + DURACION_PROGRAMADA_MIN) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function slot1a1Pasado(fecha: string, hora: string, ahora = new Date()) {
  return ordinalFechaHora(fecha, hora) <= ordinalAhoraEcuador(ahora);
}

export function tieneUnDiaAnticipacion(fecha: string, ahora = new Date()) {
  const hoy = fechaHoyEcuador(ahora);
  return ordinalFechaHora(fecha, "00:00:00") >= ordinalFechaHora(hoy, "00:00:00") + DIA_MS;
}

export function horarios1a1SeSolapan(horaA: string, horaB: string) {
  const inicioA = minutosHora(horaA);
  const inicioB = minutosHora(horaB);
  const finA = inicioA + DURACION_PROGRAMADA_MIN;
  const finB = inicioB + DURACION_PROGRAMADA_MIN;
  return inicioA < finB && inicioB < finA;
}
