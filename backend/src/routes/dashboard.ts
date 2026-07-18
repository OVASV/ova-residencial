import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { getSaldosPorUnidad } from "../utils/creditos.js";
import { saldosPorUnidadDesde } from "../utils/saldos.js";

const router = Router();

const r2 = (n: number) => Math.round(n * 100) / 100;

function periodoToDate(periodo: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return new Date(Date.UTC(Number(m[1]), mes - 1, 1));
}

// GET /dashboard/resumen?periodo=YYYY-MM  (por defecto el mes actual)
// KPIs del mes + distribución + pagos recientes + estado por unidad (sección 7.1).
router.get("/resumen", async (req, res) => {
  const periodoParam = (req.query.periodo as string) || new Date().toISOString().slice(0, 7);
  const periodoMes = periodoToDate(periodoParam);
  if (!periodoMes) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });

  const sigMes = new Date(Date.UTC(periodoMes.getUTCFullYear(), periodoMes.getUTCMonth() + 1, 1));
  const inicioAnio = new Date(Date.UTC(periodoMes.getUTCFullYear(), 0, 1));
  const complejoFiltro = req.complejoId ? { id_complejo: req.complejoId } : {};

  const anioStr = String(periodoMes.getUTCFullYear());
  const [cargosMes, cargosPrev, pagosMes, cargosAcum, pagosAcum, gastosMesAgg, gastosAnioAgg, presMesAgg, presAnioAgg, pagosRecientes, unidades] = await Promise.all([
    prisma.cargos.findMany({
      where: { ...complejoFiltro, periodo_mes: periodoMes, estado: { not: "anulado" } },
    }),
    prisma.cargos.findMany({
      where: { ...complejoFiltro, periodo_mes: { lt: periodoMes }, estado: { not: "anulado" } },
    }),
    prisma.pagos.findMany({
      where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { gte: periodoMes, lt: sigMes } },
      select: { monto_total: true },
    }),
    prisma.cargos.aggregate({
      where: { ...complejoFiltro, periodo_mes: { lte: periodoMes }, estado: { not: "anulado" } },
      _sum: { monto: true },
    }),
    prisma.pagos.aggregate({
      where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { lt: sigMes } },
      _sum: { monto_total: true },
    }),
    prisma.gastos.aggregate({
      where: { ...complejoFiltro, fecha: { gte: periodoMes, lt: sigMes } },
      _sum: { monto: true },
    }),
    prisma.gastos.aggregate({
      where: { ...complejoFiltro, fecha: { gte: inicioAnio, lt: sigMes } },
      _sum: { monto: true },
    }),
    prisma.presupuestos.aggregate({
      where: { ...complejoFiltro, periodo: periodoParam },
      _sum: { monto: true },
    }),
    prisma.presupuestos.aggregate({
      where: { ...complejoFiltro, periodo: { gte: `${anioStr}-01`, lte: periodoParam } },
      _sum: { monto: true },
    }),
    prisma.pagos.findMany({
      where: { ...complejoFiltro, estado: { not: "anulado" } },
      orderBy: { fecha_pago: "desc" },
      take: 4,
      include: {
        pago_cargos: { include: { cargos: { select: { concepto: true } } } },
        unidades: {
          select: {
            numero_propiedad: true,
            historial_propietarios: {
              where: { fecha_fin: null },
              include: { propietarios: { select: { nombre: true, apellido: true } } },
            },
            historial_estado_unidad: {
              where: { fecha_fin: null },
              include: { estados_unidad: { select: { nombre: true } } },
            },
          },
        },
      },
    }),
    prisma.unidades.findMany({
      where: { ...complejoFiltro, activo: true },
      include: {
        calles: { select: { nombre: true } },
        historial_propietarios: {
          where: { fecha_fin: null },
          include: { propietarios: { select: { nombre: true, apellido: true } } },
        },
      },
    }),
  ]);

  // KPIs
  const esperadoMes = r2(cargosMes.reduce((s, c) => s + c.monto.toNumber(), 0));
  const cobradoMes = r2(pagosMes.reduce((s, p) => s + p.monto_total.toNumber(), 0));
  const esperadoAcum = r2(cargosAcum._sum.monto?.toNumber() ?? 0);
  const cobradoAcum = r2(pagosAcum._sum.monto_total?.toNumber() ?? 0);
  const pendienteMes = r2(Math.max(0, esperadoMes - cobradoMes));
  const pendienteAcum = r2(Math.max(0, esperadoAcum - cobradoAcum));
  const gastosMes = r2(gastosMesAgg._sum.monto?.toNumber() ?? 0);
  const gastosAnio = r2(gastosAnioAgg._sum.monto?.toNumber() ?? 0);
  const presupuestoMes = r2(presMesAgg._sum.monto?.toNumber() ?? 0);
  const presupuestoAnio = r2(presAnioAgg._sum.monto?.toNumber() ?? 0);

  // Saldo real-time: total cargos - total pagos (global, no depende de cargos.saldo)
  const saldosRT = req.complejoId ? await getSaldosPorUnidad(req.complejoId) : new Map<string, number>();
  // Atrasado = deuda de meses anteriores al periodo consultado
  const cargosPrevMonto = new Map<string, number>();
  for (const c of cargosPrev) {
    cargosPrevMonto.set(c.id_unidad, (cargosPrevMonto.get(c.id_unidad) ?? 0) + c.monto.toNumber());
  }
  // Distribución del mes para el donut: cobrado vs pendiente del mes (solo el mes)
  const totalDist = cobradoMes + pendienteMes;
  const pct = (n: number) => (totalDist > 0 ? Math.round((n / totalDist) * 100) : 0);

  // Estado por unidad — basado en saldo real-time
  const montoMes = new Map<string, number>();
  for (const c of cargosMes) {
    montoMes.set(c.id_unidad, (montoMes.get(c.id_unidad) ?? 0) + c.monto.toNumber());
  }

  const estadoPorUnidad = unidades.map((u) => {
    const monto = montoMes.get(u.id) ?? 0;
    const saldoTotal = saldosRT.get(u.id) ?? 0;
    const deudaPrev = cargosPrevMonto.get(u.id) ?? 0;
    const prop = u.historial_propietarios[0]?.propietarios;
    let estado: "pagado" | "pendiente" | "atrasado" | "sin_cargos" | "a_favor";
    if (saldoTotal < 0) estado = "a_favor";
    else if (deudaPrev > 0 && saldoTotal > 0) estado = "atrasado";
    else if (monto > 0 && saldoTotal <= 0) estado = "pagado";
    else if (saldoTotal > 0) estado = "pendiente";
    else if (monto > 0) estado = "pagado";
    else estado = "sin_cargos";
    return {
      id: u.id,
      numero_propiedad: u.numero_propiedad,
      bloque: u.bloque,
      calle: u.calles?.nombre ?? null,
      propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
      saldo: saldoTotal,
      estado,
    };
  });

  res.json({
    periodo: periodoParam,
    kpis: {
      cobrado_mes: cobradoMes,
      esperado_mes: esperadoMes,
      cobrado_acum: cobradoAcum,
      esperado_acum: esperadoAcum,
      pendiente_mes: pendienteMes,
      pendiente_acum: pendienteAcum,
      gastos_mes: gastosMes,
      gastos_anio: gastosAnio,
      presupuesto_mes: presupuestoMes,
      presupuesto_anio: presupuestoAnio,
    },
    distribucion: {
      pagado: pct(cobradoMes),
      pendiente: pct(pendienteMes),
    },
    pagos_recientes: pagosRecientes.map((p) => {
      const u = p.unidades;
      const prop = u?.historial_propietarios[0]?.propietarios;
      const cat = u?.historial_estado_unidad[0]?.estados_unidad;
      return {
        id: p.id,
        id_unidad: p.id_unidad,
        numero_propiedad: u?.numero_propiedad ?? null,
        propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
        categoria: cat?.nombre ?? null,
        fecha_pago: p.fecha_pago,
        monto_total: p.monto_total,
        metodo: p.metodo,
        conceptos: [...new Set(p.pago_cargos.map((pc) => pc.cargos.concepto))].join(", "),
      };
    }),
    estado_por_unidad: estadoPorUnidad,
  });
});

