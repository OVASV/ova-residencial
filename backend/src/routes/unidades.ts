import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { getSaldosPorUnidad } from "../utils/creditos.js";

const router = Router();

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({
      message: "Complejo no especificado (superadmin: enviar header X-Complejo-ID)",
    });
    return null;
  }
  return req.complejoId;
}

// Aplana el propietario actual (historial con fecha_fin = NULL) de una unidad.
function propietarioActual(historial: Array<{ propietarios?: unknown; fecha_inicio: Date }>) {
  const actual = historial[0];
  if (!actual?.propietarios) return null;
  const p = actual.propietarios as { id: string; nombre: string; apellido: string };
  return { id: p.id, nombre: p.nombre, apellido: p.apellido, desde: actual.fecha_inicio };
}

// GET /unidades — lista con propietario actual. (El estado de pago llega en Sprint 3.)
router.get("/", async (req, res) => {
  const { bloque, activo } = req.query as { bloque?: string; activo?: string };
  const where: Record<string, unknown> = {};
  if (req.complejoId) where.id_complejo = req.complejoId;
  if (bloque) where.bloque = bloque;
  if (activo === "true" || activo === "false") where.activo = activo === "true";

  const data = await prisma.unidades.findMany({
    where,
    orderBy: { id: "asc" },
    include: {
      estados_unidad: { select: { id: true, nombre: true } },
      pisos: { select: { id: true, nombre: true } },
      historial_propietarios: {
        where: { fecha_fin: null },
        include: { propietarios: { select: { id: true, nombre: true, apellido: true } } },
      },
    },
  });

  res.json(
    data.map((u) => ({
      id: u.id,
      numero_propiedad: u.numero_propiedad,
      id_bloque: u.id_bloque,
      id_calle: u.id_calle,
      id_piso: u.id_piso,
      bloque: u.bloque,
      calle: u.calle,
      area_m2: u.area_m2,
      num_piso: u.num_piso,
      piso: u.pisos ? u.pisos.nombre : null,
      lat: u.lat,
      lng: u.lng,
      activo: u.activo,
      estado_actual: u.estados_unidad ? { id: u.estados_unidad.id, nombre: u.estados_unidad.nombre } : null,
      propietario_actual: propietarioActual(u.historial_propietarios),
    }))
  );
});

