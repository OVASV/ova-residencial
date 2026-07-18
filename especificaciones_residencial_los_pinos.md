# Especificaciones del Sistema — Residencial Los Pinos
## Sistema de administración y control de pagos

> Documento de referencia para desarrollo. Versión 2.0 — junio 2026.

---

## 1. Visión general del proyecto

Sistema web de administración para complejos habitacionales. Permite registrar propietarios, controlar pagos de cuotas, conciliar el banco, registrar gastos del complejo, enviar avisos y recordatorios automáticos, gestionar incidencias de mantenimiento y generar reportes financieros para la junta directiva. Soporta múltiples complejos desde una sola plataforma.

**Nombre del sistema:** Los Pinos Admin  
**Tipo:** Aplicación web SPA (Single Page Application) + API REST  
**Usuarios:** Superadmin (empresa administradora), Administradores por complejo, Portal de solo lectura para propietarios residentes

---

## 2. Stack tecnológico recomendado

### Frontend
- **Framework:** React 18 + TypeScript
- **Estilos:** Tailwind CSS
- **Routing:** React Router v6
- **Estado global:** Zustand o React Query
- **Formularios:** React Hook Form + Zod (validación)
- **Tablas:** TanStack Table
- **Gráficas:** Chart.js o Recharts
- **Mapas:** Google Maps JavaScript API con polygon overlays
- **Íconos:** Tabler Icons (`@tabler/icons-react`)
- **OCR de comprobantes:** Tesseract.js (cliente) o Google Vision API (servidor)
- **Fechas:** date-fns
- **Kanban incidencias:** dnd-kit (drag and drop)

### Backend
- **Runtime:** Node.js + Express o Fastify
- **ORM:** Prisma
- **Base de datos:** PostgreSQL 15+
- **Autenticación:** JWT + refresh tokens (multi-tenant: el token incluye `id_complejo`)
- **Almacenamiento de archivos:** AWS S3 o Supabase Storage
- **Envío de emails:** Resend o SendGrid
- **WhatsApp:** API de WhatsApp Business (Meta) o Twilio
- **Generación de PDF:** Puppeteer o @react-pdf/renderer (reportes junta directiva, recibos)
- **Tareas programadas:** node-cron (recordatorios automáticos a las 06:00 AM)
- **Variables de entorno:** dotenv

### Infraestructura
- **Hosting:** Vercel (frontend) + Railway o Render (backend)
- **Base de datos:** Supabase o Neon (PostgreSQL administrado)
- **Almacenamiento:** Supabase Storage o AWS S3

---

## 3. Sistema de diseño

### Paleta de colores

```css
/* Sidebar */
--sidebar-bg: #0C1B30;
--sidebar-accent: #085041;
--sidebar-accent-text: #5DCAA5;

/* Semánticos de estado */
--color-pagado:    #1D9E75;   /* verde teal */
--color-pendiente: #EF9F27;   /* ámbar */
--color-atrasado:  #E24B4A;   /* rojo */

/* Categorías de gastos */
--cat-seguridad:   #E24B4A;
--cat-limpieza:    #EF9F27;
--cat-mantenimiento: #4A90D9;
--cat-servicios:   #7B5EA7;
--cat-administrativo: #1D9E75;
--cat-extraordinario: #888888;
```

### Tipografía
- **Interfaz:** Inter o sistema (`system-ui, sans-serif`)
- **Cifras financieras:** JetBrains Mono o `font-family: monospace`
- **Tamaños base:** 13px interfaz, 12px tablas, 10-11px etiquetas

### Componentes clave
- **Sidebar:** 168px fijo, fondo `#0C1B30`, íconos Tabler
- **Cards KPI:** fondo blanco, borde 0.5px, padding 0.875rem, cifra monospace
- **Badges de estado:** border-radius 20px, colores semánticos
- **Tablas:** borde inferior 0.5px entre filas, cabecera fondo secundario
- **Formularios:** inputs con border 0.5px, border-radius 6px

---

## 4. Base de datos — Esquema completo

### 4.1 Tabla `paises`

```sql
CREATE TABLE paises (
  id          SMALLINT PRIMARY KEY,        -- ISO 3166-1 numérico
  codigo_iso2 CHAR(2)       NOT NULL UNIQUE,
  codigo_iso3 CHAR(3)       NOT NULL UNIQUE,
  nombre      VARCHAR(100)  NOT NULL,
  nombre_en   VARCHAR(100),
  activo      BOOLEAN       DEFAULT TRUE
);

-- Datos iniciales mínimos
INSERT INTO paises VALUES
  (320, 'GT', 'GTM', 'Guatemala',     'Guatemala',      TRUE),
  (222, 'SV', 'SLV', 'El Salvador',   'El Salvador',    TRUE),
  (484, 'MX', 'MEX', 'México',        'Mexico',         TRUE),
  (840, 'US', 'USA', 'Estados Unidos','United States',  TRUE),
  (724, 'ES', 'ESP', 'España',        'Spain',          TRUE),
  (170, 'CO', 'COL', 'Colombia',      'Colombia',       TRUE),
  (152, 'CL', 'CHL', 'Chile',         'Chile',          TRUE),
  (32,  'AR', 'ARG', 'Argentina',     'Argentina',      TRUE),
  (76,  'BR', 'BRA', 'Brasil',        'Brazil',         TRUE),
  (124, 'CA', 'CAN', 'Canadá',        'Canada',         TRUE);
```

### 4.2 Tabla `propietarios`

```sql
CREATE TABLE propietarios (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_pais         SMALLINT      REFERENCES paises(id),
  nombre          VARCHAR(80)   NOT NULL,
  apellido        VARCHAR(80)   NOT NULL,
  dpi_nit         VARCHAR(30)   UNIQUE,
  telefono        VARCHAR(20),
  email           VARCHAR(120)  UNIQUE,
  direccion       TEXT,
  fecha_registro  DATE          NOT NULL DEFAULT CURRENT_DATE,
  activo          BOOLEAN       DEFAULT TRUE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);
```

