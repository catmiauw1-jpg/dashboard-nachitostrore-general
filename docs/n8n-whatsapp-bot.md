# Bot de WhatsApp con n8n para PoleraFlow

## Objetivo

El bot debe recibir mensajes de WhatsApp, registrar clientes y pedidos en PoleraFlow, pedir comprobante de pago y dejar todo visible en la dashboard.

## Flujo base

1. Cliente compra desde Nachito Store o escribe por WhatsApp.
2. WhatsApp Cloud API envia el mensaje a n8n por webhook.
3. n8n interpreta el mensaje y normaliza los datos del pedido.
4. n8n llama a PoleraFlow:

```text
POST https://admin-dhasboard.vercel.app/api/webhooks/n8n/whatsapp
```

5. PoleraFlow guarda el pedido en Supabase, descuenta stock y actualiza la dashboard.
6. n8n responde al cliente con el total y pide comprobante.

## Seguridad

En Vercel agrega esta variable al proyecto del dashboard:

```text
N8N_WEBHOOK_SECRET=un_valor_largo_y_privado
```

En el nodo HTTP Request de n8n envia uno de estos headers:

```text
Authorization: Bearer {{$env.N8N_WEBHOOK_SECRET}}
```

o:

```text
x-poleraflow-webhook-secret: {{$env.N8N_WEBHOOK_SECRET}}
```

No pongas ese secreto en Nachito Store ni en codigo publico.

## Payload que n8n debe mandar

Pedido de catalogo:

```json
{
  "action": "create_order",
  "type": "catalog",
  "customerName": "Cliente WhatsApp",
  "customerPhone": "+59170000000",
  "total": 340,
  "items": [
    {
      "productName": "Tokyo Ghoul - Kaneki",
      "color": "Blanco arena",
      "size": "XL",
      "quantity": 1,
      "unitPrice": 175,
      "lineTotal": 175
    },
    {
      "productName": "Dennis Rodman",
      "color": "Negro",
      "size": "M",
      "quantity": 1,
      "unitPrice": 165,
      "lineTotal": 165
    }
  ],
  "notes": "Cliente pide confirmar envio por WhatsApp."
}
```

Pedido personalizado:

```json
{
  "action": "create_order",
  "type": "custom",
  "customerName": "Cliente WhatsApp",
  "customerPhone": "+59170000000",
  "product": "Polera personalizada",
  "color": "Negro",
  "size": "XL",
  "quantity": 1,
  "total": 165,
  "quoteOption": "Solo espalda grande",
  "designDetails": "Imagen grande en espalda, estilo anime.",
  "referenceImages": ["https://url-publica-de-la-imagen.png"]
}
```

Actualizar un pedido:

```json
{
  "action": "update_order",
  "orderId": "#BOT-12345678",
  "payment": "Pago completo",
  "status": "En preparacion",
  "notes": "Comprobante recibido por WhatsApp."
}
```

## Workflow recomendado en n8n

1. Webhook: recibe WhatsApp Cloud API.
2. Code: extrae telefono, nombre, mensaje, imagenes y texto.
3. Switch: separa catalogo, personalizada, comprobante o atencion manual.
4. HTTP Request: registra pedido en PoleraFlow.
5. HTTP Request: responde por WhatsApp Cloud API.
6. Error workflow: si falla, manda el chat a atencion manual.

## Variables necesarias en n8n

```text
POLERAFLOW_WEBHOOK_URL=https://admin-dhasboard.vercel.app/api/webhooks/n8n/whatsapp
N8N_WEBHOOK_SECRET=el_mismo_valor_de_vercel
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_ACCESS_TOKEN=tu_token_de_meta
```

