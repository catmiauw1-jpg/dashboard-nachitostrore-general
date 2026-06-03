# n8n Credentials Setup

## Required environment variables

Set these in the n8n environment before starting n8n:

```text
POLERAFLOW_BOT_URL=https://admin-dhasboard.vercel.app/api/webhooks/n8n/waflow-bot
POLERAFLOW_WEBHOOK_SECRET=same-value-as-N8N_WEBHOOK_SECRET-in-Vercel
WAFLOW_API_KEY=your-waflow-api-key
```

## Current flow

1. Waflow or Chatwoot sends an inbound WhatsApp event to n8n.
2. n8n calls PoleraFlow `/api/webhooks/n8n/waflow-bot`.
3. PoleraFlow decides the bot response, deduplicates events, stores the conversation, and creates a `payment_requests` row when the client chooses `50%` or `completo`.
4. n8n sends each response message back through Chatwoot/Waflow.

## Payment gateway status

Payment gateway is prepared but disabled:

```text
payment_gateway_enabled=false
payment_provider=manual_pending_gateway
```

When PagosBolivia or Banco Economico is ready, the gateway step should:

1. Read pending rows from `payment_requests`.
2. Generate a QR/checkout URL.
3. Update `payment_requests.qr_url` or `checkout_url`.
4. Send the QR to the customer.
5. Receive provider verification webhook.
6. Mark `payment_requests.status=verified`, `payments.status=Pago completo` or `50% pagado`, and move the order to preparation.