// GET /dashboard/segmentacion-deuda
router.get("/segmentacion-deuda", async (req, res) => {
  if (!req.complejoId) {
    return res.json({ rangos: [], propiedades: [] });
  }

  // Saldos al fin del mes seleccionado (o actuales si no se pasa período).
  const anclaSeg = req.query.periodo ? periodoToDate(req.query.periodo as string) : null;
  let saldoNeto: Map<string, number>;
  if (anclaSeg) {
    const finAncla = new Date(Date.UTC(anclaSeg.getUTCFullYear(), anclaSeg.getUTCMonth() + 1, 1));
    const [cargos, pagos] = await Promise.all([
      prisma.cargos.findMany({ where: { id_complejo: req.complejoId, estado: { not: "anulado" }, periodo_mes: { lt: finAncla } }, select: { id_unidad: true, monto: true } }),
      prisma.pagos.findMany({ where: { id_complejo: req.complejoId, estado: { not: "anulado" }, fecha_pago: { lt: finAncla } }, select: { id_unidad: true, monto_total: true } }),
    ]);
    saldoNeto = saldosPorUnidadDesde(
      cargos.map((c) => ({ id_unidad: c.id_unidad, monto: c.monto.toNumber() })),
      pagos.map((p) => ({ id_unidad: p.id_unidad, monto: p.monto_total.toNumber() }))
    );
  } else {
    saldoNeto = await getSaldosPorUnidad(req.complejoId);
  }

  // Filtrar solo unidades con saldo != 0
  const entries = [...saldoNeto.entries()].filter(([, s]) => Math.abs(s) > 0.001);
  const saldoMap = new Map(entries);
  const idsRelevantes = [...saldoMap.keys()];

  type Rango = "mayor_1000" | "500_1000" | "100_500" | "menor_100" | "a_favor";
  function clasificar(saldo: number): Rango {
    if (saldo < 0) return "a_favor";
    if (saldo >= 1000) return "mayor_1000";
    if (saldo >= 500) return "500_1000";
    if (saldo >= 100) return "100_500";
    return "menor_100";
  }

  const emptyRangos = [
    { key: "mayor_1000", label: "Más de $1,000", min: 1000, max: null, total: 0, cantidad: 0 },
    { key: "500_1000", label: "$500 – $1,000", min: 500, max: 1000, total: 0, cantidad: 0 },
    { key: "100_500", label: "$100 – $500", min: 100, max: 500, total: 0, cantidad: 0 },
    { key: "menor_100", label: "Menos de $100", min: 0, max: 100, total: 0, cantidad: 0 },
    { key: "a_favor", label: "Saldo a favor", min: null, max: 0, total: 0, cantidad: 0 },
  ];

  if (idsRelevantes.length === 0) {
    return res.json({ rangos: emptyRangos, propiedades: [] });
  }

  const unidades = await prisma.unidades.findMany({
    where: { id: { in: idsRelevantes } },
    include: {
      bloques: { select: { nombre: true } },
      calles: { select: { nombre: true } },
      historial_propietarios: {
        where: { fecha_fin: null },
        include: { propietarios: { select: { nombre: true, apellido: true, telefono: true, email: true } } },
      },
      historial_estado_unidad: {
        where: { fecha_fin: null },
        include: { estados_unidad: { select: { nombre: true } } },
      },
    },
  });

  const totales: Record<Rango, { total: number; cantidad: number }> = {
    mayor_1000: { total: 0, cantidad: 0 },
    "500_1000": { total: 0, cantidad: 0 },
    "100_500": { total: 0, cantidad: 0 },
    menor_100: { total: 0, cantidad: 0 },
    a_favor: { total: 0, cantidad: 0 },
  };

  const propiedades = unidades.map((u) => {
    const saldo = saldoMap.get(u.id) ?? 0;
    const rango = clasificar(saldo);
    totales[rango].total = r2(totales[rango].total + saldo);
    totales[rango].cantidad += 1;
    const prop = u.historial_propietarios[0]?.propietarios;
    const estado = u.historial_estado_unidad[0]?.estados_unidad;
    return {
      id: u.id,
      numero_propiedad: u.numero_propiedad,
      bloque: u.bloques?.nombre ?? null,
      calle: u.calles?.nombre ?? null,
      categoria: estado?.nombre ?? null,
      propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
      telefono: prop?.telefono ?? null,
      email: prop?.email ?? null,
      saldo,
      rango,
    };
  });

  propiedades.sort((a, b) => b.saldo - a.saldo);

  res.json({
    rangos: [
      { key: "mayor_1000", label: "Más de $1,000", min: 1000, max: null, ...totales.mayor_1000 },
      { key: "500_1000", label: "$500 – $1,000", min: 500, max: 1000, ...totales["500_1000"] },
      { key: "100_500", label: "$100 – $500", min: 100, max: 500, ...totales["100_500"] },
      { key: "menor_100", label: "Menos de $100", min: 0, max: 100, ...totales.menor_100 },
      { key: "a_favor", label: "Saldo a favor", min: null, max: 0, ...totales.a_favor },
    ],
    propiedades,
  });
});

