# Environment Variables Template - Autobank DTV

## Frontend (Next.js) - autobank-dtv/.env.local

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Cloudflare Worker URL
NEXT_PUBLIC_WORKER_URL=https://your-worker.your-subdomain.workers.dev
```

## Edge Functions (Supabase)

Usar `supabase secrets set`:

```bash
# Kapso API Key (para validación WhatsApp en procesar-archivo)
supabase secrets set KAPSO_API_KEY=your_kapso_api_key

# Kapso Webhook Secret (para verificar firma en webhook-kapso)
supabase secrets set KAPSO_WEBHOOK_SECRET=your_webhook_secret_shared_with_kapso
```

## Cloudflare Worker

Usar `wrangler secret put`:

```bash
# Supabase
wrangler secret put SUPABASE_URL
# Valor: https://your-project.supabase.co

wrangler secret put SUPABASE_KEY
# Valor: your_supabase_service_role_key

# Kapso
wrangler secret put KAPSO_API_KEY
# Valor: your_kapso_api_key

wrangler secret put KAPSO_PHONE_NUMBER_ID
# Valor: your_default_whatsapp_business_phone_number_id
```

## Notas

- Los workflow IDs se configuran por campaña en el frontend
- Si no se especifican, se pueden usar defaults del env
- Cada campaña puede sobrescribir:
  - `kapso_workflow_id` (workflow principal)
  - `kapso_workflow_id_recordatorio` (workflow recordatorio)
  - `kapso_phone_number_id` (WhatsApp Business Phone Number ID)

- Timezone default: `America/Argentina/Buenos_Aires` (configurable por campaña)

- Ventanas horarias por defecto (configurables por campaña):
  - Lunes-Viernes:
    - Ventana 1: 12:00-15:00
    - Ventana 2: 18:00-20:30
  - Sábado: 10:00-13:00
  - Domingo: deshabilitado (configurable con `contactar_domingo`)

- Horario de corte diario default: 20:00 (configurable por campaña)

