IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.unidades') AND name = 'id_piso')
  ALTER TABLE dbo.unidades ADD id_piso UNIQUEIDENTIFIER NULL;
