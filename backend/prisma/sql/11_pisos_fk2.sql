IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_piso')
  ALTER TABLE dbo.unidades ADD CONSTRAINT FK_unidades_piso FOREIGN KEY (id_piso) REFERENCES dbo.pisos(id);
