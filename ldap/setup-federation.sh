#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Script: Configurar Federación LDAP en Keycloak vía API REST
# ═══════════════════════════════════════════════════════════════════════════════
# Este script configura automáticamente la conexión entre Keycloak y OpenLDAP.
#
# Uso:
#   chmod +x ldap/setup-federation.sh
#   bash ldap/setup-federation.sh
#
# Requisitos:
#   - Keycloak corriendo en http://localhost:8080
#   - OpenLDAP corriendo en el puerto 389
#   - curl instalado
#   - El realm "facturacion-realm" ya debe existir
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# ─── Configuración ──────────────────────────────────────────────────────────
KEYCLOAK_URL="http://localhost:8080"
REALM="facturacion-realm"
KC_ADMIN="admin"
KC_PASSWORD="admin"

# Detectar si Keycloak y LDAP están en Docker (misma red) o no
# Si ambos están en Docker Compose → usar nombre del servicio "ldap"
# Si Keycloak corre en host nativo → usar "localhost"
if docker inspect keycloak --format '{{.HostConfig.NetworkMode}}' 2>/dev/null | grep -q "facturacion-net"; then
    LDAP_HOST="ldap"
    echo "✓ Keycloak detectado en Docker → usando LDAP_HOST=ldap"
else
    LDAP_HOST="host.docker.internal"
    echo "✓ Keycloak en host nativo → usando LDAP_HOST=localhost"
    LDAP_HOST="localhost"
fi

LDAP_PORT="389"
LDAP_CONNECTION_URL="ldap://${LDAP_HOST}:${LDAP_PORT}"
LDAP_BIND_DN="cn=admin,dc=facturacion,dc=local"
LDAP_BIND_CREDENTIAL="admin123"
LDAP_USERS_DN="ou=usuarios,dc=facturacion,dc=local"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Configuración de Federación LDAP en Keycloak"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Keycloak:    ${KEYCLOAK_URL}"
echo "  Realm:       ${REALM}"
echo "  LDAP URL:    ${LDAP_CONNECTION_URL}"
echo "  Users DN:    ${LDAP_USERS_DN}"
echo ""

# ─── Paso 1: Obtener token de acceso ────────────────────────────────────────
echo "→ Paso 1: Obteniendo token de administración..."

TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KC_ADMIN}" \
  -d "password=${KC_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || \
  curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KC_ADMIN}" \
  -d "password=${KC_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "✗ ERROR: No se pudo obtener el token. ¿Keycloak está corriendo en ${KEYCLOAK_URL}?"
    echo "  Intenta: docker start keycloak"
    exit 1
fi

echo "  ✓ Token obtenido correctamente"

# ─── Paso 2: Verificar que el realm existe ──────────────────────────────────
echo "→ Paso 2: Verificando que el realm '${REALM}' existe..."

REALM_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}" \
  -H "Authorization: Bearer ${TOKEN}")

if [ "$REALM_CHECK" != "200" ]; then
    echo "  ✗ ERROR: El realm '${REALM}' no existe. Créalo primero en Keycloak."
    exit 1
fi

echo "  ✓ Realm '${REALM}' encontrado"

# ─── Paso 3: Verificar si ya existe un proveedor LDAP ───────────────────────
echo "→ Paso 3: Verificando proveedores de federación existentes..."

EXISTING=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/components?type=org.keycloak.storage.UserStorageProvider" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$EXISTING" | grep -q "OpenLDAP-Facturacion"; then
    echo "  ⚠ Ya existe un proveedor 'OpenLDAP-Facturacion'. Se omite la creación."
    echo "  Para recrearlo, elimínalo desde Keycloak Admin → User Federation."
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  ✓ Federación LDAP ya configurada"
    echo "═══════════════════════════════════════════════════════════"
    exit 0
fi

# ─── Paso 4: Crear el proveedor de federación LDAP ─────────────────────────
echo "→ Paso 4: Creando proveedor de federación LDAP..."

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/components" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenLDAP-Facturacion",
    "providerId": "ldap",
    "providerType": "org.keycloak.storage.UserStorageProvider",
    "config": {
      "vendor":                    ["other"],
      "connectionUrl":             ["'"${LDAP_CONNECTION_URL}"'"],
      "bindDn":                    ["'"${LDAP_BIND_DN}"'"],
      "bindCredential":            ["'"${LDAP_BIND_CREDENTIAL}"'"],
      "usersDn":                   ["'"${LDAP_USERS_DN}"'"],
      "usernameLDAPAttribute":     ["uid"],
      "rdnLDAPAttribute":          ["uid"],
      "uuidLDAPAttribute":         ["entryUUID"],
      "userObjectClasses":         ["inetOrgPerson, organizationalPerson"],
      "editMode":                  ["READ_ONLY"],
      "syncRegistrations":         ["false"],
      "searchScope":               ["1"],
      "pagination":                ["true"],
      "importEnabled":             ["true"],
      "batchSizeForSync":          ["1000"],
      "fullSyncPeriod":            ["-1"],
      "changedSyncPeriod":         ["-1"],
      "cachePolicy":               ["DEFAULT"],
      "enabled":                   ["true"],
      "priority":                  ["0"],
      "trustEmail":                ["true"],
      "allowKerberosAuthentication": ["false"],
      "useKerberosForPasswordAuthentication": ["false"],
      "debug":                     ["false"]
    }
  }')

if [ "$RESPONSE" = "201" ]; then
    echo "  ✓ Proveedor LDAP creado exitosamente"
else
    echo "  ✗ ERROR: Respuesta inesperada del servidor (HTTP ${RESPONSE})"
    echo "  Revisa la consola de Keycloak para más detalles."
    exit 1
fi

# ─── Paso 5: Disparar sincronización inicial ────────────────────────────────
echo "→ Paso 5: Disparando sincronización de usuarios..."

# Obtener el ID del componente recién creado
COMPONENT_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/components?type=org.keycloak.storage.UserStorageProvider" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -c "
import sys, json
components = json.load(sys.stdin)
for c in components:
    if c['name'] == 'OpenLDAP-Facturacion':
        print(c['id'])
        break
" 2>/dev/null || echo "")

if [ -n "$COMPONENT_ID" ]; then
    SYNC_RESULT=$(curl -s -X POST \
      "${KEYCLOAK_URL}/admin/realms/${REALM}/user-storage/${COMPONENT_ID}/sync?action=triggerFullSync" \
      -H "Authorization: Bearer ${TOKEN}")
    
    echo "  ✓ Sincronización completada: ${SYNC_RESULT}"
else
    echo "  ⚠ No se pudo obtener el ID del componente para sincronizar."
    echo "    Puedes sincronizar manualmente desde Keycloak Admin → User Federation → OpenLDAP-Facturacion → Synchronize all users"
fi

# ─── Resumen final ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ FEDERACIÓN LDAP CONFIGURADA EXITOSAMENTE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Usuarios disponibles en LDAP:"
echo "  ┌──────────────────┬──────────────┬───────────────┐"
echo "  │ Usuario          │ Contraseña   │ Tipo          │"
echo "  ├──────────────────┼──────────────┼───────────────┤"
echo "  │ juan.perez       │ demo1234     │ facturador    │"
echo "  │ maria.garcia     │ demo1234     │ admin         │"
echo "  │ carlos.lopez     │ demo1234     │ facturador    │"
echo "  └──────────────────┴──────────────┴───────────────┘"
echo ""
echo "  Prueba el login en: http://localhost:3002"
echo "  Keycloak Admin:     http://localhost:8080/admin"
echo "  phpLDAPadmin:       https://localhost:6443"
echo ""
