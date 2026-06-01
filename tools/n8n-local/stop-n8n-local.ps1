$ErrorActionPreference = "SilentlyContinue"

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -in @("node.exe", "cmd.exe")) -and (
      $_.CommandLine -match "n8n start" -or
      $_.CommandLine -match "tools\\n8n-local\\runtime\\node_modules" -or
      $_.CommandLine -match "n8n\\bin\\n8n"
    )
  }

if (-not $processes) {
  Write-Host "No encontre procesos locales de n8n."
  exit 0
}

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
  Write-Host "n8n detenido: proceso $($process.ProcessId)"
}
