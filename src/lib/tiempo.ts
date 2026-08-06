// Formato de duraciones al minuto exacto.
export function formatHM(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m === 0) return "0 min";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}

export function horasDecimal(minutos: number): number {
  return Math.round((minutos / 60) * 10000) / 10000;
}

export function minutosEntre(horaInicio?: string | null, horaFin?: string | null): number {
  if (!horaInicio || !horaFin) return 0;
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);
  const d = (hf * 60 + mf) - (hi * 60 + mi);
  return d > 0 ? d : 0;
}