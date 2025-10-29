# prd - sistema de gestión de campañas pickit

## visión general

sistema para gestionar campañas de contacto whatsapp (vía kapso) para devolución de decodificadores dtv en puntos pickit cercanos.

## flujo principal

```
1. usuario sube archivo excel dtv
2. sistema procesa y calcula distancias a puntos pickit
3. se crea campaña con personas dentro del rango
4. sistema envía mensajes whatsapp vía kapso
5. usuario monitorea respuestas y estados
```

## arquitectura

### stack
- **frontend**: v0/nextjs
- **backend**: supabase (db + storage)
- **procesamiento**: supabase edge functions + cloudflare workers
- **whatsapp**: kapso (webhook trigger)

### flujo completo
```
frontend (upload)
    ↓
supabase storage (archivo excel)
    ↓
edge function: procesar-archivo (automático)
    ↓
supabase db (campañas, personas_contactar)
    ↓
cloudflare worker: enviar-campana (manual o cron 12:00)
    ↓
kapso api (envío whatsapp)
    ↓
edge function: webhook-kapso (recibir respuestas)
    ↓
supabase db (actualizar estados)
```

### división de responsabilidades

**supabase edge functions** (3 funciones):
1. **procesar-archivo**: triggered por storage upload
   - lee excel desde storage
   - consulta puntos_pickit (26 puntos)
   - calcula distancias haversine
   - crea campaña y personas_contactar en db
   - acceso directo a storage y db (no requiere auth externa)

2. **webhook-kapso**: recibe respuestas de kapso
   - endpoint público para kapso callback
   - actualiza estado_contacto de personas
   - guarda respuesta_texto
   - acceso directo a db

3. **recalcular-distancias**: invocada manualmente desde frontend
   - recalcula dentro_rango cuando cambia distancia_max
   - actualiza contadores de campaña

**cloudflare worker** (1 worker con 2 handlers):
1. **handler fetch**: envío manual desde frontend
   - recibe campaña_id
   - consulta supabase (personas pendientes + dentro_rango)
   - valida horario (12:00-15:00)
   - si fuera de horario → marca como encolado
   - si dentro de horario → POST a kapso por cada persona
   - actualiza estados en supabase

2. **handler scheduled**: cron diario a las 12:00
   - consulta supabase (personas encoladas)
   - POST a kapso por cada persona encolada
   - actualiza estados en supabase
   - mismo código que fetch, diferente trigger

## base de datos

### puntos_pickit (26 puntos - ya creado)
```sql
- id (uuid, pk)
- nombre (text)
- direccion (text)
- lat (float)
- lon (float)
- created_at (timestamp)
```

### campañas
```sql
- id (uuid, pk)
- nombre (text)
- archivo_url (text) -- ruta en storage
- distancia_max (int) -- metros, default 2000, configurable
- estado (enum: activa, pausada, finalizada)
- total_personas (int)
- personas_dentro_rango (int)
- personas_contactadas (int)
- personas_confirmadas (int)
- kapso_flow_id (text) -- id del flow en kapso
- kapso_whatsapp_config_id (text) -- config de whatsapp en kapso
- horario_envio_inicio (time) -- default 12:00
- horario_envio_fin (time) -- default 15:00
- timezone (text) -- default 'America/Argentina/Buenos_Aires'
- created_at (timestamp)
- updated_at (timestamp)
```

