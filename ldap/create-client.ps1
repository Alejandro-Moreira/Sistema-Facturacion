$tr = Invoke-RestMethod -Uri 'http://localhost:8080/realms/master/protocol/openid-connect/token' -Method POST -ContentType 'application/x-www-form-urlencoded' -Body @{ username='admin'; password='admin'; grant_type='password'; client_id='admin-cli' }
$tk = $tr.access_token

$clients = Invoke-RestMethod -Uri 'http://localhost:8080/admin/realms/facturacion-realm/clients' -Headers @{ 'Authorization'="Bearer $tk" }

# --- 1. Client: applebox-web ---
$existsWeb = $clients | Where-Object { $_.clientId -eq 'applebox-web' }
if (-not $existsWeb) {
    Write-Host 'Creating applebox-web client...'
    $clientConfig = @{
        clientId = 'applebox-web'
        enabled = $true
        publicClient = $true
        protocol = 'openid-connect'
        standardFlowEnabled = $true
        directAccessGrantsEnabled = $true
        redirectUris = @('http://localhost:5173/*', 'http://localhost:3000/*', 'http://127.0.0.1:5173/*', 'http://127.0.0.1:3000/*')
        webOrigins = @('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000')
    } | ConvertTo-Json -Depth 4
    
    Invoke-RestMethod -Uri 'http://localhost:8080/admin/realms/facturacion-realm/clients' -Headers @{ 'Authorization'="Bearer $tk"; 'Content-Type'='application/json' } -Method POST -Body $clientConfig
    Write-Host 'Client applebox-web created successfully!'
} else {
    Write-Host 'Client applebox-web already exists.'
}

# --- 2. Client: facturacion-app ---
$existsApp = $clients | Where-Object { $_.clientId -eq 'facturacion-app' }
if (-not $existsApp) {
    Write-Host 'Creating facturacion-app client...'
    $clientConfig = @{
        clientId = 'facturacion-app'
        enabled = $true
        publicClient = $true
        protocol = 'openid-connect'
        standardFlowEnabled = $true
        directAccessGrantsEnabled = $true
        redirectUris = @('http://localhost:3002/*', 'http://localhost:3002/keycloak/login*')
        webOrigins = @('http://localhost:3002')
    } | ConvertTo-Json -Depth 4
    
    Invoke-RestMethod -Uri 'http://localhost:8080/admin/realms/facturacion-realm/clients' -Headers @{ 'Authorization'="Bearer $tk"; 'Content-Type'='application/json' } -Method POST -Body $clientConfig
    Write-Host 'Client facturacion-app created successfully!'
} else {
    Write-Host 'Client facturacion-app already exists.'
}
