# ===============================================================================
# Script PowerShell: Configurar Federacion LDAP en Keycloak via API REST
# ===============================================================================
# Uso (en PowerShell):
#   .\ldap\setup-federation.ps1
#
# Requisitos:
#   - Keycloak corriendo en http://localhost:8080
#   - OpenLDAP corriendo en el puerto 389
#   - El realm "facturacion-realm" ya debe existir
# ===============================================================================

$ErrorActionPreference = "Stop"

# --- Configuracion ----------------------------------------------------------
$KEYCLOAK_URL     = "http://localhost:8080"
$REALM            = "facturacion-realm"
$KC_ADMIN         = "admin"
$KC_PASSWORD      = "admin"

# Detectar si Keycloak esta en Docker (misma red) o en host
try {
    $networkMode = docker inspect keycloak --format '{{.HostConfig.NetworkMode}}' 2>$null
    if ($networkMode -match "facturacion-net") {
        $LDAP_HOST = "ldap"
        Write-Host "  [OK] Keycloak detectado en Docker -> usando LDAP_HOST=ldap" -ForegroundColor Green
    } else {
        $LDAP_HOST = "localhost"
        Write-Host "  [OK] Keycloak en host nativo -> usando LDAP_HOST=localhost" -ForegroundColor Green
    }
} catch {
    $LDAP_HOST = "localhost"
    Write-Host "  [OK] Usando LDAP_HOST=localhost" -ForegroundColor Green
}

$LDAP_CONNECTION_URL  = "ldap://${LDAP_HOST}:389"
$LDAP_BIND_DN         = "cn=admin,dc=facturacion,dc=local"
$LDAP_BIND_CREDENTIAL = "admin123"
$LDAP_USERS_DN        = "ou=usuarios,dc=facturacion,dc=local"

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "  Configuracion de Federacion LDAP en Keycloak" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Keycloak:    $KEYCLOAK_URL"
Write-Host "  Realm:       $REALM"
Write-Host "  LDAP URL:    $LDAP_CONNECTION_URL"
Write-Host "  Users DN:    $LDAP_USERS_DN"
Write-Host ""

# --- Paso 1: Obtener token de acceso ----------------------------------------
Write-Host "-> Paso 1: Obteniendo token de administracion..." -ForegroundColor Yellow

