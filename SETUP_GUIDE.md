# Setup Guide - Autobank DTV (Alineado al PRD)

## 1. Database Migration

### Aplicar migración de schema

La migración `supabase/migrations/20250127_align_to_prd_schema.sql` alinea la base de datos con el PRD.

**Opción A: Supabase CLI (recomendado)**
```bash
cd supabase
supabase db push
```

**Opción B: Supabase Dashboard**
1. Ir a SQL Editor en el dashboard de Supabase
2. Abrir el archivo `supabase/migrations/20250127_align_to_prd_schema.sql`
3. Copiar y ejecutar el contenido completo

**Opción C: Manual SQL**
```bash
psql -h db.your-project.supabase.co -U postgres -d postgres -f supabase/migrations/20250127_align_to_prd_schema.sql
```

### Verificar migración exitosa

```sql
-- Verificar columnas de campanas
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'campanas' 
ORDER BY ordinal_position;

-- Verificar columnas de personas_contactar
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'personas_contactar' 
ORDER BY ordinal_position;

-- Verificar enum
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = 'estado_contacto_enum'::regtype;
```

## 2. Edge Functions

### Deploy todas las funciones

```bash
cd /Users/franciscolamberti/Library/Mobile\ Documents/com~apple~CloudDocs/autobank-dtv

# Deploy todas las funciones
supabase functions deploy procesar-archivo
supabase functions deploy webhook-kapso
supabase functions deploy recalcular-distancias
supabase functions deploy generar-corte-diario
```

### Configurar secretos de Edge Functions

```bash
# Kapso API Key para validación WhatsApp
supabase secrets set KAPSO_API_KEY=your_kapso_api_key

# Webhook secret para verificar firma
supabase secrets set KAPSO_WEBHOOK_SECRET=your_webhook_secret
```

## 3. Cloudflare Worker

### Configurar secretos

```bash
cd /Users/franciscolamberti/Library/Mobile\ Documents/com~apple~CloudDocs/autobank-dtv

# Supabase credentials
wrangler secret put SUPABASE_URL
# Valor: https://your-project.supabase.co

wrangler secret put SUPABASE_KEY
# Valor: tu service_role_key

# Kapso credentials
wrangler secret put KAPSO_API_KEY
# Valor: tu API key de Kapso

wrangler secret put KAPSO_PHONE_NUMBER_ID
# Valor: WhatsApp Business Phone Number ID (default, puede ser sobrescrito por campaña)
```

### Deploy worker

```bash
wrangler deploy
```

### Configurar cron trigger (ya configurado en wrangler.toml)
- Cron ejecuta a las 12:00 UTC diariamente
- Procesa recordatorios (09:00 AR)
- Procesa contacto inicial encolado (12:00 AR, inicio ventana 1)

## 4. Frontend (Next.js)

### Configurar variables de entorno

Crear `autobank-dtv/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_WORKER_URL=https://your-worker.your-subdomain.workers.dev
```

### Instalar dependencias y ejecutar

```bash
cd autobank-dtv
npm install
npm run dev
```

### Build para producción

```bash
npm run build
```

## 5. Configurar Kapso Webhook

En el dashboard de Kapso, configurar el webhook URL para que apunte a:
```
https://your-project.supabase.co/functions/v1/webhook-kapso
```

Agregar header:
```
X-Kapso-Signature: {generado por Kapso usando KAPSO_WEBHOOK_SECRET}
```

## 6. Storage Buckets

Verificar que exista el bucket `archivos-dtv` en Supabase Storage:

```sql
-- Si no existe, crear via dashboard o SQL
INSERT INTO storage.buckets (id, name, public) 
VALUES ('archivos-dtv', 'archivos-dtv', false)
ON CONFLICT (id) DO NOTHING;
```

Políticas de seguridad (RLS) para el bucket:
- Permitir upload autenticado
- Permitir lectura desde Edge Functions (service_role)

## 7. Probar el sistema

### Test 1: Crear campaña con archivo de prueba

1. Ir a http://localhost:3000/campanas/nueva
2. Completar formulario con todos los campos PRD
3. Subir archivo: `2025.10.27.Piloto Autobank - DTV - Estatus - Archivo de datos.xlsx`
4. Confirmar creación

Verificar:
- Edge Function `procesar-archivo` se ejecuta automáticamente
- Personas se insertan en DB con campos PRD
- Deduplicación por `nro_cliente` funciona
- Teléfonos normalizados a E.164
- Export "Fuera de rango" se genera

### Test 2: Envío manual de mensajes

1. Desde detalle de campaña, click "Enviar Mensajes"
2. Worker valida horario y fecha_fin_contactacion
3. Si fuera de horario → encola
4. Si dentro de horario → envía a Kapso

Verificar:
- Batch processing (10 por batch)
- Estados se actualizan (enviado_whatsapp)
- intentos_envio incrementa correctamente

### Test 3: Webhook de respuesta

Simular webhook desde Kapso:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/webhook-kapso \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Signature: sha256=..." \
  -d '{
    "tracking_id": "test-123",
    "workflow_id": "workflow-123",
    "phone_number": "+5491156571617",
    "context": {
      "source": "sistema_pickit",
      "campana_id": "uuid-campana",
      "persona_id": "uuid-persona"
    },
    "variables": {
      "confirmado": true,
      "fecha_compromiso": "2025-11-10"
    }
  }'
