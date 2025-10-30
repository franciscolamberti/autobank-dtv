# Deployment Guide - Sistema Autobank DTV

Este documento contiene las instrucciones detalladas para completar el despliegue del sistema en producción.

## Estado Actual

✅ **Completado:**
- Frontend Next.js con todas las páginas implementadas
- Edge Functions de Supabase deployadas:
  - `procesar-archivo` (con deduplicación)
  - `webhook-kapso` (recibir respuestas)
  - `recalcular-distancias` (actualizar rangos)
- Cloudflare Worker implementado (en modo DRY_RUN)
- Base de datos configurada

⏳ **Pendiente:**
- Configurar y deployar Cloudflare Worker
- Obtener credenciales reales de Kapso
- Testing end-to-end completo
- Activar modo producción

---

## 1. Configurar y Deployar Cloudflare Worker

El worker está listo en `src/enviar-campana.js` pero necesita ser deployado.

### Paso 1.1: Instalar Wrangler

```bash
npm install -g wrangler
```

### Paso 1.2: Login en Cloudflare

```bash
wrangler login
```

Esto abrirá un navegador para autenticarte con tu cuenta de Cloudflare.

### Paso 1.3: Verificar wrangler.toml

El archivo `wrangler.toml` debe contener:

```toml
name = "enviar-campana"
main = "src/enviar-campana.js"
compatibility_date = "2024-01-01"

# Cron para ejecutar diariamente a las 12:00 UTC (9:00 Argentina)
[triggers]
crons = ["0 12 * * *"]
```

### Paso 1.4: Configurar Secrets

Ejecuta estos comandos para configurar las variables de entorno secretas:

```bash
# Supabase
wrangler secret put SUPABASE_URL
# Ingresa: https://fobaguhlzpwrzdhyyyje.supabase.co

wrangler secret put SUPABASE_KEY
# Ingresa: tu SUPABASE_SERVICE_ROLE_KEY (desde Supabase Dashboard > Settings > API)

# Kapso (ver sección 2 para obtener estos valores)
wrangler secret put KAPSO_API_KEY
# Ingresa: tu API key de Kapso

wrangler secret put KAPSO_FLOW_ID
# Ingresa: el ID del flow de Kapso

wrangler secret put KAPSO_WHATSAPP_CONFIG_ID
# Ingresa: el config ID de WhatsApp en Kapso
```

### Paso 1.5: Deploy del Worker

```bash
wrangler deploy
```

Esto deployará el worker en modo DRY_RUN (seguro, no envía mensajes reales).

### Paso 1.6: Obtener URL del Worker

Después del deploy, obtendrás una URL como:
```
https://enviar-campana.YOUR-SUBDOMAIN.workers.dev
```

Guarda esta URL, la necesitarás para configurar el frontend.

---

## 2. Obtener Credenciales de Kapso

### Paso 2.1: Acceder a Kapso Dashboard

1. Ingresa a https://app.kapso.ai
2. Inicia sesión con tu cuenta

### Paso 2.2: Obtener API Key

1. Ve a Settings > API Keys
2. Crea una nueva API key o copia la existente
3. Guárdala de forma segura

### Paso 2.3: Crear/Obtener Flow ID

1. Ve a la sección de Flows
2. Crea un nuevo flow para recupero de decodificadores DTV
3. En el flow, asegúrate de usar estas variables:
   - `nombre_cliente`: nombre del cliente
   - `nro_cliente`: número de cliente principal (legacy)
   - `nros_cliente`: lista de números de cliente separados por coma
   - `cantidad_decos`: número de decodificadores a recuperar
   - `texto_deco`: "el decodificador" o "los decodificadores" (singular/plural)
   - `punto_pickit`: nombre del punto Pickit más cercano
   - `direccion_punto`: dirección del punto Pickit
   - `distancia`: distancia en metros al punto

4. Copia el Flow ID (aparece en la URL o en la configuración)

### Paso 2.4: Obtener WhatsApp Config ID

1. En el flow, busca la configuración de WhatsApp
2. Copia el WhatsApp Config ID

