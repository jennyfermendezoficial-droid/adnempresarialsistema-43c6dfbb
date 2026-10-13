import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularCobroMensual } from "./alumnas-saldo";

describe("Cobro mensual de alumnas", () => {
  it("descuenta abonos del curso y del mes sin contar dos veces el pago previo", () => {
    assert.deepEqual(calcularCobroMensual({ cuota: 200, valorCurso: 1000, pagadoInicial: 100, abonadoTotal: 25, abonadoMes: 25 }), { total: 200, falta: 175, saldoCurso: 875 });
  });
  it("reduce la última cuota al saldo restante", () => {
    assert.deepEqual(calcularCobroMensual({ cuota: 200, valorCurso: 1000, pagadoInicial: 950, abonadoTotal: 20, abonadoMes: 20 }), { total: 50, falta: 30, saldoCurso: 30 });
  });
  it("conserva el total de un mes registrado aunque se paguen otros meses", () => {
    assert.deepEqual(calcularCobroMensual({ totalManual: 200, cuota: 200, valorCurso: 1000, pagadoInicial: 950, abonadoTotal: 20, abonadoMes: 20 }), { total: 200, falta: 180, saldoCurso: 30 });
  });
  it("mantiene totales antiguos cuando no se configuró el curso", () => {
    assert.deepEqual(calcularCobroMensual({ totalManual: 80, abonadoMes: 30 }), { total: 80, falta: 50, saldoCurso: undefined });
  });
});