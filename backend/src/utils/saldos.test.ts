import { describe, it, expect } from "vitest";
import {
  calcularSaldo,
  calcularMora,
  saldosPorUnidadDesde,
  periodoKey,
  fmtMonto,
  parseMonto,
} from "./saldos.js";

describe("calcularSaldo", () => {
  it("deuda: cargos mayores que pagos", () => {
    expect(calcularSaldo(3080, 3010)).toBe(70);
  });
  it("al día: cargos igual a pagos", () => {
    expect(calcularSaldo(1000, 1000)).toBe(0);
  });
  it("crédito: pagos mayores que cargos (negativo)", () => {
    expect(calcularSaldo(0, 17791.01)).toBe(-17791.01);
  });
  it("redondea a 2 decimales", () => {
    expect(calcularSaldo(100.005, 0)).toBe(100.01);
  });
});

describe("calcularMora", () => {
  it("deuda positiva => mora igual al saldo", () => {
    expect(calcularMora(140)).toBe(140);
  });
  it("crédito (saldo negativo) => mora 0", () => {
    expect(calcularMora(-500)).toBe(0);
  });
  it("saldo cero => mora 0", () => {
    expect(calcularMora(0)).toBe(0);
  });
});

describe("saldosPorUnidadDesde", () => {
  it("agrega varios cargos y pagos por unidad", () => {
    const cargos = [
      { id_unidad: "A", monto: 70 },
      { id_unidad: "A", monto: 70 },
      { id_unidad: "B", monto: 100 },
    ];
    const pagos = [
      { id_unidad: "A", monto: 70 },
      { id_unidad: "B", monto: 40 },
    ];
    const m = saldosPorUnidadDesde(cargos, pagos);
    expect(m.get("A")).toBe(70); // 140 - 70
    expect(m.get("B")).toBe(60); // 100 - 40
  });
  it("unidad con pagos y sin cargos => crédito negativo (caso X01)", () => {
    const m = saldosPorUnidadDesde([], [{ id_unidad: "X01", monto: 17791.01 }]);
    expect(m.get("X01")).toBe(-17791.01);
  });
  it("no arrastra error de punto flotante", () => {
    const m = saldosPorUnidadDesde(
      [{ id_unidad: "A", monto: 0.1 }, { id_unidad: "A", monto: 0.2 }],
      []
    );
    expect(m.get("A")).toBe(0.3);
  });
});

describe("periodoKey (bug String(Date) => 'Tue Jun')", () => {
  it("devuelve YYYY-MM en UTC, no el toString del Date", () => {
    expect(periodoKey(new Date(Date.UTC(2026, 5, 1)))).toBe("2026-06");
  });
  it("mantiene orden lexicográfico correcto", () => {
    expect(periodoKey(new Date(Date.UTC(2026, 5, 1)))
      < periodoKey(new Date(Date.UTC(2026, 6, 1)))).toBe(true);
  });
});

describe("fmtMonto (moneda sin símbolo)", () => {
  it("agrega separador de miles y 2 decimales", () => {
    expect(fmtMonto(2800)).toBe("2,800.00");
    expect(fmtMonto(70)).toBe("70.00");
    expect(fmtMonto(10458.24)).toBe("10,458.24");
  });
  it("no lleva símbolo de moneda", () => {
    expect(fmtMonto(50)).not.toContain("$");
  });
});

describe("parseMonto (bug coma de miles en la migración)", () => {
  it("parsea '$1,040.00' como 1040, no como 1", () => {
    expect(parseMonto("$1,040.00")).toBe(1040);
    expect(parseMonto("1,590.00")).toBe(1590);
    expect(parseMonto("1,080.00")).toBe(1080);
  });
  it("parsea valores simples y vacíos", () => {
    expect(parseMonto("70.00")).toBe(70);
    expect(parseMonto("")).toBe(0);
    expect(parseMonto(null)).toBe(0);
    expect(parseMonto(250)).toBe(250);
  });
});