### personas_contactar
```sql
- id (uuid, pk)
- campaña_id (uuid, fk)
- fila_archivo (int) -- referencia a fila del excel (primera fila si hay duplicados)

-- datos del cliente
- nro_cliente (text) -- primer nro cliente (deprecado, usar nros_cliente)
- nro_wo (text) -- primer work order (deprecado, usar nros_wo)
- nros_cliente (text[] o jsonb) -- 🆕 array con todos los nros de cliente si tiene múltiples decos
- nros_wo (text[] o jsonb) -- 🆕 array con todos los work orders
- cantidad_decos (int) -- 🆕 cantidad de decos en su poder
- apellido_nombre (text)
- dni (text)
- telefono_principal (text) -- para whatsapp (clave de deduplicación)
- direccion_completa (text)
- cp (text)
- localidad (text)
- provincia (text)

-- ubicación
- lat (float)
- lon (float)

-- distancia y punto pickit
- punto_pickit_id (uuid, fk)
- distancia_metros (float)
- dentro_rango (boolean) -- recalculable si cambia distancia_max

-- estado de contacto
- estado_contacto (enum: pendiente, encolado, enviado_whatsapp, respondio, confirmado, rechazado, no_responde, error_envio)
- fecha_envio_whatsapp (timestamp)
- fecha_respuesta (timestamp)
- respuesta_texto (text)
- intentos_envio (int) -- contador de intentos

-- info adicional del excel
- razon_creacion (text)
- estado_cliente_original (text)

-- notas y seguimiento
- notas (text)
- created_at (timestamp)
- updated_at (timestamp)
```

### historial_contacto (opcional - para múltiples intentos)
```sql
- id (uuid, pk)
- persona_id (uuid, fk)
- tipo_accion (enum: envio_whatsapp, respuesta, nota_manual)
- descripcion (text)
- created_at (timestamp)
```

## integración kapso

### endpoint y autenticación
```bash
POST https://app.kapso.ai/api/v1/flows/{flow_id}/executions
Headers:
  Content-Type: application/json
  X-API-Key: <api-key>
```

### trigger
cuando usuario activa envío de campaña:
1. obtener todas las personas con `dentro_rango = true` y `estado_contacto = pendiente`
2. **validar horario**: solo enviar entre 12:00 y 15:00 (hora argentina)
   - si es fuera de horario: encolar mensajes para envío programado
3. por cada persona, hacer POST a kapso:

```bash
curl --request POST \
  --url https://app.kapso.ai/api/v1/flows/{flow_id}/executions \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: <api-key>' \
  --data '{
  "phone_number": "+5491156571617",
  "whatsapp_config_id": "config-123abc",
  "variables": {
    "nombre_cliente": "RICARDO GARCIA",
    "nro_cliente": "885540",
    "punto_pickit": "Meraki - Yaguareté",
    "direccion_punto": "Yaguareté, 734, Comuna 1, Buenos Aires",
    "distancia": "1234 metros"
  },
  "context": {
    "source": "sistema_pickit",
    "campana_id": "uuid-campana",
    "persona_id": "uuid-persona"
  },
  "initial_data": {}
}'
```

4. actualizar `estado_contacto = enviado_whatsapp`, `fecha_envio_whatsapp = now()`
5. si hay error, marcar `estado_contacto = error_envio` y continuar

### webhook callback (kapso → sistema)
kapso notifica cuando hay respuesta:

```json
POST /api/webhook/kapso
{
  "telefono": "+5491156571617",
  "mensaje": "si, confirmo",
  "timestamp": "2025-10-26T02:00:00Z"
}
```

sistema actualiza:
- `estado_contacto = respondio`
- `fecha_respuesta = timestamp`
- `respuesta_texto = mensaje`

## funcionalidades clave

### 1. cargar campaña
- usuario sube excel dtv
- sistema procesa archivo en background
- crea campaña y personas_contactar
- calcula distancias automáticamente

### 2. configurar distancia
- usuario puede modificar `distancia_max` de la campaña
- sistema recalcula `dentro_rango` para todas las personas
- no reenvía whatsapp automáticamente

### 3. enviar mensajes
- botón "iniciar contacto" en campaña
- envía a todos los `dentro_rango = true` pendientes
- opción de filtrar por zonas/localidades

### 4. monitorear respuestas
- dashboard con estados en tiempo real
- filtros por estado, localidad, punto pickit
- vista detalle de cada persona

### 5. gestión manual
- cambiar estado manualmente
- agregar notas
- marcar como confirmado/rechazado
- reasignar punto pickit

### 6. reportes
- conversión por campaña
- personas por punto pickit
- tiempos de respuesta
- exportar lista filtrada

