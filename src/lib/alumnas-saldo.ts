export function calcularCobroMensual({ totalManual, cuota, valorCurso, pagadoInicial, abonadoTotal, abonadoMes }: {
  totalManual?: number; cuota?: number; valorCurso?: number; pagadoInicial?: number; abonadoTotal?: number; abonadoMes: number;
}) {
  const centavos = (n: number) => Math.round(n * 100) / 100;
  const saldoCurso = valorCurso === undefined ? undefined : Math.max(0, centavos(valorCurso - (pagadoInicial ?? 0) - (abonadoTotal ?? 0)));
  const disponibleMes = saldoCurso === undefined ? undefined : centavos(saldoCurso + abonadoMes);
  const base = totalManual ?? cuota ?? 0;
  const total = Math.max(abonadoMes, disponibleMes === undefined ? base : Math.min(base, disponibleMes));
  const falta = Math.max(0, centavos(total - abonadoMes));
  return { total: centavos(total), falta, saldoCurso };
}