# Receipt Email Automation Setup

## 1) Deploy functions

```bash
supabase functions deploy send-receipt-email --no-verify-jwt
supabase functions deploy retry-receipt-email --no-verify-jwt
supabase functions deploy generate-receipt-pdf
```

## 2) Configure function secrets

Set these secrets in your Supabase project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RECEIPT_EMAIL_FROM` (example: `receipts@yourdomain.com`)
- `RECEIPT_WEBHOOK_SECRET` (long random string)

```bash
supabase secrets set \
  RESEND_API_KEY=... \
  RECEIPT_EMAIL_FROM=... \
  RECEIPT_WEBHOOK_SECRET=...
```

## 3) Apply migration

Run your normal migration command so table + queue trigger are created:

```bash
supabase db push
```

This creates:
- `public.receipt_email_dispatch`
- trigger `trg_enqueue_receipt_email_dispatch` on `public.vantiga_entries`

## 4) Create Database Webhook

Create a Supabase Database Webhook in Dashboard:

- Table: `public.vantiga_entries`
- Events: `INSERT`, `UPDATE`
- Endpoint: `https://<project-ref>.supabase.co/functions/v1/send-receipt-email`
- Headers:
  - `x-webhook-secret: <RECEIPT_WEBHOOK_SECRET>`

The function itself filters events and only sends when `receipt_no` is newly set.

## 5) Add retry schedule (recommended)

Create a scheduled HTTP call (every 10-15 minutes) to:

- `POST https://<project-ref>.supabase.co/functions/v1/retry-receipt-email`
- Header: `x-webhook-secret: <RECEIPT_WEBHOOK_SECRET>`
- Body:

```json
{
  "limit": 25,
  "max_attempts": 5
}
```

## 6) Smoke test

1. Create cash entry so receipt number is generated.
2. Confirm row appears in `receipt_email_dispatch`.
3. Confirm row status becomes `sent`.
4. Confirm recipient gets email with `receipt-<receipt_no>.pdf` attachment.
