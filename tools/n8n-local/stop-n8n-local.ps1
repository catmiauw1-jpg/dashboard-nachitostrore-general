$ErrorActionPreference = "SilentlyContinue"

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -match "n8n start"
  }

if (-not $processes) {
  Write-Host "No encontre procesos locales de n8n."
  exit 0
}

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
  Write-Host "n8n detenido: proceso $($process.ProcessId)"
}