### 4.3 Tabla `unidades`

```sql
CREATE TABLE unidades (
  id          VARCHAR(10)    PRIMARY KEY,  -- Ej: 'A-01', 'B-03'
  bloque      CHAR(1)        NOT NULL,
  area_m2     DECIMAL(6,2),
  num_piso    SMALLINT,
  lat         DECIMAL(10,7),              -- coordenada GPS latitud
  lng         DECIMAL(10,7),              -- coordenada GPS longitud
  poligono    JSONB,                       -- [[lat,lng],...] contorno del terreno
  activo      BOOLEAN        DEFAULT TRUE,
  created_at  TIMESTAMPTZ    DEFAULT NOW()
);
```

> **Nota:** `unidades` NO tiene `id_propietario` directamente.  
> El propietario actual se obtiene siempre desde `historial_propietarios`  
> con `fecha_fin IS NULL`.

### 4.4 Tabla `historial_propietarios`

```sql
CREATE TABLE historial_propietarios (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_unidad       VARCHAR(10) NOT NULL REFERENCES unidades(id),
  id_propietario  UUID        NOT NULL REFERENCES propietarios(id),
  fecha_inicio    DATE        NOT NULL,
  fecha_fin       DATE,                   -- NULL = propietario actual
  motivo          VARCHAR(60),            -- 'compra', 'herencia', 'donacion', etc.
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT no_overlap EXCLUDE USING gist (
    id_unidad WITH =,
    daterange(fecha_inicio, fecha_fin, '[)') WITH &&
  )
);

-- Índice para consulta rápida del propietario actual
CREATE INDEX idx_hist_prop_actual
  ON historial_propietarios (id_unidad)
  WHERE fecha_fin IS NULL;
```

### 4.5 Tabla `cuotas`

```sql
CREATE TABLE cuotas (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto      VARCHAR(100)  NOT NULL,    -- 'Mantenimiento', 'Agua', etc.
  monto         DECIMAL(10,2) NOT NULL,
  periodicidad  VARCHAR(20)   DEFAULT 'mensual'
                CHECK (periodicidad IN ('mensual','bimestral','trimestral','anual')),
  aplica_desde  DATE          NOT NULL,
  aplica_hasta  DATE,                      -- NULL = vigente indefinidamente
  activo        BOOLEAN       DEFAULT TRUE
);
```

### 4.6 Tabla `conciliaciones`

```sql
CREATE TABLE conciliaciones (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo         VARCHAR(7)    NOT NULL,   -- 'YYYY-MM'
  banco           VARCHAR(80),
  archivo_nombre  VARCHAR(200),
  fecha           DATE          NOT NULL DEFAULT CURRENT_DATE,
  estado          VARCHAR(20)   DEFAULT 'borrador'
                  CHECK (estado IN ('borrador','en_revision','confirmada','anulada')),
  total_banco     DECIMAL(12,2),
  total_sistema   DECIMAL(12,2),
  diferencia      DECIMAL(12,2) GENERATED ALWAYS AS (total_banco - total_sistema) STORED,
  confirmado_por  UUID          REFERENCES usuarios(id),
  confirmado_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);
```

### 4.7 Tabla `pagos`

```sql
CREATE TABLE pagos (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_unidad        VARCHAR(10)   NOT NULL REFERENCES unidades(id),
  id_conciliacion  UUID          REFERENCES conciliaciones(id),

  -- Concepto
  concepto         VARCHAR(100)  NOT NULL,
  periodo_mes      DATE          NOT NULL,  -- primer día del mes: '2026-06-01'
  monto            DECIMAL(10,2) NOT NULL   CHECK (monto > 0),

  -- Datos del pago
  fecha_pago       DATE          NOT NULL,
  metodo           VARCHAR(20)   NOT NULL
                   CHECK (metodo IN ('transferencia','efectivo','cheque')),
  banco_origen     VARCHAR(80),             -- banco desde donde se hizo la transferencia/cheque
  referencia_banco VARCHAR(60),             -- No. de referencia o No. de cheque

  -- Comprobante adjunto
  comprobante_url     VARCHAR(500),
  comprobante_nombre  VARCHAR(200),
  comprobante_tipo    VARCHAR(10)
                      CHECK (comprobante_tipo IN ('imagen','pdf')),

  -- Estado
  estado           VARCHAR(20)   DEFAULT 'registrado'
                   CHECK (estado IN ('registrado','conciliado','anulado')),
  conciliado       BOOLEAN       DEFAULT FALSE,

  -- Auditoría
  registrado_por   UUID          REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ   DEFAULT NOW(),

  -- Restricción: transferencia y cheque requieren referencia
  CONSTRAINT chk_referencia CHECK (
    metodo = 'efectivo'
    OR (metodo IN ('transferencia','cheque') AND referencia_banco IS NOT NULL)
  )
);

-- Índices frecuentes
CREATE INDEX idx_pagos_unidad     ON pagos (id_unidad);
CREATE INDEX idx_pagos_periodo    ON pagos (periodo_mes);
CREATE INDEX idx_pagos_estado     ON pagos (estado);
CREATE INDEX idx_pagos_conciliado ON pagos (conciliado) WHERE conciliado = FALSE;
```

### 4.8 Tabla `gastos`

```sql
CREATE TABLE gastos (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria        VARCHAR(30)   NOT NULL
                   CHECK (categoria IN (
                     'seguridad','limpieza','mantenimiento',
                     'servicios','administrativo','extraordinario'
                   )),
  descripcion      VARCHAR(200)  NOT NULL,
  proveedor        VARCHAR(100),
  no_factura       VARCHAR(60),
  monto            DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  fecha            DATE          NOT NULL,
  metodo           VARCHAR(20)   CHECK (metodo IN ('transferencia','efectivo','cheque')),
  periodo_mes      DATE          NOT NULL,

  -- Comprobante / factura
  comprobante_url     VARCHAR(500),
  comprobante_nombre  VARCHAR(200),
  comprobante_tipo    VARCHAR(10) CHECK (comprobante_tipo IN ('imagen','pdf')),

  registrado_por   UUID          REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);
```

