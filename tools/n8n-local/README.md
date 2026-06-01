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

## Variables locales

El script lee variables desde:

```text
C:\Users\nacho\Documents\codex\poleraflow\.n8n-local.env
```

Ejemplo:

```text
POLERAFLOW_WEBHOOK_SECRET=el-mismo-secreto-de-vercel
POLERAFLOW_WEBHOOK_URL=https://admin-dhasboard.vercel.app/api/webhooks/n8n/whatsapp
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
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

Si localtunnel responde lento o con 408, usa Cloudflare Tunnel:

```powershell
.\.n8n-local\cloudflared.exe tunnel --url http://127.0.0.1:5678 --no-autoupdate
```

La URL publica cambia cada vez que se reinicia el tunnel temporal. En Waflow pega la URL completa del webhook activo de n8n.

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
