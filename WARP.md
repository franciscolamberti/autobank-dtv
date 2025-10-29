# WARP.md

this file provides guidance to warp (warp.dev) when working with code in this repository.

## project overview

whatsapp campaign management system for dtv decoder returns at nearby pickit points. processes excel files, calculates distances using haversine formula, deduplicates customers, and sends personalized whatsapp messages via kapso api.

## architecture

multi-tier system:
- **frontend**: next.js 16 app in `/autobank-dtv`
- **backend**: supabase (postgresql + storage)
- **processing**: 3 supabase edge functions (deno)
- **messaging**: cloudflare worker for scheduled/manual whatsapp sending
- **external**: kapso api for whatsapp business

### key data flow
1. user uploads excel → supabase storage
2. `procesar-archivo` edge function processes file automatically
3. calculates haversine distances to 26 pickit points
4. deduplicates by phone, groups multiple decoders per person
5. cloudflare worker sends messages (12:00-15:00 argentina time)
6. `webhook-kapso` receives customer responses

## development commands

### frontend (next.js)
```bash
cd autobank-dtv
npm install
npm run dev        # start dev server
npm run build      # production build
npm run lint       # eslint
npm start          # start production server
```

### cloudflare worker
```bash
npm install                          # install root dependencies
wrangler dev                         # local worker testing
wrangler deploy                      # deploy to cloudflare
wrangler secret put SUPABASE_URL     # configure secrets
```

**important**: worker has `DRY_RUN = true` flag at top of `src/enviar-campana.js` - change to false for production

### supabase edge functions
deployed via supabase cli (not managed from this repo):
```bash
supabase functions deploy procesar-archivo
supabase functions deploy webhook-kapso
supabase functions deploy recalcular-distancias
```

### testing
```bash
python3 generar_archivo_prueba.py    # generates test excel with 100 persons
```

## critical architectural details

### haversine distance calculation
implemented in both `procesar-archivo` edge function and potentially cloudflare worker. uses earth radius of 6,371,000 meters. coordinates in excel are in microdegrees (divided by 1,000,000 if > 180).

### excel file format (dtv)
- column ag (index 32): longitude
- column ah (index 33): latitude
- columns 37-40: phone numbers (priority 40 > 39 > 38 > 37)
- column 28: customer name
- column 0: customer number
- column 1: work order number

### deduplication logic
**critical feature**: same person appears multiple times with different decoders. system groups by `telefono_principal`:
- consolidates all `nro_cliente` and `nro_wo` into arrays
- stores `cantidad_decos` count
- sends single whatsapp message adapted for multiple decoders
- reduces costs and improves customer experience

**status**: documented in prd.md but not fully implemented yet (see progress.md)

### time restrictions
whatsapp messages only sent 12:00-15:00 argentina time (`America/Argentina/Buenos_Aires`). outside this window, messages marked as `encolado` (queued) and sent by cron job.

### database schema
three main tables:
- `puntos_pickit`: 26 pre-loaded pickup points with lat/lon
- `campañas`: campaign configuration (distancia_max defaults to 2000m)
- `personas_contactar`: customers with location, distance, contact state

state machine: `pendiente → encolado → enviado_whatsapp → respondio → confirmado/rechazado`

## component locations

### frontend structure
```
autobank-dtv/
├── app/
│   ├── page.tsx              # dashboard (campaign list)
│   ├── campanas/
│   │   └── nueva/            # 3-step wizard for new campaign
│   └── layout.tsx
├── components/               # shadcn/ui components
└── lib/
    └── supabase.ts          # supabase client config
```

### backend structure
```
supabase/functions/
├── procesar-archivo/         # automatic excel processing
├── webhook-kapso/            # receive customer responses
└── recalcular-distancias/    # recalc when distancia_max changes
```

### worker
```
src/enviar-campana.js         # cloudflare worker (fetch + scheduled handlers)
wrangler.toml                 # cron: "0 12 * * *" (12:00 utc)
```

## environment variables

### frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### cloudflare worker (secrets)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY    # needed for auth bypass
KAPSO_API_KEY
KAPSO_FLOW_ID
KAPSO_WHATSAPP_CONFIG_ID
```

## kapso integration

endpoint: `https://app.kapso.ai/api/v1/flows/{flow_id}/executions`

payload includes:
- `phone_number`: customer phone
- `whatsapp_config_id`: kapso config
- `variables`: personalized data (nombre_cliente, nro_cliente, cantidad_decos, punto_pickit, direccion_punto, distancia)
- `context`: tracking info (campana_id, persona_id)

## technical constraints

- edge functions: 10s timeout, 2mb response limit
- cloudflare workers: 30s cpu time, 50000ms limit in wrangler.toml
- excel files: optimized for <10k rows
- batch processing: 10 messages per batch, 1s delay between batches

## pending work (from progress.md)

1. **critical**: complete deduplication implementation (db migration + edge function + worker + frontend)
2. implement `campañas/[id]` detail page with send button
3. implement `campañas/[id]/personas` list page with filters
4. deploy `webhook-kapso` and `recalcular-distancias` edge functions
5. obtain real kapso credentials
6. deploy cloudflare worker to production
7. change `DRY_RUN = false` in worker

## code style notes

- all lowercase file names and variables (spanish language used throughout)
- typescript for frontend, javascript for worker
- supabase edge functions use deno (typescript)
- uses radix-ui components via shadcn/ui
- tailwind css for styling
