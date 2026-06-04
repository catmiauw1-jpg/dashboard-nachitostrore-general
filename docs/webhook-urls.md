# Webhook URLs

## Waflow / Chatwoot inbound messages

Use this URL in Waflow or Chatwoot webhooks:

```text
https://YOUR_N8N_PUBLIC_URL/webhook/poleraflow-waflow
```

For local testing with Cloudflare Tunnel, replace `YOUR_N8N_PUBLIC_URL` with the active tunnel URL.

Current local tunnel example:

```text
https://remember-durable-resistance-manhattan.trycloudflare.com/webhook/poleraflow-waflow
```

## PoleraFlow bot processor

n8n calls this dashboard endpoint:

```text
https://admin-dhasboard.vercel.app/api/webhooks/n8n/waflow-bot
```

Required header:

```text
x-poleraflow-webhook-secret: $POLERAFLOW_WEBHOOK_SECRET
```

## Future payment gateway webhooks

Keep these endpoints reserved for the payment provider integration:

```text
https://admin-dhasboard.vercel.app/api/webhooks/payments/pagosbolivia
https://admin-dhasboard.vercel.app/api/webhooks/payments/banco-economico
```

They are not active yet. The current bot creates rows in `payment_requests` so later the QR/payment verification can be connected without changing the conversation flow.
