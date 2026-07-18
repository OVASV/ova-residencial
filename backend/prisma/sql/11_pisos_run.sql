IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pisos')
CREATE TABLE dbo.pisos (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pisos_id DEFAULT (NEWID()) CONSTRAINT PK_pisos PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pisos_complejo REFERENCES dbo.complejos(id),
  nombre      NVARCHAR(50)     NOT NULL,
  activo      BIT              NOT NULL CONSTRAINT DF_pisos_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_pisos_created DEFAULT (SYSDATETIMEOFFSET())
);