### 4.9 Tabla `presupuestos`

```sql
CREATE TABLE presupuestos (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo     VARCHAR(7)    NOT NULL,       -- 'YYYY-MM' o 'YYYY' para anual
  categoria   VARCHAR(30)   NOT NULL
              CHECK (categoria IN (
                'seguridad','limpieza','mantenimiento',
                'servicios','administrativo','extraordinario'
              )),
  monto       DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (periodo, categoria)
);
```

### 4.10 Tabla `avisos`

```sql
CREATE TABLE avisos (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          VARCHAR(30)   NOT NULL
                CHECK (tipo IN (
                  'recordatorio_pago','aviso_mora','mantenimiento',
                  'reunion','general'
                )),
  asunto        VARCHAR(200),
  mensaje       TEXT          NOT NULL,
  canal         VARCHAR(20)   NOT NULL
                CHECK (canal IN ('whatsapp','email','ambos')),
  destinatarios JSONB,                      -- [{id_propietario, nombre, contacto}]
  total_envios  INT           DEFAULT 0,
  total_entregados INT        DEFAULT 0,
  total_abiertos   INT        DEFAULT 0,
  estado        VARCHAR(20)   DEFAULT 'borrador'
                CHECK (estado IN ('borrador','programado','enviado','cancelado')),
  programado_at TIMESTAMPTZ,
  enviado_at    TIMESTAMPTZ,
  creado_por    UUID          REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);
```

### 4.11 Tabla `usuarios`

```sql
CREATE TABLE usuarios (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  rol           VARCHAR(20)  DEFAULT 'admin'
                CHECK (rol IN ('superadmin','admin','lectura')),
  activo        BOOLEAN      DEFAULT TRUE,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
```

---

## 5. Consultas SQL clave

### Propietario actual de una unidad

```sql
SELECT pr.*
FROM historial_propietarios hp
JOIN propietarios pr ON pr.id = hp.id_propietario
WHERE hp.id_unidad = 'A-04'
  AND hp.fecha_fin IS NULL;
```

### Quién era el dueño cuando se hizo un pago

```sql
SELECT p.*, pr.nombre, pr.apellido, pr.email
FROM pagos p
JOIN historial_propietarios hp
  ON  hp.id_unidad = p.id_unidad
  AND p.fecha_pago BETWEEN hp.fecha_inicio
                       AND COALESCE(hp.fecha_fin, CURRENT_DATE)
JOIN propietarios pr ON pr.id = hp.id_propietario
WHERE p.id_unidad = 'A-04'
ORDER BY p.periodo_mes DESC;
```

### Estado de pagos de todas las unidades en un mes

```sql
SELECT
  u.id                                        AS unidad,
  u.bloque,
  COALESCE(pr.nombre || ' ' || pr.apellido, 'Sin propietario') AS propietario,
  c.monto                                     AS cuota_esperada,
  p.monto                                     AS pagado,
  CASE
    WHEN p.id IS NOT NULL        THEN 'pagado'
    WHEN CURRENT_DATE > '2026-06-30' THEN 'atrasado'
    ELSE 'pendiente'
  END                                         AS estado
FROM unidades u
CROSS JOIN (SELECT monto FROM cuotas WHERE activo = TRUE LIMIT 1) c
LEFT JOIN historial_propietarios hp
  ON hp.id_unidad = u.id AND hp.fecha_fin IS NULL
LEFT JOIN propietarios pr ON pr.id = hp.id_propietario
LEFT JOIN pagos p
  ON p.id_unidad = u.id
  AND p.periodo_mes = '2026-06-01'
  AND p.estado != 'anulado'
WHERE u.activo = TRUE
ORDER BY u.bloque, u.id;
```

### Gastos vs presupuesto por categoría en un mes

```sql
SELECT
  pr.categoria,
  pr.monto                            AS presupuestado,
  COALESCE(SUM(g.monto), 0)           AS gastado,
  pr.monto - COALESCE(SUM(g.monto),0) AS disponible,
  ROUND(COALESCE(SUM(g.monto),0) / pr.monto * 100, 1) AS pct_ejecutado
FROM presupuestos pr
LEFT JOIN gastos g
  ON g.categoria = pr.categoria
  AND g.periodo_mes = '2026-06-01'
WHERE pr.periodo = '2026-06'
GROUP BY pr.categoria, pr.monto
ORDER BY pct_ejecutado DESC;
```

---

## 6. API REST — Endpoints principales

```
BASE URL: /api/v1

AUTH
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout

PROPIETARIOS
  GET    /propietarios                    Lista con filtros
  POST   /propietarios                    Crear propietario
  GET    /propietarios/:id                Detalle
  PUT    /propietarios/:id                Editar
  DELETE /propietarios/:id                Desactivar

UNIDADES
  GET    /unidades                        Lista con estado de pago
  POST   /unidades                        Crear unidad
  GET    /unidades/:id                    Detalle + propietario actual
  PUT    /unidades/:id                    Editar (incluye lat/lng/poligono)
  GET    /unidades/:id/historial          Historial de propietarios
  POST   /unidades/:id/propietario        Asignar nuevo propietario

PAGOS
  GET    /pagos                           Lista con filtros (unidad, periodo, estado)
  POST   /pagos                           Registrar pago
  GET    /pagos/:id                       Detalle
  PATCH  /pagos/:id/anular                Anular pago
  POST   /pagos/:id/comprobante           Subir comprobante (multipart)
  GET    /pagos/estado-mensual            Estado de todas las unidades en un mes

CONCILIACIONES
  GET    /conciliaciones                  Lista
  POST   /conciliaciones                  Iniciar nueva conciliación
  GET    /conciliaciones/:id              Detalle con matches
  POST   /conciliaciones/:id/archivo      Subir archivo del banco
  POST   /conciliaciones/:id/match        Match manual pago-transaccion
  POST   /conciliaciones/:id/confirmar    Confirmar conciliación

GASTOS
  GET    /gastos                          Lista con filtros
  POST   /gastos                          Registrar gasto
  GET    /gastos/:id                      Detalle
  PUT    /gastos/:id                      Editar
  POST   /gastos/:id/comprobante          Subir factura/recibo
  GET    /gastos/resumen-mensual          Presupuesto vs ejecutado

AVISOS
  GET    /avisos                          Historial
  POST   /avisos                          Crear y enviar aviso
  GET    /avisos/:id                      Detalle + estadísticas de entrega

PAISES
  GET    /paises                          Lista completa (para select)
```