// GET /dashboard/eficiencia?meses=13
// Devuelve cobrado, pendiente, esperado y % eficiencia por mes.
router.get("/eficiencia", async (req, res) => {
  const complejoFiltro = req.complejoId ? { id_complejo: req.complejoId } : {};
  const meses = Math.min(Math.max(parseInt(req.query.meses as string) || 13, 1), 48);

  // Ventana de N meses terminando en el mes seleccionado (por defecto el actual).
  const anclaEfi = periodoToDate((req.query.periodo as string) || new Date().toISOString().slice(0, 7)) ?? new Date();
  const periodos: Date[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    periodos.push(new Date(Date.UTC(anclaEfi.getUTCFullYear(), anclaEfi.getUTCMonth() - i, 1)));
  }

  const desde = periodos[0];
  const hasta = new Date(Date.UTC(anclaEfi.getUTCFullYear(), anclaEfi.getUTCMonth() + 1, 1));

  const [cargos, pagos] = await Promise.all([
    prisma.cargos.findMany({
      where: { ...complejoFiltro, estado: { not: "anulado" }, periodo_mes: { gte: desde, lt: hasta } },
      select: { periodo_mes: true, monto: true, saldo: true },
    }),
    prisma.pagos.findMany({
      where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { gte: desde, lt: hasta } },
      select: { fecha_pago: true, monto_total: true },
    }),
  ]);

  const porMes = new Map<string, { esperado: number; cobrado: number; pendiente: number; recaudado: number }>();
  for (const p of periodos) {
    porMes.set(p.toISOString().slice(0, 7), { esperado: 0, cobrado: 0, pendiente: 0, recaudado: 0 });
  }

  for (const c of cargos) {
    const key = c.periodo_mes.toISOString().slice(0, 7);
    const entry = porMes.get(key);
    if (!entry) continue;
    const monto = c.monto.toNumber();
    const saldo = c.saldo.toNumber();
    entry.esperado = r2(entry.esperado + monto);
    entry.cobrado = r2(entry.cobrado + (monto - saldo));
    entry.pendiente = r2(entry.pendiente + saldo);
  }

  for (const p of pagos) {
    const key = p.fecha_pago.toISOString().slice(0, 7);
    const entry = porMes.get(key);
    if (entry) entry.recaudado = r2(entry.recaudado + p.monto_total.toNumber());
  }

  const resultado = [...porMes.entries()].map(([periodo, d]) => ({
    periodo,
    esperado: d.esperado,
    cobrado: d.recaudado,
    pendiente: d.pendiente,
    recaudado: d.recaudado,
    eficiencia: d.esperado > 0 ? Math.round((d.recaudado / d.esperado) * 100) : 0,
  }));

  res.json(resultado);
});

