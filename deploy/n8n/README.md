# Despliegue gratis de n8n para PoleraFlow

Este paquete levanta n8n 24/7 en una VM Ubuntu, recomendado para Oracle Cloud Always Free o un VPS barato.

Incluye:

- n8n
- Postgres para guardar workflows y credenciales
- Caddy para HTTPS automatico
- Variables para conectar PoleraFlow y WhatsApp Cloud API

## Por que no Vercel

Vercel sirve para Nachito Store y PoleraFlow, pero n8n necesita un proceso prendido todo el dia. En Vercel las funciones no estan pensadas para ejecutar un servidor permanente de n8n.

## Requisitos

1. Una VM Ubuntu 22.04 o 24.04.
2. Un dominio o subdominio apuntando a la IP publica de la VM, por ejemplo:

```text
n8n.nachitostore.com -> IP_DE_LA_VM
```

3. Puertos abiertos en la nube:

```text
80/tcp
443/tcp
22/tcp
```

## Preparar variables

En la VM:

```bash
mkdir -p ~/poleraflow-n8n
cd ~/poleraflow-n8n
```

Copia los archivos de esta carpeta a la VM y crea `.env` desde `.env.example`:

```bash
cp .env.example .env
nano .env
```

Valores importantes:

```text
N8N_DOMAIN=n8n.tudominio.com
CADDY_EMAIL=tu-correo@gmail.com
POSTGRES_PASSWORD=clave-larga
N8N_ENCRYPTION_KEY=clave-larga-de-32-caracteres
POLERAFLOW_WEBHOOK_SECRET=mismo-secreto-en-vercel
```

## Instalar

```bash
sudo bash install-ubuntu.sh
```

Luego abre:

```text
https://n8n.tudominio.com
```

## Conectar con PoleraFlow

En Vercel, dentro del proyecto del dashboard, agrega:

```text
N8N_WEBHOOK_SECRET=mismo-secreto-en-vercel
```

En n8n, cuando llames a PoleraFlow, manda el header:

```text
x-poleraflow-webhook-secret: mismo-secreto-en-vercel
```

Endpoint:

```text
https://admin-dhasboard.vercel.app/api/webhooks/n8n/whatsapp
```

## Comandos utiles

Ver logs:

```bash
cd /opt/poleraflow-n8n
sudo docker compose logs -f n8n
```

Reiniciar:

```bash
cd /opt/poleraflow-n8n
sudo docker compose restart
```

Actualizar:

```bash
cd /opt/poleraflow-n8n
sudo docker compose pull
sudo docker compose up -d
```

Backup rapido:

```bash
cd /opt/poleraflow-n8n
sudo docker compose exec postgres pg_dump -U n8n n8n > n8n-backup.sql
```

