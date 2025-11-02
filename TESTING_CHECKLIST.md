# Testing Checklist - Autobank DTV (Alineado al PRD)

## Pre-requisitos

- [x] Database migrations aplicadas via Supabase MCP
- [ ] Edge Functions deployed
- [ ] Cloudflare Worker deployed
- [ ] Variables de entorno configuradas
- [ ] Webhook Kapso configurado

## Test 1: Validación de Excel y Procesamiento

### Objetivo
Verificar que `procesar-archivo` valida columnas, normaliza teléfonos, deduplica y calcula distancias correctamente.

### Pasos

1. Ir a `/campanas/nueva`
2. Completar wizard:
   - Nombre: "Test PRD - Nov 2025"
   - Distancia máxima: 2000m
   - Fecha fin contactación: 2025-12-31
   - Ventanas horarias: defaults (12:00-15:00, 18:00-20:30)
   - Sábado: 10:00-13:00
   - Contactar domingo: NO
   - Horario corte: 20:00
3. Subir archivo: `2025.10.27.Piloto Autobank - DTV - Estatus - Archivo de datos.xlsx`
4. Confirmar

### Verificaciones

**Edge Function logs:**
```bash
supabase functions logs procesar-archivo --tail
```

**En Base de Datos:**
```sql
-- Verificar campaña creada
SELECT * FROM campanas WHERE nombre = 'Test PRD - Nov 2025';

-- Verificar personas procesadas
SELECT 
    COUNT(*) as total,
    COUNT(DISTINCT telefono_principal) as telefonos_unicos,
    SUM(cantidad_decos) as total_decos,
    COUNT(*) FILTER (WHERE dentro_rango = true) as dentro_rango,
    COUNT(*) FILTER (WHERE fuera_de_rango = true) as fuera_rango,
    COUNT(*) FILTER (WHERE tiene_whatsapp = true) as con_whatsapp,
    COUNT(*) FILTER (WHERE tiene_whatsapp = false) as sin_whatsapp,
    COUNT(*) FILTER (WHERE tiene_whatsapp IS NULL) as whatsapp_null
FROM personas_contactar 
WHERE campana_id = 'uuid-de-test';

-- Verificar normalización de teléfonos (deben empezar con +54)
SELECT telefono_principal, apellido_nombre
FROM personas_contactar
WHERE campana_id = 'uuid-de-test'
LIMIT 10;

-- Verificar deduplicación (personas con múltiples decos)
SELECT 
    apellido_nombre,
    telefono_principal,
    cantidad_decos,
    nros_cliente,
    nros_wo
FROM personas_contactar
WHERE campana_id = 'uuid-de-test' AND cantidad_decos > 1;
```

**Checklist:**
- [ ] Todas las columnas requeridas validadas (no error de "columnas faltantes")
- [ ] Teléfonos normalizados a formato E.164 (+54...)
- [ ] Deduplicación funciona (personas con múltiples decos agrupadas)
- [ ] Arrays `nros_cliente` y `nros_wo` poblados correctamente
- [ ] Distancias calculadas (campo `distancia_metros` tiene valores)
- [ ] Flags `dentro_rango` y `fuera_de_rango` correctos
- [ ] Export "Fuera de rango" generado en Storage
- [ ] Contadores de campaña actualizados

---

## Test 2: Envío Manual con Validaciones

### Objetivo
Verificar que el worker valida horarios, fecha_fin, y no contacta mismo día de creación.

### Pasos

1. Desde dashboard de campaña, click "Enviar Mensajes"
2. Observar comportamiento según hora actual

### Escenarios

**A. Fuera de horario (ej: 16:00 AR, entre ventanas)**
```bash
# Verificar en DB que personas se encolaron
SELECT COUNT(*) 
FROM personas_contactar 
WHERE campana_id = 'uuid-test' 
  AND estado_contacto = 'encolado';
```

- [ ] Estado cambia a `encolado`
- [ ] No se envían mensajes a Kapso
- [ ] Worker retorna mensaje "X personas encoladas"

**B. Dentro de horario (ej: 13:00 AR, ventana 1)**

Con `DRY_RUN = true` en worker:
- [ ] Worker procesa en batches de 10
- [ ] Delay de 1s entre batches
- [ ] Estado cambia a `enviado_whatsapp`
- [ ] `fecha_envio_whatsapp` se actualiza
- [ ] `intentos_envio` incrementa correctamente
- [ ] Log muestra mensajes simulados

Con `DRY_RUN = false`:
- [ ] POST a Kapso workflows endpoint correcto
- [ ] Payload incluye todas las variables PRD
- [ ] Context incluye campana_id y persona_id
- [ ] Respuesta 202 Accepted de Kapso

**C. Mismo día de creación**
- [ ] Worker rechaza envío
- [ ] Mensaje: "mismo día de creación, no se contacta"

