# Los Pinos Admin

Sistema de administración y control de pagos para complejos habitacionales.
Ver `especificaciones_residencial_los_pinos.md` para el diseño completo.

## Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + React Router v6 (Vite)
- **Backend:** Node.js + Express + Prisma (ESM + TypeScript con `tsx`)
- **Base de datos:** SQL Server 2022 — base `OVA_RESIDENCIAL`

> El documento de especificaciones define el esquema en PostgreSQL. Aquí se usa
> **SQL Server** (entorno del cliente), con el esquema traducido fielmente a T-SQL.
> Ver `backend/prisma/sql/01_schema.sql` para las equivalencias aplicadas.

## Estado

**Sprint 1 — Proyecto base + esquema (completado)**
Base de datos con las tablas `complejos`, `paises`, `propietarios`, `unidades`,
`historial_propietarios`, `usuarios` con sus relaciones, constraints (CHECK, índices
únicos filtrados) y el trigger de no-solapamiento de propietarios. Seed de 10 países.

**Auth + multi-tenant (completado)**
Login JWT (access 8h + refresh 30d, bcrypt), roles `superadmin` / `admin` / `lectura`,
middleware `requireAuth` / `requireRole` y middleware multi-tenant (`resolveComplejo`):
admin/lectura ven solo su `id_complejo`; superadmin tiene vista global e impersona
complejos vía header `X-Complejo-ID`. Rutas de datos protegidas con JWT.

**Multiempresa (completado)**
El superadmin gestiona **varios complejos**: pantalla **Complejos** (`/complejos`, listar/crear) y un
**selector de complejo activo** en la cabecera. El complejo activo se envía como `X-Complejo-ID` y todas
las pantallas (unidades, pagos, gastos, configuración…) operan sobre él, aislando los datos por proyecto.
Endpoints `GET/POST/PUT /api/v1/complejos` (solo superadmin). Admin/lectura siguen atados a su complejo.

**Sistema de diseño aplicado (completado)**
Tokens del documento en Tailwind (sidebar/estados/categorías), fuentes Inter + JetBrains Mono,
íconos Tabler. Librería UI (`Sidebar` 168px, `MainLayout`, `KpiCard`, `StatusBadge`, `MonoAmount`,
`Panel`, `Modal`, `Button`) y Dashboard (7.1).

**Sprint 2 — Propietarios y unidades (completado)**
CRUD de propietarios y unidades con filtrado por complejo, `historial_propietarios` con
asignación/transferencia transaccional (cierra el registro abierto e inserta el nuevo; el
trigger de no-solapamiento valida). Frontend: pantalla Residentes (pestañas Propietarios /
Unidades) y formulario "Nuevo propietario" en 3 pasos (7.4). Mapa interactivo (Google Maps)
diferido — requiere API key.

**Sprint 3 — Facturación configurable: esquema (en progreso)**
Modelo de cuotas administrable en **USD** donde el mantenimiento depende del estado/uso de la
unidad. Tablas: `estados_unidad`, `historial_estado_unidad`, `cuotas` (tarifas), `cargos`
(generados por unidad/mes), `pagos` + `pago_cargos`. Ver `prisma/sql/03_schema_pagos.sql`.
Seed de configuración: `npm run seed:pagos` (4 estados + tarifas Mantenimiento por estado +
Agua variable). Configuración administrable desde la app: rutas `/api/v1/config/estados` y
`/api/v1/config/cuotas` (CRUD, escritura solo admin/superadmin) + pantalla **Configuración**
(pestañas Tarifas / Estados). Cada unidad tiene categoría/estado con historial (`POST
/unidades/:id/estado`). Generación de cargos del mes: `POST /api/v1/cargos/generar { periodo }`
(mantenimiento por categoría + conceptos fijos; idempotente) y `POST /api/v1/cargos` (cargo manual,
p. ej. Agua variable) + pantalla **Pagos**. Registro de pagos que saldan cargos: `POST
/api/v1/pagos` (distribuye el monto entre cargos vía `pago_cargos`, baja saldos y marca
pagado/parcial, transaccional) y `PATCH /api/v1/pagos/:id/anular` (restaura saldos); pantalla
**Pagos** con pestañas Cargos/Pagos y modal "Registrar pago". Estado de cuenta por unidad:
`GET /api/v1/unidades/:id/estado-cuenta` + pantalla en `/pagos/estado-cuenta/:idUnidad`.
Dashboard con datos reales: `GET /api/v1/dashboard/resumen` (KPIs cobrado/pendiente/atrasado/esperado,
distribución, pagos recientes, estado por unidad). **Sprint 3 completo.**

**Mapa del complejo (completado)**
Visor y editor en `/residentes/mapa` con **Leaflet + OpenStreetMap (sin API key)**: búsqueda de
dirección (Nominatim), marcadores por nivel de mora (al día / pendiente / mora), ficha lateral
(propietario, categoría, saldo, meses de atraso, link a Google Maps) y modo edición para colocar el
pin y guardar lat/lng de cada unidad. Backend: `GET /api/v1/unidades/mapa`; coordenadas vía `PUT
/api/v1/unidades/:id`. También se pueden pegar coordenadas/link de Google Maps al editar la unidad.
Pendiente: conciliación bancaria (Sprint 4, diferido) y editor de polígonos del terreno.

