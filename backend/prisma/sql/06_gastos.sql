/* ============================================================================
   Los Pinos Admin — Gastos y presupuestos (Sprint 5)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   Secciones 4.8 (gastos) y 4.9 (presupuestos) del documento, con id_complejo
   para multi-tenant. Categorías semánticas compartidas (mismas que los colores
   cat.* del frontend).
   ============================================================================ */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   4.8  gastos
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.gastos (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_gastos_id DEFAULT (NEWID())
                                      CONSTRAINT PK_gastos PRIMARY KEY,
  id_complejo        UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_gastos_complejo REFERENCES dbo.complejos(id),
  categoria          NVARCHAR(30)     NOT NULL CONSTRAINT CK_gastos_categoria
                       CHECK (categoria IN ('seguridad','limpieza','mantenimiento','servicios','administrativo','extraordinario')),
  descripcion        NVARCHAR(200)    NOT NULL,
  proveedor          NVARCHAR(100)    NULL,
  no_factura         NVARCHAR(60)     NULL,
  monto              DECIMAL(10,2)    NOT NULL CONSTRAINT CK_gastos_monto CHECK (monto > 0),
  fecha              DATE             NOT NULL,
  metodo             NVARCHAR(20)     NULL CONSTRAINT CK_gastos_metodo
                       CHECK (metodo IS NULL OR metodo IN ('transferencia','efectivo','cheque')),
  periodo_mes        DATE             NOT NULL,      -- primer día del mes
  comprobante_url    NVARCHAR(500)    NULL,
  comprobante_nombre NVARCHAR(200)    NULL,
  comprobante_tipo   NVARCHAR(10)     NULL CONSTRAINT CK_gastos_comp
                       CHECK (comprobante_tipo IS NULL OR comprobante_tipo IN ('imagen','pdf')),
  registrado_por     UNIQUEIDENTIFIER NULL CONSTRAINT FK_gastos_usuario REFERENCES dbo.usuarios(id),
  created_at         DATETIMEOFFSET   NOT NULL CONSTRAINT DF_gastos_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE INDEX idx_gastos_complejo ON dbo.gastos(id_complejo);
CREATE INDEX idx_gastos_periodo  ON dbo.gastos(periodo_mes);
CREATE INDEX idx_gastos_categoria ON dbo.gastos(categoria);
GO

/* ---------------------------------------------------------------------------
   4.9  presupuestos  (un monto por complejo + periodo + categoria)
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.presupuestos (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_presupuestos_id DEFAULT (NEWID())
                               CONSTRAINT PK_presupuestos PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_presupuestos_complejo REFERENCES dbo.complejos(id),
  periodo     VARCHAR(7)       NOT NULL,            -- 'YYYY-MM'
  categoria   NVARCHAR(30)     NOT NULL CONSTRAINT CK_presupuestos_categoria
                CHECK (categoria IN ('seguridad','limpieza','mantenimiento','servicios','administrativo','extraordinario')),
  monto       DECIMAL(10,2)    NOT NULL CONSTRAINT CK_presupuestos_monto CHECK (monto >= 0),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_presupuestos_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE UNIQUE INDEX UQ_presupuestos ON dbo.presupuestos(id_complejo, periodo, categoria);
GO

PRINT 'Tablas gastos y presupuestos creadas.';
GO
