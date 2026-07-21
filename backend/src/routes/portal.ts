import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { getSaldosPorUnidad } from "../utils/creditos.js";

const router = Router();
const soloPropietario = requireRole("propietario");

// GET /portal/mis-unidades — unidades del propietario logueado.
router.get("/mis-unidades", soloPropietario, async (req, res) => {
  const idProp = req.user!.id_propietario;
  if (!idProp) return res.status(400).json({ message: "Usuario sin propietario asignado" });

  const historial = await prisma.historial_propietarios.findMany({
    where: { id_propietario: idProp, fecha_fin: null },
    include: {
      unidades: {
        include: {
          bloques: { select: { nombre: true } },
          calles: { select: { nombre: true } },
          estados_unidad: { select: { nombre: true } },
        },
      },
    },
  });

  const unidades = await Promise.all(historial.map(async (h) => {
    const [cargosAgg, pagosAgg] = await Promise.all([
      prisma.cargos.aggregate({ where: { id_unidad: h.unidades.id, estado: { not: "anulado" } }, _sum: { monto: true } }),
      prisma.pagos.aggregate({ where: { id_unidad: h.unidades.id, estado: { not: "anulado" } }, _sum: { monto_total: true } }),
    ]);
    const saldo = Math.round(((cargosAgg._sum.monto?.toNumber() ?? 0) - (pagosAgg._sum.monto_total?.toNumber() ?? 0)) * 100) / 100;
    return {
      id: h.unidades.id,
      numero_propiedad: h.unidades.numero_propiedad,
      bloque: h.unidades.bloques?.nombre ?? h.unidades.bloque,
      calle: h.unidades.calles?.nombre ?? null,
      estado: h.unidades.estados_unidad?.nombre ?? null,
      saldo, // > 0 debe, <= 0 al día / a favor
      lat: h.unidades.lat ? Number(h.unidades.lat) : null,
      lng: h.unidades.lng ? Number(h.unidades.lng) : null,
      poligono: h.unidades.poligono,
    };
  }));

  res.json(unidades);
});

// GET /portal/mis-promesas — promesas de pago ACTIVAS del propietario.
// Una promesa está activa si: la unidad aún tiene saldo > 0 Y no se ha
// registrado ningún pago DESPUÉS de la promesa (la promesa "vale hasta el
// próximo pago", así no se reactiva una promesa ya cumplida).
router.get("/mis-promesas", soloPropietario, async (req, res) => {
  const idProp = req.user!.id_propietario;
  if (!idProp) return res.status(400).json({ message: "Usuario sin propietario asignado" });

  const vinculos = await prisma.historial_propietarios.findMany({
    where: { id_propietario: idProp, fecha_fin: null },
    select: { id_unidad: true, unidades: { select: { numero_propiedad: true } } },
  });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const promesas: { id_unidad: string; numero_propiedad: string | null; promesa_fecha: string; vencida: boolean; saldo: number }[] = [];

  for (const v of vinculos) {
    const [cargosAgg, pagosAgg, ultimaPromesa] = await Promise.all([
      prisma.cargos.aggregate({ where: { id_unidad: v.id_unidad, estado: { not: "anulado" } }, _sum: { monto: true } }),
      prisma.pagos.aggregate({ where: { id_unidad: v.id_unidad, estado: { not: "anulado" } }, _sum: { monto_total: true } }),
      prisma.gestiones_cobranza.findFirst({
        where: { id_unidad: v.id_unidad, resultado: "promesa_pago", promesa_fecha: { not: null } },
        orderBy: { created_at: "desc" },
        select: { promesa_fecha: true, created_at: true },
      }),
    ]);
    const saldo = Math.round(((cargosAgg._sum.monto?.toNumber() ?? 0) - (pagosAgg._sum.monto_total?.toNumber() ?? 0)) * 100) / 100;
    if (saldo <= 0 || !ultimaPromesa?.promesa_fecha) continue;

    // ¿Hubo algún pago registrado DESPUÉS de la promesa? -> promesa cumplida/consumida.
    const pagoPosterior = await prisma.pagos.count({
      where: { id_unidad: v.id_unidad, estado: { not: "anulado" }, created_at: { gt: ultimaPromesa.created_at } },
    });
    if (pagoPosterior > 0) continue;

    const pf = new Date(ultimaPromesa.promesa_fecha);
    promesas.push({
      id_unidad: v.id_unidad,
      numero_propiedad: v.unidades?.numero_propiedad ?? null,
      promesa_fecha: pf.toISOString().slice(0, 10),
      vencida: pf < hoy,
      saldo,
    });
  }

  // Más urgente primero (vencidas, luego por fecha).
  promesas.sort((a, b) => Number(b.vencida) - Number(a.vencida) || a.promesa_fecha.localeCompare(b.promesa_fecha));
  res.json(promesas);
});

