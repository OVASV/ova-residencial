# Despliegue en Azure — OVA Residencial

Arquitectura elegida: **un solo App Service (Linux, Node 20)** que sirve el API
Express **y** el frontend React ya compilado, contra **Azure SQL Database**.

```
Navegador ──HTTPS──> App Service (Node)
                        ├── /api/v1/*   → API Express
                        ├── /uploads/*  → comprobantes (disco persistente /home/data/uploads)
                        └── /*          → frontend React (carpeta ./public)
                             │
                             └──> Azure SQL Database (OVA_RESIDENCIAL)
```

---

## 1. Requisitos previos
- La base de datos ya está copiada en **Azure SQL Database** ✅
- Tener instalado **Azure CLI** (`az`) o la extensión **Azure App Service** de VS Code.
- Node 20 LTS (Azure). Localmente compila igual.

---

## 2. Cadena de conexión a Azure SQL (formato Prisma)

En el portal de Azure SQL: **Configuración → Cadenas de conexión**, toma el
servidor y arma esta URL (formato que entiende Prisma):

```
sqlserver://TU-SERVIDOR.database.windows.net:1433;database=OVA_RESIDENCIAL;user=TU-USUARIO;password=TU-PASSWORD;encrypt=true;trustServerCertificate=false
```

- `encrypt=true` es **obligatorio** en Azure SQL.
- `trustServerCertificate=false` (Azure usa certificado real).
- Si la contraseña tiene caracteres raros (`;`, `@`, `/`), enciérrala/escápala.

Pruébala localmente antes de desplegar (opcional):
```bash
cd backend
# Edita .env con la DATABASE_URL de Azure y luego:
npx prisma db pull   # si conecta, imprime el esquema; Ctrl-C
```

---

## 3. Firewall de Azure SQL
En el **servidor** de Azure SQL → **Redes / Firewall**:
- Activa **"Permitir que los servicios y recursos de Azure accedan a este servidor"**
  (para que el App Service pueda conectarse).
- Agrega tu **IP pública** si quieres conectarte desde tu PC (Prisma Studio, pruebas).

---

## 4. Crear el App Service

### Opción A — Azure CLI
```bash
az login
az group create -n rg-ova -l eastus2

az appservice plan create -n plan-ova -g rg-ova --is-linux --sku B1

az webapp create -g rg-ova -p plan-ova -n ova-residencial \
  --runtime "NODE:20-lts"
```
> `ova-residencial` debe ser único: la URL será `https://ova-residencial.azurewebsites.net`.

### Opción B — Portal
Crear recurso → **Web App** → Publicar: *Código* → Pila: *Node 20 LTS* → SO: *Linux* → Plan B1.

---

## 5. Variables de entorno (App Settings)

En el App Service → **Configuración → Variables de entorno** (o por CLI abajo).
**No** definas `PORT`: Azure lo inyecta y el código ya lo lee.

| Nombre | Valor |
|---|---|
| `DATABASE_URL` | *(la cadena del paso 2)* |
| `JWT_SECRET` | *(una cadena larga aleatoria)* |
| `JWT_REFRESH_SECRET` | *(otra cadena larga aleatoria, distinta)* |
| `JWT_EXPIRES` | `8h` |
| `JWT_REFRESH_EXPIRES` | `30d` |
| `UPLOAD_DIR` | `/home/data/uploads` |
| `NODE_ENV` | `production` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `WEBSITES_ENABLE_APP_SERVICE_STORAGE` | `true` |

Por CLI (reemplaza valores):
```bash
az webapp config appsettings set -g rg-ova -n ova-residencial --settings \
  DATABASE_URL="sqlserver://...;encrypt=true;trustServerCertificate=false" \
  JWT_SECRET="pon-aqui-un-secreto-largo" \
  JWT_REFRESH_SECRET="otro-secreto-largo-distinto" \
  JWT_EXPIRES="8h" JWT_REFRESH_EXPIRES="30d" \
  UPLOAD_DIR="/home/data/uploads" NODE_ENV="production" \
  SCM_DO_BUILD_DURING_DEPLOYMENT="true" \
  WEBSITES_ENABLE_APP_SERVICE_STORAGE="true"
```

Genera secretos fuertes con:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Comando de inicio** (App Service → Configuración → Configuración general → *Startup Command*):
```
npm start
```

---

## 6. Preparar y desplegar

El backend sirve el frontend desde `backend/public`. Un solo comando lo compila
y lo copia allí:

```bash
cd backend
npm run prep:deploy     # compila el frontend y lo copia a backend/public
```

Luego despliega **la carpeta `backend/`** (Azure compilará el TypeScript y
generará Prisma en Linux gracias a `SCM_DO_BUILD_DURING_DEPLOYMENT=true`):

### Opción A — VS Code (recomendado en Windows)
1. Extensión **Azure App Service** → inicia sesión.
2. Clic derecho en la carpeta **`backend`** → **Deploy to Web App…** → elige `ova-residencial`.
3. Acepta que ejecute el build en el servidor.

### Opción B — Azure CLI (zip deploy)
```bash
cd backend
az webapp deploy -g rg-ova -n ova-residencial --src-path . --type zip
```
> Se despliega `backend/` con su `public/`. `node_modules`, `dist` y `uploads`
> están excluidos por `.gitignore` (Azure los regenera en el build).

Al terminar, abre: **https://ova-residencial.azurewebsites.net**

---

## 7. Migrar los comprobantes ya subidos ⚠️

La base de datos ya trae rutas como `/uploads/<archivo>.pdf` (p. ej. el estado de
cuenta de febrero 2023). Esos **archivos** viven en tu disco local
(`backend/uploads`) y hay que subirlos al almacenamiento persistente de Azure,
o los enlaces darán 404.

1. Entra a **Kudu**: `https://ova-residencial.scm.azurewebsites.net`
2. **Debug console → Bash** → navega/crea `/home/data/uploads`.
3. Arrastra ahí **todo el contenido** de tu carpeta local `backend/uploads`.

(De aquí en adelante, los nuevos comprobantes se guardan directo en
`/home/data/uploads`, que persiste entre reinicios.)

---

## 8. Verificación

```bash
# API viva
curl https://ova-residencial.azurewebsites.net/api/v1/health
# → {"status":"ok","db":"ok",...}
```
- Abre la URL en el navegador → debe cargar el login del sistema.
- Inicia sesión y revisa el dashboard (confirma que lee datos = conecta a Azure SQL).
- Abre un comprobante de un cierre → confirma que el PDF se sirve (paso 7).

---

## Notas y mantenimiento
- **Respaldos:** además de la BD, respalda `/home/data/uploads` (los PDF no están en la BD).
- **SMTP / WhatsApp:** su configuración vive en la BD (por complejo), no en variables
  de entorno; ya viajó con la copia de la base. Verifica que los hosts SMTP sean
  alcanzables desde Azure.
- **Actualizar la app:** repite `npm run prep:deploy` + volver a desplegar `backend/`.
- **Dominio propio / HTTPS:** App Service da HTTPS en `*.azurewebsites.net`. Para un
  dominio propio, agrégalo en *Dominios personalizados* (certificado gratuito administrado).
- **Costo:** el plan **B1** es suficiente para empezar; puedes escalar luego.
