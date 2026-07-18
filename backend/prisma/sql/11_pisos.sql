-- Catálogo de pisos (niveles) del complejo
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pisos')
CREATE TABLE dbo.pisos (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pisos_id DEFAULT (NEWID()) CONSTRAINT PK_pisos PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pisos_complejo REFERENCES dbo.complejos(id),
  nombre      NVARCHAR(50)     NOT NULL,
  activo      BIT              NOT NULL CONSTRAINT DF_pisos_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_pisos_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_pisos_nombre')
  CREATE UNIQUE INDEX UQ_pisos_nombre ON dbo.pisos(id_complejo, nombre);
GO

-- FK en unidades
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.unidades') AND name = 'id_piso')
  ALTER TABLE dbo.unidades ADD id_piso UNIQUEIDENTIFIER NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_piso')
  ALTER TABLE dbo.unidades ADD CONSTRAINT FK_unidades_piso FOREIGN KEY (id_piso) REFERENCES dbo.pisos(id);
GO
