IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_pisos_nombre')
  CREATE UNIQUE INDEX UQ_pisos_nombre ON dbo.pisos(id_complejo, nombre);
