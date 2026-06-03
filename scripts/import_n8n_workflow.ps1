param(
  [string]$WorkflowPath = ".\workflows\n8n-waflow-bot-starter.json"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$n8nCmd = Join-Path $root "tools\n8n-local\runtime\node_modules\.bin\n8n.cmd"
$userFolder = Join-Path $root ".n8n-local"
$resolvedWorkflow = Resolve-Path (Join-Path $root $WorkflowPath)

if (!(Test-Path $n8nCmd)) {
  throw "n8n local runtime not found at $n8nCmd. Start local n8n setup first."
}

$env:N8N_USER_FOLDER = (Resolve-Path $userFolder).Path

& $n8nCmd import:workflow --input $resolvedWorkflow
& $n8nCmd publish:workflow --id=poleraflow-waflow-bot-starter

Write-Host "Imported and published workflow: $resolvedWorkflow"
