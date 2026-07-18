/* ============================================================================
   Los Pinos Admin — Campo `calle` en unidades
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   La calle es propia de cada unidad/lote (dentro del complejo). Se exige en los
   formularios; en BD queda NULL para no romper filas existentes.
   ============================================================================ */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

IF COL_LENGTH('dbo.unidades', 'calle') IS NULL
  ALTER TABLE dbo.unidades ADD calle NVARCHAR(150) NULL;
GO

PRINT 'Columna unidades.calle lista.';
GO
