# n8n local para pruebas

Este modo sirve para probar el bot antes de pagar un VPS.

## Iniciar

Desde PowerShell:

```powershell
Set-Location C:\Users\nacho\Documents\codex\poleraflow
powershell -ExecutionPolicy Bypass -File .\tools\n8n-local\start-n8n-local.ps1
```

Abre:

```text
http://127.0.0.1:5678
```

## Iniciar con tunnel temporal

Para probar webhooks externos mientras n8n esta local:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\n8n-local\start-n8n-local.ps1 -Tunnel
```

La URL publica temporal aparece en:

```text
C:\Users\nacho\Documents\codex\poleraflow\.n8n-local\logs\n8n.log
```

## Apagar

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\n8n-local\stop-n8n-local.ps1
```

## Datos locales

n8n guarda sus datos en:

```text
C:\Users\nacho\Documents\codex\poleraflow\.n8n-local
```

No borres esa carpeta si quieres conservar workflows y credenciales.
