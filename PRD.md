# prd - sistema de gestión de campañas pickit

## visión general

sistema para gestionar campañas de contacto whatsapp (vía kapso) para devolución de decodificadores dtv en puntos pickit cercanos.

## arquitectura

### stack tecnológico
- **frontend**: next.js 16 (autobank-dtv)
- **backend**: supabase (postgresql + storage)
- **procesamiento**: supabase edge functions
- **mensajería whatsapp**: cloudflare workers + kapso api

### flujo completo
```
frontend (upload excel)
    ↓
supabase storage (archivos-dtv)
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

## base de datos

### puntos_pickit (26 puntos pre-cargados)
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
- archivo_url (text)
- distancia_max (int) -- default 2000 metros
- estado (enum: activa, pausada, finalizada)
- total_personas (int)
- personas_dentro_rango (int)
- personas_contactadas (int)
- personas_confirmadas (int)
- kapso_flow_id (text)
- kapso_whatsapp_config_id (text)
- horario_envio_inicio (time) -- default 12:00
- horario_envio_fin (time) -- default 15:00
- timezone (text) -- default 'America/Argentina/Buenos_Aires'
- created_at (timestamp)
- updated_at (timestamp)
```

### personas_contactar
```sql
- id (uuid, pk)
- campana_id (uuid, fk)
- fila_archivo (int)

-- datos del cliente
- nro_cliente (text)
- nro_wo (text)
- nros_cliente (text[]) -- array para múltiples decos
- nros_wo (text[]) -- array para múltiples work orders
- cantidad_decos (int) -- cantidad de decodificadores
- apellido_nombre (text)
- dni (text)
- telefono_principal (text) -- clave de deduplicación
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
- dentro_rango (boolean)

-- estado de contacto
- estado_contacto (enum: pendiente, encolado, enviado_whatsapp, 
                        respondio, confirmado, rechazado, no_responde, error_envio)
- fecha_envio_whatsapp (timestamp)
- fecha_respuesta (timestamp)
- respuesta_texto (text)
- intentos_envio (int)

-- info adicional
- razon_creacion (text)
- estado_cliente_original (text)
- notas (text)
- created_at (timestamp)
- updated_at (timestamp)
```

## componentes

### supabase edge functions

#### 1. procesar-archivo
- **trigger**: automático al subir archivo a storage
- **función**: 
  - lee excel desde storage
  - extrae datos de personas (cols 0-40)
  - calcula distancias haversine a 26 puntos pickit
  - deduplica personas por telefono_principal
  - agrupa múltiples decodificadores por persona
  - inserta registros en personas_contactar
  - actualiza contadores en campañas

#### 2. webhook-kapso
- **trigger**: post request desde kapso
- **función**:
  - recibe respuestas de clientes vía whatsapp
  - actualiza estado_contacto
  - guarda respuesta_texto y fecha_respuesta

#### 3. recalcular-distancias
- **trigger**: invocación manual desde frontend
- **función**:
  - recalcula dentro_rango cuando cambia distancia_max
  - actualiza contadores de campaña

### cloudflare worker (enviar-campana)

#### handler fetch (envío manual)
- recibe campaña_id desde frontend
- consulta personas pendientes + dentro_rango
- valida horario (12:00-15:00 argentina)
- si fuera de horario → marca como encolado
- si dentro de horario → POST a kapso por cada persona
- actualiza estados en supabase

#### handler scheduled (cron)
- ejecuta diariamente a las 12:00 utc
- consulta personas encoladas
- POST a kapso por cada persona
- actualiza estados en supabase

## integración kapso

### endpoint
```bash
POST https://app.kapso.ai/api/v1/flows/{flow_id}/executions
Headers:
  Content-Type: application/json
  X-API-Key: <api-key>
```

### payload
```json
{
  "phone_number": "+5491156571617",
  "whatsapp_config_id": "config-123abc",
  "variables": {
    "nombre_cliente": "ricardo garcia",
    "nro_cliente": "885540",
    "nros_cliente": "885540, 885541, 885542",
    "cantidad_decos": 3,
    "texto_deco": "los decodificadores",
    "punto_pickit": "meraki - yaguareté",
    "direccion_punto": "yaguareté, 734, comuna 1, buenos aires",
    "distancia": "1234 metros"
  },
  "context": {
    "source": "sistema_pickit",
    "campana_id": "uuid-campana",
    "persona_id": "uuid-persona"
  }
}
```

## deduplicación de personas

**problema**: misma persona aparece múltiples veces en excel por tener varios decodificadores.

**solución**: 
- agrupar por telefono_principal
- consolidar todos los nro_cliente y nro_wo en arrays
- crear un solo registro con cantidad_decos
- enviar un solo mensaje whatsapp adaptado según cantidad

**beneficios**:
- reduce mensajes whatsapp enviados
- mejora experiencia del cliente
- reduce costos de envío

## funcionalidades clave

### 1. cargar campaña
- usuario sube excel dtv
- sistema procesa en background
- crea campaña y personas_contactar
- calcula distancias automáticamente

### 2. configurar distancia
- usuario modifica distancia_max
- sistema recalcula dentro_rango
- no reenvía whatsapp automáticamente

### 3. enviar mensajes
- botón "iniciar contacto"
- valida horario (12:00-15:00 argentina)
- envía a todos los dentro_rango pendientes
- encola si fuera de horario

### 4. monitorear respuestas
- dashboard con estados en tiempo real
- filtros por estado, localidad, punto pickit
- vista detalle de cada persona

### 5. gestión manual
- cambiar estado manualmente
- agregar notas
- marcar como confirmado/rechazado

## formato archivo excel dtv

- hoja: primera hoja del workbook
- columna ag (índice 32): longitud (x)
- columna ah (índice 33): latitud (y)
- coordenadas en microgrados (dividir por 1000000 si > 180)
- teléfonos en cols 37-40 (prioridad: 40 > 39 > 38 > 37)

## cálculo de distancias

**fórmula**: haversine
**radio de la tierra**: 6,371,000 metros
**implementación**: javascript en edge function

## límites técnicos

- edge functions: 10s timeout, 2mb response
- cloudflare workers: 30s cpu time
- archivos excel: optimizar para <10k filas
- horario envío: 12:00-15:00 (america/argentina/buenos_aires)

## métricas importantes

- tasa de respuesta (respondieron / enviados)
- tasa de conversión (confirmados / enviados)
- tiempo promedio de respuesta
- personas por punto pickit
- cobertura por zona (% dentro de rango)
