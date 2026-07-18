/* ============================================================================
   Los Pinos Admin — Catálogos geográficos + dirección del complejo
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   Copia los catálogos LVD_PAIS / LVD_DEPARTAMENTO / LVD_MUNICIPIO desde la base
   VENTAS (misma instancia) y agrega a `complejos` la ubicación del proyecto
   (país / departamento / municipio). La dirección exacta usa complejos.direccion.

   Jerarquía: LVD_MUNICIPIO -> LVD_DEPARTAMENTO -> LVD_PAIS.
   La info geográfica vive en el COMPLEJO (no se duplica por unidad).
   ============================================================================ */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* 1) Quitar FKs previos de complejos (re-ejecución idempotente) */
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_complejos_municipio')
  ALTER TABLE dbo.complejos DROP CONSTRAINT FK_complejos_municipio;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_complejos_departamento')
  ALTER TABLE dbo.complejos DROP CONSTRAINT FK_complejos_departamento;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_complejos_paisgeo')
  ALTER TABLE dbo.complejos DROP CONSTRAINT FK_complejos_paisgeo;
GO

/* 2) Re-copiar catálogos (orden por dependencias) */
IF OBJECT_ID('dbo.LVD_MUNICIPIO')   IS NOT NULL DROP TABLE dbo.LVD_MUNICIPIO;
IF OBJECT_ID('dbo.LVD_DEPARTAMENTO') IS NOT NULL DROP TABLE dbo.LVD_DEPARTAMENTO;
IF OBJECT_ID('dbo.LVD_PAIS')        IS NOT NULL DROP TABLE dbo.LVD_PAIS;
GO

SELECT * INTO dbo.LVD_PAIS         FROM VENTAS.dbo.LVD_PAIS;
SELECT * INTO dbo.LVD_DEPARTAMENTO FROM VENTAS.dbo.LVD_DEPARTAMENTO;
SELECT * INTO dbo.LVD_MUNICIPIO    FROM VENTAS.dbo.LVD_MUNICIPIO;
GO

/* 3) PKs */
ALTER TABLE dbo.LVD_PAIS         ADD CONSTRAINT PK_LVD_PAIS         PRIMARY KEY (Id);
ALTER TABLE dbo.LVD_DEPARTAMENTO ADD CONSTRAINT PK_LVD_DEPARTAMENTO PRIMARY KEY (Id);
ALTER TABLE dbo.LVD_MUNICIPIO    ADD CONSTRAINT PK_LVD_MUNICIPIO    PRIMARY KEY (Id);
GO

/* 4) FKs entre catálogos (WITH NOCHECK por si hubiera huérfanos en los datos) */
ALTER TABLE dbo.LVD_DEPARTAMENTO WITH NOCHECK
  ADD CONSTRAINT FK_LVD_depto_pais FOREIGN KEY (IdPais) REFERENCES dbo.LVD_PAIS(Id);
ALTER TABLE dbo.LVD_MUNICIPIO WITH NOCHECK
  ADD CONSTRAINT FK_LVD_muni_depto FOREIGN KEY (IdDepartamento) REFERENCES dbo.LVD_DEPARTAMENTO(Id);
GO
CREATE INDEX idx_lvd_depto_pais ON dbo.LVD_DEPARTAMENTO(IdPais);
CREATE INDEX idx_lvd_muni_depto ON dbo.LVD_MUNICIPIO(IdDepartamento);
GO

/* 5) Columnas de ubicación en complejos (la dirección exacta = complejos.direccion) */
IF COL_LENGTH('dbo.complejos', 'id_pais_geo')     IS NULL ALTER TABLE dbo.complejos ADD id_pais_geo     INT NULL;
IF COL_LENGTH('dbo.complejos', 'id_departamento') IS NULL ALTER TABLE dbo.complejos ADD id_departamento INT NULL;
IF COL_LENGTH('dbo.complejos', 'id_municipio')    IS NULL ALTER TABLE dbo.complejos ADD id_municipio    INT NULL;
GO

ALTER TABLE dbo.complejos
  ADD CONSTRAINT FK_complejos_paisgeo       FOREIGN KEY (id_pais_geo)     REFERENCES dbo.LVD_PAIS(Id);
ALTER TABLE dbo.complejos
  ADD CONSTRAINT FK_complejos_departamento  FOREIGN KEY (id_departamento) REFERENCES dbo.LVD_DEPARTAMENTO(Id);
ALTER TABLE dbo.complejos
  ADD CONSTRAINT FK_complejos_municipio     FOREIGN KEY (id_municipio)    REFERENCES dbo.LVD_MUNICIPIO(Id);
GO

PRINT 'Catálogos geográficos copiados y complejos extendido con ubicación.';
GO
