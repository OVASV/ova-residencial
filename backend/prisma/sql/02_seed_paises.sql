/* ============================================================================
   Seed inicial de paises (seccion 4.1 del documento).
   Idempotente: solo inserta paises que aun no existen.
   ============================================================================ */
SET NOCOUNT ON;
GO

MERGE dbo.paises AS dst
USING (VALUES
  (320, 'GT', 'GTM', N'Guatemala',      N'Guatemala',     1),
  (222, 'SV', 'SLV', N'El Salvador',    N'El Salvador',   1),
  (484, 'MX', 'MEX', N'México',         N'Mexico',        1),
  (840, 'US', 'USA', N'Estados Unidos', N'United States', 1),
  (724, 'ES', 'ESP', N'España',         N'Spain',         1),
  (170, 'CO', 'COL', N'Colombia',       N'Colombia',      1),
  (152, 'CL', 'CHL', N'Chile',          N'Chile',         1),
  ( 32, 'AR', 'ARG', N'Argentina',      N'Argentina',     1),
  ( 76, 'BR', 'BRA', N'Brasil',         N'Brazil',        1),
  (124, 'CA', 'CAN', N'Canadá',         N'Canada',        1)
) AS src (id, codigo_iso2, codigo_iso3, nombre, nombre_en, activo)
  ON dst.id = src.id
WHEN NOT MATCHED BY TARGET THEN
  INSERT (id, codigo_iso2, codigo_iso3, nombre, nombre_en, activo)
  VALUES (src.id, src.codigo_iso2, src.codigo_iso3, src.nombre, src.nombre_en, src.activo);
GO

PRINT 'Seed de paises aplicado.';
GO
