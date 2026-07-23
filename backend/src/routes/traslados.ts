import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { estaPeriodoCerrado, periodoDeFecha, PERIODO_CERRADO_MSG } from "../utils/cierres.js";

const router = Router();
const soloAdmin = requireRole("admin", "superadmin");

const r2 = (n: number) => Math.round(n * 100) / 100;

function complejoEscritura(req: Request, res: Response): string | null {
  if (!req.complejoId) {
    res.status(400).json({ message: "Complejo no especificado" });
    return null;
  }
  return req.complejoId;
}

// GET /traslados — pagos asignados a la unidad especial (numero_propiedad=X01) + historial.
router.get("/", async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const unidadEspecial = await prisma.unidades.findFirst({
    where: { id_complejo: idc, numero_propiedad: "X01" },
    select: { id: true },
  });
  const idEspecial = unidadEspecial?.id ?? "__NONE__";

  const [pagosX01, historial, trasladosPorOrigen] = await Promise.all([
    prisma.pagos.findMany({
      where: { id_complejo: idc, id_unidad: idEspecial, estado: { not: "anulado" } },
      orderBy: { created_at: "desc" },
      include: {
        pago_cargos: { include: { cargos: { select: { concepto: true, periodo_mes: true } } } },
      },
    }),
    prisma.traslados_pago.findMany({
      where: {
        pagos: { id_complejo: idc },
      },
      orderBy: { created_at: "desc" },
      include: {
        pagos: { select: { monto_total: true, metodo: true, referencia_banco: true, fecha_pago: true } },
      },
    }),
    prisma.traslados_pago.findMany({
      where: { id_pago_origen: { not: null }, pagos: { id_complejo: idc } },
      orderBy: { created_at: "desc" },
    }),
  ]);

  // Enrich historial + trasladosPorOrigen with unit info
  const allDestIds = [...new Set([
    ...historial.map((t) => t.id_unidad_destino),
    ...trasladosPorOrigen.map((t) => t.id_unidad_destino),
  ])];
  const destUnidades = allDestIds.length > 0
    ? await prisma.unidades.findMany({
        where: { id: { in: allDestIds } },
        select: {
          id: true,
          numero_propiedad: true,
          historial_propietarios: {
            where: { fecha_fin: null },
            include: { propietarios: { select: { nombre: true, apellido: true } } },
            take: 1,
          },
        },
      })
    : [];
  const destMap = new Map(destUnidades.map((u) => [u.id, u]));

  // Group trasladosPorOrigen by id_pago_origen
  const trasladosPorPago = new Map<string, typeof trasladosPorOrigen>();
  for (const t of trasladosPorOrigen) {
    const key = t.id_pago_origen!;
    if (!trasladosPorPago.has(key)) trasladosPorPago.set(key, []);
    trasladosPorPago.get(key)!.push(t);
  }

  res.json({
    pendientes: pagosX01.map((p) => {
      const trs = trasladosPorPago.get(p.id) ?? [];
      // saldo = lo que aún queda en X01 (monto_total ya viene reducido por los
      // traslados parciales). original = saldo + lo ya trasladado.
      const saldo = p.monto_total.toNumber();
      const trasladado = trs.reduce((s, t) => s + t.monto_total.toNumber(), 0);
      const montoOriginal = Math.round((saldo + trasladado) * 100) / 100;
      return {
        id: p.id,
        fecha_pago: p.fecha_pago,
        monto_total: p.monto_total,
        monto_original: montoOriginal,
        saldo,
        metodo: p.metodo,
        banco_origen: p.banco_origen,
        referencia_banco: p.referencia_banco,
        estado: p.estado,
        created_at: p.created_at,
        conceptos: p.pago_cargos.map((pc) => pc.cargos.concepto).join(", ") || null,
        traslados: trs.map((t) => {
          const dest = destMap.get(t.id_unidad_destino);
          const prop = dest?.historial_propietarios[0]?.propietarios;
          return {
            id: t.id,
            fecha: t.fecha_traslado ?? t.created_at, // fecha de auditoría del traslado
            numero_propiedad: dest?.numero_propiedad ?? t.id_unidad_destino,
            propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
            monto: t.monto_total,
          };
        }),
      };
    }),
    historial: historial.map((t) => {
      const dest = destMap.get(t.id_unidad_destino);
      const prop = dest?.historial_propietarios[0]?.propietarios;
      return {
        id: t.id,
        id_pago: t.id_pago,
        id_unidad_destino: t.id_unidad_destino,
        numero_propiedad: dest?.numero_propiedad ?? t.id_unidad_destino,
        propietario: prop ? `${prop.nombre} ${prop.apellido}` : null,
        justificacion: t.justificacion,
        monto_total: t.monto_total,
        realizado_por: t.realizado_por,
        created_at: t.fecha_traslado ?? t.created_at, // fecha de auditoría del traslado
        pago: t.pagos,
      };
    }),
  });
});