// GET /portal/estado-cuenta/:idUnidad — estado de cuenta de una unidad del propietario.
router.get("/estado-cuenta/:idUnidad", soloPropietario, async (req, res) => {
  const idProp = req.user!.id_propietario;
  if (!idProp) return res.status(400).json({ message: "Usuario sin propietario asignado" });

  // Verify the unit belongs to this propietario
  const vinculo = await prisma.historial_propietarios.findFirst({
    where: { id_propietario: idProp, id_unidad: req.params.idUnidad, fecha_fin: null },
  });
  if (!vinculo) return res.status(403).json({ message: "Unidad no asignada a este propietario" });

  const idUnidad = req.params.idUnidad;

  const [u, cargos, pagos, complejo] = await Promise.all([
    prisma.unidades.findUnique({
      where: { id: idUnidad },
      include: {
        bloques: { select: { nombre: true } },
        calles: { select: { nombre: true } },
        estados_unidad: { select: { nombre: true } },
      },
    }),
    prisma.cargos.findMany({
      where: { id_unidad: idUnidad, estado: { not: "anulado" } },
      orderBy: [{ periodo_mes: "asc" }, { concepto: "asc" }],
    }),
    prisma.pagos.findMany({
      where: { id_unidad: idUnidad, estado: { not: "anulado" } },
      orderBy: { fecha_pago: "asc" },
      include: { pago_cargos: { include: { cargos: { select: { concepto: true, periodo_mes: true } } } } },
    }),
    prisma.complejos.findUnique({
      where: { id: req.complejoId! },
      select: { nombre: true, logo_url: true },
    }),
  ]);

  if (!u) return res.status(404).json({ message: "Unidad no encontrada" });

  const anio = new Date().getUTCFullYear();
  const totalCargos = cargos.reduce((s, c) => s + c.monto.toNumber(), 0);
  const totalHistorico = pagos.reduce((s, p) => s + p.monto_total.toNumber(), 0);
  const totalAnio = pagos
    .filter((p) => new Date(p.fecha_pago).getUTCFullYear() === anio)
    .reduce((s, p) => s + p.monto_total.toNumber(), 0);
  const ultimoPago = pagos[0] ? pagos[pagos.length - 1]?.fecha_pago : null;

  const saldoPendiente = Math.round((totalCargos - totalHistorico) * 100) / 100;
  const credito = saldoPendiente < 0 ? Math.abs(saldoPendiente) : 0;

  res.json({
    nombre_complejo: complejo?.nombre ?? "Residencial",
    logo_url: complejo?.logo_url ?? null,
    unidad: {
      id: u.id,
      numero_propiedad: u.numero_propiedad,
      bloque: u.bloques?.nombre ?? u.bloque,
      calle: u.calles?.nombre ?? null,
      estado_actual: u.estados_unidad ? { id: u.id_estado_unidad!, nombre: u.estados_unidad.nombre } : null,
    },
    kpis: {
      saldo_pendiente: saldoPendiente,
      credito_a_favor: Math.round(credito * 100) / 100,
      total_pagado_anio: Math.round(totalAnio * 100) / 100,
      total_historico: Math.round(totalHistorico * 100) / 100,
      ultimo_pago: ultimoPago,
    },
    cargos: cargos.map((c) => ({
      id: c.id,
      concepto: c.concepto,
      periodo_mes: c.periodo_mes,
      monto: c.monto.toNumber(),
      saldo: c.saldo.toNumber(),
      estado: c.estado,
    })),
    pagos: pagos.map((p) => ({
      id: p.id,
      fecha_pago: p.fecha_pago,
      monto_total: p.monto_total.toNumber(),
      metodo: p.metodo,
      referencia_banco: p.referencia_banco,
      estado: p.estado,
    })),
  });
});

