# 🔐 Integración Keycloak SSO — Sistema de Facturación ECL FRUVER

> **Fecha:** 2026-06-23  
> **Stack:** Node.js + Express + EJS + Keycloak  
> **Objetivo:** Autenticación SSO, MFA y control de acceso por roles sin reemplazar la lógica de negocio existente.

---

## 📋 Índice

1. [Resumen General](#resumen-general)
2. [Infraestructura (Docker + Keycloak)](#infraestructura-docker--keycloak)
3. [Archivos Modificados](#archivos-modificados)
4. [Archivos Nuevos](#archivos-nuevos)
5. [Cambios en Detalle](#cambios-en-detalle)
6. [Roles y Permisos](#roles-y-permisos)
7. [MFA (Autenticación Multifactor)](#mfa-autenticación-multifactor)
8. [Flujo de Autenticación](#flujo-de-autenticación)
9. [Cómo Ejecutar el Sistema](#cómo-ejecutar-el-sistema)
10. [Administración de Usuarios](#administración-de-usuarios)
11. [Troubleshooting](#troubleshooting)

---

## Resumen General

Se integró **Keycloak** como proveedor de identidad (IdP) usando el protocolo **OpenID Connect (OIDC)**. Keycloak gestiona:

| Funcionalidad | Estado | Descripción |
|---|---|---|
| **Autenticación** | ✅ Activo | Login centralizado via Keycloak |
| **SSO** | ✅ Activo | Sesión compartida entre apps del mismo realm |
| **MFA** | ✅ Configurado | OTP requerido para nuevos usuarios |
| **Roles** | ✅ Implementado | `admin` y `facturador` con control de acceso |

**Principio clave:** La lógica de negocio (facturación, productos, clientes) **no fue modificada**. Solo se agregó una capa de autenticación y autorización encima.

---

## Infraestructura (Docker + Keycloak)

### Contenedor Docker

```bash
docker run -d \
  --name keycloak \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

| Parámetro | Valor |
|---|---|
| **Nombre del contenedor** | `keycloak` |
| **Puerto** | `8080` |
| **Admin de Keycloak** | `admin` / `admin` |
| **Modo** | Desarrollo (`start-dev`) |
| **Consola admin** | http://localhost:8080/admin |

### Configuración del Realm

| Propiedad | Valor |
|---|---|
| **Realm** | `facturacion-realm` |
| **Client ID** | `facturacion-app` |
| **Client Type** | OpenID Connect |
| **Client Authentication** | OFF (cliente público) |
| **Standard Flow** | ON |
| **Valid Redirect URIs** | `http://localhost:3002/*` |

---

## Archivos Modificados

| Archivo | Tipo de Cambio |
|---|---|
| `server.js` | Integración principal de Keycloak |
| `db.js` | Sincronización de credenciales de BD |
| `views/index.ejs` | Navbar con usuario + roles |
| `views/productos.ejs` | Navbar con usuario + roles |
| `views/clientes.ejs` | Navbar con usuario + roles |
| `views/ventas.ejs` | Navbar con usuario + roles |
| `views/configuracion.ejs` | Navbar con usuario + logout |

## Archivos Nuevos

| Archivo | Propósito |
|---|---|
| `keycloak.json` | Configuración del adaptador Keycloak |
| `KEYCLOAK_INTEGRACION.md` | Este documento |

### Dependencia agregada

```bash
npm install keycloak-connect
```

Agrega el paquete `keycloak-connect` — adaptador oficial de Keycloak para Express/Connect.

---

## Cambios en Detalle

### 1. `keycloak.json` (NUEVO)

```json
{
  "realm": "facturacion-realm",
  "auth-server-url": "http://localhost:8080/",
  "ssl-required": "none",
  "resource": "facturacion-app",
  "public-client": true,
  "confidential-port": 0
}
```

- `realm`: Nombre del realm creado en Keycloak.
- `auth-server-url`: URL base de Keycloak.
- `ssl-required: "none"`: Porque estamos en desarrollo local (HTTP).
- `resource`: El Client ID registrado en Keycloak.
- `public-client: true`: No se requiere client secret (Client Authentication OFF).

---

### 2. `server.js` — Cambios principales

#### 2.1 Importación y MemoryStore compartido

```diff
+ const Keycloak = require('keycloak-connect');

+ // ── Keycloak: store compartido con express-session ──
+ const memoryStore = new session.MemoryStore();
```

**¿Por qué?** Keycloak almacena los tokens de sesión (grants) en el mismo store que `express-session`. Ambos deben compartir la misma instancia de `MemoryStore`.

#### 2.2 Sesión con store compartido

```diff
  app.use(session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
+     store: memoryStore,
      cookie: {
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
-         sameSite: 'strict'
+         sameSite: 'lax'
      }
  }));
```

**¿Por qué `sameSite: 'lax'`?** Con `strict`, el navegador no envía la cookie de sesión durante el redirect de vuelta desde Keycloak (es un request cross-site), lo que rompe el flujo OIDC.

#### 2.3 Inicialización y middleware de Keycloak

```diff
+ const keycloak = new Keycloak({ store: memoryStore });
+ app.use(keycloak.middleware({ logout: '/logout', admin: '/' }));
```

- `keycloak.middleware()` intercepta las URLs de callback OIDC (`/sso/login`, `/sso/logout`).
- `logout: '/logout'` registra automáticamente la ruta `/logout` que cierra sesión en la app Y en Keycloak.

#### 2.4 Inyección de datos del usuario en las vistas

```diff
+ if (req.kauth && req.kauth.grant) {
+     const tokenContent = req.kauth.grant.access_token.content;
+     res.locals.user = tokenContent;
+     res.locals.userRoles = (tokenContent.realm_access && tokenContent.realm_access.roles) || [];
+ } else {
+     res.locals.user = null;
+     res.locals.userRoles = [];
+ }
```

**Resultado:** En cualquier vista EJS se puede usar:
- `<%= user.preferred_username %>` → nombre de usuario
- `<%= user.email %>` → email
- `<%= user.given_name %>` → nombre
- `<%= user.family_name %>` → apellido
- `<%= userRoles %>` → array de roles del realm (ej: `['admin', 'facturador']`)

#### 2.5 Protección de rutas

```diff
- app.get('/', (req, res) => {
+ app.get('/', keycloak.protect(), (req, res) => {

- app.use('/productos',     productosRoutes);
+ app.use('/productos',     keycloak.protect(), productosRoutes);

- app.use('/configuracion', productosRoutes);
+ app.use('/configuracion', keycloak.protect('realm:admin'), configuracionRoutes);
```

- `keycloak.protect()` → requiere cualquier usuario autenticado.
- `keycloak.protect('realm:admin')` → requiere el rol `admin` del realm.

---

### 3. Vistas EJS — Cambios en el Navbar

En las 5 vistas principales se modificó el navbar para incluir:

#### Info del usuario autenticado + botón Salir

```html
<% if (user) { %>
<span class="navbar-text text-light ms-3 d-flex align-items-center gap-2">
    <i class="bi bi-person-circle"></i>
    <span class="d-none d-sm-inline"><%= user.preferred_username %></span>
    <a href="/logout" class="btn btn-outline-danger btn-sm ms-1">
        <i class="bi bi-box-arrow-right"></i>
        <span class="d-none d-md-inline">Salir</span>
    </a>
</span>
<% } %>
```

#### Enlace de Configuración condicional (solo admin)

En `index.ejs`, `productos.ejs`, `clientes.ejs` y `ventas.ejs`:

```html
<% if (userRoles && userRoles.includes('admin')) { %>
<a href="/configuracion" class="btn btn-outline-light nav-btn">
    <i class="bi bi-gear"></i>
    <span class="d-none d-sm-inline">Configuración</span>
</a>
<% } %>
```

**Resultado:** Usuarios sin el rol `admin` no ven el enlace de Configuración. Además, aunque intenten acceder a `/configuracion` directamente por URL, el middleware `keycloak.protect('realm:admin')` los rechaza con un error 403.

---

## Roles y Permisos

### Roles definidos en Keycloak

| Rol | Descripción | Acceso a Configuración |
|---|---|---|
| `admin` | Acceso total al sistema | ✅ Sí |
| `facturador` | Facturación, productos y clientes | ❌ No |

### Mapa de acceso por ruta

| Ruta | Requisito |
|---|---|
| `/` (Facturación) | Autenticado |
| `/productos` | Autenticado |
| `/clientes` | Autenticado |
| `/ventas` | Autenticado |
| `/facturas` | Autenticado |
| `/api/*` | Autenticado |
| `/configuracion` | **Rol `admin`** |
| `/logout` | Autenticado |

### Cómo agregar nuevos roles

1. Ir a Keycloak Admin → `facturacion-realm` → **Realm roles**
2. Click **Create role**
3. Definir nombre y descripción
4. En el código, proteger la ruta con: `keycloak.protect('realm:nombre_del_rol')`

---

## MFA (Autenticación Multifactor)

### Configuración actual

- **Método:** TOTP (Time-based One-Time Password)
- **Estado:** Habilitado como **acción requerida por defecto**
- **Comportamiento:** Los nuevos usuarios deben configurar una app de autenticación (Google Authenticator, Authy, Microsoft Authenticator) en su primer login.

### Cómo funciona

1. El usuario inicia sesión con usuario/contraseña.
2. Keycloak le muestra un QR code.
3. El usuario escanea el QR con su app de autenticación.
4. Ingresa el código de 6 dígitos generado.
5. A partir de ahí, cada login requiere el código OTP además de la contraseña.

### Cómo desactivar MFA para un usuario específico

1. Ir a Keycloak Admin → Users → seleccionar usuario
2. Ir a la pestaña **Credentials**
3. Eliminar la credencial OTP existente
4. Ir a la pestaña **Details** → **Required Actions** → quitar "Configure OTP"

---

## Flujo de Autenticación

```
Usuario → http://localhost:3002
    │
    ▼
keycloak.protect() → ¿Tiene sesión?
    │
    ├── SÍ → Renderiza la página normalmente
    │         (user y userRoles disponibles en EJS)
    │
    └── NO → 302 Redirect → Keycloak Login
                │
                ▼
         Keycloak muestra formulario de login
                │
                ▼
         Usuario ingresa credenciales (+OTP si MFA activo)
                │
                ▼
         Keycloak valida y genera tokens
                │
                ▼
         302 Redirect → http://localhost:3002/sso/login
                │
                ▼
         keycloak-connect intercambia code por tokens
                │
                ▼
         Guarda grant en la sesión (MemoryStore)
                │
                ▼
         302 Redirect → Página original solicitada
                │
                ▼
         Página renderizada con datos del usuario
```

### Logout

```
Usuario hace click en "Salir"
    │
    ▼
GET /logout
    │
    ▼
keycloak.middleware destruye sesión local
    │
    ▼
302 Redirect → Keycloak /logout endpoint
    │
    ▼
Keycloak invalida la sesión SSO
    │
    ▼
302 Redirect → http://localhost:3002
    │
    ▼
keycloak.protect() → Sin sesión → Redirect a login
```

---

## Cómo Ejecutar el Sistema

### Requisitos previos

- **Node.js** v16+
- **Docker** instalado y corriendo
- **MySQL** con la base de datos `reconocimiento`

### Paso 1: Levantar Keycloak

```bash
# Si el contenedor ya existe pero está detenido:
docker start keycloak

# Si es la primera vez:
docker run -d --name keycloak -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest start-dev
```

Esperar ~30 segundos a que Keycloak inicie completamente.

### Paso 2: Iniciar la aplicación

```bash
cd Sistema-Facturacion
npm install       # Solo la primera vez o si se borraron node_modules
npm start         # o: node server.js
```

### Paso 3: Acceder

- **Aplicación:** http://localhost:3002 (redirige a Keycloak para login)
- **Keycloak Admin:** http://localhost:8080/admin (admin/admin)

---

## Administración de Usuarios

### Crear un nuevo usuario

1. Ir a http://localhost:8080/admin
2. Seleccionar realm: `facturacion-realm`
3. Menú lateral: **Users** → **Create new user**
4. Llenar: Username, Email, First Name, Last Name
5. Guardar
6. Ir a pestaña **Credentials** → **Set password**
7. Ingresar contraseña y poner **Temporary: OFF**
8. Ir a pestaña **Role mapping** → **Assign role**
9. Seleccionar `admin` y/o `facturador`

### Usuario de prueba existente

| Campo | Valor |
|---|---|
| **Username** | `admin` |
| **Password** | `admin123` |
| **Roles** | `admin`, `facturador` |

---

## Troubleshooting

### Error: "Access Denied" al acceder a `/configuracion`

**Causa:** El usuario no tiene el rol `admin`.  
**Solución:** En Keycloak Admin → Users → seleccionar usuario → Role mapping → Assign role → `admin`.

### La app no redirige a Keycloak

**Causa:** El contenedor de Keycloak no está corriendo.  
**Solución:**
```bash
docker ps                  # Verificar si está corriendo
docker start keycloak      # Iniciarlo si está detenido
```

### Error "ECONNREFUSED" al iniciar la app

**Causa:** Keycloak no está listo aún o no está corriendo.  
**Solución:** Esperar 30 segundos después de `docker start keycloak` y reintentar.

### La cookie de sesión no se mantiene

**Causa:** `sameSite` configurado como `strict` (ya corregido a `lax`).  
**Verificar:** En `server.js`, la config de sesión debe tener `sameSite: 'lax'`.

### MFA no aparece al hacer login

**Causa:** El usuario ya configuró OTP anteriormente, o "Configure OTP" no está como acción por defecto.  
**Verificar:** Keycloak Admin → Authentication → Required actions → "Configure OTP" debe estar habilitado con "Set as default action" activo.

---

## Estructura Final del Proyecto

```
Sistema-Facturacion/
├── config/
│   └── database.js          # Config alternativa de BD
├── public/
│   ├── css/styles.css
│   ├── js/
│   └── uploads/
├── routes/
│   ├── clientes.js
│   ├── configuracion.js
│   ├── facturas.js
│   ├── productos.js
│   └── ventas.js
├── views/
│   ├── index.ejs             # ✏️ Navbar + user + roles
│   ├── productos.ejs         # ✏️ Navbar + user + roles
│   ├── clientes.ejs          # ✏️ Navbar + user + roles
│   ├── ventas.ejs            # ✏️ Navbar + user + roles
│   ├── configuracion.ejs     # ✏️ Navbar + user + logout
│   ├── factura.ejs
│   ├── layout.ejs
│   ├── 404.ejs
│   └── error.ejs
├── db.js                     # ✏️ Credenciales sincronizadas
├── server.js                 # ✏️ Integración Keycloak principal
├── keycloak.json             # 🆕 Config del adaptador Keycloak
├── package.json              # ✏️ +keycloak-connect
├── KEYCLOAK_INTEGRACION.md   # 🆕 Este documento
└── ...
```

Leyenda: ✏️ = Modificado | 🆕 = Nuevo
