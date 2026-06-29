# Verificacion completa del sistema
$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  VERIFICACION COMPLETA DEL SISTEMA" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# 1 - Containers
Write-Host "1/6 - Docker Containers:" -ForegroundColor Yellow
foreach ($c in @("keycloak", "openldap", "phpldapadmin")) {
    $running = docker inspect $c --format "{{.State.Running}}" 2>$null
    if ($running -eq "true") {
        Write-Host "  [OK] $c" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] $c NO corriendo" -ForegroundColor Red
        $allOk = $false
    }
}

# 2 - Keycloak
Write-Host ""
Write-Host "2/6 - Keycloak responde:" -ForegroundColor Yellow
try {
    $kc = Invoke-WebRequest -Uri "http://localhost:8080/realms/master" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  [OK] HTTP $($kc.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No responde" -ForegroundColor Red
    $allOk = $false
}

# 3 - Realm
Write-Host ""
Write-Host "3/6 - Realm facturacion-realm:" -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "http://localhost:8080/realms/facturacion-realm" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
    Write-Host "  [OK] Existe" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No existe" -ForegroundColor Red
    $allOk = $false
}

# 4 - Client
Write-Host ""
Write-Host "4/6 - Client facturacion-app:" -ForegroundColor Yellow
try {
    $tr = Invoke-RestMethod -Uri "http://localhost:8080/realms/master/protocol/openid-connect/token" -Method POST -ContentType "application/x-www-form-urlencoded" -Body @{ username="admin"; password="admin"; grant_type="password"; client_id="admin-cli" } -TimeoutSec 5
    $tk = $tr.access_token
    $clients = Invoke-RestMethod -Uri "http://localhost:8080/admin/realms/facturacion-realm/clients" -Headers @{ "Authorization"="Bearer $tk" } -TimeoutSec 5
    $found = $clients | Where-Object { $_.clientId -eq "facturacion-app" }
    if ($found) {
        Write-Host "  [OK] Existe" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] No existe" -ForegroundColor Red
        $allOk = $false
    }
} catch {
    Write-Host "  [ERROR] No se pudo verificar: $_" -ForegroundColor Red
    $allOk = $false
}

# 5 - LDAP users
Write-Host ""
Write-Host "5/6 - OpenLDAP + Usuarios:" -ForegroundColor Yellow
$users = docker exec openldap ldapsearch -x -D "cn=admin,dc=facturacion,dc=local" -w admin123 -b "ou=usuarios,dc=facturacion,dc=local" "(objectClass=inetOrgPerson)" uid 2>&1
$ul = [regex]::Matches($users, "uid:\s+(\S+)")
if ($ul.Count -gt 0) {
    Write-Host "  [OK] $($ul.Count) usuarios:" -ForegroundColor Green
    foreach ($u in $ul) { Write-Host "       - $($u.Groups[1].Value)" }
} else {
    Write-Host "  [ERROR] Sin usuarios" -ForegroundColor Red
    $allOk = $false
}

# 6 - Federation
Write-Host ""
Write-Host "6/6 - Federacion LDAP en Keycloak:" -ForegroundColor Yellow
try {
    $comps = Invoke-RestMethod -Uri "http://localhost:8080/admin/realms/facturacion-realm/components?type=org.keycloak.storage.UserStorageProvider" -Headers @{ "Authorization"="Bearer $tk" } -TimeoutSec 5
    $ldapProv = $comps | Where-Object { $_.name -eq "OpenLDAP-Facturacion" }
    if ($ldapProv) {
        Write-Host "  [OK] OpenLDAP-Facturacion configurado" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] No configurado" -ForegroundColor Red
        $allOk = $false
    }
} catch {
    Write-Host "  [ERROR] No se pudo verificar" -ForegroundColor Red
    $allOk = $false
}

# Resultado
Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
if ($allOk) {
    Write-Host "  RESULTADO: TODO FUNCIONA CORRECTAMENTE" -ForegroundColor Green
    Write-Host "  El sistema esta listo para la demo!" -ForegroundColor Green
} else {
    Write-Host "  RESULTADO: HAY PROBLEMAS (revisa los errores)" -ForegroundColor Red
}
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Accesos:"
Write-Host "    Keycloak Admin:  http://localhost:8080/admin   (admin/admin)"
Write-Host "    phpLDAPadmin:    https://localhost:6443"
Write-Host "    Sistema:         http://localhost:3002"
Write-Host "    Usuarios LDAP:   juan.perez / maria.garcia / carlos.lopez  (demo1234)"
Write-Host ""