---

## 7. Módulos y pantallas

### 7.1 Dashboard principal

**Ruta:** `/`

**KPIs que muestra:**
- Total cobrado en el mes
- Total pendiente
- Total atrasado
- Ingreso esperado total

**Componentes:**
- 4 cards KPI en fila
- Donut chart: distribución pagado / pendiente / atrasado (Chart.js)
- Lista de pagos recientes (últimos 4)
- Tabla de estado por unidad (paginada)

---

### 7.2 Conciliación bancaria

**Ruta:** `/pagos/conciliacion`

**Flujo de 4 pasos:**
1. Seleccionar período (mes/año)
2. Subir archivo del banco (CSV, XLS, XLSX)
3. Revisar matches automáticos y resolver excepciones
4. Confirmar conciliación

**Tipos de match:**
- `conciliado`: monto + referencia coinciden exactamente
- `diferencia`: el monto no coincide (mostrar delta)
- `sin_match_banco`: hay transacción en el banco sin pago en sistema → botón "Asignar"
- `sin_match_sistema`: hay pago en sistema sin transacción en banco → marcado como no pagado

**Algoritmo de match automático:**
```
Para cada transacción del banco:
  1. Buscar pagos del mismo período con mismo monto → match exacto
  2. Buscar pagos con referencia_banco = referencia del banco → match por referencia
  3. Si no hay match → marcar como "sin_match_banco"
Para cada pago del sistema sin match:
  → marcar como "sin_match_sistema"
```

---

### 7.3 Mapa interactivo del complejo

**Ruta:** `/residentes/mapa`

**Tecnología:** Google Maps JavaScript API

**Funcionalidad:**
- Renderizar polígonos de cada unidad sobre el mapa (`unidades.poligono`)
- Colorear polígonos según estado de pago del mes actual
- Click en unidad → panel lateral con ficha del propietario
- Hover → highlight del polígono + tooltip con ID y nombre
- Búsqueda por texto que filtra unidades (opacidad 0.2 en no-coincidencias)
- Filtro por estado (todos / pagado / pendiente / atrasado)
- Botón "Editar coordenadas" abre modo de edición del polígono con arrastre de vértices

**Ficha lateral al seleccionar unidad:**
- Nombre del propietario (avatar con iniciales)
- ID de unidad + bloque + área m²
- País de residencia
- Teléfono y email
- Badge de estado + saldo pendiente
- Coordenadas GPS (lat/lng)
- Botones: Registrar pago / Enviar aviso / Ver historial

---

### 7.4 Registro de propietario y unidad

**Ruta:** `/residentes/nuevo`

**Formulario en 3 pasos:**

**Paso 1 — Datos personales:**
- Nombre* + Apellido*
- DPI / NIT* (único)
- Fecha de registro
- Toggle "Propietario activo"

**Paso 2 — Contacto y residencia:**
- Teléfono* + Email*
- País de residencia* → select con búsqueda en tiempo real (carga desde `/api/v1/paises`)
- Dirección (opcional)

**Paso 3 — Asignación de unidad:**
- Grid de cards con unidades disponibles (sin propietario actual: `fecha_fin IS NULL` no existe)
- Fecha de inicio de propiedad*
- Motivo de asignación (select)
- Observaciones

**Al guardar:**
- Crear registro en `propietarios`
- Crear registro en `historial_propietarios` con `fecha_fin = NULL`
- Todo en una transacción SQL

---

### 7.5 Registro de pago individual

**Ruta:** `/pagos/nuevo`

**Secciones del formulario:**

**Sección 1 — Unidad:**
- Input de búsqueda (por ID de unidad o nombre de propietario)
- Al seleccionar: mostrar nombre, unidad, estado actual y saldo pendiente

**Sección 2 — Conceptos a pagar:**
- Lista de cuotas pendientes y atrasadas del residente (checkboxes)
- Posibilidad de agregar concepto extraordinario
- El total se calcula automáticamente según los checkboxes activos

**Sección 3 — Método de pago:**
- Botones: Efectivo / Transferencia / Cheque
- Transferencia → campos: `referencia_banco`*, `fecha_pago`*, `banco_origen`
- Cheque → campos: `no_cheque`*, `banco_origen`
- Efectivo → campo: monto recibido

**Sección 4 — Comprobante:**
- Zona drag & drop
- Botón "Galería / Archivo" → file input
- Botón "Usar cámara" → `navigator.mediaDevices.getUserMedia`
- Botón "Escanear" → integración con escáner físico (WIA/TWAIN)
- Al subir imagen: aplicar OCR y pre-llenar campos de referencia, monto y banco
- Preview miniatura del comprobante subido

**Panel derecho — Vista previa del recibo:**
- Número de recibo correlativo (auto-generado)
- Nombre + unidad del residente
- Lista de conceptos seleccionados con montos
- Saldo pendiente restante tras el pago
- Total a cobrar
- Método + referencia bancaria
- Indicador de comprobante adjunto
- Checkboxes: enviar por email / enviar por WhatsApp

---

### 7.6 Estado de cuenta del residente

**Ruta:** `/pagos/estado-cuenta/:id_unidad`

**Header del residente:**
- Avatar con iniciales
- Nombre completo, unidad, bloque, área
- País + teléfono + email
- Fecha de residencia (desde `historial_propietarios.fecha_inicio`)
- Badge de estado del mes actual