// GET /traslados/unidades-destino — lista de unidades activas (excepto la especial) para el selector.
router.get("/unidades-destino", async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  const unidades = await prisma.unidades.findMany({
    where: { id_complejo: idc, activo: true, numero_propiedad: { not: "X01" } },
    select: {
      id: true,
      numero_propiedad: true,
      historial_propietarios: {
        where: { fecha_fin: null },
        include: { propietarios: { select: { nombre: true, apellido: true } } },
        take: 1,
      },
    },
    orderBy: { numero_propiedad: "asc" },
  });

  res.json(
    unidades.map((u) => {
      const p = u.historial_propietarios[0]?.propietarios;
      return {
        id: u.id,
        numero_propiedad: u.numero_propiedad,
        propietario: p ? `${p.nombre} ${p.apellido}` : null,
      };
    })
  );
});

// POST /traslados — trasladar pago de X01 a la unidad destino.
router.post("/", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;

  try {
  const { id_pago, id_unidad_destino, justificacion, aplicaciones, monto_trasladar, fecha_traslado } = req.body ?? {};

  if (!id_pago || !id_unidad_destino || !justificacion?.trim()) {
    return res.status(400).json({ message: "id_pago, id_unidad_destino y justificacion son requeridos" });
  }

  const pago = await prisma.pagos.findUnique({
    where: { id: id_pago },
    include: { pago_cargos: { include: { cargos: true } } },
  });

  if (!pago || pago.id_complejo !== idc) {
    return res.status(404).json({ message: "Pago no encontrado" });
  }

  const unidadEspecialPost = await prisma.unidades.findFirst({
    where: { id_complejo: idc, numero_propiedad: "X01" },
    select: { id: true },
  });
  if (!unidadEspecialPost || pago.id_unidad !== unidadEspecialPost.id) {
    return res.status(400).json({ message: "El pago no está asignado a la unidad especial (X01)" });
  }
  if (pago.estado === "anulado") {
    return res.status(400).json({ message: "No se puede trasladar un pago anulado" });
  }

  const destino = await prisma.unidades.findUnique({ where: { id: id_unidad_destino } });
  if (!destino || destino.id_complejo !== idc) {
    return res.status(404).json({ message: "Unidad destino no encontrada" });
  }

  const montoTotal = pago.monto_total.toNumber();
  const montoTrasladar = monto_trasladar != null ? r2(Number(monto_trasladar)) : montoTotal;

  if (!Number.isFinite(montoTrasladar) || montoTrasladar <= 0) {
    return res.status(400).json({ message: "monto_trasladar debe ser mayor a 0" });
  }
  if (montoTrasladar > montoTotal + 0.001) {
    return res.status(400).json({ message: "monto_trasladar excede el monto del pago" });
  }

  // La fecha de pago aplicada al destino es SIEMPRE la fecha original del
  // movimiento (no es culpa del propietario que se aplicara tarde).
  const fechaPago = pago.fecha_pago;
  // `fecha_traslado` es solo la fecha de AUDITORÍA (cuándo se procesó el
  // traslado). Por defecto, hoy; el usuario puede indicar otra.
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  let fechaAuditoria = new Date();
  if (fecha_traslado) {
    const ft = new Date(fecha_traslado);
    if (isNaN(ft.getTime())) return res.status(400).json({ message: "fecha_traslado inválida" });
    if (ft < fechaPago) return res.status(400).json({ message: "la fecha de auditoría debe ser mayor o igual a la fecha del pago" });
    if (ft > hoy) return res.status(400).json({ message: "la fecha de auditoría no puede ser futura" });
    fechaAuditoria = ft;
  }

  const esParcial = montoTrasladar < montoTotal - 0.001;

  // Validate aplicaciones if provided
  let detalle: { id_cargo: string; monto: number; saldoActual: number }[] = [];
  if (Array.isArray(aplicaciones) && aplicaciones.length > 0) {
    const ids = aplicaciones.map((a: { id_cargo: string }) => a.id_cargo);
    const cargos = await prisma.cargos.findMany({ where: { id: { in: ids } } });
    const porId = new Map(cargos.map((c) => [c.id, c]));

    for (const a of aplicaciones as { id_cargo: string; monto_aplicado?: number }[]) {
      const cargo = porId.get(a.id_cargo);
      if (!cargo || cargo.id_complejo !== idc || cargo.id_unidad !== id_unidad_destino) {
        return res.status(400).json({ message: `Cargo inválido: ${a.id_cargo}` });
      }
      const saldoActual = cargo.saldo.toNumber();
      const monto = a.monto_aplicado != null ? Number(a.monto_aplicado) : saldoActual;
      if (!Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({ message: `monto_aplicado inválido para ${a.id_cargo}` });
      }
      if (monto > saldoActual + 0.001) {
        return res.status(400).json({ message: `monto excede saldo del cargo ${a.id_cargo}` });
      }
      detalle.push({ id_cargo: cargo.id, monto: r2(monto), saldoActual });
    }
  }

  await prisma.$transaction(async (tx) => {
    // Reverse old pago_cargos from X01
    for (const pc of pago.pago_cargos) {
      const cargo = pc.cargos;
      const restaurado = r2(cargo.saldo.toNumber() + pc.monto_aplicado.toNumber());
      await tx.cargos.update({
        where: { id: cargo.id },
        data: { saldo: restaurado, estado: restaurado >= cargo.monto.toNumber() ? "pendiente" : "parcial" },
      });
    }
    await tx.pago_cargos.deleteMany({ where: { id_pago: pago.id } });

    if (esParcial) {
      // Partial: reduce original payment and create new one for destination
      await tx.pagos.update({
        where: { id: pago.id },
        data: { monto_total: r2(montoTotal - montoTrasladar) },
      });

      const nuevoPago = await tx.pagos.create({
        data: {
          id_complejo: idc,
          id_unidad: id_unidad_destino,
          fecha_pago: fechaPago, // fecha ORIGINAL del movimiento
          monto_total: montoTrasladar,
          metodo: pago.metodo,
          banco_origen: pago.banco_origen,
          referencia_banco: pago.referencia_banco,
          estado: "registrado",
          registrado_por: req.user?.sub ?? null,
        },
      });

      // Apply to cargos on the new payment
      for (const d of detalle) {
        await tx.pago_cargos.create({
          data: { id_pago: nuevoPago.id, id_cargo: d.id_cargo, monto_aplicado: d.monto },
        });
        const nuevoSaldo = r2(d.saldoActual - d.monto);
        await tx.cargos.update({
          where: { id: d.id_cargo },
          data: { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagado" : "parcial" },
        });
      }

      await tx.traslados_pago.create({
        data: {
          id_pago: nuevoPago.id,
          id_pago_origen: pago.id,
          id_unidad_origen: unidadEspecialPost.id,
          id_unidad_destino,
          justificacion: justificacion.trim(),
          monto_total: montoTrasladar,
          fecha_traslado: fechaAuditoria,
          realizado_por: req.user?.sub ?? null,
        },
      });
    } else {
      // Full transfer: reassign the payment
      await tx.pagos.update({ where: { id: pago.id }, data: { id_unidad: id_unidad_destino } });

      for (const d of detalle) {
        await tx.pago_cargos.create({
          data: { id_pago: pago.id, id_cargo: d.id_cargo, monto_aplicado: d.monto },
        });
        const nuevoSaldo = r2(d.saldoActual - d.monto);
        await tx.cargos.update({
          where: { id: d.id_cargo },
          data: { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagado" : "parcial" },
        });
      }

      await tx.traslados_pago.create({
        data: {
          id_pago: pago.id,
          id_pago_origen: pago.id,
          id_unidad_origen: unidadEspecialPost.id,
          id_unidad_destino,
          justificacion: justificacion.trim(),
          monto_total: montoTrasladar,
          fecha_traslado: fechaAuditoria,
          realizado_por: req.user?.sub ?? null,
        },
      });
    }
  });

  res.status(201).json({ message: "Pago trasladado exitosamente", id_pago, id_unidad_destino, monto: montoTrasladar });
  } catch (err: any) {
    console.error("Error en traslado:", err);
    res.status(500).json({ message: err.message ?? "Error interno al trasladar" });
  }
});

// POST /traslados/:id/revertir — deshace un traslado: el dinero regresa a X01
// y se restauran los cargos del destino. Bloqueado si el mes del pago está cerrado.
router.post("/:id/revertir", soloAdmin, async (req, res) => {
  const idc = complejoEscritura(req, res);
  if (!idc) return;
  try {
    const traslado = await prisma.traslados_pago.findUnique({
      where: { id: req.params.id },
      include: { pagos: { include: { pago_cargos: { include: { cargos: true } } } } },
    });
    if (!traslado || traslado.pagos.id_complejo !== idc) {
      return res.status(404).json({ message: "Traslado no encontrado" });
    }
    const destino = traslado.pagos; // pago del destino (o el reasignado en traslado total)
    if (await estaPeriodoCerrado(idc, periodoDeFecha(destino.fecha_pago))) {
      return res.status(403).json({ message: PERIODO_CERRADO_MSG });
    }
    // Parcial: se creó un pago nuevo en el destino. Total: se reasignó el mismo pago.
    const esParcial = traslado.id_pago_origen != null && traslado.id_pago_origen !== traslado.id_pago;

    await prisma.$transaction(async (tx) => {
      // Restaurar los cargos que el pago del destino había saldado.
      for (const pc of destino.pago_cargos) {
        const cargo = pc.cargos;
        const restaurado = r2(cargo.saldo.toNumber() + pc.monto_aplicado.toNumber());
        await tx.cargos.update({
          where: { id: cargo.id },
          data: { saldo: restaurado, estado: restaurado >= cargo.monto.toNumber() ? "pendiente" : "parcial" },
        });
      }
      await tx.pago_cargos.deleteMany({ where: { id_pago: destino.id } });

      if (esParcial) {
        // Devolver el monto al depósito de X01 y eliminar el pago del destino.
        await tx.pagos.update({
          where: { id: traslado.id_pago_origen! },
          data: { monto_total: { increment: traslado.monto_total } },
        });
        await tx.traslados_pago.delete({ where: { id: traslado.id } }); // FK -> antes de borrar el pago
        await tx.pagos.delete({ where: { id: destino.id } });
      } else {
        // Traslado total: reasignar el pago de vuelta a X01 (especiales).
        await tx.pagos.update({ where: { id: destino.id }, data: { id_unidad: traslado.id_unidad_origen } });
        await tx.traslados_pago.delete({ where: { id: traslado.id } });
      }
    });

    res.json({ message: "Traslado revertido: el monto regresó a especiales (X01)" });
  } catch (err: any) {
    console.error("Error al revertir traslado:", err);
    res.status(500).json({ message: err.message ?? "Error al revertir el traslado" });
  }
});

export default router;