### Paso 2.5: Ejemplo de Template de Mensaje

```
Hola {{nombre_cliente}}! 👋

Te contactamos de DirecTV para coordinar la devolución de {{texto_deco}} (clientes {{nros_cliente}}).

Podés dejar {{texto_deco}} en:
📍 {{punto_pickit}}
🏠 {{direccion_punto}}
📏 A {{distancia}} de tu domicilio

¿Confirmás que podés acercarte a devolver {{texto_deco}}?
```

### Paso 2.6: Configurar Webhook de Kapso

1. En Kapso, ve a Settings > Webhooks
2. Crea un nuevo webhook con esta URL:
   ```
   https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/webhook-kapso
   ```
3. Configura que se envíe cuando un usuario responde al flow

---

## 3. Configurar Frontend

### Paso 3.1: Agregar Variable de Entorno

Crea o edita el archivo `autobank-dtv/.env.local`:

```env
NEXT_PUBLIC_WORKER_URL=https://enviar-campana.YOUR-SUBDOMAIN.workers.dev
```

Reemplaza `YOUR-SUBDOMAIN` con tu subdomain real de Cloudflare.

### Paso 3.2: Rebuild Frontend

```bash
cd autobank-dtv
pnpm build
```

---

## 4. Testing End-to-End (Modo DRY_RUN)

Con el worker en modo DRY_RUN, puedes hacer testing sin enviar mensajes reales.

### Paso 4.1: Cargar Campaña de Prueba

1. Ve a http://localhost:3000 (o tu URL de producción)
2. Click en "Nueva Campaña"
3. Sube el archivo `archivo_prueba_duplicados.xlsx`
4. Completa el wizard
5. Espera a que se procese

### Paso 4.2: Verificar Deduplicación

1. Ve a la página de detalle de la campaña
2. Verifica que muestre las estadísticas correctas
3. Ve a "Ver Personas"
4. Confirma que:
   - Las personas duplicadas se agruparon correctamente
   - El campo `cantidad_decos` muestra el número correcto
   - Los arrays `nros_cliente` contienen todos los números

### Paso 4.3: Probar Envío (DRY_RUN)

1. En la página de detalle de campaña
2. Click en "Enviar Mensajes"
3. Verifica la respuesta en la consola del navegador
4. Debería mostrar un log detallado con:
   - Modo: DRY_RUN
   - Personas procesadas
   - Mensajes simulados (primeros 3)
   - NO se enviarán mensajes reales a WhatsApp

### Paso 4.4: Verificar Estados en DB

```bash
# Conectarse a Supabase y verificar
# Las personas deberían estar en estado 'encolado' o 'enviado_whatsapp'
# (dependiendo del horario de prueba)
```

### Paso 4.5: Probar Webhook (Simulado)

```bash
curl -X POST https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/webhook-kapso \
  -H "Content-Type: application/json" \
  -d '{
    "execution_id": "test-exec-123",
    "phone_number": "+5491156571617",
    "status": "completed",
    "context": {
      "source": "sistema_pickit",
      "campana_id": "TU_CAMPANA_ID",
      "persona_id": "TU_PERSONA_ID"
    },
    "last_user_message": "Si, confirmo que voy"
  }'
```

Verifica que:
- El estado de la persona cambia a 'confirmado'
- Los contadores de campaña se actualizan

### Paso 4.6: Probar Recalcular Distancias

```bash
curl -X POST https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/recalcular-distancias \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_ANON_KEY" \
  -d '{
    "campana_id": "TU_CAMPANA_ID",
    "distancia_max": 3000
  }'
```

Verifica que:
- El contador `personas_dentro_rango` se actualiza
- El campo `dentro_rango` cambia para las personas afectadas

---

## 5. Validar con Cliente

Antes de activar producción, validar con el cliente:

### Checklist de Validación

- [ ] El criterio de deduplicación por `telefono_principal` es correcto
- [ ] El template de Kapso acepta las nuevas variables
- [ ] El flujo de mensajes es el esperado
- [ ] Los horarios de envío son correctos (12:00-15:00 Argentina)
- [ ] La distancia máxima default (2000m) es apropiada
- [ ] Los 26 puntos Pickit están correctos