// GET /portal/mensajes — mensajes del propietario.
router.get("/mensajes", soloPropietario, async (req, res) => {
  const msgs = await prisma.mensajes.findMany({
    where: { id_usuario: req.user!.sub },
    orderBy: { created_at: "desc" },
    include: {
      unidades: { select: { numero_propiedad: true } },
      respuestas_mensajes: {
        orderBy: { created_at: "asc" },
        select: { id: true, nombre_usuario: true, texto: true, created_at: true },
      },
    },
  });
  res.json(msgs.map((m) => ({
    id: m.id,
    categoria: m.categoria,
    asunto: m.asunto,
    mensaje: m.mensaje,
    estado: m.estado,
    id_unidad: m.id_unidad,
    numero_propiedad: m.unidades?.numero_propiedad ?? null,
    fecha: m.created_at,
    respuestas: m.respuestas_mensajes.map((r) => ({
      id: r.id,
      nombre_usuario: r.nombre_usuario,
      texto: r.texto,
      fecha: r.created_at,
    })),
  })));
});

// POST /portal/mensajes — crear mensaje/queja.
router.post("/mensajes", soloPropietario, async (req, res) => {
  const { categoria, asunto, mensaje, id_unidad } = req.body ?? {};
  if (!asunto?.trim() || !mensaje?.trim() || !categoria?.trim()) {
    return res.status(400).json({ message: "Categoría, asunto y mensaje son requeridos" });
  }

  // If id_unidad provided, verify it belongs to propietario
  if (id_unidad) {
    const vinculo = await prisma.historial_propietarios.findFirst({
      where: { id_propietario: req.user!.id_propietario!, id_unidad, fecha_fin: null },
    });
    if (!vinculo) return res.status(403).json({ message: "Unidad no asignada a este propietario" });
  }

  const msg = await prisma.mensajes.create({
    data: {
      id_complejo: req.complejoId!,
      id_usuario: req.user!.sub,
      id_unidad: id_unidad || null,
      categoria: categoria.trim(),
      asunto: asunto.trim(),
      mensaje: mensaje.trim(),
    },
  });
  res.status(201).json({ id: msg.id });
});

