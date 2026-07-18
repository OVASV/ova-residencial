/* ============================================================================
   Los Pinos Admin — Esquema base (Sprint 1)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   Traducción fiel del esquema del documento de especificaciones (PostgreSQL)
   al dialecto T-SQL de SQL Server. Equivalencias aplicadas:

     UUID + gen_random_uuid()   -> UNIQUEIDENTIFIER + DEFAULT NEWID()
     BOOLEAN / TRUE             -> BIT / 1
     TIMESTAMPTZ + NOW()        -> DATETIMEOFFSET + SYSDATETIMEOFFSET()
     DATE + CURRENT_DATE        -> DATE + CAST(SYSDATETIME() AS DATE)
     TEXT                       -> NVARCHAR(MAX)
     VARCHAR(n) (texto humano)  -> NVARCHAR(n)   (soporte unicode/acentos)
     JSONB                      -> NVARCHAR(MAX) + CHECK ISJSON(...) = 1
     UNIQUE sobre col nullable  -> indice unico filtrado WHERE col IS NOT NULL
                                   (replica la semantica PG de multiples NULL)
     EXCLUDE USING gist (daterange &&)
                                -> indice unico filtrado (un propietario activo)
                                   + trigger de no-solapamiento de rangos

   Columnas con DEFAULT del documento se declaran NOT NULL (siempre reciben
   el valor por defecto): activo, created_at, updated_at, fecha_registro, rol.

   Orden de creacion segun dependencias de FK:
     paises -> complejos -> propietarios -> unidades
            -> historial_propietarios -> usuarios
   ============================================================================ */

-- ANSI_NULLS + QUOTED_IDENTIFIER deben estar ON para indices filtrados y triggers.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   4.1  paises
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.paises (
  id          SMALLINT      NOT NULL CONSTRAINT PK_paises PRIMARY KEY,   -- ISO 3166-1 numerico
  codigo_iso2 CHAR(2)       NOT NULL CONSTRAINT UQ_paises_iso2 UNIQUE,
  codigo_iso3 CHAR(3)       NOT NULL CONSTRAINT UQ_paises_iso3 UNIQUE,
  nombre      NVARCHAR(100) NOT NULL,
  nombre_en   NVARCHAR(100) NULL,
  activo      BIT           NOT NULL CONSTRAINT DF_paises_activo DEFAULT (1)
);
GO

