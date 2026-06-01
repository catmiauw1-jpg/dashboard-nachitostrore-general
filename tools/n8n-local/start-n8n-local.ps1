param(
  [switch]$Tunnel
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$runtimeDir = Join-Path $scriptDir "runtime"
$dataDir = Join-Path $projectRoot ".n8n-local"
$localEnvFile = Join-Path $projectRoot ".n8n-local.env"
$logDir = Join-Path $dataDir "logs"
$logFile = Join-Path $logDir "n8n.log"
$errorLogFile = Join-Path $logDir "n8n-error.log"
$n8nCmd = Join-Path $runtimeDir "node_modules\.bin\n8n.cmd"

New-Item -ItemType Directory -Force -Path $dataDir, $logDir | Out-Null

if (Test-Path $localEnvFile) {
  Get-Content $localEnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $name, $value = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
  }
}

$existing = Get-NetTCPConnection -LocalPort 5678 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -First 1
if ($existing) {
  Write-Host "n8n parece estar abierto en http://127.0.0.1:5678"
  Write-Host "Proceso: $($existing.OwningProcess)"
  exit 0
}

$env:N8N_USER_FOLDER = $dataDir
$env:N8N_HOST = "127.0.0.1"
$env:N8N_PORT = "5678"
$env:N8N_PROTOCOL = "http"
$env:N8N_EDITOR_BASE_URL = "http://127.0.0.1:5678"
$env:WEBHOOK_URL = "http://127.0.0.1:5678"
$env:N8N_SECURE_COOKIE = "false"
$env:N8N_DIAGNOSTICS_ENABLED = "false"
$env:N8N_VERSION_NOTIFICATIONS_ENABLED = "false"
$env:GENERIC_TIMEZONE = "America/La_Paz"
$env:TZ = "America/La_Paz"

if (-not (Test-Path $n8nCmd)) {
  Write-Host "Instalando n8n local por primera vez..."
  & "C:\Program Files\nodejs\npm.cmd" install --prefix $runtimeDir --omit=optional --no-audit --no-fund --loglevel=error
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo instalar n8n local."
  }
}

$arguments = @("start")
if ($Tunnel) {
  $arguments += "--tunnel"
}

Write-Host "Iniciando n8n local..."
Write-Host "Datos: $dataDir"
Write-Host "Logs:  $logFile"
Write-Host "Err:   $errorLogFile"

$process = Start-Process `
  -FilePath $n8nCmd `
  -ArgumentList $arguments `
  -WorkingDirectory $runtimeDir `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errorLogFile `
  -WindowStyle Hidden `
  -PassThru

for ($i = 1; $i -le 90; $i++) {
  Start-Sleep -Seconds 2
  $connection = Get-NetTCPConnection -LocalPort 5678 -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" } |
    Select-Object -First 1
  if ($connection) {
    Write-Host "n8n listo: http://127.0.0.1:5678"
    Write-Host "Proceso: $($process.Id)"
    if ($Tunnel) {
      Write-Host "Revisa el log para ver la URL publica temporal del tunnel:"
      Write-Host $logFile
    }
    exit 0
  }

  if ($process.HasExited) {
    Write-Host "n8n se cerro antes de iniciar. Ultimas lineas del log:"
    Get-Content $logFile -Tail 40 -ErrorAction SilentlyContinue
    Get-Content $errorLogFile -Tail 40 -ErrorAction SilentlyContinue
    exit 1
  }
}

Write-Host "n8n sigue iniciando o quedo bloqueado. Ultimas lineas del log:"
Get-Content $logFile -Tail 40 -ErrorAction SilentlyContinue
Get-Content $errorLogFile -Tail 40 -ErrorAction SilentlyContinue
exit 1