---

## 6. Activar Modo Producción

⚠️ **IMPORTANTE:** Solo ejecutar después de completar testing y validación.

### Paso 6.1: Modificar Worker

Edita `src/enviar-campana.js`:

```javascript
const DRY_RUN = false // ⚠️ CAMBIAR DE true A false
```

### Paso 6.2: Re-deploy Worker

```bash
wrangler deploy
```

### Paso 6.3: Monitorear Primera Campaña Real

1. Crea una campaña pequeña de prueba (5-10 personas)
2. Envía mensajes en horario permitido
3. Monitorea los logs en Cloudflare Dashboard
4. Verifica que los mensajes llegan a WhatsApp
5. Confirma que el webhook actualiza estados correctamente

### Paso 6.4: Logs y Monitoreo

- **Cloudflare Worker Logs**: https://dash.cloudflare.com > Workers > enviar-campana > Logs
- **Supabase Edge Functions**: https://supabase.com/dashboard/project/fobaguhlzpwrzdhyyyje/functions
- **Kapso Logs**: Revisar en Kapso dashboard

---

## 7. Troubleshooting

### Error: Worker no encuentra personas

**Causa:** SUPABASE_KEY incorrecta
**Solución:** Verificar que sea la SERVICE_ROLE_KEY, no la ANON_KEY

### Error: Kapso rechaza el request

**Causa:** API Key o Flow ID incorrectos
**Solución:** Verificar credenciales en Kapso Dashboard

### Error: Webhook no actualiza estados

**Causa:** URL del webhook mal configurada en Kapso
**Solución:** Verificar URL exacta del edge function

### Personas no se deduplican

**Causa:** Campo telefono_principal vacío o diferente
**Solución:** Verificar que el Excel tenga teléfonos en columnas 37-40

### Frontend no puede enviar mensajes

**Causa:** NEXT_PUBLIC_WORKER_URL no configurada
**Solución:** Agregar variable en .env.local y rebuild

---

## 8. Comandos Útiles de Referencia

```bash
# Ver logs del worker en tiempo real
wrangler tail

# Ver secrets configurados
wrangler secret list

# Eliminar un secret
wrangler secret delete SECRET_NAME

# Ver status de Supabase
cd autobank-dtv && supabase status

# Ver logs de edge function
supabase functions logs procesar-archivo --follow

# Invocar edge function manualmente
supabase functions invoke webhook-kapso --body '{...}'

# Rebuild frontend
cd autobank-dtv && pnpm dev

# Ver versión deployada del worker
wrangler deployments list
```

---

## 9. URLs Importantes

- **Frontend (local)**: http://localhost:3000
- **Supabase Dashboard**: https://supabase.com/dashboard/project/fobaguhlzpwrzdhyyyje
- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Kapso Dashboard**: https://app.kapso.ai

- **Edge Function - procesar-archivo**: 
  `https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/procesar-archivo`
  
- **Edge Function - webhook-kapso**: 
  `https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/webhook-kapso`
  
- **Edge Function - recalcular-distancias**: 
  `https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/recalcular-distancias`

---

## 10. Checklist Final Pre-Producción

- [ ] Cloudflare Worker deployado y configurado
- [ ] Todos los secrets configurados correctamente
- [ ] Credenciales de Kapso obtenidas y validadas
- [ ] Template de Kapso creado con variables correctas
- [ ] Webhook de Kapso configurado
- [ ] Frontend con variable NEXT_PUBLIC_WORKER_URL
- [ ] Testing end-to-end en modo DRY_RUN completado
- [ ] Deduplicación validada con archivo de prueba
- [ ] Estados de personas actualizándose correctamente
- [ ] Cliente validó criterios y flujo
- [ ] DRY_RUN cambiado a false
- [ ] Primera campaña real monitoreada exitosamente

---

## Soporte

Para problemas o preguntas, contactar al equipo de desarrollo.