// GET /unidades/mapa — unidades con coordenadas + categoría + propietario + nivel de mora.
// Para la vista de mapa: marcadores coloreados por estado de pago.
router.get("/mapa", async (req, res) => {
  const where: Record<string, unknown> = { activo: true };
  if (req.complejoId) where.id_complejo = req.complejoId;

  const [unidades, cargos, cuotas] = await Promise.all([
    prisma.unidades.findMany({
      where,
      include: {
        calles: { select: { nombre: true } },
        estados_unidad: { select: { id: true, nombre: true } },
        historial_propietarios: {
          where: { fecha_fin: null },
          include: { propietarios: { select: { id: true, nombre: true, apellido: true, telefono: true } } },
        },
      },
    }),
    prisma.cargos.findMany({
      where: { ...(req.complejoId ? { id_complejo: req.complejoId } : {}), estado: { not: "anulado" }, saldo: { gt: 0 } },
      select: { id_unidad: true, saldo: true, periodo_mes: true },
    }),
    // Tarifas fijas vigentes ligadas a una categoría -> "cuota asignada" por tipo.
    prisma.cuotas.findMany({
      where: {
        ...(req.complejoId ? { id_complejo: req.complejoId } : {}),
        activo: true,
        tipo: "fijo",
        id_estado_unidad: { not: null },
      },
      select: { id_estado_unidad: true, monto: true },
    }),
  ]);

  // Cuota mensual asignada por categoría (suma de tarifas fijas del estado).
  const cuotaPorEstado = new Map<string, number>();
  for (const c of cuotas) {
    if (!c.id_estado_unidad) continue;
    cuotaPorEstado.set(c.id_estado_unidad, (cuotaPorEstado.get(c.id_estado_unidad) ?? 0) + c.monto.toNumber());
  }

  const inicioMes = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const mesesAtraso = new Map<string, Set<string>>();
  for (const c of cargos) {
    if (new Date(c.periodo_mes) < inicioMes) {
      const set = mesesAtraso.get(c.id_unidad) ?? new Set<string>();
      set.add(String(c.periodo_mes).slice(0, 7));
      mesesAtraso.set(c.id_unidad, set);
    }
  }

  const saldosRT = req.complejoId ? await getSaldosPorUnidad(req.complejoId) : new Map<string, number>();

  res.json(
    unidades.map((u) => {
      const saldo = saldosRT.get(u.id) ?? 0;
      const atraso = mesesAtraso.get(u.id)?.size ?? 0;
      const nivel: string = saldo < 0 ? "a_favor" : saldo <= 0 ? "al_dia" : saldo >= 1000 ? "mayor_1000" : saldo >= 500 ? "500_1000" : saldo >= 100 ? "100_500" : "menor_100";
      const prop = u.historial_propietarios[0]?.propietarios;
      return {
        id: u.id,
        numero_propiedad: u.numero_propiedad,
        bloque: u.bloque,
        calle: u.calles?.nombre ?? null,
        lat: u.lat,
        lng: u.lng,
        estado_actual: u.estados_unidad ? { id: u.estados_unidad.id, nombre: u.estados_unidad.nombre } : null,
        propietario_actual: prop ? { id: prop.id, nombre: prop.nombre, apellido: prop.apellido, telefono: prop.telefono } : null,
        cuota_mensual: u.id_estado_unidad ? Math.round((cuotaPorEstado.get(u.id_estado_unidad) ?? 0) * 100) / 100 : 0,
        saldo_pendiente: saldo,
        meses_atraso: atraso,
        nivel,
      };
    })
  );
});