## flujo detallado

### fase 1: carga y procesamiento
```
1. usuario accede a /campañas/nueva
2. ingresa nombre de campaña
3. sube archivo excel dtv
4. archivo → supabase storage bucket 'archivos-dtv'
5. edge function triggered:
   - lee excel
   - consulta puntos_pickit (26 puntos)
   - calcula distancias para cada persona
   - crea registro en tabla campañas
   - inserta personas en personas_contactar
   - marca dentro_rango según distancia_max
6. usuario ve resumen:
   - total personas: 100
   - dentro de rango: 45
   - fuera de rango: 55
```

### fase 2: configuración
```
1. usuario puede ajustar distancia_max (slider o input)
2. al cambiar:
   - edge function recalcula dentro_rango
   - actualiza contador personas_dentro_rango
3. usuario revisa lista de personas a contactar
4. puede filtrar por localidad/zona
5. puede excluir personas manualmente
```

### fase 3: envío whatsapp
```
1. usuario hace click "enviar mensajes"
2. confirmación con preview del mensaje
3. sistema valida horario actual:
   - SI está entre 12:00-15:00 (arg):
     → envío inmediato
   - SI está fuera de horario:
     → marca personas como 'encolado'
     → cronjob enviará al día siguiente a las 12:00
4. edge function 'enviar-campana':
   - obtiene lista personas pendientes/encolado + dentro_rango
   - por cada persona:
     - POST a kapso webhook con flow_id y variables
     - actualiza estado → enviado_whatsapp
     - registra fecha_envio_whatsapp
     - incrementa intentos_envio
   - si hay error, marca error_envio y continúa
5. usuario ve progreso en tiempo real
```

### fase 4: monitoreo
```
1. webhook de kapso recibe respuestas
2. actualiza estado de personas
3. dashboard muestra:
   - enviados: 45
   - respondieron: 20
   - confirmados: 15
   - rechazados: 3
   - sin respuesta: 22
4. usuario puede filtrar y ver detalles
5. puede hacer seguimiento manual
```

## edge cases importantes

### 1. personas duplicadas (múltiples decos) 🔴
**problema**: la misma persona puede aparecer múltiples veces en el archivo excel porque tiene varios decodificadores en su poder.

**solución**:
- **deduplicación**: agrupar por `telefono_principal` durante el procesamiento
- **agregación**: crear un solo registro en `personas_contactar` con:
  - `nros_cliente`: array con todos los nros de cliente
  - `nros_wo`: array con todos los work orders
  - `cantidad_decos`: contador de decos
- **mensaje whatsapp**: adaptar según cantidad:
  - 1 deco: "tenés el decodificador nro xxx"
  - múltiples: "tenés los decodificadores nro xxx, yyy, zzz"
- **variables kapso**:
  ```json
  {
    "nro_cliente": "123456",  // primer nro o "varios"
    "nros_cliente": "123456, 789012, 345678",  // lista formateada
    "cantidad_decos": 3,
    "texto_decos": "los decodificadores"  // singular/plural
  }
  ```

**implementación**:
1. modificar schema db: agregar campos array
2. modificar `procesar-archivo` edge function:
   - detectar duplicados por teléfono
   - agrupar nros_cliente y nros_wo
   - insertar registro único con arrays
3. modificar template kapso con lógica condicional
4. actualizar frontend para mostrar cantidad_decos

**beneficios**:
- reduce cantidad de mensajes whatsapp
- mejora experiencia del cliente (un solo contacto)
- reduce costos de envío
- evita spam al cliente

## preguntas pendientes

