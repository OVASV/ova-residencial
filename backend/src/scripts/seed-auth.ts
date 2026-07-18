import "dotenv/config";
import { prisma } from "../db/prisma.js";
import { hashPassword } from "../auth/password.js";

// Seed de usuarios iniciales + un complejo demo, para poder probar el login.
// Contraseña de desarrollo: admin123  (cambiar en producción).
async function main() {
  const passwordHash = await hashPassword("admin123");

  // 1) Superadmin (sin complejo asignado)
  await prisma.usuarios.upsert({
    where: { email: "superadmin@lospinos.gt" },
    update: {},
    create: {
      nombre: "Super Admin",
      email: "superadmin@lospinos.gt",
      password_hash: passwordHash,
      rol: "superadmin",
      id_complejo: null,
    },
  });

  // 2) Complejo demo
  let complejo = await prisma.complejos.findFirst({
    where: { nombre: "Residencial Los Pinos" },
  });
  if (!complejo) {
    complejo = await prisma.complejos.create({
      data: { nombre: "Residencial Los Pinos", ciudad: "Guatemala", id_pais: 320 },
    });
  }

  // 3) Admin del complejo
  await prisma.usuarios.upsert({
    where: { email: "admin@lospinos.gt" },
    update: {},
    create: {
      nombre: "Administrador Los Pinos",
      email: "admin@lospinos.gt",
      password_hash: passwordHash,
      rol: "admin",
      id_complejo: complejo.id,
    },
  });

  // 4) Usuario junta directiva
  await prisma.usuarios.upsert({
    where: { email: "directiva@lospinos.gt" },
    update: {},
    create: {
      nombre: "Junta Directiva",
      email: "directiva@lospinos.gt",
      password_hash: passwordHash,
      rol: "directiva",
      id_complejo: complejo.id,
    },
  });

  console.log("Seed de auth aplicado:");
  console.log("  • superadmin@lospinos.gt / admin123  (superadmin, vista global)");
  console.log(`  • admin@lospinos.gt / admin123        (admin, complejo ${complejo.id})`);
  console.log(`  • directiva@lospinos.gt / admin123    (directiva, complejo ${complejo.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