try {
    $tokenResponse = Invoke-RestMethod -Uri "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" `
        -Method POST `
        -ContentType "application/x-www-form-urlencoded" `
        -Body @{
            username   = $KC_ADMIN
            password   = $KC_PASSWORD
            grant_type = "password"
            client_id  = "admin-cli"
        }
    $TOKEN = $tokenResponse.access_token
    Write-Host "  [OK] Token obtenido correctamente" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo obtener el token. Keycloak esta corriendo en ${KEYCLOAK_URL}?" -ForegroundColor Red
    Write-Host "  Intenta: docker start keycloak" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type"  = "application/json"
}

# --- Paso 2: Verificar que el realm existe ----------------------------------
Write-Host "-> Paso 2: Verificando que el realm '$REALM' existe..." -ForegroundColor Yellow

$realmExists = $false
try {
    Invoke-RestMethod -Uri "${KEYCLOAK_URL}/admin/realms/${REALM}" `
        -Headers @{ "Authorization" = "Bearer $TOKEN" } `
        -Method GET | Out-Null
    Write-Host "  [OK] Realm '$REALM' encontrado" -ForegroundColor Green
    $realmExists = $true
} catch {
    Write-Host "  [AVISO] El realm '$REALM' no existe. Intentando crearlo..." -ForegroundColor Yellow
}

if (-not $realmExists) {
    try {
        $realmConfig = @{
            id = $REALM
            realm = $REALM
            enabled = $true
        } | ConvertTo-Json -Depth 4
        
        Invoke-RestMethod -Uri "${KEYCLOAK_URL}/admin/realms" `
            -Headers @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" } `
            -Method POST `
            -Body $realmConfig | Out-Null
            
        Write-Host "  [OK] Realm '$REALM' creado exitosamente" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] No se pudo crear el realm. Detalle: $_" -ForegroundColor Red
        exit 1
    }
}

# --- Paso 3: Verificar si ya existe un proveedor LDAP -----------------------
Write-Host "-> Paso 3: Verificando proveedores de federacion existentes..." -ForegroundColor Yellow

$existing = Invoke-RestMethod `
    -Uri "${KEYCLOAK_URL}/admin/realms/${REALM}/components?type=org.keycloak.storage.UserStorageProvider" `
    -Headers @{ "Authorization" = "Bearer $TOKEN" } `
    -Method GET

$alreadyExists = $existing | Where-Object { $_.name -eq "OpenLDAP-Facturacion" }

if ($alreadyExists) {
    Write-Host "  [AVISO] Ya existe un proveedor 'OpenLDAP-Facturacion'. Se omite la creacion." -ForegroundColor Yellow
    Write-Host "  Para recrearlo, eliminalo desde Keycloak Admin -> User Federation." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Cyan
    Write-Host "  [OK] Federacion LDAP ya configurada" -ForegroundColor Green
    Write-Host "===========================================================" -ForegroundColor Cyan
    exit 0
}

# --- Paso 4: Crear el proveedor de federacion LDAP -------------------------
Write-Host "-> Paso 4: Creando proveedor de federacion LDAP..." -ForegroundColor Yellow

$ldapConfig = @{
    name         = "OpenLDAP-Facturacion"
    providerId   = "ldap"
    providerType = "org.keycloak.storage.UserStorageProvider"
    config       = @{
        vendor                    = @("other")
        connectionUrl             = @($LDAP_CONNECTION_URL)
        bindDn                    = @($LDAP_BIND_DN)
        bindCredential            = @($LDAP_BIND_CREDENTIAL)
        usersDn                   = @($LDAP_USERS_DN)
        usernameLDAPAttribute     = @("uid")
        rdnLDAPAttribute          = @("uid")
        uuidLDAPAttribute         = @("entryUUID")
        userObjectClasses         = @("inetOrgPerson, organizationalPerson")
        editMode                  = @("READ_ONLY")
        syncRegistrations         = @("false")
        searchScope               = @("1")
        pagination                = @("true")
        importEnabled             = @("true")
        batchSizeForSync          = @("1000")
        fullSyncPeriod            = @("-1")
        changedSyncPeriod         = @("-1")
        cachePolicy               = @("DEFAULT")
        enabled                   = @("true")
        priority                  = @("0")
        trustEmail                = @("true")
        allowKerberosAuthentication = @("false")
        useKerberosForPasswordAuthentication = @("false")
        debug                     = @("false")
    }
} | ConvertTo-Json -Depth 4

try {
    Invoke-RestMethod -Uri "${KEYCLOAK_URL}/admin/realms/${REALM}/components" `
        -Headers $headers `
        -Method POST `
        -Body $ldapConfig | Out-Null
    Write-Host "  [OK] Proveedor LDAP creado exitosamente" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo crear el proveedor LDAP. Codigo: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "  Revisa la consola de Keycloak para mas detalles." -ForegroundColor Red
    exit 1
}

# --- Paso 5: Disparar sincronizacion inicial --------------------------------
Write-Host "-> Paso 5: Disparando sincronizacion de usuarios..." -ForegroundColor Yellow

$components = Invoke-RestMethod `
    -Uri "${KEYCLOAK_URL}/admin/realms/${REALM}/components?type=org.keycloak.storage.UserStorageProvider" `
    -Headers @{ "Authorization" = "Bearer $TOKEN" } `
    -Method GET

$componentId = ($components | Where-Object { $_.name -eq "OpenLDAP-Facturacion" }).id

if ($componentId) {
    try {
        $syncResult = Invoke-RestMethod `
            -Uri "${KEYCLOAK_URL}/admin/realms/${REALM}/user-storage/${componentId}/sync?action=triggerFullSync" `
            -Headers @{ "Authorization" = "Bearer $TOKEN" } `
            -Method POST
        Write-Host "  [OK] Sincronizacion completada: added=$($syncResult.added) updated=$($syncResult.updated) removed=$($syncResult.removed) failed=$($syncResult.failed)" -ForegroundColor Green
    } catch {
        Write-Host "  [AVISO] No se pudo sincronizar automaticamente." -ForegroundColor Yellow
        Write-Host "  Sincroniza manualmente desde Keycloak Admin -> User Federation -> Synchronize all users" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [AVISO] No se pudo obtener el ID del componente." -ForegroundColor Yellow
}

# --- Resumen final ----------------------------------------------------------
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "  [OK] FEDERACION LDAP CONFIGURADA EXITOSAMENTE" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Usuarios disponibles en LDAP:"
Write-Host "  +------------------+--------------+---------------+"
Write-Host "  | Usuario          | Contrasena   | Tipo          |"
Write-Host "  +------------------+--------------+---------------+"
Write-Host "  | juan.perez       | demo1234     | facturador    |"
Write-Host "  | maria.garcia     | demo1234     | admin         |"
Write-Host "  | carlos.lopez     | demo1234     | facturador    |"
Write-Host "  +------------------+--------------+---------------+"
Write-Host ""
Write-Host "  Prueba el login en: http://localhost:3002"
Write-Host "  Keycloak Admin:     http://localhost:8080/admin"
Write-Host "  phpLDAPadmin:       https://localhost:6443"
Write-Host ""
