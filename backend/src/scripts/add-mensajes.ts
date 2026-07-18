import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  // Add id_propietario column to usuarios
  await prisma.$queryRawUnsafe(`
    IF COL_LENGTH('usuarios', 'id_propietario') IS NULL
      ALTER TABLE usuarios ADD id_propietario UNIQUEIDENTIFIER NULL
  `);

  // Add FK
  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_usuarios_propietario')
      ALTER TABLE usuarios ADD CONSTRAINT FK_usuarios_propietario
        FOREIGN KEY (id_propietario) REFERENCES propietarios(id)
  `);

  // Update CHECK constraint for rol
  await prisma.$queryRawUnsafe(`ALTER TABLE usuarios DROP CONSTRAINT CK_usuarios_rol`);
  await prisma.$queryRawUnsafe(`ALTER TABLE usuarios ADD CONSTRAINT CK_usuarios_rol CHECK (rol IN ('superadmin','admin','lectura','directiva','propietario'))`);

  // Create mensajes table
  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'mensajes')
    CREATE TABLE mensajes (
      id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_mensajes_id DEFAULT (newid()) CONSTRAINT PK_mensajes PRIMARY KEY,
      id_complejo     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_mensajes_complejo REFERENCES complejos(id),
      id_usuario      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_mensajes_usuario REFERENCES usuarios(id),
      id_unidad       VARCHAR(10) NULL CONSTRAINT FK_mensajes_unidad REFERENCES unidades(id),
      asunto          NVARCHAR(200) NOT NULL,
      mensaje         NVARCHAR(MAX) NOT NULL,
      respuesta       NVARCHAR(MAX) NULL,
      estado          NVARCHAR(20) NOT NULL CONSTRAINT DF_mensajes_estado DEFAULT ('pendiente'),
      fecha_respuesta DATETIMEOFFSET NULL,
      created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_mensajes_created DEFAULT (sysdatetimeoffset())
    )
  `);

  // Indexes
  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_mensajes_complejo')
      CREATE INDEX idx_mensajes_complejo ON mensajes(id_complejo)
  `);
  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_mensajes_usuario')
      CREATE INDEX idx_mensajes_usuario ON mensajes(id_usuario)
  `);

  console.log("Migration applied: id_propietario + mensajes table + propietario role");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