**KPIs:**
- Saldo pendiente total
- Total pagado en el año
- Fecha del último pago
- Total histórico pagado (desde inicio)

**Tabla de historial:**
- Columnas: Período / Concepto / Método / Banco / Referencia / Monto / Fecha pago / Estado
- Filtro por año: 2026 / 2025 / Todos
- Icono de clip si tiene comprobante adjunto (click → abrir comprobante)
- Filas coloreadas según estado: verde / ámbar / rojo

**Acciones:**
- Exportar a PDF (genera estado de cuenta formal)
- Enviar por email
- Registrar nuevo pago (redirige a 7.5)

---

### 7.7 Módulo de gastos

**Ruta:** `/gastos`

**Vista principal:**

**KPIs del mes:**
- Total gastado vs presupuesto
- Monto disponible
- Número de transacciones
- Variación vs mes anterior (%)

**Sección de presupuesto por categoría:**
- Barra de progreso por categoría con color semántico
- Porcentaje ejecutado + monto disponible
- Alerta visual si supera 90% del presupuesto

**Gráfica comparativa:**
- Bar chart doble: presupuestado vs ejecutado por categoría

**Tabla de detalle:**
- Columnas: Fecha / Categoría / Descripción / Proveedor / Monto / Comprobante
- Filtros: categoría, fecha
- Chip de color por categoría
- Indicador de comprobante (adjunto / sin adjunto)
- Exportar a Excel o PDF

**Formulario nuevo gasto (panel desplegable):**
- Categoría* (select)
- Proveedor / Beneficiario*
- Descripción*
- Monto* + Fecha*
- Método de pago
- No. factura / recibo
- Adjuntar factura (mismo componente que pagos)

---

### 7.8 Módulo de avisos

**Ruta:** `/avisos`

**Tab "Nuevo aviso":**

*Tipo de aviso (plantillas):*
- Recordatorio de pago pendiente
- Aviso de mora — pago atrasado
- Mantenimiento programado
- Reunión de vecinos
- Aviso general

*Destinatarios (auto-calculados desde BD):*
- Todos los residentes (COUNT de unidades activas)
- Solo pendientes (cuota del mes sin pagar, no vencida)
- Solo atrasados (cuota vencida hace más de X días)
- Unidad específica (select con búsqueda)

*Canal:*
- WhatsApp / Email / Ambos

*Mensaje:*
- Textarea con plantilla pre-cargada según el tipo
- Variables disponibles: `{nombre}`, `{mes}`, `{monto}`, `{meses_mora}`, `{monto_total}`, `{fecha}`, `{hora}`, `{area}`
- Las variables se reemplazan per-destinatario al enviar

*Vista previa:*
- Simula la burbuja de WhatsApp o email con datos del primer destinatario
- Cambia estilo según el canal seleccionado

*Programación:*
- Enviar ahora o programar fecha/hora

**Tab "Historial":**
- Stats: total enviados / tasa de entrega / tasa de apertura
- Lista de avisos enviados con tipo, destinatarios, canal, fecha y métricas
- Click en cada aviso → ver detalle de entrega por destinatario

---

## 8. Reglas de negocio

### Pagos
- Un pago NO puede registrarse sin seleccionar al menos un concepto
- Transferencia y cheque requieren `referencia_banco` (validado en BD y frontend)
- Al anular un pago, el estado cambia a `'anulado'` — nunca se elimina físicamente
- Un pago conciliado (`estado = 'conciliado'`) no puede anularse sin deshacer la conciliación
- El número de recibo es correlativo global: `YYYY-NNNN` (ej: `2026-0847`)

### Propietarios y unidades
- Una unidad solo puede tener UN propietario activo (`fecha_fin IS NULL`) a la vez
- Al asignar un nuevo propietario, cerrar el registro anterior (`fecha_fin = fecha_inicio_nuevo - 1 día`)
- Un propietario puede poseer múltiples unidades simultáneamente
- No se pueden borrar propietarios; solo desactivar (`activo = FALSE`)

### Conciliación
- Solo puede haber una conciliación `en_revision` o `borrador` por período a la vez
- Una conciliación confirmada no puede modificarse
- Al confirmar, todos los pagos incluidos pasan a `estado = 'conciliado'`

### Gastos
- Si el gasto supera el presupuesto de su categoría, mostrar alerta (no bloquear)
- Los gastos no se borran físicamente

### Avisos
- Las variables `{nombre}`, `{monto}`, etc. deben reemplazarse individualmente para cada destinatario
- Los avisos enviados quedan en historial permanente

---

## 9. Seguridad

- Autenticación: JWT con expiración de 8 horas + refresh token de 30 días
- Todas las rutas de la API requieren token válido excepto `POST /auth/login`
- Los archivos de comprobantes se almacenan con nombres UUID (no el nombre original) para evitar ataques
- Las URLs de comprobantes deben ser firmadas (presigned URLs con expiración de 1 hora)
- Logging de auditoría: todos los cambios en `pagos`, `propietarios`, `historial_propietarios` deben registrar `updated_by` y `updated_at`

---

## 10. Estructura de carpetas sugerida (frontend React)

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── MainLayout.tsx
│   ├── ui/
│   │   ├── Badge.tsx
│   │   ├── KpiCard.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── MonoAmount.tsx          ← cifras con font-mono
│   │   └── ComprobanteUploader.tsx ← uploader reutilizable
│   └── maps/
│       ├── ComplexMap.tsx
│       └── UnitInfoPanel.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── pagos/
│   │   ├── ConciliacionBancaria.tsx
│   │   ├── RegistrarPago.tsx
│   │   └── EstadoCuenta.tsx
│   ├── residentes/
│   │   ├── MapaComplejo.tsx
│   │   └── NuevoPropietario.tsx
│   ├── gastos/
│   │   └── Gastos.tsx
│   └── avisos/
│       └── Avisos.tsx
├── hooks/
│   ├── usePagos.ts
│   ├── useUnidades.ts
│   └── useConciliacion.ts
├── services/
│   └── api.ts                      ← cliente HTTP centralizado
├── stores/
│   └── authStore.ts
└── utils/
    ├── formatters.ts               ← formatCurrency, formatDate, etc.
    └── ocrHelper.ts                ← Tesseract.js wrapper