1. **mensaje whatsapp**: ¿template fijo o configurable por campaña? → kapso maneja templates en su flow
2. **múltiples intentos**: ¿reenviar a los que no responden? ¿después de cuánto tiempo?
3. **capacidad kapso**: ¿límite de mensajes por minuto? → validar con kapso
4. **autenticación**: ¿un solo usuario o múltiples operadores?
5. **punto pickit alternativo**: ¿si el más cercano no sirve, ofrecer el segundo más cercano?
6. **horarios**: ✅ resuelto - solo entre 12:00 y 15:00, encolado automático fuera de horario
7. **zonas prioritarias**: ¿enviar primero a ciertas localidades?
8. **confirmación**: ¿qué respuestas consideramos "confirmado"? ¿palabras clave?
9. **cronjob**: ✅ resuelto - cloudflare worker con cron trigger
10. **personas duplicadas**: 🔴 pendiente implementar deduplicación

## métricas importantes

- tasa de respuesta (respondieron / enviados)
- tasa de conversión (confirmados / enviados)
- tiempo promedio de respuesta
- personas por punto pickit
- cobertura por zona (% dentro de rango)

## próximos pasos

### fase 1: database
1. crear tablas campañas y personas_contactar
2. configurar rls policies si es necesario
3. crear índices para performance

### fase 2: supabase edge functions
1. **procesar-archivo**:
   - leer excel desde storage
   - calcular distancias
   - insertar en db
2. **webhook-kapso**:
   - recibir POST de kapso
   - actualizar estados
3. **recalcular-distancias**:
   - recalcular cuando cambia distancia_max

### fase 3: cloudflare worker
1. actualizar worker existente con:
   - handler `fetch`: envío manual
   - handler `scheduled`: cron trigger
   - lógica de horarios (12:00-15:00)
   - integración supabase (consultas y updates)
   - integración kapso (POST con flow_id)
2. configurar en wrangler.toml:
   ```toml
   [triggers]
   crons = ["0 12 * * *"]  # diario a las 12:00 utc
   ```
3. configurar secrets:
   - SUPABASE_URL
   - SUPABASE_KEY
   - KAPSO_API_KEY
   - KAPSO_FLOW_ID
   - KAPSO_WHATSAPP_CONFIG_ID

### fase 4: frontend
1. crear con v0
2. páginas:
   - /campañas/nueva (upload archivo)
   - /campañas/[id] (detalle, enviar mensajes)
   - /campañas/[id]/personas (lista con filtros)
3. integración:
   - supabase client (upload, queries)
   - llamada a cloudflare worker (envío manual)

### fase 5: testing
1. test unitario edge functions
2. test cloudflare worker (local con wrangler dev)
3. test integración completa
4. deploy production

## notas técnicas

### general
- distancia calculada con fórmula haversine
- coordenadas en excel vienen sin punto decimal (dividir por 1000000)
- archivos excel pueden ser grandes (optimizar procesamiento edge function)

### horarios y encolado
- **horarios**: envío solo entre 12:00-15:00 (argentina/buenos_aires = utc-3)
- **cron cloudflare**: ejecuta a las 12:00 utc = 09:00 argentina (ajustar según dst)
- **encolado**: mensajes fuera de horario → estado 'encolado' → procesados por cron
- **validación horario**: se hace en cloudflare worker, no en edge function

### cloudflare worker
- **2 handlers**: fetch (manual) y scheduled (cron)
- **cron syntax**: `0 12 * * *` en wrangler.toml
- **secrets**: usar `wrangler secret put` para kapso y supabase credentials
- **rate limiting**: considerar delay entre requests a kapso
- **batching**: procesar en lotes si hay muchas personas
- **idempotencia**: usar persona_id en context kapso
- **timeout**: workers tienen 30s cpu time (suficiente para ~100 mensajes)

### supabase edge functions
- **procesar-archivo**: puede tardar en archivos grandes, considerar timeout
- **webhook-kapso**: debe ser público (sin auth)
- **recalcular-distancias**: invocar desde frontend con auth
- **xlsx library**: usar deno-compatible (ej: sheetjs cdn)

### kapso
- **flow_id**: puede ser diferente por campaña (configurar en tabla)
- **whatsapp_config_id**: mismo para todas las campañas
- **webhook**: configurar url de edge function en dashboard kapso
- **variables**: nombre_cliente, punto_pickit, direccion_punto, distancia
- **context**: incluir campaña_id y persona_id para callback
