# Cloudflare Workers - Setup y Deploy Automático

## Estado: Conectado a GitHub ✅

El Worker está conectado al repositorio: `https://github.com/franciscolamberti/autobank-dtv`

## Configuración del Worker

**Nombre:** `worker-distancias`  
**Archivo principal:** `src/enviar-campana.js`  
**Cron trigger:** Diario a las 12:00 UTC (09:00 Argentina)

## Deploy Automático desde GitHub

Cloudflare Workers puede hacer deploy automático cuando se hace push al repositorio.

### Pasos para Activar Auto-Deploy

1. **Ir a Cloudflare Dashboard:**
   - https://dash.cloudflare.com/
   - Workers & Pages > worker-distancias

2. **Configurar Git Integration:**
   - Settings > Builds & Deployments
   - Verificar que esté conectado a: `franciscolamberti/autobank-dtv`
   - Branch de producción: `main`

3. **Configurar Auto-Deploy:**
   - Production branch: `main`
   - Build command: (vacío)
   - Build output directory: (vacío)

## Configurar Secretos en Cloudflare Dashboard

**IMPORTANTE:** Los secretos NO se pueden subir a GitHub por seguridad. Debes configurarlos manualmente en Cloudflare Dashboard.

### Ir a: Workers & Pages > worker-distancias > Settings > Variables

Agregar las siguientes **Environment Variables** como **Secrets**:

1. **SUPABASE_URL**
   ```
   https://fobaguhlzpwrzdhyyyje.supabase.co
   ```

2. **SUPABASE_KEY** (Service Role Key)
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvYmFndWhsenB3cnpkaHl5eWplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTMwOTA5NywiZXhwIjoyMDc2ODg1MDk3fQ.T68hlUzWyrxBDo7wQ6xe_3bVmt7R2QcunfI8lac1pcA
   ```

3. **KAPSO_API_KEY**
   ```
   29ef63b8c7f44b6d258a44288d89f350c3e323bdca8bedae9cb9228f260fbb66
   ```

4. **KAPSO_PHONE_NUMBER_ID** (placeholder por ahora)
   ```
   NEEDS_CONFIGURATION
   ```

### Cómo agregar secretos:

1. Click en **"Add Variable"**
2. Type: **Secret** (Encrypted)
3. Name: nombre de la variable (ej: `SUPABASE_URL`)
4. Value: pegar el valor
5. Click **"Save"**
6. Repetir para cada secreto

## Deploy Manual (alternativa)

Si prefieres hacer deploy manual desde la línea de comandos:

```bash
# Autenticar Cloudflare
npx wrangler login

# Deploy
npx wrangler deploy

# Configurar secretos vía CLI
echo "https://fobaguhlzpwrzdhyyyje.supabase.co" | npx wrangler secret put SUPABASE_URL
echo "tu_service_role_key" | npx wrangler secret put SUPABASE_KEY
echo "29ef63b8c7f44b6d258a44288d89f350c3e323bdca8bedae9cb9228f260fbb66" | npx wrangler secret put KAPSO_API_KEY
echo "NEEDS_CONFIGURATION" | npx wrangler secret put KAPSO_PHONE_NUMBER_ID
```

## Después del Deploy

Una vez deployado, obtendrás una URL del Worker como:
```
https://worker-distancias.your-subdomain.workers.dev
```

**Actualizar Frontend:**

Edita `autobank-dtv/.env.local` con la URL del Worker:

```env
NEXT_PUBLIC_SUPABASE_URL=https://fobaguhlzpwrzdhyyyje.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvYmFndWhsenB3cnpkaHl5eWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMDkwOTcsImV4cCI6MjA3Njg4NTA5N30.1Vp8L7k-moEM2_1IuuN74oKR3Iwcq1NKtaYFzG0A6NY
NEXT_PUBLIC_WORKER_URL=https://worker-distancias.your-subdomain.workers.dev
```

## Verificar Deploy

```bash
# Test del Worker
curl https://worker-distancias.your-subdomain.workers.dev

# Ver logs en tiempo real
npx wrangler tail
```

## Cron Trigger

El Worker ejecutará automáticamente todos los días a las 12:00 UTC:
- 09:00 hora Argentina (sin DST)
- Procesa recordatorios
- Procesa contacto inicial encolado

## Troubleshooting

### Error: "Missing environment variables"
- Verificar que todos los secretos estén configurados en Cloudflare Dashboard
- Los secretos NO se heredan del repositorio, deben configurarse manualmente

### Error: "Worker not found"
- Verificar que el deploy se completó exitosamente
- Revisar logs en Cloudflare Dashboard

### Cron no se ejecuta
- Verificar que el trigger está habilitado en Settings > Triggers
- Verificar formato del cron en wrangler.toml

