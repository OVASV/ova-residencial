import "dotenv/config";
import { prisma } from "../db/prisma.js";

// Seed de configuración de facturación (estados de unidad + tarifas) en USD.
// Idempotente. Los montos son EDITABLES desde la app (todo administrable).
//
// Montos confirmados por el cliente: Sin construcción $50, En construcción $70.
// Construida / Airbnb quedan como placeholders ajustables.
const ESTADOS = [
  { nombre: "Sin construcción", orden: 1, mantenimiento: 50 },
  { nombre: "En construcción", orden: 2, mantenimiento: 70 },
  { nombre: "Construida", orden: 3, mantenimiento: 70 },
  { nombre: "Airbnb", orden: 4, mantenimiento: 100 },
];

async function main() {
  const complejo = await prisma.complejos.findFirst({
    where: { nombre: "Residencial Los Pinos" },
  });
  if (!complejo) throw new Error("No existe el complejo demo; corre primero seed:auth");
  const idc = complejo.id;

  for (const e of ESTADOS) {
    // Estado (catálogo)
    let estado = await prisma.estados_unidad.findFirst({
      where: { id_complejo: idc, nombre: e.nombre },
    });
    if (!estado) {
      estado = await prisma.estados_unidad.create({
        data: { id_complejo: idc, nombre: e.nombre, orden: e.orden },
      });
    }
    // Tarifa de mantenimiento ligada al estado
    const existe = await prisma.cuotas.findFirst({
      where: { id_complejo: idc, concepto: "Mantenimiento", id_estado_unidad: estado.id },
    });
    if (!existe) {
      await prisma.cuotas.create({
        data: {
          id_complejo: idc,
          concepto: "Mantenimiento",
          monto: e.mantenimiento,
          moneda: "USD",
          tipo: "fijo",
          id_estado_unidad: estado.id,
          periodicidad: "mensual",
          aplica_auto: true,
        },
      });
    }
  }

  // Concepto adicional variable: Agua (aplica a todas, monto se captura al generar)
  const agua = await prisma.cuotas.findFirst({
    where: { id_complejo: idc, concepto: "Agua", id_estado_unidad: null },
  });
  if (!agua) {
    await prisma.cuotas.create({
      data: {
        id_complejo: idc,
        concepto: "Agua",
        monto: 0,
        moneda: "USD",
        tipo: "variable",
        id_estado_unidad: null,
        periodicidad: "mensual",
        aplica_auto: true,
      },
    });
  }

  const estados = await prisma.estados_unidad.findMany({
    where: { id_complejo: idc },
    orderBy: { orden: "asc" },
  });
  const cuotas = await prisma.cuotas.findMany({ where: { id_complejo: idc } });
  console.log(`Seed de facturación aplicado al complejo ${complejo.nombre}:`);
  console.log(`  estados: ${estados.map((e) => e.nombre).join(", ")}`);
  console.log(`  tarifas: ${cuotas.length} (Mantenimiento por estado en USD + Agua variable)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
