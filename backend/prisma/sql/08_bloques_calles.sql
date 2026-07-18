/* ============================================================================
   Los Pinos Admin — Bloques y calles como catálogos + número de propiedad
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   - bloques / calles: catálogos administrables por complejo.
   - unidades: id_bloque / id_calle (FK), numero_propiedad (etiqueta humana).
     `bloque` se ensancha a NVARCHAR(50) y se mantiene denormalizado (= nombre
     del catálogo) para que las lecturas existentes (mapa, dashboard, etc.) no
     cambien. El `id` de la unidad pasa a autogenerarse en la aplicación.
   ============================================================================ */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* 1) Catálogos */
IF OBJECT_ID('dbo.bloques') IS NULL
CREATE TABLE dbo.bloques (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_bloques_id DEFAULT (NEWID()) CONSTRAINT PK_bloques PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_bloques_complejo REFERENCES dbo.complejos(id),
  nombre      NVARCHAR(50)     NOT NULL,
  activo      BIT              NOT NULL CONSTRAINT DF_bloques_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_bloques_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_bloques_nombre')
  CREATE UNIQUE INDEX UQ_bloques_nombre ON dbo.bloques(id_complejo, nombre);
GO

IF OBJECT_ID('dbo.calles') IS NULL
CREATE TABLE dbo.calles (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_calles_id DEFAULT (NEWID()) CONSTRAINT PK_calles PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_calles_complejo REFERENCES dbo.complejos(id),
  nombre      NVARCHAR(150)    NOT NULL,
  activo      BIT              NOT NULL CONSTRAINT DF_calles_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_calles_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_calles_nombre')
  CREATE UNIQUE INDEX UQ_calles_nombre ON dbo.calles(id_complejo, nombre);
GO

/* 2) Ensanchar bloque (CHAR(1) -> NVARCHAR(50)) y nuevas columnas en unidades */
ALTER TABLE dbo.unidades ALTER COLUMN bloque NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.unidades', 'id_bloque')        IS NULL ALTER TABLE dbo.unidades ADD id_bloque        UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('dbo.unidades', 'id_calle')         IS NULL ALTER TABLE dbo.unidades ADD id_calle         UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('dbo.unidades', 'numero_propiedad') IS NULL ALTER TABLE dbo.unidades ADD numero_propiedad NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_bloque')
  ALTER TABLE dbo.unidades ADD CONSTRAINT FK_unidades_bloque FOREIGN KEY (id_bloque) REFERENCES dbo.bloques(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_calle')
  ALTER TABLE dbo.unidades ADD CONSTRAINT FK_unidades_calle FOREIGN KEY (id_calle) REFERENCES dbo.calles(id);
GO

/* 3) Sembrar catálogos desde los datos existentes y enlazar */
INSERT INTO dbo.bloques (id_complejo, nombre)
SELECT DISTINCT u.id_complejo, u.bloque
FROM dbo.unidades u
WHERE u.bloque IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.bloques b WHERE b.id_complejo = u.id_complejo AND b.nombre = u.bloque);

INSERT INTO dbo.calles (id_complejo, nombre)
SELECT DISTINCT u.id_complejo, u.calle
FROM dbo.unidades u
WHERE u.calle IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.calles c WHERE c.id_complejo = u.id_complejo AND c.nombre = u.calle);
GO

UPDATE u SET u.id_bloque = b.id
FROM dbo.unidades u JOIN dbo.bloques b ON b.id_complejo = u.id_complejo AND b.nombre = u.bloque
WHERE u.id_bloque IS NULL;

UPDATE u SET u.id_calle = c.id
FROM dbo.unidades u JOIN dbo.calles c ON c.id_complejo = u.id_complejo AND c.nombre = u.calle
WHERE u.id_calle IS NULL;
GO

-- Para las unidades existentes, usar su id como número de propiedad inicial.
UPDATE dbo.unidades SET numero_propiedad = id WHERE numero_propiedad IS NULL;
GO

PRINT 'Catálogos bloques/calles creados y unidades migradas.';
GO