```

---

## 11. Variables de entorno requeridas

```env
# Base de datos
DATABASE_URL=postgresql://user:pass@host:5432/lospinos

# JWT
JWT_SECRET=...
JWT_REFRESH_SECRET=...

# Almacenamiento
S3_BUCKET=lospinos-comprobantes
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Email
RESEND_API_KEY=...
FROM_EMAIL=admin@residenciallospinos.com

# WhatsApp
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_ID=...

# Google Maps
VITE_GOOGLE_MAPS_API_KEY=...

# Google Vision (OCR en servidor)
GOOGLE_VISION_API_KEY=...
```

---

---

## 13. Tablas adicionales — módulos expandidos

### 13.1 Tabla `complejos` (multi-complejo)

```sql
CREATE TABLE complejos (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(100) NOT NULL,
  direccion   TEXT,
  ciudad      VARCHAR(80),
  id_pais     SMALLINT     REFERENCES paises(id),
  activo      BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
```

**Migración de tablas existentes** — agregar `id_complejo` como FK a todas las tablas:

```sql
ALTER TABLE unidades      ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);
ALTER TABLE propietarios  ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);
ALTER TABLE pagos          ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);
ALTER TABLE gastos         ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);
ALTER TABLE conciliaciones ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);
ALTER TABLE cuotas         ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);
ALTER TABLE avisos         ADD COLUMN id_complejo UUID NOT NULL REFERENCES complejos(id);

-- Índices para filtrado eficiente por complejo
CREATE INDEX idx_unidades_complejo    ON unidades    (id_complejo);
CREATE INDEX idx_pagos_complejo       ON pagos        (id_complejo);
CREATE INDEX idx_gastos_complejo      ON gastos       (id_complejo);
```

> **Patrón multi-tenant en el backend:** el token JWT incluye `id_complejo`. Un middleware
> en Express/Fastify inyecta automáticamente `WHERE id_complejo = $1` en todas las
> consultas de Prisma. El superadmin recibe un token sin `id_complejo` y ve todos.

### 13.2 Tabla `usuarios` — roles expandidos

```sql
-- Roles del sistema
-- superadmin : ve y gestiona todos los complejos
-- admin      : gestiona un solo complejo (id_complejo en su token)
-- lectura    : solo lectura de un complejo (junta directiva)
-- residente  : acceso al portal propio (ver tabla usuarios_residentes)

ALTER TABLE usuarios
  ADD COLUMN id_complejo UUID REFERENCES complejos(id);
  -- NULL para superadmin, requerido para admin y lectura
```

### 13.3 Tabla `usuarios_residentes` (portal del propietario)

```sql
CREATE TABLE usuarios_residentes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_propietario  UUID         NOT NULL UNIQUE REFERENCES propietarios(id),
  id_complejo     UUID         NOT NULL REFERENCES complejos(id),
  email           VARCHAR(120) NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  activo          BOOLEAN      DEFAULT TRUE,
  ultimo_acceso   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
