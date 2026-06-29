# ===============================================================================
# Script PowerShell: Inicializar datos en OpenLDAP
# ===============================================================================
# Crea la OU y los usuarios de prueba si no existen.
# Ejecutar despues de: docker compose up -d
#
# Uso:
#   .\ldap\init-ldap.ps1
# ===============================================================================

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Inicializando datos en OpenLDAP" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# --- Verificar que OpenLDAP esta corriendo ----------------------------------
$ldapStatus = docker inspect openldap --format "{{.State.Running}}" 2>$null
if ($ldapStatus -ne "true") {
    Write-Host "  [ERROR] OpenLDAP no esta corriendo. Ejecuta: docker compose up -d" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] OpenLDAP esta corriendo" -ForegroundColor Green

# --- Crear OU=usuarios (si no existe) ---------------------------------------
Write-Host "-> Creando OU 'usuarios'..." -ForegroundColor Yellow

$ouLdif = @"
dn: ou=usuarios,dc=facturacion,dc=local
objectClass: organizationalUnit
ou: usuarios
description: Usuarios del Sistema de Facturacion ECL FRUVER
"@

$ouLdif | docker exec -i openldap ldapadd -x -D "cn=admin,dc=facturacion,dc=local" -w admin123 2>&1 | Out-Null

# Verificar
$ouCheck = docker exec openldap ldapsearch -x -D "cn=admin,dc=facturacion,dc=local" -w admin123 -b "dc=facturacion,dc=local" "(ou=usuarios)" dn 2>$null
if ($ouCheck -match "ou=usuarios") {
    Write-Host "  [OK] OU 'usuarios' existe" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] No se pudo crear la OU" -ForegroundColor Red
    exit 1
}

# --- Crear usuarios de prueba -----------------------------------------------
$usuarios = @(
    @{
        uid = "juan.perez"
        cn = "Juan Perez"
        sn = "Perez"
        givenName = "Juan"
        mail = "juan.perez@facturacion.local"
        desc = "Facturador"
    },
    @{
        uid = "maria.garcia"
        cn = "Maria Garcia"
        sn = "Garcia"
        givenName = "Maria"
        mail = "maria.garcia@facturacion.local"
        desc = "Administradora"
    },
    @{
        uid = "carlos.lopez"
        cn = "Carlos Lopez"
        sn = "Lopez"
        givenName = "Carlos"
        mail = "carlos.lopez@facturacion.local"
        desc = "Facturador"
    }
)

foreach ($u in $usuarios) {
    Write-Host "-> Creando usuario '$($u.uid)'..." -ForegroundColor Yellow
    
    # Verificar si ya existe
    $exists = docker exec openldap ldapsearch -x -D "cn=admin,dc=facturacion,dc=local" -w admin123 -b "ou=usuarios,dc=facturacion,dc=local" "(uid=$($u.uid))" dn 2>$null
    
    if ($exists -match $u.uid) {
        Write-Host "  [OK] Ya existe, omitido" -ForegroundColor DarkGray
        continue
    }

    $ldif = @"
dn: uid=$($u.uid),ou=usuarios,dc=facturacion,dc=local
objectClass: inetOrgPerson
objectClass: organizationalPerson
objectClass: person
objectClass: top
cn: $($u.cn)
sn: $($u.sn)
givenName: $($u.givenName)
uid: $($u.uid)
mail: $($u.mail)
userPassword: demo1234
description: Usuario de prueba - $($u.desc)
"@

    $result = $ldif | docker exec -i openldap ldapadd -x -D "cn=admin,dc=facturacion,dc=local" -w admin123 2>&1
    
    if ($result -match "adding new entry") {
        # Usar ldappasswd para establecer la contrasena correctamente (evita problemas de encoding en Windows)
        docker exec openldap ldappasswd -x -D "cn=admin,dc=facturacion,dc=local" -w admin123 -s "demo1234" "uid=$($u.uid),ou=usuarios,dc=facturacion,dc=local" 2>&1 | Out-Null
        Write-Host "  [OK] Creado exitosamente (password OK)" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] $result" -ForegroundColor Red
    }
}

# --- Resumen ----------------------------------------------------------------
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  [OK] DATOS LDAP INICIALIZADOS" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Usuarios creados (password: demo1234):"
Write-Host "    - juan.perez"
Write-Host "    - maria.garcia"
Write-Host "    - carlos.lopez"
Write-Host ""
Write-Host "  Siguiente paso: .\ldap\setup-federation.ps1"
Write-Host ""
