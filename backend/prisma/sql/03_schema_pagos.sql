/* ============================================================================
   Los Pinos Admin — Esquema de cuotas/cargos/pagos (Sprint 3)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   Modelo de facturación CONFIGURABLE acordado con el cliente:
     - La cuota de mantenimiento depende del ESTADO/categoría de la unidad
       (Sin construcción, En construcción, Construida, Airbnb, …) — todo editable.
     - Conceptos adicionales configurables (Agua, etc.), fijos o variables.
     - El estado de la unidad cambia con el tiempo -> historial_estado_unidad.
     - Facturación: cada mes se GENERAN cargos por unidad; los pagos saldan cargos.
     - Moneda: USD.

   Dependencias de FK (orden de creación):
     estados_unidad -> (ALTER unidades) -> historial_estado_unidad
     cuotas -> cargos -> pagos -> pago_cargos
   ============================================================================ */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   estados_unidad — catálogo configurable de estados/categorías por complejo.
   Determina la cuota de mantenimiento aplicable (vía tabla cuotas).
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.estados_unidad (
  id          UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_estados_unidad_id DEFAULT (NEWID())
                               CONSTRAINT PK_estados_unidad PRIMARY KEY,
  id_complejo UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_estados_unidad_complejo REFERENCES dbo.complejos(id),
  nombre      NVARCHAR(60)     NOT NULL,          -- 'Sin construcción', 'En construcción', 'Construida', 'Airbnb'
  orden       SMALLINT         NOT NULL CONSTRAINT DF_estados_unidad_orden DEFAULT (0),
  activo      BIT              NOT NULL CONSTRAINT DF_estados_unidad_activo DEFAULT (1),
  created_at  DATETIMEOFFSET   NOT NULL CONSTRAINT DF_estados_unidad_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE UNIQUE INDEX UQ_estados_unidad_nombre ON dbo.estados_unidad(id_complejo, nombre);
GO

/* ---------------------------------------------------------------------------
   unidades += id_estado_unidad  (estado/categoría actual de la unidad)
   --------------------------------------------------------------------------- */
ALTER TABLE dbo.unidades
  ADD id_estado_unidad UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_unidades_estado REFERENCES dbo.estados_unidad(id);
GO

/* ---------------------------------------------------------------------------
   historial_estado_unidad — cambios de estado de la unidad en el tiempo.
   Análogo a historial_propietarios (un estado activo por unidad, sin solapar).
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.historial_estado_unidad (
  id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_hist_estado_id DEFAULT (NEWID())
                                CONSTRAINT PK_hist_estado PRIMARY KEY,
  id_unidad    VARCHAR(10)      NOT NULL CONSTRAINT FK_hist_estado_unidad REFERENCES dbo.unidades(id),
  id_estado    UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_hist_estado_estado REFERENCES dbo.estados_unidad(id),
  fecha_inicio DATE             NOT NULL,
  fecha_fin    DATE             NULL,             -- NULL = estado actual
  created_at   DATETIMEOFFSET   NOT NULL CONSTRAINT DF_hist_estado_created DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT CK_hist_estado_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
GO
CREATE UNIQUE INDEX UQ_hist_estado_activo ON dbo.historial_estado_unidad(id_unidad) WHERE fecha_fin IS NULL;
GO

CREATE OR ALTER TRIGGER dbo.TR_hist_estado_no_overlap
ON dbo.historial_estado_unidad
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM dbo.historial_estado_unidad h
    JOIN inserted i
      ON  i.id_unidad = h.id_unidad
      AND i.id <> h.id
    WHERE i.fecha_inicio < COALESCE(h.fecha_fin, '9999-12-31')
      AND h.fecha_inicio < COALESCE(i.fecha_fin, '9999-12-31')
  )
  BEGIN
    RAISERROR('Solapamiento de estados para la misma unidad (no_overlap).', 16, 1);
    ROLLBACK TRANSACTION;
  END
END;
GO

/* ---------------------------------------------------------------------------
   cuotas — catálogo configurable de tarifas/conceptos por complejo.
   - id_estado_unidad NOT NULL : la tarifa aplica solo a unidades en ese estado
     (así 'Mantenimiento' tiene una fila por estado con monto distinto).
   - id_estado_unidad NULL     : aplica a todas las unidades (p. ej. 'Agua').
   - tipo 'variable'           : el monto se captura por unidad al generar el cargo.
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.cuotas (
  id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_cuotas_id DEFAULT (NEWID())
                                    CONSTRAINT PK_cuotas PRIMARY KEY,
  id_complejo      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_cuotas_complejo REFERENCES dbo.complejos(id),
  concepto         NVARCHAR(100)    NOT NULL,         -- 'Mantenimiento', 'Agua', …
  monto            DECIMAL(10,2)    NOT NULL CONSTRAINT DF_cuotas_monto DEFAULT (0),
  moneda           CHAR(3)          NOT NULL CONSTRAINT DF_cuotas_moneda DEFAULT ('USD'),
  tipo             NVARCHAR(20)     NOT NULL CONSTRAINT DF_cuotas_tipo DEFAULT ('fijo')
                                    CONSTRAINT CK_cuotas_tipo CHECK (tipo IN ('fijo','variable')),
  id_estado_unidad UNIQUEIDENTIFIER NULL CONSTRAINT FK_cuotas_estado REFERENCES dbo.estados_unidad(id),
  periodicidad     NVARCHAR(20)     NOT NULL CONSTRAINT DF_cuotas_periodicidad DEFAULT ('mensual')
                                    CONSTRAINT CK_cuotas_periodicidad
                                    CHECK (periodicidad IN ('mensual','bimestral','trimestral','anual','unica')),
  aplica_auto      BIT              NOT NULL CONSTRAINT DF_cuotas_auto DEFAULT (1),  -- se genera al facturar el mes
  aplica_desde     DATE             NOT NULL CONSTRAINT DF_cuotas_desde DEFAULT (CAST(SYSDATETIME() AS DATE)),
  aplica_hasta     DATE             NULL,
  activo           BIT              NOT NULL CONSTRAINT DF_cuotas_activo DEFAULT (1),
  created_at       DATETIMEOFFSET   NOT NULL CONSTRAINT DF_cuotas_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
CREATE INDEX idx_cuotas_complejo ON dbo.cuotas(id_complejo);
GO

/* ---------------------------------------------------------------------------
   cargos — obligaciones generadas por unidad + período + concepto.
   estado/saldo se mantienen desde la aplicación al registrar pagos.
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.cargos (
  id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_cargos_id DEFAULT (NEWID())
                                     CONSTRAINT PK_cargos PRIMARY KEY,
  id_complejo       UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_cargos_complejo REFERENCES dbo.complejos(id),
  id_unidad         VARCHAR(10)      NOT NULL CONSTRAINT FK_cargos_unidad REFERENCES dbo.unidades(id),
  id_cuota          UNIQUEIDENTIFIER NULL CONSTRAINT FK_cargos_cuota REFERENCES dbo.cuotas(id),  -- NULL = cargo manual
  concepto          NVARCHAR(100)    NOT NULL,
  periodo_mes       DATE             NOT NULL,        -- primer día del mes: '2026-06-01'
  monto             DECIMAL(10,2)    NOT NULL CONSTRAINT CK_cargos_monto CHECK (monto >= 0),
  saldo             DECIMAL(10,2)    NOT NULL CONSTRAINT CK_cargos_saldo CHECK (saldo >= 0),
  estado            NVARCHAR(20)     NOT NULL CONSTRAINT DF_cargos_estado DEFAULT ('pendiente')
                                     CONSTRAINT CK_cargos_estado CHECK (estado IN ('pendiente','parcial','pagado','anulado')),
  fecha_vencimiento DATE             NULL,
  created_at        DATETIMEOFFSET   NOT NULL CONSTRAINT DF_cargos_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
-- Evita duplicar el mismo concepto para la misma unidad/mes al regenerar.
CREATE UNIQUE INDEX UQ_cargos_unidad_periodo_concepto ON dbo.cargos(id_unidad, periodo_mes, concepto);
CREATE INDEX idx_cargos_periodo ON dbo.cargos(periodo_mes);
CREATE INDEX idx_cargos_estado  ON dbo.cargos(estado);
GO

/* ---------------------------------------------------------------------------
   pagos (sección 4.7) — un pago por unidad; salda uno o varios cargos.
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.pagos (
  id                 UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pagos_id DEFAULT (NEWID())
                                      CONSTRAINT PK_pagos PRIMARY KEY,
  id_complejo        UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pagos_complejo REFERENCES dbo.complejos(id),
  id_unidad          VARCHAR(10)      NOT NULL CONSTRAINT FK_pagos_unidad REFERENCES dbo.unidades(id),
  fecha_pago         DATE             NOT NULL,
  monto_total        DECIMAL(10,2)    NOT NULL CONSTRAINT CK_pagos_monto CHECK (monto_total > 0),
  metodo             NVARCHAR(20)     NOT NULL CONSTRAINT CK_pagos_metodo CHECK (metodo IN ('transferencia','efectivo','cheque')),
  banco_origen       NVARCHAR(80)     NULL,
  referencia_banco   NVARCHAR(60)     NULL,
  comprobante_url    NVARCHAR(500)    NULL,
  comprobante_nombre NVARCHAR(200)    NULL,
  comprobante_tipo   NVARCHAR(10)     NULL CONSTRAINT CK_pagos_comp_tipo CHECK (comprobante_tipo IS NULL OR comprobante_tipo IN ('imagen','pdf')),
  estado             NVARCHAR(20)     NOT NULL CONSTRAINT DF_pagos_estado DEFAULT ('registrado')
                                      CONSTRAINT CK_pagos_estado CHECK (estado IN ('registrado','conciliado','anulado')),
  registrado_por     UNIQUEIDENTIFIER NULL CONSTRAINT FK_pagos_usuario REFERENCES dbo.usuarios(id),
  created_at         DATETIMEOFFSET   NOT NULL CONSTRAINT DF_pagos_created DEFAULT (SYSDATETIMEOFFSET()),
  -- transferencia y cheque requieren referencia
  CONSTRAINT CK_pagos_referencia CHECK (
    metodo = 'efectivo' OR referencia_banco IS NOT NULL
  )
);
GO
CREATE INDEX idx_pagos_unidad  ON dbo.pagos(id_unidad);
CREATE INDEX idx_pagos_complejo ON dbo.pagos(id_complejo);
GO

/* ---------------------------------------------------------------------------
   pago_cargos — distribución de un pago entre los cargos que salda.
   --------------------------------------------------------------------------- */
CREATE TABLE dbo.pago_cargos (
  id             UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_pago_cargos_id DEFAULT (NEWID())
                                  CONSTRAINT PK_pago_cargos PRIMARY KEY,
  id_pago        UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pago_cargos_pago REFERENCES dbo.pagos(id) ON DELETE CASCADE,
  id_cargo       UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pago_cargos_cargo REFERENCES dbo.cargos(id),
  monto_aplicado DECIMAL(10,2)    NOT NULL CONSTRAINT CK_pago_cargos_monto CHECK (monto_aplicado > 0)
);
GO
CREATE UNIQUE INDEX UQ_pago_cargos ON dbo.pago_cargos(id_pago, id_cargo);
GO

PRINT 'Esquema de cuotas/cargos/pagos creado correctamente.';
GO