/* ---------------------------------------------------------------------------
   13.1  complejos  (multi-complejo / multi-tenant)
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.complejos (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_complejos_id DEFAULT (NEWID())
                               CONSTRAINT PK_complejos PRIMARY KEY,
  nombre      NVARCHAR(100)    NOT NULL,
  direccion   NVARCHAR(MAX)    NULL,
  ciudad      NVARCHAR(80)     NULL,
  id_pais     SMALLINT         NULL CONSTRAINT FK_complejos_pais REFERENCES dbo.paises(id),
  activo      BIT              NOT NULL CONSTRAINT DF_complejos_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_complejos_created DEFAULT (SYSDATETIMEOFFSET())
);
GO

/* ---------------------------------------------------------------------------
   4.2 + 13.1  propietarios
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.propietarios (
  id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_propietarios_id DEFAULT (NEWID())
                                  CONSTRAINT PK_propietarios PRIMARY KEY,
  id_complejo    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_propietarios_complejo REFERENCES dbo.complejos(id),
  id_pais        SMALLINT         NULL CONSTRAINT FK_propietarios_pais REFERENCES dbo.paises(id),
  nombre         NVARCHAR(80)     NOT NULL,
  apellido       NVARCHAR(80)     NOT NULL,
  dpi_nit        NVARCHAR(30)     NULL,
  telefono       NVARCHAR(20)     NULL,
  email          NVARCHAR(120)    NULL,
  direccion      NVARCHAR(MAX)    NULL,
  fecha_registro DATE             NOT NULL CONSTRAINT DF_propietarios_fechareg DEFAULT (CAST(SYSDATETIME() AS DATE)),
  activo         BIT              NOT NULL CONSTRAINT DF_propietarios_activo DEFAULT (1),
  created_at     DATETIMEOFFSET   NOT NULL CONSTRAINT DF_propietarios_created DEFAULT (SYSDATETIMEOFFSET()),
  updated_at     DATETIMEOFFSET   NOT NULL CONSTRAINT DF_propietarios_updated DEFAULT (SYSDATETIMEOFFSET())
);
GO
-- UNIQUE sobre columnas nullable -> indice unico filtrado (permite multiples NULL)
CREATE UNIQUE INDEX UQ_propietarios_dpinit ON dbo.propietarios(dpi_nit) WHERE dpi_nit IS NOT NULL;
CREATE UNIQUE INDEX UQ_propietarios_email  ON dbo.propietarios(email)   WHERE email   IS NOT NULL;
CREATE INDEX idx_propietarios_complejo     ON dbo.propietarios(id_complejo);
GO

/* ---------------------------------------------------------------------------
   4.3 + 13.1  unidades
   Nota: NO tiene id_propietario. El propietario actual se obtiene desde
         historial_propietarios con fecha_fin IS NULL.
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.unidades (
  id          VARCHAR(10)      NOT NULL CONSTRAINT PK_unidades PRIMARY KEY,  -- Ej: 'A-01', 'B-03'
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_unidades_complejo REFERENCES dbo.complejos(id),
  bloque      CHAR(1)          NOT NULL,
  area_m2     DECIMAL(6,2)     NULL,
  num_piso    SMALLINT         NULL,
  lat         DECIMAL(10,7)    NULL,                 -- coordenada GPS latitud
  lng         DECIMAL(10,7)    NULL,                 -- coordenada GPS longitud
  poligono    NVARCHAR(MAX)    NULL CONSTRAINT CK_unidades_poligono_json
                                    CHECK (poligono IS NULL OR ISJSON(poligono) = 1),  -- [[lat,lng],...]
  activo      BIT              NOT NULL CONSTRAINT DF_unidades_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_unidades_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE INDEX idx_unidades_complejo ON dbo.unidades(id_complejo);
GO

/* ---------------------------------------------------------------------------
   4.4  historial_propietarios
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.historial_propietarios (
  id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_historial_id DEFAULT (NEWID())
                                  CONSTRAINT PK_historial PRIMARY KEY,
  id_unidad      VARCHAR(10)      NOT NULL CONSTRAINT FK_historial_unidad REFERENCES dbo.unidades(id),
  id_propietario UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_historial_propietario REFERENCES dbo.propietarios(id),
  fecha_inicio   DATE             NOT NULL,
  fecha_fin      DATE             NULL,            -- NULL = propietario actual
  motivo         NVARCHAR(60)     NULL,            -- 'compra', 'herencia', 'donacion', etc.
  created_at     DATETIMEOFFSET   NOT NULL CONSTRAINT DF_historial_created DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT CK_historial_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
GO
-- Un solo propietario activo por unidad (fecha_fin IS NULL) + indice de consulta rapida.
-- Reemplaza la parte "una unidad = un propietario actual" del EXCLUDE de PostgreSQL.
CREATE UNIQUE INDEX UQ_hist_prop_activo ON dbo.historial_propietarios(id_unidad) WHERE fecha_fin IS NULL;
GO

-- No-solapamiento de rangos de propiedad por unidad.
-- Replica EXCLUDE USING gist (id_unidad =, daterange(fecha_inicio, fecha_fin, '[)') &&).
-- Semantica half-open [inicio, fin): se solapan si a.inicio < b.fin AND b.inicio < a.fin,
-- tratando fecha_fin NULL como infinito (9999-12-31).
CREATE OR ALTER TRIGGER dbo.TR_historial_no_overlap
ON dbo.historial_propietarios
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM dbo.historial_propietarios h
    JOIN inserted i
      ON  i.id_unidad = h.id_unidad
      AND i.id <> h.id
    WHERE i.fecha_inicio < COALESCE(h.fecha_fin, '9999-12-31')
      AND h.fecha_inicio < COALESCE(i.fecha_fin, '9999-12-31')
  )
  BEGIN
    RAISERROR('Solapamiento de rangos de propiedad para la misma unidad (no_overlap).', 16, 1);
    ROLLBACK TRANSACTION;
  END
END;
GO

/* ---------------------------------------------------------------------------
   4.11 + 13.2  usuarios
   id_complejo: NULL para superadmin, requerido para admin / lectura.
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.usuarios (
  id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_usuarios_id DEFAULT (NEWID())
                                 CONSTRAINT PK_usuarios PRIMARY KEY,
  id_complejo   UNIQUEIDENTIFIER NULL CONSTRAINT FK_usuarios_complejo REFERENCES dbo.complejos(id),
  nombre        NVARCHAR(100)    NOT NULL,
  email         NVARCHAR(120)    NOT NULL CONSTRAINT UQ_usuarios_email UNIQUE,
  password_hash NVARCHAR(MAX)    NOT NULL,
  rol           NVARCHAR(20)     NOT NULL CONSTRAINT DF_usuarios_rol DEFAULT ('admin')
                                 CONSTRAINT CK_usuarios_rol CHECK (rol IN ('superadmin','admin','lectura')),
  activo        BIT              NOT NULL CONSTRAINT DF_usuarios_activo DEFAULT (1),
  created_at    DATETIMEOFFSET   NOT NULL CONSTRAINT DF_usuarios_created DEFAULT (SYSDATETIMEOFFSET())
);
GO

PRINT 'Esquema base creado correctamente.';
GO
