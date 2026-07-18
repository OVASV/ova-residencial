/* ============================================================================
   OVA Residencial — Configuración de WhatsApp (Cloud API)
   Base de datos: OVA_RESIDENCIAL  (SQL Server 2022)

   Config por complejo para el despacho de avisos vía WhatsApp Cloud API.
   El envío en frío usa plantillas aprobadas; aquí se guardan las credenciales
   (Phone Number ID + token de System User) y el número visible (referencia).
   ============================================================================ */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

CREATE TABLE dbo.config_whatsapp (
  id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_config_wa_id DEFAULT (NEWID())
                                    CONSTRAINT PK_config_whatsapp PRIMARY KEY,
  id_complejo      UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_config_wa_complejo REFERENCES dbo.complejos(id)
                                    CONSTRAINT UQ_config_wa_complejo UNIQUE,
  phone_number_id  NVARCHAR(60)     NOT NULL,   -- ID del número en WhatsApp Manager (no el número)
  access_token     NVARCHAR(800)    NOT NULL,   -- token permanente de System User
  numero_visible   NVARCHAR(30)     NULL,       -- número mostrable, solo referencia (ej. 50368326586)
  api_version      NVARCHAR(10)     NOT NULL CONSTRAINT DF_config_wa_apiver DEFAULT ('v21.0'),
  activo           BIT              NOT NULL CONSTRAINT DF_config_wa_activo DEFAULT (1),
  created_at       DATETIMEOFFSET   NOT NULL CONSTRAINT DF_config_wa_created DEFAULT (SYSDATETIMEOFFSET())
);
GO
