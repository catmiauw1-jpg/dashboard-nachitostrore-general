# Flujo n8n: Gmail + cobros con agente AI

Objetivo: confirmar pagos solo cuando coinciden tres piezas:

1. Pedido pendiente en PoleraFlow.
2. Comprobante enviado por WhatsApp.
3. Correo real del Banco Mercantil Santa Cruz.

El comprobante solo no confirma pago. El correo Mercantil solo no confirma si hay varios candidatos.

## Variables necesarias

En Vercel o VPS:

```env
PAYMENT_AI_PROVIDER=ollama
PAYMENT_AI_BASE_URL=http://127.0.0.1:11434
PAYMENT_AI_MODEL=llava:latest
PAYMENT_AI_MIN_CONFIDENCE=0.78

PROOF_AI_PROVIDER=ollama
PROOF_AI_BASE_URL=http://127.0.0.1:11434
PROOF_AI_MODEL=llava:latest
```

Para proveedor OpenAI-compatible:

```env
PAYMENT_AI_PROVIDER=openai-compatible
PAYMENT_AI_BASE_URL=https://tu-proveedor.com/v1
PAYMENT_AI_MODEL=tu-modelo
PAYMENT_AI_API_KEY=tu-key

PROOF_AI_PROVIDER=openai-compatible
PROOF_AI_BASE_URL=https://tu-proveedor.com/v1
PROOF_AI_MODEL=tu-modelo-vision
PROOF_AI_API_KEY=tu-key
```

## Flujo 1: YCloud / WhatsApp

1. Webhook YCloud recibe mensajes y archivos.
2. Si llega imagen o PDF de comprobante, llamar:

```txt
POST https://admin-dhasboard.vercel.app/api/webhooks/n8n/payment-proof-ai
```

Headers:

```txt
x-poleraflow-webhook-secret: {{$env.POLERAFLOW_WEBHOOK_SECRET}}
```

Body recomendado:

```json
{
  "expectedAmount": "{{$json.paymentAmount}}",
  "orderReference": "{{$json.orderReference}}",
  "customerName": "{{$json.customerName}}",
  "phone": "{{$json.phone}}",
  "message": "{{$json.message}}"
}
```

3. Pasar `proofEvidence` y `proofText` al webhook principal del bot:

```txt
POST https://admin-dhasboard.vercel.app/api/webhooks/n8n/waflow-bot
```

El bot guarda el comprobante en `payment_requests` como `proof_received`.

## Flujo 2: Gmail Mercantil

1. Gmail Trigger: filtrar correos de `bmscsa@bmsc.com.bo`.
2. HTTP Request:

```txt
POST https://admin-dhasboard.vercel.app/api/webhooks/gmail/mercantil-payment
```

Headers:

```txt
x-poleraflow-webhook-secret: {{$env.POLERAFLOW_WEBHOOK_SECRET}}
```

Body:

```json
{
  "id": "{{$json.id}}",
  "from": "{{$json.from}}",
  "subject": "{{$json.subject}}",
  "snippet": "{{$json.snippet}}",
  "body": "{{$json.textPlain || $json.textHtml || $json.body}}",
  "email_ts": "{{$json.date}}"
}
```

3. Si la respuesta trae `matched: true`, enviar `replyText` al cliente por YCloud usando `phone`.
4. Si trae `needsManualReview: true`, dejarlo en la cola de pagos del dashboard.

## Reglas del agente

- No confirma sin correo Mercantil.
- No confirma sin comprobante del cliente.
- No confirma si el monto no coincide.
- Si hay nombres distintos entre comprobante y correo, queda en revisión.
- Si hay dos pedidos con el mismo monto y no hay referencia clara, queda en revisión.

## Prueba segura

Primero usar `dryRun: true` en el body de Gmail para ver:

```json
{
  "dryRun": true
}
```

Cuando `matched: true` salga correcto en pruebas, quitar `dryRun`.