```

El administrador crea el acceso desde el panel. El residente recibe un email con su
contraseña temporal y puede cambiarla al primer ingreso. El portal es **solo lectura**:
el residente ve sus pagos, historial, datos de su propiedad, avisos e incidencias propias.

### 13.4 Tabla `incidencias`

```sql
CREATE TABLE incidencias (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_complejo     UUID        NOT NULL REFERENCES complejos(id),
  id_unidad       VARCHAR(10) REFERENCES unidades(id),  -- NULL si es área común
  area_comun      VARCHAR(80),                           -- 'Piscina', 'Jardín', etc.
  categoria       VARCHAR(30) NOT NULL
                  CHECK (categoria IN (
                    'plomeria','electricidad','areas_comunes',
                    'seguridad','jardineria','otro'
                  )),
  titulo          VARCHAR(150) NOT NULL,
  descripcion     TEXT,
  prioridad       VARCHAR(10) DEFAULT 'normal'
                  CHECK (prioridad IN ('baja','normal','urgente')),
  estado          VARCHAR(20) DEFAULT 'reportada'
                  CHECK (estado IN ('reportada','asignada','en_proceso','resuelta','cancelada')),
  proveedor       VARCHAR(100),
  foto_url        VARCHAR(500),
  pct_avance      SMALLINT    DEFAULT 0 CHECK (pct_avance BETWEEN 0 AND 100),

  -- Timestamps de cada cambio de estado
  reportada_at    TIMESTAMPTZ DEFAULT NOW(),
  asignada_at     TIMESTAMPTZ,
  en_proceso_at   TIMESTAMPTZ,
  resuelta_at     TIMESTAMPTZ,

  reportado_por   UUID        REFERENCES usuarios_residentes(id),
  gestionado_por  UUID        REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidencias_complejo ON incidencias (id_complejo);
CREATE INDEX idx_incidencias_estado   ON incidencias (estado);
```

### 13.5 Tabla `reglas_recordatorio`

```sql
CREATE TABLE reglas_recordatorio (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_complejo     UUID         NOT NULL REFERENCES complejos(id),
  nombre          VARCHAR(100) NOT NULL,
  activa          BOOLEAN      DEFAULT TRUE,
  tipo            VARCHAR(20)  NOT NULL
                  CHECK (tipo IN ('previo','vencimiento','mora')),
  dias_antes      INT,         -- tipo 'previo': días antes del vencimiento (ej: 5)
  dias_mora_min   INT,         -- tipo 'mora': mínimo días atrasado para activar
  frecuencia_dias INT,         -- tipo 'mora': cada cuántos días repetir
  destinatarios   VARCHAR(20)  NOT NULL
                  CHECK (destinatarios IN ('todos','pendientes','atrasados')),
  canal           VARCHAR(20)  NOT NULL
                  CHECK (canal IN ('whatsapp','email','ambos')),
  plantilla       TEXT         NOT NULL,
  hora_envio      TIME         DEFAULT '06:00',
  ultimo_envio    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
```

### 13.6 Tabla `miembros_junta`

```sql
CREATE TABLE miembros_junta (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  id_complejo UUID         NOT NULL REFERENCES complejos(id),
  nombre      VARCHAR(100) NOT NULL,
  cargo       VARCHAR(60),   -- 'Presidente', 'Tesorero', 'Vocal', etc.
  email       VARCHAR(120) NOT NULL,
  telefono    VARCHAR(20),
  activo      BOOLEAN      DEFAULT TRUE,
  recibe_reporte BOOLEAN   DEFAULT TRUE,  -- incluir en envío automático mensual
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
```

---

## 14. Módulos adicionales — especificación de pantallas

### 14.1 Reporte financiero para junta directiva

**Ruta:** `/reportes/junta`

**Secciones del reporte:**

**KPIs principales (4 cards):**
- Total cobrado en el mes vs total esperado
- Total gastado vs presupuesto
- Saldo en caja (cobrado − gastado)
- Por cobrar (pendiente + atrasado)

**Gráfica de barras doble:** ingresos vs gastos mes a mes (últimos 6 meses).

**Gráfica donut:** distribución de gastos por categoría del mes.

**Estado de cobranza por bloque:** barra de progreso por bloque con unidades pagadas / pendientes / atrasadas.

**Panel de envío:**
- Lista de miembros de la junta (de `miembros_junta`)
- Botón "Generar y enviar" → genera el PDF con Puppeteer y lo envía por email a todos con `recibe_reporte = TRUE`
- El PDF incluye el logo del complejo, período, fecha de generación y firma del administrador

**Generación automática mensual:**
El sistema envía el reporte el día 3 de cada mes automáticamente (vía `node-cron`) con los datos del mes anterior, sin intervención del administrador.

---

### 14.2 Módulo de incidencias

**Ruta:** `/incidencias`

**Vista principal:** tablero kanban con 4 columnas: Reportada → Asignada → En proceso → Resuelta.

**Cada tarjeta muestra:**
- Título y categoría (con dot de color)
- Unidad o área común que reporta
- Prioridad (badge rojo si es urgente)
- Proveedor asignado (si ya fue asignada)
- Barra de progreso (si está en proceso)
- Tiempo transcurrido desde el reporte

**Acciones del administrador:**
- Arrastrar tarjeta entre columnas (dnd-kit) para cambiar estado
- Asignar a proveedor del directorio
- Actualizar porcentaje de avance
- Adjuntar foto del trabajo realizado
- Resolver y registrar costo del servicio (vinculado a `gastos`)

**Filtros:** por categoría, por prioridad, por bloque.

**Estadísticas del encabezado:**
- Conteo por estado
- Tiempo promedio de resolución del mes

**Desde el portal del residente:**
El residente puede reportar nuevas incidencias y ver el estado de las suyas.
Al cambiar de estado, el sistema envía automáticamente un aviso al residente por WhatsApp o email.

**Campos al reportar (residente o admin):**
- Categoría
- Título + descripción
- Prioridad sugerida
- Foto adjunta (opcional)
- Unidad o área común afectada

---

### 14.3 Vista superadmin — multi-complejo

**Ruta:** `/` (solo para rol `superadmin`)

**Dashboard global:**
- 4 KPIs consolidados: total complejos, total unidades, cobrado global del mes, mora total
- Grid de cards — una por complejo

**Cada card de complejo muestra:**
- Nombre, ciudad, número de unidades
- Badge de salud (Al día / Atención / Nuevo)
- Barra de cobrado vs esperado
- Monto cobrado, gastado y mora del mes
- Botón "Administrar complejo" → redirige al panel con el `id_complejo` activo en el token

**Cambio de contexto:** al entrar a un complejo, el sidebar muestra el nombre de ese complejo. Un botón "← Todos los complejos" regresa al dashboard global (solo visible para superadmin).

**Reporte consolidado:** genera un PDF con el resumen de todos los complejos en un solo documento, útil para reuniones de dirección de la empresa administradora.

---

### 14.4 Portal del propietario — residente

**Ruta:** `https://portal.lospinos.gt` (subdominio propio por complejo)

**Secciones del menú:**
- Mi resumen — estado de cuenta del mes + últimos 3 pagos + avisos recientes
- Mis pagos — historial completo con descarga de recibos en PDF
- Mi propiedad — datos de la unidad y datos de contacto registrados + solicitud de cambio
- Avisos — tablón de comunicados del complejo
- Incidencias — ver mis incidencias reportadas + reportar nueva

**Características:**
- Solo lectura (el residente no puede modificar nada del sistema)
- Descarga de recibos individuales en PDF
- Solicitud de cambio de datos → genera notificación al administrador (no aplica directamente)
- Reporte de incidencia → crea registro en `incidencias` con estado `reportada`

**Autenticación:** email + contraseña. El administrador crea el acceso y el residente recibe un email con su contraseña temporal y enlace para cambiarla.

---

## 15. API REST — endpoints adicionales

```
COMPLEJOS (solo superadmin)
  GET    /complejos                       Lista de todos los complejos
  POST   /complejos                       Crear nuevo complejo
  GET    /complejos/:id/resumen           KPIs consolidados del complejo
  GET    /complejos/consolidado           Dashboard global superadmin

INCIDENCIAS
  GET    /incidencias                     Lista con filtros (estado, categoria, prioridad)
  POST   /incidencias                     Crear incidencia (admin o residente)
  GET    /incidencias/:id                 Detalle
  PATCH  /incidencias/:id/estado          Cambiar estado + timestamp automático
  PATCH  /incidencias/:id/avance          Actualizar % de avance
  POST   /incidencias/:id/foto            Adjuntar foto del trabajo

REGLAS DE RECORDATORIO
  GET    /recordatorios/reglas            Lista de reglas del complejo
  POST   /recordatorios/reglas            Crear regla
  PUT    /recordatorios/reglas/:id        Editar regla
  PATCH  /recordatorios/reglas/:id/toggle Activar/pausar regla
  POST   /recordatorios/reglas/:id/enviar Enviar manualmente ahora

REPORTES JUNTA
  GET    /reportes/junta/:periodo         Datos del reporte (YYYY-MM)
  POST   /reportes/junta/:periodo/enviar  Generar PDF y enviar por email
  GET    /reportes/junta/historial        Lista de reportes enviados

MIEMBROS JUNTA
  GET    /junta/miembros                  Lista
  POST   /junta/miembros                  Agregar miembro
  PUT    /junta/miembros/:id              Editar
  DELETE /junta/miembros/:id              Desactivar

PORTAL RESIDENTE (autenticación separada)
  POST   /portal/auth/login               Login del residente
  GET    /portal/mi-cuenta                Estado de cuenta + últimos pagos
  GET    /portal/pagos                    Historial completo
  GET    /portal/pagos/:id/recibo         Descargar recibo en PDF
  GET    /portal/propiedad                Datos de la unidad
  GET    /portal/avisos                   Avisos del complejo
  GET    /portal/incidencias              Mis incidencias
  POST   /portal/incidencias              Reportar nueva incidencia
  POST   /portal/cambio-datos             Solicitar actualización de datos
```

---

## 16. Reglas de negocio adicionales

### Multi-complejo
- Ninguna consulta puede devolver datos de un complejo diferente al del token activo
- El superadmin puede impersonar cualquier complejo pasando `X-Complejo-ID` en el header
- Al crear un nuevo complejo se copia la estructura de `cuotas` y `reglas_recordatorio` de un complejo plantilla (opcional)

### Incidencias
- Al cambiar estado a `asignada` → registrar `asignada_at` y notificar al residente automáticamente
- Al cambiar a `resuelta` → registrar `resuelta_at`, calcular días de resolución, notificar al residente
- Si la incidencia es `urgente` y lleva más de 24h en estado `reportada` → enviar alerta al administrador
- El costo de resolución puede vincularse opcionalmente a un registro en `gastos`

### Recordatorios automáticos
- El cron corre a las 06:00 AM todos los días
- Para cada complejo activo evalúa todas las reglas activas
- Tipo `previo`: ejecutar si `CURRENT_DATE = primer_dia_del_mes - dias_antes`
- Tipo `vencimiento`: ejecutar si `CURRENT_DATE = primer_dia_del_mes` y residente no tiene pago del mes
- Tipo `mora`: ejecutar si `CURRENT_DATE - fecha_vencimiento > dias_mora_min` y ejecutar cada `frecuencia_dias` días
- Cada ejecución registra un historial en `avisos` con `destinatarios` real y métricas de entrega

### Reporte financiero
- Si el día 3 del mes cae en fin de semana, el cron lo envía el siguiente lunes
- El reporte incluye solo datos confirmados (pagos no anulados, gastos registrados)
- Se genera una copia del PDF y se almacena en S3 para consulta posterior

### Portal del residente
- Un residente solo puede ver datos de sus propias unidades (`historial_propietarios` con su `id_propietario`)
- No puede ver datos de otros residentes ni de las finanzas globales del complejo
- Las incidencias reportadas desde el portal entran con estado `reportada` y se notifica al administrador

---

## 17. Variables de entorno adicionales

```env
# PDF (Puppeteer o react-pdf)
PDF_STORAGE_BUCKET=lospinos-reportes

# Cron (zona horaria del complejo)
CRON_TIMEZONE=America/Guatemala

# Portal del residente (JWT separado)
PORTAL_JWT_SECRET=...
PORTAL_JWT_EXPIRY=8h

# Subdominio por complejo (opcional)
PORTAL_BASE_DOMAIN=portal.tuadmin.gt
```

---

## 12. Flujo de desarrollo sugerido (actualizado)

### Fase 1 — Sistema base (sprints 1–8)
1. **Sprint 1 — Multi-complejo + Auth:** Tabla `complejos`, middleware multi-tenant, roles (superadmin / admin / lectura), login
2. **Sprint 2 — Propietarios y unidades:** CRUD propietarios + unidades + historial_propietarios + mapa básico
3. **Sprint 3 — Pagos core:** Registro de pago + estado de cuenta + dashboard por complejo
4. **Sprint 4 — Conciliación bancaria:** Upload banco + algoritmo de match + confirmación
5. **Sprint 5 — Gastos + presupuesto:** CRUD gastos + presupuestos por categoría + gráficas
6. **Sprint 6 — Avisos manuales:** Módulo de avisos con plantillas + envío email/WhatsApp
7. **Sprint 7 — Comprobantes + mapa:** OCR + uploader + visor + polígonos Google Maps
8. **Sprint 8 — Pulish fase 1:** Exportaciones PDF/Excel + refinamiento UX + tests

### Fase 2 — Automatización e inteligencia (sprints 9–12)
9. **Sprint 9 — Recordatorios automáticos:** Motor de reglas + cron + tabla `reglas_recordatorio` + historial
10. **Sprint 10 — Incidencias:** Módulo kanban completo + notificaciones de cambio de estado
11. **Sprint 11 — Reporte junta directiva:** Generación PDF + envío automático mensual + `miembros_junta`
12. **Sprint 12 — Portal del residente:** Subdominio + auth separado + vistas de solo lectura + reporte incidencias

### Fase 3 — Escala (sprints 13–14)
13. **Sprint 13 — Dashboard superadmin:** Vista global multi-complejo + reporte consolidado
14. **Sprint 14 — Pagos en línea:** Integración Stripe o pasarela local (pendiente de definición)

---

*Documento generado a partir del diseño visual y especificaciones definidas en sesión de diseño — junio 2026.*  
*Versión 2.0 — actualizado con módulos de incidencias, recordatorios automáticos, reportes para junta directiva, portal del residente y arquitectura multi-complejo.*  
*Preparado para entrega a equipo de desarrollo (Claude Code).*