// GET /dashboard/proyeccion?meses=6 — proyección de flujo de caja.
// Caja actual + (ingreso mensual estimado − gasto mensual estimado) mes a mes.
// ingreso estimado = facturación mensual × tasa de cobro histórica (aquí pega la mora).
router.get("/proyeccion", async (req, res) => {
  const complejoFiltro = req.complejoId ? { id_complejo: req.complejoId } : {};
  const meses = Math.min(Math.max(parseInt(req.query.meses as string) || 6, 1), 24);
  // Ancla = mes seleccionado (por defecto el mes actual). Todo se calcula "al fin de ese mes".
  const anclaParam = (req.query.periodo as string) || new Date().toISOString().slice(0, 7);
  const ancla = periodoToDate(anclaParam);
  if (!ancla) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });

  const finAncla = new Date(Date.UTC(ancla.getUTCFullYear(), ancla.getUTCMonth() + 1, 1)); // fin del mes ancla (exclusivo)
  const desde12 = new Date(Date.UTC(ancla.getUTCFullYear(), ancla.getUTCMonth() - 11, 1)); // ventana 12m terminando en el ancla
  const desde6 = new Date(Date.UTC(ancla.getUTCFullYear(), ancla.getUTCMonth() - 5, 1)); // ventana 6m terminando en el ancla

  const [pagHasta, gasHasta, unidades, cuotas, cargos12, pagos12, gastos6, cargosUnidad, pagosUnidad, pagosFechas, gastosFechas] = await Promise.all([
    prisma.pagos.aggregate({ where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { lt: finAncla } }, _sum: { monto_total: true } }),
    prisma.gastos.aggregate({ where: { ...complejoFiltro, fecha: { lt: finAncla } }, _sum: { monto: true } }),
    prisma.unidades.findMany({ where: { ...complejoFiltro, activo: true }, select: { id_estado_unidad: true } }),
    prisma.cuotas.findMany({ where: { ...complejoFiltro, activo: true, periodicidad: "mensual" }, select: { id_estado_unidad: true, monto: true } }),
    prisma.cargos.aggregate({ where: { ...complejoFiltro, estado: { not: "anulado" }, periodo_mes: { gte: desde12, lt: finAncla } }, _sum: { monto: true } }),
    prisma.pagos.aggregate({ where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { gte: desde12, lt: finAncla } }, _sum: { monto_total: true } }),
    prisma.gastos.aggregate({ where: { ...complejoFiltro, fecha: { gte: desde6, lt: finAncla } }, _sum: { monto: true } }),
    // Mora al fin del mes ancla: cargos y pagos por unidad hasta esa fecha
    prisma.cargos.findMany({ where: { ...complejoFiltro, estado: { not: "anulado" }, periodo_mes: { lt: finAncla } }, select: { id_unidad: true, monto: true } }),
    prisma.pagos.findMany({ where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { lt: finAncla } }, select: { id_unidad: true, monto_total: true } }),
    prisma.pagos.findMany({ where: { ...complejoFiltro, estado: { not: "anulado" } }, select: { fecha_pago: true, monto_total: true } }),
    prisma.gastos.findMany({ where: { ...complejoFiltro }, select: { fecha: true, monto: true } }),
  ]);

  // Caja al fin del mes ancla = Σ pagos − Σ gastos hasta ese mes
  const cajaInicial = r2((pagHasta._sum.monto_total?.toNumber() ?? 0) - (gasHasta._sum.monto?.toNumber() ?? 0));

  // Facturación mensual esperada = Σ cuota mensual de cada unidad activa según su estado
  const cuotaPorEstado = new Map<string, number>();
  for (const c of cuotas) {
    if (c.id_estado_unidad) cuotaPorEstado.set(c.id_estado_unidad, (cuotaPorEstado.get(c.id_estado_unidad) ?? 0) + c.monto.toNumber());
  }
  let facturacionMensual = 0;
  for (const u of unidades) facturacionMensual += u.id_estado_unidad ? (cuotaPorEstado.get(u.id_estado_unidad) ?? 0) : 0;
  facturacionMensual = r2(facturacionMensual);

  // Tasa de cobro histórica (12m), acotada a 1 para proyectar facturación nueva
  const esperado12 = cargos12._sum.monto?.toNumber() ?? 0;
  const recaudado12 = pagos12._sum.monto_total?.toNumber() ?? 0;
  const tasaCobro = esperado12 > 0 ? Math.min(1, recaudado12 / esperado12) : 1;

  // Gasto mensual estimado = promedio de los últimos 6 meses
  const gastoMensual = r2((gastos6._sum.monto?.toNumber() ?? 0) / 6);

  const ingresoMensual = r2(facturacionMensual * tasaCobro);
  const flujoNeto = r2(ingresoMensual - gastoMensual);

  const nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  // Histórico: caja real al fin de cada uno de los últimos 6 meses.
  // Flujo neto por mes (pagos − gastos) acumulado cronológicamente.
  const netPorMes = new Map<string, number>();
  for (const p of pagosFechas) {
    const k = p.fecha_pago.toISOString().slice(0, 7);
    netPorMes.set(k, (netPorMes.get(k) ?? 0) + p.monto_total.toNumber());
  }
  for (const g of gastosFechas) {
    const k = g.fecha.toISOString().slice(0, 7);
    netPorMes.set(k, (netPorMes.get(k) ?? 0) - g.monto.toNumber());
  }
  const mesesActivos = [...netPorMes.keys()].sort();
  let acum = 0;
  const cumPorMes = new Map<string, number>();
  for (const k of mesesActivos) { acum = r2(acum + (netPorMes.get(k) ?? 0)); cumPorMes.set(k, acum); }
  const cajaAlFin = (periodo: string) => {
    let v = 0;
    for (const k of mesesActivos) { if (k <= periodo) v = cumPorMes.get(k)!; else break; }
    return v;
  };
  const historico: { periodo: string; label: string; caja_fin: number }[] = [];
  for (let i = 6; i >= 1; i--) {
    const d = new Date(Date.UTC(ancla.getUTCFullYear(), ancla.getUTCMonth() - i, 1));
    const periodo = d.toISOString().slice(0, 7);
    historico.push({ periodo, label: `${nombres[d.getUTCMonth()]} ${d.getUTCFullYear()}`, caja_fin: cajaAlFin(periodo) });
  }

  // Mora al fin del mes ancla = suma de saldos positivos por unidad (Σ cargos − Σ pagos hasta ese mes)
  const saldos = saldosPorUnidadDesde(
    cargosUnidad.map((c) => ({ id_unidad: c.id_unidad, monto: c.monto.toNumber() })),
    pagosUnidad.map((p) => ({ id_unidad: p.id_unidad, monto: p.monto_total.toNumber() }))
  );
  let moraRest = 0;
  for (const s of saldos.values()) if (s > 0) moraRest += s;
  moraRest = r2(moraRest);
  const moraInicial = moraRest;
  const TASA_RECUPERACION = 0.10; // 10% de la mora restante por mes

  // Proyección mes a mes: conservadora (caja_fin) y con recuperación de mora (caja_con_mora)
  let caja = cajaInicial;
  let cajaM = cajaInicial;
  const proyeccion: { periodo: string; label: string; ingreso: number; egreso: number; caja_fin: number; recuperacion_mora: number; caja_con_mora: number }[] = [];
  let mesNegativo: string | null = null;
  for (let i = 1; i <= meses; i++) {
    const d = new Date(Date.UTC(ancla.getUTCFullYear(), ancla.getUTCMonth() + i, 1));
    caja = r2(caja + ingresoMensual - gastoMensual);
    const rec = r2(moraRest * TASA_RECUPERACION);
    moraRest = r2(moraRest - rec);
    cajaM = r2(cajaM + ingresoMensual - gastoMensual + rec);
    const periodo = d.toISOString().slice(0, 7);
    proyeccion.push({ periodo, label: `${nombres[d.getUTCMonth()]} ${d.getUTCFullYear()}`, ingreso: ingresoMensual, egreso: gastoMensual, caja_fin: caja, recuperacion_mora: rec, caja_con_mora: cajaM });
    if (mesNegativo === null && caja < 0) mesNegativo = `${nombres[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  res.json({
    periodo: anclaParam,
    label_ancla: `${nombres[ancla.getUTCMonth()]} ${ancla.getUTCFullYear()}`,
    caja_inicial: cajaInicial,
    facturacion_mensual: facturacionMensual,
    tasa_cobro: Math.round(tasaCobro * 100),
    mora_actual: moraInicial,
    tasa_recuperacion: Math.round(TASA_RECUPERACION * 100),
    ingreso_mensual: ingresoMensual,
    gasto_mensual: gastoMensual,
    flujo_neto: flujoNeto,
    mes_negativo: mesNegativo,
    historico,
    proyeccion,
  });
});

// GET /dashboard/movimientos?periodo=YYYY-MM — libro de caja tipo kardex del mes.
// Saldo inicial (acumulado de meses anteriores, o 0 si no hay) + ingresos/egresos por fecha con saldo corriente.
router.get("/movimientos", async (req, res) => {
  const periodoParam = (req.query.periodo as string) || new Date().toISOString().slice(0, 7);
  const periodoMes = periodoToDate(periodoParam);
  if (!periodoMes) return res.status(400).json({ message: "periodo inválido (use YYYY-MM)" });
  const sigMes = new Date(Date.UTC(periodoMes.getUTCFullYear(), periodoMes.getUTCMonth() + 1, 1));
  const complejoFiltro = req.complejoId ? { id_complejo: req.complejoId } : {};

  const [pagPrev, gasPrev, pagosMes, gastosMes, complejo] = await Promise.all([
    prisma.pagos.aggregate({ where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { lt: periodoMes } }, _sum: { monto_total: true } }),
    prisma.gastos.aggregate({ where: { ...complejoFiltro, fecha: { lt: periodoMes } }, _sum: { monto: true } }),
    prisma.pagos.findMany({
      where: { ...complejoFiltro, estado: { not: "anulado" }, fecha_pago: { gte: periodoMes, lt: sigMes } },
      select: { id: true, fecha_pago: true, monto_total: true, metodo: true, referencia_banco: true, unidades: { select: { numero_propiedad: true } } },
    }),
    prisma.gastos.findMany({
      where: { ...complejoFiltro, fecha: { gte: periodoMes, lt: sigMes } },
      select: { id: true, fecha: true, monto: true, categoria: true, descripcion: true, proveedor: true },
    }),
    req.complejoId ? prisma.complejos.findUnique({ where: { id: req.complejoId }, select: { nombre: true, logo_url: true } }) : Promise.resolve(null),
  ]);

  const saldoInicial = r2((pagPrev._sum.monto_total?.toNumber() ?? 0) - (gasPrev._sum.monto?.toNumber() ?? 0));

  type Mov = { fecha: string; tipo: "pago" | "gasto"; descripcion: string; detalle: string | null; ingreso: number; egreso: number; orden: number };
  const movs: Mov[] = [];
  for (const p of pagosMes) {
    movs.push({
      fecha: p.fecha_pago.toISOString().slice(0, 10),
      tipo: "pago",
      descripcion: `Pago${p.unidades?.numero_propiedad ? " — " + p.unidades.numero_propiedad : ""}`,
      detalle: p.referencia_banco ?? p.metodo ?? null,
      ingreso: r2(p.monto_total.toNumber()),
      egreso: 0,
      orden: 0,
    });
  }
  for (const g of gastosMes) {
    const m = g.monto.toNumber();
    // Un gasto negativo (ajuste/saldo inicial) es en realidad un ingreso a la caja.
    movs.push({
      fecha: g.fecha.toISOString().slice(0, 10),
      tipo: m < 0 ? "pago" : "gasto",
      descripcion: g.descripcion,
      detalle: `${g.categoria}${g.proveedor ? " · " + g.proveedor : ""}`,
      ingreso: m < 0 ? r2(-m) : 0,
      egreso: m < 0 ? 0 : r2(m),
      orden: m < 0 ? 0 : 1,
    });
  }
  // Orden: por fecha; en la misma fecha, ingresos antes que egresos.
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

  let saldo = saldoInicial;
  const movimientos = movs.map((m) => {
    saldo = r2(saldo + m.ingreso - m.egreso);
    return { fecha: m.fecha, tipo: m.tipo, descripcion: m.descripcion, detalle: m.detalle, ingreso: m.ingreso, egreso: m.egreso, saldo };
  });

  res.json({
    periodo: periodoParam,
    nombre_complejo: complejo?.nombre ?? "Residencial",
    logo_url: complejo?.logo_url ?? null,
    saldo_inicial: saldoInicial,
    total_ingresos: r2(movs.reduce((s, m) => s + m.ingreso, 0)),
    total_egresos: r2(movs.reduce((s, m) => s + m.egreso, 0)),
    saldo_final: saldo,
    movimientos,
  });
});

export default router;