```

Verificar:
- Firma se valida correctamente
- Estado cambia a `confirmado`
- `fecha_compromiso` se actualiza
- Contadores de campaña se actualizan

### Test 4: Dashboard - 5 buckets PRD

1. Ir a detalle de campaña
2. Verificar que aparecen los 5 buckets:
   - Comprometidos (confirmado + fecha_compromiso)
   - In Progress (encolado, enviado_whatsapp, respondio)
   - Fuera de Rango (fuera_de_rango = true)
   - Sin WhatsApp (tiene_whatsapp = false)
   - Atención Especial (rechazado OR solicita_retiro_domicilio)

3. Probar export por bucket (botón "Exportar" en cada sección)

### Test 5: Recordatorios

Simular cron a las 09:00 AR:
```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"tipo": "recordatorios"}'
```

Verificar:
- Busca confirmados con fecha_compromiso = hoy
- Envía workflow de recordatorio
- Marca recordatorio_enviado = true

### Test 6: Corte diario Pickit

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"tipo": "corte-diario", "campana_id": "uuid-campana"}'
```

Verificar:
- Genera XLSX con una fila por WO
- Sube archivo a Storage
- Formato correcto para Pickit

## 8. Checklist de funcionalidades PRD

### Fase 1 (MVP) - Incluye

- [x] Dashboard simple para carga de Excel con validación estricta
- [x] Procesamiento automático: deduplicación por nro_cliente
- [x] Cálculo de distancias Haversine
- [x] Agrupación de work orders
- [x] Validación WhatsApp inicial (pending validation)
- [x] Configuración de franjas horarias: L-V (2 franjas), Sábado (1 franja), Domingo configurable
- [x] Configuración de distancia máxima a puntos Pickit
- [x] Fecha fin de contactación por campaña
- [x] Horario de corte diario configurable (default 20:00)
- [x] Dashboard con 5 buckets: comprometidos, in progress, fuera de rango, sin whatsapp, atención especial
- [x] Exports: bucket-specific, fuera de rango (al crear), diario Pickit
- [x] WhatsApp: flujo happy path y negativo con motivos
- [x] No contactar mismo día de carga
- [x] Primer mensaje siempre día hábil siguiente
- [x] Compromisos post-corte aparecen en corte del día
- [x] Recordatorios automáticos día del compromiso

### Fase 1 - No incluye (postponed)

- [ ] Mapeo configurable de columnas
- [ ] Workflows/cambio de estados avanzados en UI
- [ ] Gestión manual: marcar como entregado, agregar notas (parcial: checkbox devuelto existe)
- [ ] Vista de historial de chat por persona
- [ ] Fecha de inicio de contactación (solo fin)
- [ ] Recontactación automática post-compromiso
- [ ] Reporte crudo general
- [ ] Integración directa con API Pickit

## 9. Arquitectura final

```
Frontend (Next.js 16) @ Vercel
    ↓
Supabase Storage (archivos-dtv)
    ↓
Edge Function: procesar-archivo (automático)
    → Valida columnas, normaliza phones E.164
    → Dedupe nro_cliente > phone
    → Calcula distancias, marca fuera_de_rango
    → Valida WhatsApp (pending)
    → Genera export "Fuera de rango"
    ↓
Supabase DB (campañas, personas_contactar, puntos_pickit)
    ↓
Cloudflare Worker: enviar-campana (manual o cron 12:00 UTC)
    → Handler fetch: envío manual con validaciones
    → Handler scheduled: contacto inicial + recordatorios
    ↓
Kapso API (workflows endpoint)
    → POST /platform/v1/workflows/{id}/executions
    → Workflow principal + workflow recordatorio
    ↓
Edge Function: webhook-kapso (recibir respuestas)
    → Verifica firma X-Kapso-Signature
    → Parsea variables estructuradas
    → Actualiza estados y contadores
    ↓
Edge Function: generar-corte-diario
    → Una fila por WO
    → Upload a Storage
```

## 10. Monitoring y Logs

### Ver logs de Edge Functions
```bash
supabase functions logs procesar-archivo
supabase functions logs webhook-kapso
supabase functions logs generar-corte-diario
```

### Ver logs de Worker
```bash
wrangler tail
```

## 11. Troubleshooting

### Error: "Columnas requeridas faltantes"
- Verificar que el Excel tiene las columnas en los índices correctos según PRD
- Columnas requeridas: 0 (NroCliente), 1 (NroWO), 28 (ApellidoNombre), 32 (X), 33 (Y), 38-41 (teléfonos)

### Error: "tiene_whatsapp = false" en muchas personas
- Verificar normalización de teléfonos a E.164
- Confirmar que KAPSO_API_KEY y KAPSO_PHONE_NUMBER_ID están configurados
- Revisar logs de procesar-archivo para ver intentos de validación

### Mensajes no se envían
- Verificar horario y ventanas configuradas
- Confirmar fecha_fin_contactacion no ha pasado
- Verificar que no es el mismo día de creación de campaña
- Revisar logs del worker con `wrangler tail`

### Webhook no actualiza estados
- Verificar firma X-Kapso-Signature
- Confirmar KAPSO_WEBHOOK_SECRET configurado en Edge Function
- Revisar estructura del payload que envía Kapso
- Ver logs: `supabase functions logs webhook-kapso`

## 12. Próximos pasos operativos

1. Aplicar migración de base de datos
2. Deploy Edge Functions
3. Configurar todos los secretos (Kapso, Supabase, Worker)
4. Deploy Cloudflare Worker
5. Configurar webhook en Kapso
6. Probar con archivo real
7. Monitorear logs en primera ejecución
8. Ajustar configuración según resultados iniciales

