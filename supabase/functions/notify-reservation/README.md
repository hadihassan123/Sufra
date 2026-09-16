# notify-reservation

Log-only / feature-flagged post-reserve notify shell.

- Does **not** modify reservations, stock, or pickup codes.
- Client invokes after successful `create_reservation_safe`; errors are ignored.
- No SMS/WhatsApp provider is connected.

## Secrets

```bash
supabase secrets set NOTIFY_ENABLED=false
supabase secrets set NOTIFY_MODE=log
```

Set `NOTIFY_ENABLED=true` only when you want logs to record `would_notify` lines in the function dashboard.

## Deploy

```bash
supabase functions deploy notify-reservation
```