**D. Fecha fin pasada**
- [ ] Worker rechaza envío
- [ ] Mensaje: "fecha_fin_contactacion ya pasó"

---

## Test 3: Webhook de Respuesta

### Objetivo
Verificar que webhook parsea variables estructuradas y actualiza correctamente.

### Setup

Necesitas el `KAPSO_WEBHOOK_SECRET` para generar la firma.

### Casos de Prueba

**A. Confirmación con fecha**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/webhook-kapso \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Signature: sha256=GENERATED_SIGNATURE" \
  -d '{
    "tracking_id": "test-confirm-123",
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
    },
    "last_user_message": "Sí, voy el 10 de noviembre"
  }'
```

Verificar:
- [ ] `estado_contacto` = `confirmado`
- [ ] `fecha_compromiso` = `2025-11-10`
- [ ] `respuesta_texto` guardado
- [ ] `fecha_respuesta` actualizada
- [ ] Contadores de campaña actualizados

**B. Rechazo con motivo**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/webhook-kapso \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Signature: sha256=GENERATED_SIGNATURE" \
  -d '{
    "tracking_id": "test-reject-123",
    "workflow_id": "workflow-123",
    "phone_number": "+5491156571617",
    "context": {
      "source": "sistema_pickit",
      "campana_id": "uuid-campana",
      "persona_id": "uuid-persona"
    },
    "variables": {
      "confirmado": false,
      "motivo_negativo": "Ya lo devolvió - servicio activo"
    },
    "last_user_message": "No, ya lo devolví hace un mes"
  }'
```

Verificar:
- [ ] `estado_contacto` = `rechazado`
- [ ] `motivo_negativo` guardado
- [ ] Aparece en bucket "Atención Especial"

**C. Solicita retiro domicilio**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/webhook-kapso \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Signature: sha256=GENERATED_SIGNATURE" \
  -d '{
    "context": {
      "persona_id": "uuid-persona",
      "campana_id": "uuid-campana"
    },
    "variables": {
      "solicita_retiro_domicilio": true
    }
  }'
```

Verificar:
- [ ] `solicita_retiro_domicilio` = true
- [ ] Aparece en bucket "Atención Especial"

**D. Firma inválida**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/webhook-kapso \
  -H "Content-Type: application/json" \
  -H "X-Kapso-Signature: sha256=INVALID_SIGNATURE" \
  -d '{"context": {"persona_id": "test"}}'
```

Verificar:
- [ ] Respuesta 401 Unauthorized
- [ ] No se actualiza nada en DB

---

## Test 4: Dashboard - 5 Buckets PRD

### Objetivo
Verificar que las personas se categorizan correctamente en los 5 buckets.

### Setup

Crear personas de prueba en distintos estados:

```sql
-- Bucket 1: Comprometido
UPDATE personas_contactar 
SET estado_contacto = 'confirmado',
    fecha_compromiso = CURRENT_DATE + 2
WHERE id = 'persona-1-id';

-- Bucket 2: In Progress
UPDATE personas_contactar 
SET estado_contacto = 'enviado_whatsapp',
    fecha_envio_whatsapp = NOW()
WHERE id = 'persona-2-id';

-- Bucket 3: Fuera de Rango
UPDATE personas_contactar 
SET fuera_de_rango = true,
    dentro_rango = false
WHERE id = 'persona-3-id';

-- Bucket 4: Sin WhatsApp
UPDATE personas_contactar 
SET tiene_whatsapp = false
WHERE id = 'persona-4-id';

-- Bucket 5: Atención Especial
UPDATE personas_contactar 
SET estado_contacto = 'rechazado',
    motivo_negativo = 'Ya lo devolvió - robado'
WHERE id = 'persona-5-id';
```

### Verificaciones en UI

- [ ] Bucket "Comprometidos" muestra persona-1 con fecha de compromiso visible
- [ ] Bucket "In Progress" muestra persona-2 con badge "Enviado"
- [ ] Bucket "Fuera de Rango" muestra persona-3 con distancia en metros
- [ ] Bucket "Sin WhatsApp" muestra persona-4 con badge "Sin WhatsApp"
- [ ] Bucket "Atención Especial" muestra persona-5 con motivo negativo visible
- [ ] Cada bucket tiene botón "Exportar"
- [ ] Exports descargables funcionan
- [ ] Checkboxes de "Devuelto" funcionan

---

## Test 5: Recordatorios Automáticos

### Objetivo
Verificar que el worker envía recordatorios a personas con fecha_compromiso = hoy.

### Setup

```sql
-- Crear persona con compromiso para hoy
UPDATE personas_contactar 
SET estado_contacto = 'confirmado',
    fecha_compromiso = CURRENT_DATE,
    recordatorio_enviado = false
WHERE id = 'persona-test-recordatorio';
```