// GET /unidades/:id — detalle + propietario actual + polígono parseado.
router.get("/:id", async (req, res) => {
  const u = await prisma.unidades.findUnique({
    where: { id: req.params.id },
    include: {
      estados_unidad: { select: { id: true, nombre: true } },
      historial_propietarios: {
        where: { fecha_fin: null },
        include: { propietarios: { select: { id: true, nombre: true, apellido: true } } },
      },
    },
  });
  if (!u || (req.complejoId && u.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Unidad no encontrada" });
  }
  res.json({
    id: u.id,
    numero_propiedad: u.numero_propiedad,
    id_bloque: u.id_bloque,
    id_calle: u.id_calle,
    bloque: u.bloque,
    calle: u.calle,
    area_m2: u.area_m2,
    num_piso: u.num_piso,
    lat: u.lat,
    lng: u.lng,
    poligono: u.poligono ? JSON.parse(u.poligono) : null,
    activo: u.activo,
    estado_actual: u.estados_unidad ? { id: u.estados_unidad.id, nombre: u.estados_unidad.nombre } : null,
    propietario_actual: propietarioActual(u.historial_propietarios),
  });
});

// Genera un id interno único tipo U-0001 para el complejo (identificador propio).
async function nextUnidadId(idComplejo: string): Promise<string> {
  const existentes = await prisma.unidades.findMany({ where: { id_complejo: idComplejo }, select: { id: true } });
  let max = 0;
  for (const u of existentes) {
    const m = /(\d+)\s*$/.exec(u.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const usados = new Set(existentes.map((u) => u.id));
  let n = max + 1;
  let id = `U-${String(n).padStart(4, "0")}`;
  while (usados.has(id)) { n++; id = `U-${String(n).padStart(4, "0")}`; }
  return id;
}

// POST /unidades — crear unidad (id autogenerado; bloque/calle por catálogo).
router.post("/", async (req, res) => {
  const idComplejo = complejoEscritura(req, res);
  if (!idComplejo) return;

  const { id_bloque, id_calle, id_piso, numero_propiedad, area_m2, num_piso, lat, lng, poligono } = req.body ?? {};
  if (!id_bloque || !id_calle || !numero_propiedad?.trim()) {
    return res.status(400).json({ message: "bloque, calle y número de propiedad son requeridos" });
  }
  const bloque = await prisma.bloques.findUnique({ where: { id: id_bloque } });
  if (!bloque || bloque.id_complejo !== idComplejo) return res.status(400).json({ message: "Bloque inválido" });
  const calle = await prisma.calles.findUnique({ where: { id: id_calle } });
  if (!calle || calle.id_complejo !== idComplejo) return res.status(400).json({ message: "Calle inválida" });

  const id = await nextUnidadId(idComplejo);
  const creada = await prisma.unidades.create({
    data: {
      id,
      id_complejo: idComplejo,
      id_bloque,
      id_calle,
      id_piso: id_piso ?? null,
      bloque: bloque.nombre,
      calle: calle.nombre,
      numero_propiedad: numero_propiedad.trim(),
      area_m2: area_m2 ?? null,
      num_piso: num_piso ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      poligono: poligono ? JSON.stringify(poligono) : null,
    },
  });
  res.status(201).json(creada);
});

// PUT /unidades/:id — editar.
router.put("/:id", async (req, res) => {
  const u = await prisma.unidades.findUnique({ where: { id: req.params.id } });
  if (!u || (req.complejoId && u.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Unidad no encontrada" });
  }
  const { id_bloque, id_calle, id_piso, numero_propiedad, area_m2, num_piso, lat, lng, poligono, activo } = req.body ?? {};
  const data: Record<string, unknown> = {};

  if (id_bloque !== undefined) {
    const bloque = await prisma.bloques.findUnique({ where: { id: id_bloque } });
    if (!bloque || bloque.id_complejo !== u.id_complejo) return res.status(400).json({ message: "Bloque inválido" });
    data.id_bloque = id_bloque;
    data.bloque = bloque.nombre;
  }
  if (id_calle !== undefined) {
    const calle = await prisma.calles.findUnique({ where: { id: id_calle } });
    if (!calle || calle.id_complejo !== u.id_complejo) return res.status(400).json({ message: "Calle inválida" });
    data.id_calle = id_calle;
    data.calle = calle.nombre;
  }
  if (numero_propiedad !== undefined) {
    if (!String(numero_propiedad).trim()) return res.status(400).json({ message: "número de propiedad no puede quedar vacío" });
    data.numero_propiedad = String(numero_propiedad).trim();
  }
  if (id_piso !== undefined) data.id_piso = id_piso || null;
  if (area_m2 !== undefined) data.area_m2 = area_m2 ?? null;
  if (num_piso !== undefined) data.num_piso = num_piso ?? null;
  if (lat !== undefined) data.lat = lat ?? null;
  if (lng !== undefined) data.lng = lng ?? null;
  if (poligono !== undefined) data.poligono = poligono ? JSON.stringify(poligono) : null;
  if (activo !== undefined) data.activo = activo;

  const updated = await prisma.unidades.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

// GET /unidades/:id/historial — historial de propietarios de la unidad.
router.get("/:id/historial", async (req, res) => {
  const u = await prisma.unidades.findUnique({ where: { id: req.params.id } });
  if (!u || (req.complejoId && u.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Unidad no encontrada" });
  }
  const historial = await prisma.historial_propietarios.findMany({
    where: { id_unidad: req.params.id },
    orderBy: { fecha_inicio: "desc" },
    include: { propietarios: { select: { id: true, nombre: true, apellido: true } } },
  });
  res.json(historial);
});

// POST /unidades/:id/propietario — asigna/transfiere propietario actual.
// Cierra el historial abierto (fecha_fin = fecha_inicio nuevo) e inserta el
// nuevo registro; todo en una transacción. El trigger de no-solapamiento valida.
router.post("/:id/propietario", async (req, res) => {
  const idComplejo = complejoEscritura(req, res);
  if (!idComplejo) return;

  const { id_propietario, fecha_inicio, motivo } = req.body ?? {};
  if (!id_propietario || !fecha_inicio) {
    return res.status(400).json({ message: "id_propietario y fecha_inicio son requeridos" });
  }

  const unidad = await prisma.unidades.findUnique({
    where: { id: req.params.id },
    include: { historial_propietarios: { where: { fecha_fin: null } } },
  });
  if (!unidad || unidad.id_complejo !== idComplejo) {
    return res.status(404).json({ message: "Unidad no encontrada en este complejo" });
  }

  const prop = await prisma.propietarios.findUnique({ where: { id: id_propietario } });
  if (!prop || prop.id_complejo !== idComplejo) {
    return res.status(404).json({ message: "Propietario no encontrado en este complejo" });
  }

  const inicio = new Date(fecha_inicio);
  const abierto = unidad.historial_propietarios[0];
  if (abierto && new Date(abierto.fecha_inicio) >= inicio) {
    return res.status(400).json({
      message: "fecha_inicio debe ser posterior al inicio del propietario actual",
    });
  }

  try {
    const nuevo = await prisma.$transaction(async (tx) => {
      if (abierto) {
        await tx.historial_propietarios.update({
          where: { id: abierto.id },
          data: { fecha_fin: inicio },
        });
      }
      return tx.historial_propietarios.create({
        data: {
          id_unidad: req.params.id,
          id_propietario,
          fecha_inicio: inicio,
          fecha_fin: null,
          motivo: motivo || null,
        },
      });
    });
    res.status(201).json(nuevo);
  } catch (e) {
    res.status(400).json({ message: "No se pudo asignar el propietario", detail: String(e) });
  }
});

// GET /unidades/:id/historial-estado — historial de estados/categoría de la unidad.
router.get("/:id/historial-estado", async (req, res) => {
  const u = await prisma.unidades.findUnique({ where: { id: req.params.id } });
  if (!u || (req.complejoId && u.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Unidad no encontrada" });
  }
  const historial = await prisma.historial_estado_unidad.findMany({
    where: { id_unidad: req.params.id },
    orderBy: { fecha_inicio: "desc" },
    include: { estados_unidad: { select: { id: true, nombre: true } } },
  });
  res.json(historial);
});

// GET /unidades/:id/estado-cuenta — ficha financiera de la unidad (sección 7.6):
// datos del residente, KPIs y el historial de cargos y pagos.
router.get("/:id/estado-cuenta", async (req, res) => {
  const u = await prisma.unidades.findUnique({
    where: { id: req.params.id },
    include: {
      estados_unidad: { select: { id: true, nombre: true } },
      calles: { select: { nombre: true } },
      historial_propietarios: {
        where: { fecha_fin: null },
        include: {
          propietarios: {
            select: { id: true, nombre: true, apellido: true, telefono: true, email: true },
          },
        },
      },
    },
  });
  if (!u || (req.complejoId && u.id_complejo !== req.complejoId)) {
    return res.status(404).json({ message: "Unidad no encontrada" });
  }

  const [cargos, pagos, complejo] = await Promise.all([
    prisma.cargos.findMany({
      where: { id_unidad: req.params.id, estado: { not: "anulado" } },
      orderBy: [{ periodo_mes: "desc" }, { concepto: "asc" }],
    }),
    prisma.pagos.findMany({
      where: { id_unidad: req.params.id, estado: { not: "anulado" } },
      orderBy: { fecha_pago: "desc" },
      include: { pago_cargos: { include: { cargos: { select: { concepto: true, periodo_mes: true } } } } },
    }),
    prisma.complejos.findUnique({ where: { id: u.id_complejo }, select: { nombre: true, logo_url: true } }),
  ]);

  const anio = new Date().getUTCFullYear();
  // Saldo en tiempo real: Σ cargos.monto − Σ pagos.monto_total (igual que el dashboard)
  const totalCargos = cargos.reduce((s, c) => s + c.monto.toNumber(), 0);
  const totalHistorico = pagos.reduce((s, p) => s + p.monto_total.toNumber(), 0);
  const totalAnio = pagos
    .filter((p) => new Date(p.fecha_pago).getUTCFullYear() === anio)
    .reduce((s, p) => s + p.monto_total.toNumber(), 0);
  const ultimoPago = pagos[0]?.fecha_pago ?? null;

  const saldoPendiente = Math.round((totalCargos - totalHistorico) * 100) / 100;
  // Crédito a favor: saldo negativo (pagó más de lo cobrado)
  const credito = saldoPendiente < 0 ? Math.abs(saldoPendiente) : 0;

  const actual = u.historial_propietarios[0];
  res.json({
    nombre_complejo: complejo?.nombre ?? "Residencial",
    logo_url: complejo?.logo_url ?? null,
    unidad: {
      id: u.id,
      numero_propiedad: u.numero_propiedad,
      bloque: u.bloque,
      calle: u.calles?.nombre ?? null,
      area_m2: u.area_m2,
      estado_actual: u.estados_unidad ? { id: u.estados_unidad.id, nombre: u.estados_unidad.nombre } : null,
      propietario_actual: actual?.propietarios
        ? { ...actual.propietarios, desde: actual.fecha_inicio }
        : null,
    },
    kpis: {
      saldo_pendiente: saldoPendiente,
      credito_a_favor: Math.round(credito * 100) / 100,
      total_pagado_anio: Math.round(totalAnio * 100) / 100,
      total_historico: Math.round(totalHistorico * 100) / 100,
      ultimo_pago: ultimoPago,
    },
    cargos,
    pagos,
  });
});

// POST /unidades/:id/estado — asigna/cambia el estado de la unidad.
// Cierra el historial de estado abierto (fecha_fin = nuevo inicio), inserta el
// nuevo y actualiza el puntero unidades.id_estado_unidad. Todo transaccional.
router.post("/:id/estado", async (req, res) => {
  const idComplejo = complejoEscritura(req, res);
  if (!idComplejo) return;

  const { id_estado, fecha_inicio } = req.body ?? {};
  if (!id_estado || !fecha_inicio) {
    return res.status(400).json({ message: "id_estado y fecha_inicio son requeridos" });
  }

  const unidad = await prisma.unidades.findUnique({
    where: { id: req.params.id },
    include: { historial_estado_unidad: { where: { fecha_fin: null } } },
  });
  if (!unidad || unidad.id_complejo !== idComplejo) {
    return res.status(404).json({ message: "Unidad no encontrada en este complejo" });
  }

  const estado = await prisma.estados_unidad.findUnique({ where: { id: id_estado } });
  if (!estado || estado.id_complejo !== idComplejo) {
    return res.status(404).json({ message: "Estado no encontrado en este complejo" });
  }

  const inicio = new Date(fecha_inicio);
  const abierto = unidad.historial_estado_unidad[0];
  if (abierto && abierto.id_estado === id_estado) {
    return res.status(409).json({ message: "La unidad ya tiene ese estado" });
  }
  if (abierto && new Date(abierto.fecha_inicio) >= inicio) {
    return res.status(400).json({
      message: "fecha_inicio debe ser posterior al inicio del estado actual",
    });
  }

  try {
    const nuevo = await prisma.$transaction(async (tx) => {
      if (abierto) {
        await tx.historial_estado_unidad.update({
          where: { id: abierto.id },
          data: { fecha_fin: inicio },
        });
      }
      const h = await tx.historial_estado_unidad.create({
        data: { id_unidad: req.params.id, id_estado, fecha_inicio: inicio, fecha_fin: null },
      });
      await tx.unidades.update({
        where: { id: req.params.id },
        data: { id_estado_unidad: id_estado },
      });
      return h;
    });
    res.status(201).json(nuevo);
  } catch (e) {
    res.status(400).json({ message: "No se pudo asignar el estado", detail: String(e) });
  }
});

export default router;