// GET /portal/transparencia — resumen financiero público para propietarios.
// Devuelve los últimos 6 meses de recaudación, gastos por categoría y saldo en caja.
router.get("/transparencia", async (req, res) => {
  const complejoId = req.complejoId;
  if (!complejoId) return res.status(400).json({ message: "Complejo no especificado" });

  const complejo = await prisma.complejos.findUnique({
    where: { id: complejoId },
    select: { nombre: true },
  });

  const hoy = new Date();
  const meses: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const inicioRango = new Date(Date.UTC(
    Number(meses[0].split("-")[0]),
    Number(meses[0].split("-")[1]) - 1,
    1
  ));
  const finRango = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));

  const [pagos, gastos] = await Promise.all([
    prisma.pagos.findMany({
      where: {
        id_complejo: complejoId,
        estado: { not: "anulado" },
        fecha_pago: { gte: inicioRango, lt: finRango },
      },
      select: { fecha_pago: true, monto_total: true },
    }),
    prisma.gastos.findMany({
      where: {
        id_complejo: complejoId,
        fecha: { gte: inicioRango, lt: finRango },
      },
      select: { fecha: true, monto: true, categoria: true, descripcion: true, proveedor: true },
    }),
  ]);

  // Agrupar por mes
  const porMes = meses.map((m) => {
    const [y, mo] = m.split("-").map(Number);
    const recaudado = pagos
      .filter((p) => {
        const d = new Date(p.fecha_pago);
        return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === mo;
      })
      .reduce((s, p) => s + p.monto_total.toNumber(), 0);
    const gastado = gastos
      .filter((g) => {
        const d = new Date(g.fecha);
        return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === mo;
      })
      .reduce((s, g) => s + g.monto.toNumber(), 0);
    return { periodo: m, recaudado: Math.round(recaudado * 100) / 100, gastado: Math.round(gastado * 100) / 100 };
  });

  // Gastos por categoría del mes actual
  const mesActual = meses[meses.length - 1];
  const [yAct, mAct] = mesActual.split("-").map(Number);
  const gastosMesActual = gastos.filter((g) => {
    const d = new Date(g.fecha);
    return d.getUTCFullYear() === yAct && d.getUTCMonth() + 1 === mAct;
  });
  const porCategoria: Record<string, { total: number; items: { descripcion: string; proveedor: string | null; monto: number }[] }> = {};
  for (const g of gastosMesActual) {
    if (!porCategoria[g.categoria]) porCategoria[g.categoria] = { total: 0, items: [] };
    const m = g.monto.toNumber();
    porCategoria[g.categoria].total += m;
    porCategoria[g.categoria].items.push({ descripcion: g.descripcion, proveedor: g.proveedor, monto: Math.round(m * 100) / 100 });
  }
  const categorias = Object.entries(porCategoria)
    .map(([categoria, v]) => ({ categoria, monto: Math.round(v.total * 100) / 100, items: v.items }))
    .sort((a, b) => b.monto - a.monto);

  // Totales acumulados (todo el historial)
  const [totalRecaudado, totalGastado] = await Promise.all([
    prisma.pagos.aggregate({
      where: { id_complejo: complejoId, estado: { not: "anulado" } },
      _sum: { monto_total: true },
    }),
    prisma.gastos.aggregate({
      where: { id_complejo: complejoId },
      _sum: { monto: true },
    }),
  ]);

  const recaudadoTotal = totalRecaudado._sum.monto_total?.toNumber() ?? 0;
  const gastadoTotal = totalGastado._sum.monto?.toNumber() ?? 0;
  const saldoCaja = Math.round((recaudadoTotal - gastadoTotal) * 100) / 100;

  const recaudadoMesActual = porMes[porMes.length - 1].recaudado;
  const gastadoMesActual = porMes[porMes.length - 1].gastado;

  res.json({
    nombre_complejo: complejo?.nombre ?? "Residencial",
    kpis: {
      saldo_caja: saldoCaja,
      recaudado_mes: recaudadoMesActual,
      gastado_mes: gastadoMesActual,
    },
    meses: porMes,
    categorias_mes: categorias,
  });
});

// GET /portal/transparencia/:periodo — detalle de un mes: gastos individuales + total recaudado.
router.get("/transparencia/:periodo", async (req, res) => {
  const complejoId = req.complejoId;
  if (!complejoId) return res.status(400).json({ message: "Complejo no especificado" });

  const periodo = req.params.periodo; // "2026-07"
  const [y, m] = periodo.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, 1));
  const fin = new Date(Date.UTC(y, m, 1));

  const [gastosDetalle, pagosTotal] = await Promise.all([
    prisma.gastos.findMany({
      where: { id_complejo: complejoId, fecha: { gte: inicio, lt: fin } },
      select: { descripcion: true, proveedor: true, monto: true, categoria: true, fecha: true },
      orderBy: { fecha: "asc" },
    }),
    prisma.pagos.aggregate({
      where: { id_complejo: complejoId, estado: { not: "anulado" }, fecha_pago: { gte: inicio, lt: fin } },
      _sum: { monto_total: true },
    }),
  ]);

  res.json({
    periodo,
    recaudado: pagosTotal._sum.monto_total?.toNumber() ?? 0,
    gastos: gastosDetalle.map((g) => ({
      descripcion: g.descripcion,
      proveedor: g.proveedor,
      monto: g.monto.toNumber(),
      categoria: g.categoria,
      fecha: g.fecha,
    })),
  });
});

export default router;