### Ejecutar

**Opción A: Trigger manual**
```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"tipo": "recordatorios"}'
```

**Opción B: Esperar cron (12:00 UTC diario)**

### Verificaciones

- [ ] Worker encuentra la persona
- [ ] Envía a workflow de recordatorio (kapso_workflow_id_recordatorio)
- [ ] Variables incluyen: nombre_cliente, punto_pickit, direccion_punto, nros_wo
- [ ] Context.source = 'sistema_pickit_recordatorio'
- [ ] `recordatorio_enviado` = true
- [ ] `fecha_envio_recordatorio` actualizada

---

## Test 6: Corte Diario Pickit

### Objetivo
Verificar generación de archivo con una fila por WO.

### Setup

```sql
-- Crear personas confirmadas
UPDATE personas_contactar 
SET estado_contacto = 'confirmado',
    fecha_compromiso = CURRENT_DATE + 1
WHERE id IN ('persona-1', 'persona-2');
```

### Ejecutar

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"tipo": "corte-diario", "campana_id": "uuid-campana"}'
```

### Verificaciones

- [ ] Edge Function `generar-corte-diario` se ejecuta
- [ ] Archivo XLSX generado en Storage: `archivos-dtv/{campana_id}/cortes-diarios/corte-diario-{campana_id}-{fecha}.xlsx`
- [ ] Una fila por work order (si persona tiene 3 WOs → 3 filas)
- [ ] Columnas incluyen: Nro Cliente, Nro WO, Nombre, DNI, Teléfono, Dirección, CP, Localidad, Fecha Compromiso, Punto Pickit
- [ ] Formato compatible con template Pickit

---

## Test 7: Recalcular Distancias

### Objetivo
Verificar que cambiar `distancia_max` recalcula `dentro_rango` y `fuera_de_rango`.

### Pasos

1. Desde detalle de campaña (cuando esté implementado el botón)
2. O manualmente via Edge Function:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/recalcular-distancias \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campana_id": "uuid-campana",
    "distancia_max": 3000
  }'
```

### Verificaciones

```sql
-- Verificar cambios
SELECT 
    COUNT(*) FILTER (WHERE dentro_rango = true) as dentro,
    COUNT(*) FILTER (WHERE fuera_de_rango = true) as fuera
FROM personas_contactar
WHERE campana_id = 'uuid-campana';

-- Verificar contadores de campaña actualizados
SELECT personas_dentro_rango 
FROM campanas 
WHERE id = 'uuid-campana';
```

- [ ] Personas que estaban fuera ahora dentro (si distancia < nueva distancia_max)
- [ ] Flags `dentro_rango` y `fuera_de_rango` actualizados
- [ ] Contador `personas_dentro_rango` en campaña actualizado
- [ ] Dashboard refleja cambios en buckets

---

## Test 8: Errores de Meta (tiene_whatsapp = false)

### Objetivo
Verificar que errores Meta específicos marcan `tiene_whatsapp = false`.

### Setup

Modificar temporalmente el worker para simular error Meta:

```javascript
// En enviarKapsoWorkflow, antes del fetch a Kapso:
if (persona.telefono_principal === '+5491112345678') {
  throw new Error(JSON.stringify({
    error: { code: 131026, message: 'Invalid phone number' }
  }))
}
```

### Ejecutar

Crear persona con ese teléfono y enviar mensaje.

### Verificaciones

```sql
SELECT tiene_whatsapp, estado_contacto 
FROM personas_contactar 
WHERE telefono_principal = '+5491112345678';
```

- [ ] `tiene_whatsapp` = false
- [ ] Aparece en bucket "Sin WhatsApp"
- [ ] No se reintenta envío en próximos crons

---

## Test 9: Exports por Bucket

### Objetivo
Verificar que cada bucket puede exportarse a Excel.

### Pasos

1. Ir a dashboard de campaña
2. Click "Exportar" en cada bucket

### Verificaciones

- [ ] Export "Comprometidos" incluye fecha_compromiso
- [ ] Export "In Progress" incluye estado_contacto
- [ ] Export "Fuera de Rango" incluye distancia en metros
- [ ] Export "Sin WhatsApp" incluye teléfono y estado
- [ ] Export "Atención Especial" incluye motivo_negativo
- [ ] Todos los exports incluyen: nros_cliente, nros_wo, cantidad_decos
- [ ] Archivos descargables con nombres descriptivos

---

## Test 10: Flujo Completo End-to-End

### Objetivo
Simular flujo completo desde carga hasta confirmación.

### Pasos

1. **Día 1 (16:00):** Crear campaña, subir Excel
   - ✅ Procesamiento exitoso
   - ✅ Export fuera de rango generado
   - ✅ Dashboard muestra buckets

