import "dotenv/config";
import { prisma } from "../db/prisma.js";

async function main() {
  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'respuestas_mensajes')
    CREATE TABLE respuestas_mensajes (
      id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_respmsg_id DEFAULT (newid()) CONSTRAINT PK_respuestas_mensajes PRIMARY KEY,
      id_mensaje      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_respmsg_mensaje REFERENCES mensajes(id),
      id_usuario      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_respmsg_usuario REFERENCES usuarios(id),
      nombre_usuario  NVARCHAR(100) NOT NULL,
      texto           NVARCHAR(MAX) NOT NULL,
      created_at      DATETIMEOFFSET NOT NULL CONSTRAINT DF_respmsg_created DEFAULT (sysdatetimeoffset())
    )
  `);

  await prisma.$queryRawUnsafe(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_respmsg_mensaje')
      CREATE INDEX idx_respmsg_mensaje ON respuestas_mensajes(id_mensaje)
  `);

  // Migrate existing single responses to the new table
  await prisma.$queryRawUnsafe(`
    INSERT INTO respuestas_mensajes (id_mensaje, id_usuario, nombre_usuario, texto, created_at)
    SELECT m.id, m.id_usuario, ISNULL(m.respondido_por, 'Administrador'), m.respuesta, ISNULL(m.fecha_respuesta, m.created_at)
    FROM mensajes m
    WHERE m.respuesta IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM respuestas_mensajes r WHERE r.id_mensaje = m.id)
  `);

  console.log("Table respuestas_mensajes created + existing responses migrated");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
