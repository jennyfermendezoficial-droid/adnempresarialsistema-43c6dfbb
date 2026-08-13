export const UMBRALES = [0, 5, 20, 65, 155, 515, 2015, 8015, 33015];

export function nivelDePuntos(puntos: number): number {
  let n = 1;
  UMBRALES.forEach((u, i) => { if (puntos >= u) n = i + 1; });
  return Math.min(n, 9);
}

export function progresoNivel(puntos: number) {
  const nivel = nivelDePuntos(puntos);
  const actual = UMBRALES[nivel - 1] ?? 0;
  const siguiente = UMBRALES[nivel] ?? null;
  const pct = siguiente === null ? 100 : Math.round(((puntos - actual) / (siguiente - actual)) * 100);
  return { nivel, actual, siguiente, pct: Math.max(0, Math.min(100, pct)), faltan: siguiente === null ? 0 : siguiente - puntos };
}
