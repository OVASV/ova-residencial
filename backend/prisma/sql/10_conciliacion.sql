/* ============================================================================
   Los Pinos Admin — Esquema de conciliación bancaria (Sprint 4)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   - conciliaciones      : una conciliación por período/banco (borrador→confirmada).
   - conciliacion_lineas : movimientos del archivo del banco + su tipo de match.
   - pagos += id_conciliacion : marca qué conciliación saldó cada pago.

   Tipos de match de una línea (sección 7.2):
     conciliado      : monto + (referencia o período) coinciden con un pago.
     diferencia      : coincide por referencia pero el monto difiere.
     sin_match_banco : movimiento del banco sin pago en el sistema.
   El caso 'sin_match_sistema' (pago sin movimiento) se calcula en consulta.
   ============================================================================ */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

CREATE TABLE dbo.conciliaciones (
  id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_concil_id DEFAULT (NEWID())
                                  CONSTRAINT PK_conciliaciones PRIMARY KEY,
  id_complejo    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_concil_complejo REFERENCES dbo.complejos(id),
  periodo        VARCHAR(7)       NOT NULL,                 -- 'YYYY-MM'
  banco          NVARCHAR(80)     NULL,
  archivo_nombre NVARCHAR(200)    NULL,
  fecha          DATE             NOT NULL CONSTRAINT DF_concil_fecha DEFAULT (CAST(SYSDATETIME() AS DATE)),
  estado         NVARCHAR(20)     NOT NULL CONSTRAINT DF_concil_estado DEFAULT ('borrador')
                                  CONSTRAINT CK_concil_estado CHECK (estado IN ('borrador','en_revision','confirmada','anulada')),
  total_banco    DECIMAL(12,2)    NULL,
  total_sistema  DECIMAL(12,2)    NULL,
  confirmado_por UNIQUEIDENTIFIER NULL CONSTRAINT FK_concil_usuario REFERENCES dbo.usuarios(id),
  confirmado_at  DATETIMEOFFSET   NULL,
  created_at     DATETIMEOFFSET   NOT NULL CONSTRAINT DF_concil_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE INDEX idx_concil_complejo ON dbo.conciliaciones(id_complejo);
GO

CREATE TABLE dbo.conciliacion_lineas (
  id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_cline_id DEFAULT (NEWID())
                                   CONSTRAINT PK_conciliacion_lineas PRIMARY KEY,
  id_conciliacion UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_cline_concil REFERENCES dbo.conciliaciones(id) ON DELETE CASCADE,
  id_complejo     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_cline_complejo REFERENCES dbo.complejos(id),
  fecha_mov       DATE             NULL,
  monto           DECIMAL(12,2)    NOT NULL,
  referencia      NVARCHAR(100)    NULL,
  descripcion     NVARCHAR(300)    NULL,
  tipo_match      NVARCHAR(20)     NOT NULL CONSTRAINT DF_cline_match DEFAULT ('sin_match_banco')
                                   CONSTRAINT CK_cline_match CHECK (tipo_match IN ('conciliado','diferencia','sin_match_banco')),
  id_pago         UNIQUEIDENTIFIER NULL CONSTRAINT FK_cline_pago REFERENCES dbo.pagos(id),
  created_at      DATETIMEOFFSET   NOT NULL CONSTRAINT DF_cline_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE INDEX idx_cline_concil ON dbo.conciliacion_lineas(id_conciliacion);
GO

-- pagos += id_conciliacion (qué conciliación confirmó el pago)
ALTER TABLE dbo.pagos
  ADD id_conciliacion UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_pagos_conciliacion REFERENCES dbo.conciliaciones(id);
GO

PRINT 'Esquema de conciliación creado correctamente.';
GO
