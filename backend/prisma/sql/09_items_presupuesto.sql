/* ============================================================================
   Los Pinos Admin — Items de presupuesto (descripción por línea)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   El presupuesto pasa de ser por categoría a ser por ITEM (línea con descripción),
   administrable desde Configuración. Cada item pertenece a una categoría (para la
   comparación vs gastos, que sigue siendo por categoría).

   - items_presupuesto: catálogo por complejo (categoria + nombre/descripción).
   - presupuestos: + id_item (FK) + descripcion (denormalizada). Se conserva
     `categoria` (denormalizada del item) para no cambiar la comparación.
   ============================================================================ */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* 1) Catálogo de items */
IF OBJECT_ID('dbo.items_presupuesto') IS NULL
CREATE TABLE dbo.items_presupuesto (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_items_presup_id DEFAULT (NEWID())
                               CONSTRAINT PK_items_presupuesto PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_items_presup_complejo REFERENCES dbo.complejos(id),
  categoria   NVARCHAR(30)     NOT NULL CONSTRAINT CK_items_presup_categoria
                CHECK (categoria IN ('seguridad','limpieza','mantenimiento','servicios','administrativo','extraordinario')),
  nombre      NVARCHAR(150)    NOT NULL,           -- descripción del item
  orden       SMALLINT         NOT NULL CONSTRAINT DF_items_presup_orden DEFAULT (0),
  activo      BIT              NOT NULL CONSTRAINT DF_items_presup_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_items_presup_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_items_presupuesto')
  CREATE UNIQUE INDEX UQ_items_presupuesto ON dbo.items_presupuesto(id_complejo, categoria, nombre);
GO

/* 2) Columnas en presupuestos */
IF COL_LENGTH('dbo.presupuestos', 'id_item')     IS NULL ALTER TABLE dbo.presupuestos ADD id_item     UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('dbo.presupuestos', 'descripcion') IS NULL ALTER TABLE dbo.presupuestos ADD descripcion NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_presupuestos_item')
  ALTER TABLE dbo.presupuestos ADD CONSTRAINT FK_presupuestos_item FOREIGN KEY (id_item) REFERENCES dbo.items_presupuesto(id);
GO

/* 3) Migrar presupuestos existentes a un item 'General' por categoría */
INSERT INTO dbo.items_presupuesto (id_complejo, categoria, nombre)
SELECT DISTINCT p.id_complejo, p.categoria, N'General'
FROM dbo.presupuestos p
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.items_presupuesto i
  WHERE i.id_complejo = p.id_complejo AND i.categoria = p.categoria AND i.nombre = N'General'
);
GO
UPDATE p SET p.id_item = i.id, p.descripcion = i.nombre
FROM dbo.presupuestos p
JOIN dbo.items_presupuesto i ON i.id_complejo = p.id_complejo AND i.categoria = p.categoria AND i.nombre = N'General'
WHERE p.id_item IS NULL;
GO

/* 4) Reemplazar el índice único (ahora por item, no por categoría) */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_presupuestos')
  DROP INDEX UQ_presupuestos ON dbo.presupuestos;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_presupuestos_item')
  CREATE UNIQUE INDEX UQ_presupuestos_item ON dbo.presupuestos(id_complejo, periodo, id_item) WHERE id_item IS NOT NULL;
GO

PRINT 'Items de presupuesto creados y presupuestos migrados.';
GO