2. **Día 2 (13:00):** Envío manual
   - ✅ Worker valida que no es mismo día de creación
   - ✅ Está en ventana 1 (12:00-15:00)
   - ✅ Envía a Kapso
   - ✅ Estados cambian a `enviado_whatsapp`

3. **Día 2 (14:00):** Cliente responde
   - ✅ Webhook recibido con firma válida
   - ✅ Variables parseadas: confirmado = true, fecha_compromiso = "2025-11-05"
   - ✅ Estado cambia a `confirmado`
   - ✅ Aparece en bucket "Comprometidos"

4. **Día 5 (09:00):** Recordatorio automático
   - ✅ Cron encuentra persona con fecha_compromiso = hoy
   - ✅ Envía workflow recordatorio
   - ✅ Marca `recordatorio_enviado` = true

5. **Día 5 (20:00):** Corte diario
   - ✅ Genera archivo Pickit
   - ✅ Una fila por WO
   - ✅ Archivo en Storage

6. **Día 6:** Cliente devuelve
   - ✅ Checkbox "Devuelto" en UI
   - ✅ `decodificador_devuelto` = true
   - ✅ `fecha_devolucion` actualizada

---

## Test 11: Ventanas Horarias

### Objetivo
Verificar que worker respeta las 2 ventanas L-V, 1 ventana Sábado, y no contacta Domingo.

### Configurar campaña de prueba

```sql
UPDATE campanas 
SET horario_ventana_1_inicio = '10:00:00',
    horario_ventana_1_fin = '12:00:00',
    horario_ventana_2_inicio = '16:00:00',
    horario_ventana_2_fin = '18:00:00',
    horario_sabado_inicio = '09:00:00',
    horario_sabado_fin = '11:00:00',
    contactar_domingo = false
WHERE id = 'uuid-test';
```

### Casos

| Día | Hora | Esperado |
|-----|------|----------|
| Lunes | 10:30 | ✅ Envía (ventana 1) |
| Lunes | 13:00 | ❌ Encola (entre ventanas) |
| Lunes | 17:00 | ✅ Envía (ventana 2) |
| Sábado | 10:00 | ✅ Envía (ventana sábado) |
| Sábado | 12:00 | ❌ Encola (fuera ventana) |
| Domingo | 10:00 | ❌ Encola (domingo deshabilitado) |

Con `contactar_domingo = true`:
| Domingo | 10:00 | ⚠️ Revisa lógica - PRD no especifica ventana para domingo |

---

## Checklist Final

### Base de Datos
- [x] Migración aplicada exitosamente
- [x] Todos los campos PRD presentes
- [x] Índices creados
- [x] Defaults aplicados en registros existentes

### Edge Functions
- [ ] `procesar-archivo` deployed
- [ ] `webhook-kapso` deployed
- [ ] `recalcular-distancias` deployed
- [ ] `generar-corte-diario` deployed
- [ ] Secrets configurados (KAPSO_API_KEY, KAPSO_WEBHOOK_SECRET)

### Cloudflare Worker
- [ ] Worker deployed
- [ ] Secrets configurados (SUPABASE_URL, SUPABASE_KEY, KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID)
- [ ] Cron trigger activo (12:00 UTC)
- [ ] DRY_RUN = false para producción

### Frontend
- [ ] Variables de entorno configuradas (.env.local)
- [ ] Build exitoso (npm run build)
- [ ] Deployed a Vercel/producción
- [ ] UI muestra 5 buckets PRD
- [ ] Wizard completo con todos los campos

### Kapso Integration
- [ ] Webhook URL configurado
- [ ] Workflow principal creado
- [ ] Workflow recordatorio creado
- [ ] Phone Number ID obtenido
- [ ] Variables del workflow configuradas según PRD

### Testing
- [ ] Test 1: Validación y procesamiento ✅
- [ ] Test 2: Envío manual con validaciones ✅
- [ ] Test 3: Webhook de respuesta ✅
- [ ] Test 4: Dashboard buckets ✅
- [ ] Test 5: Recordatorios ✅
- [ ] Test 6: Corte diario ✅
- [ ] Test 7: Recalcular distancias ✅
- [ ] Test 8: Errores Meta ✅
- [ ] Test 9: Exports por bucket ✅
- [ ] Test 10: Flujo E2E ✅
- [ ] Test 11: Ventanas horarias ✅

## Smoke Test Rápido

Para verificar rápidamente que todo funciona:

```bash
# 1. Verificar DB
supabase db remote status

# 2. Verificar Edge Functions
supabase functions list

# 3. Verificar Worker
curl https://your-worker.workers.dev -X POST -H "Content-Type: application/json" -d '{"test": true}'

# 4. Verificar Frontend
curl http://localhost:3000 # o URL de producción
```

