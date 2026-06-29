# Sistema de Facturación

## Requisitos Previos
1. Node.js (versión 14 o superior)
2. MySQL (versión 5.7 o superior)
3. Docker Desktop (para Keycloak + OpenLDAP)
4. Git (opcional)

## Pasos de Instalación

### 1. Base de Datos
1. Abrir MySQL Workbench o el cliente MySQL de tu preferencia
2. Ejecutar el script `database.sql` que se encuentra en la raíz del proyecto

### 2. Infraestructura (Keycloak + LDAP)
1. Levantar los servicios con Docker:
```bash
docker compose up -d
```
2. Esperar ~60 segundos a que Keycloak arranque
3. Configurar la federación LDAP:
```powershell
# Windows (PowerShell):
.\ldap\setup-federation.ps1

# Linux/Mac (Bash):
bash ldap/setup-federation.sh
```
> Para más detalles ver: `FEDERACION_LDAP.md`

### 3. Aplicación
1. Clonar o descargar este repositorio
2. Abrir una terminal en la carpeta del proyecto
3. Instalar las dependencias:
```bash
npm install
```
4. Crear el archivo de configuración:
   - Copiar el archivo `.env.example` y renombrarlo a `.env`
   - Editar el archivo `.env` con tus credenciales de base de datos:
```
DB_HOST=localhost
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_DATABASE=sistema_facturacion
PORT=3000
```

### 4. Iniciar el Sistema
1. Ejecutar el siguiente comando:
```bash
npm start
```
2. Abrir el navegador y acceder a: `http://localhost:3002`

## Estructura de Carpetas
- `/public` - Archivos estáticos (CSS, JS, imágenes)
- `/routes` - Rutas de la aplicación
- `/views` - Plantillas EJS
- `/config` - Configuración de la base de datos
- `/ldap` - Configuración de federación LDAP (bootstrap, scripts)
- `/uploads` - Carpeta donde se guardan las imágenes subidas

## Funcionalidades
- Gestión de productos
- Gestión de clientes
- Generación de facturas
- Configuración de impresión
- Soporte para logo y QR de pagos
- Autenticación SSO con Keycloak (ver `KEYCLOAK_INTEGRACION.md`)
- Federación de usuarios LDAP (ver `FEDERACION_LDAP.md`)

