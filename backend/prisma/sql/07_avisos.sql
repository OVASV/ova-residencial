/* ============================================================================
   Los Pinos Admin — Avisos (Sprint 6)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   Sección 4.10 del documento, con id_complejo. El despacho real por
   email/WhatsApp requiere integración externa (pendiente de credenciales);
   esta tabla registra el aviso, sus destinatarios y métricas.
   ============================================================================ */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

CREATE TABLE dbo.avisos (
  id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_avisos_id DEFAULT (NEWID())
                                    CONSTRAINT PK_avisos PRIMARY KEY,
  id_complejo      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_avisos_complejo REFERENCES dbo.complejos(id),
  tipo             NVARCHAR(30)     NOT NULL CONSTRAINT CK_avisos_tipo
                     CHECK (tipo IN ('recordatorio_pago','aviso_mora','mantenimiento','reunion','general')),
  asunto           NVARCHAR(200)    NULL,
  mensaje          NVARCHAR(MAX)    NOT NULL,
  canal            NVARCHAR(20)     NOT NULL CONSTRAINT CK_avisos_canal
                     CHECK (canal IN ('whatsapp','email','ambos')),
  destinatarios    NVARCHAR(MAX)    NULL CONSTRAINT CK_avisos_dest_json
                     CHECK (destinatarios IS NULL OR ISJSON(destinatarios) = 1),  -- [{id_unidad,nombre,contacto,...}]
  total_envios     INT              NOT NULL CONSTRAINT DF_avisos_envios DEFAULT (0),
  total_entregados INT              NOT NULL CONSTRAINT DF_avisos_entregados DEFAULT (0),
  total_abiertos   INT              NOT NULL CONSTRAINT DF_avisos_abiertos DEFAULT (0),
  estado           NVARCHAR(20)     NOT NULL CONSTRAINT DF_avisos_estado DEFAULT ('borrador')
                     CONSTRAINT CK_avisos_estado CHECK (estado IN ('borrador','programado','enviado','cancelado')),
  programado_at    DATETIMEOFFSET   NULL,
  enviado_at       DATETIMEOFFSET   NULL,
  creado_por       UNIQUEIDENTIFIER NULL CONSTRAINT FK_avisos_usuario REFERENCES dbo.usuarios(id),
  created_at       DATETIMEOFFSET   NOT NULL CONSTRAINT DF_avisos_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE INDEX idx_avisos_complejo ON dbo.avisos(id_complejo);
CREATE INDEX idx_avisos_estado   ON dbo.avisos(estado);
GO

PRINT 'Tabla avisos creada.';
GO