**Ubicación del proyecto (completado)**
La dirección (país / departamento / municipio / dirección exacta) vive en el **complejo**, no por
unidad. Catálogos `LVD_PAIS` / `LVD_DEPARTAMENTO` / `LVD_MUNICIPIO` copiados desde la base `VENTAS`
(ver `prisma/sql/04_geo_catalogos.sql`). Endpoints: `GET/PUT /api/v1/complejo` y
`GET /api/v1/complejo/geo/{paises|departamentos|municipios}` (cascada). UI: **Configuración → Proyecto**
(nombre, ciudad, dirección + selects país→departamento→municipio).

**Sprint 5 — Gastos + presupuesto (completado)**
Tablas `gastos` (4.8) y `presupuestos` (4.9) con 6 categorías. Endpoints `/api/v1/gastos`
(CRUD), `/api/v1/gastos/presupuesto` (GET/PUT por categoría) y `/api/v1/gastos/resumen-mensual`
(KPIs + presupuesto vs ejecutado por categoría con alerta ≥90%). Pantalla **Gastos** con KPIs,
barras por categoría, tabla con chips de color + filtro, y modales de nuevo gasto y presupuesto.
Pendiente: comprobantes/adjuntos (Sprint 7) y conciliación (Sprint 4, diferido).

**Sprint 6 — Avisos (completado)**
Tabla `avisos` (4.10). Endpoints `/api/v1/avisos` (historial + crear), `/api/v1/avisos/destinatarios`
(resuelve automáticamente todos/pendientes/atrasados/unidad desde la BD). Pantalla **Avisos** con
pestañas Nuevo aviso (plantillas por tipo, variables `{nombre}` `{monto}` etc., preview de
WhatsApp/email) e Historial (stats + lista). **El despacho real por email/WhatsApp requiere conectar
SMTP / WhatsApp Business API** (pendiente de credenciales); por ahora el aviso se registra y marca enviado.

## Requisitos

- Node.js 20+ (probado con Node 24)
- SQL Server con la base `OVA_RESIDENCIAL` y la instancia accesible

## Configuración

1. Copiar `backend/.env.example` a `backend/.env` y completar `DATABASE_URL` y los secretos JWT.

   La instancia `TRANSFORMA` usa **puerto TCP dinámico**. Para obtener el puerto actual:

   ```powershell
   $inst = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL').TRANSFORMA
   (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$inst\MSSQLServer\SuperSocketNetLib\Tcp\IPAll").TcpDynamicPorts
   ```

   Y ajustar el puerto en `DATABASE_URL` (`sqlserver://localhost:<puerto>;database=OVA_RESIDENCIAL;...`).
   Si el puerto cambia tras reiniciar SQL Server, repetir este paso.

2. Instalar dependencias:

   ```bash
   cd backend  && npm install
   cd frontend && npm install
   ```

## Arranque

Con `iniciar.bat` desde la raíz (Windows), o manualmente:

```bash
# Backend (puerto 3010)
cd backend && npm run dev

# Frontend (puerto 5180)
cd frontend && npm run dev
```

App: http://localhost:5180 — el frontend resuelve el backend vía proxy de Vite (`/api` → `http://localhost:3010`).

## Base de datos

El esquema es la **fuente de verdad en SQL**, no en migraciones de Prisma:

```bash
# Aplicar / recrear esquema (requiere sqlcmd; -I = QUOTED_IDENTIFIER ON; -f 65001 = UTF-8)
sqlcmd -S "DESKTOP-5T971SC\TRANSFORMA" -U sa -P *** -C -d OVA_RESIDENCIAL -I -b -i backend/prisma/sql/01_schema.sql
sqlcmd -S "DESKTOP-5T971SC\TRANSFORMA" -U sa -P *** -C -d OVA_RESIDENCIAL -I -b -f 65001 -i backend/prisma/sql/02_seed_paises.sql
```

Tras cambios en la BD, sincronizar Prisma:

```bash
cd backend && npx prisma db pull && npx prisma generate
```

### Usuarios iniciales (seed)

```bash
cd backend && npm run seed:auth
```

Crea (idempotente) un complejo demo y dos usuarios (contraseña `admin123`, cambiar en prod):

| Email | Rol | Alcance |
|-------|-----|---------|
| `superadmin@lospinos.gt` | superadmin | Vista global (sin complejo) |
| `admin@lospinos.gt` | admin | Complejo "Residencial Los Pinos" |

## Endpoints

Públicos: `GET /api/v1/health`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`.
El resto requiere `Authorization: Bearer <token>`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/health` | Estado de la API y conexión a la BD (público) |
| POST | `/api/v1/auth/login` | Login → `{ token, refreshToken, user }` |
| POST | `/api/v1/auth/refresh` | Renovar access token desde el refresh token |
| POST | `/api/v1/auth/logout` | Cerrar sesión (JWT stateless, descarte en cliente) |
| GET | `/api/v1/auth/me` | Usuario autenticado |
| GET | `/api/v1/paises` | Lista de países activos (protegido) |
| GET·POST | `/api/v1/propietarios` | Listar (con `?q=`) / crear (con asignación opcional) |
| GET·PUT·DELETE | `/api/v1/propietarios/:id` | Detalle / editar / desactivar |
| GET·POST | `/api/v1/unidades` | Listar (con propietario actual) / crear |
| GET·PUT | `/api/v1/unidades/:id` | Detalle (+ polígono) / editar (lat/lng/polígono) |
| GET | `/api/v1/unidades/:id/historial` | Historial de propietarios |
| POST | `/api/v1/unidades/:id/propietario` | Asignar / transferir propietario (transaccional) |

> Las rutas de `propietarios` y `unidades` aplican filtrado por complejo (`resolveComplejo`).
> Superadmin: para operar sobre un complejo concreto, enviar el header `X-Complejo-ID: <uuid>`.
