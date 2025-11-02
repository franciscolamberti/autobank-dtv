# prd - sistema de gestión de campañas pickit

## visión general

sistema para gestionar campañas de contacto whatsapp (vía kapso) para devolución de decodificadores dtv en puntos pickit cercanos.

## alcance fase 1 (mvp)

### incluye
- dashboard simple para carga de excel con validación estricta de columnas requeridas.
- procesamiento automático: deduplicación por nro_cliente, cálculo de distancias, agrupación de work orders, validación whatsapp inicial.
- validación whatsapp: intento en procesamiento vía endpoint kapso contacts (pending validation); confirmación al ejecutar flow si falla.
- configuración de franjas horarias: lunes a viernes (2 franjas), sábado (1 franja), domingo deshabilitado.
- configuración de distancia máxima a puntos pickit y fecha fin de contactación por campaña.
- horario de corte diario configurable por campaña (default: 20:00 gmt-3).
- dashboard con 5 buckets: comprometidos, in progress, fuera de rango, sin whatsapp, atención especial.
- exports: diario pickit (corte configurable, una fila por wo), fuera de rango (al crear campaña), sin whatsapp, atención especial con motivo.
- whatsapp: flujo happy path (captura compromiso y fecha), flujo negativo (captura motivo), recordatorio separado día del compromiso.
- no contactar el mismo día de carga; primer mensaje siempre al día hábil siguiente.
- compromisos post-corte (ej. 02:00am miércoles) aparecen en el corte del día (20:00 miércoles) para entrega desde día siguiente.

### no incluye (pospuesto a fases posteriores)
- mapeo configurable de columnas (subir template y etiquetar).
- workflows/cambio de estados avanzados en ui.
- gestión manual: marcar como entregado, agregar notas, cambios de estado manuales.
- vista de historial de chat por persona.
- fecha de inicio de contactación (solo fin).
- recontactación automática post-compromiso.
- reporte crudo general (se arma manualmente juntando exports por campaña).
- integración directa con api de pickit.

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
- kapso_workflow_id (text) -- workflow principal de contacto (uuid)
- kapso_workflow_id_recordatorio (text) -- workflow separado para recordatorio (uuid)
- kapso_phone_number_id (text) -- whatsapp business phone number id
- fecha_fin_contactacion (date) -- plazo máximo para contactar personas
- horario_corte_diario (time) -- default 20:00, hora de generación del archivo diario pickit
- horario_ventana_1_inicio (time) -- default 12:00 (lun-vie)
- horario_ventana_1_fin (time) -- default 15:00 (lun-vie)
- horario_ventana_2_inicio (time) -- default 18:00 (lun-vie)
- horario_ventana_2_fin (time) -- default 20:30 (lun-vie)
- horario_sabado_inicio (time) -- default 10:00
- horario_sabado_fin (time) -- default 13:00
- contactar_domingo (boolean) -- default false
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
- fecha_compromiso (date) -- día que el cliente se comprometió a entregar
- recordatorio_enviado (boolean) -- default false
- fecha_envio_recordatorio (timestamp)
- respuesta_texto (text)
- motivo_negativo (text) -- generado por agente kapso en caso de rechazo
- intentos_envio (int)
- tiene_whatsapp (boolean) -- null inicial, false si validación kapso falla
- fuera_de_rango (boolean) -- true si distancia > distancia_max
- solicita_retiro_domicilio (boolean) -- default false

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
  - valida columnas requeridas (nro_cliente, nro_wo, telefono, nombre, lat, lon); abort si faltan.
  - lee excel desde storage
  - extrae datos de personas (cols 0-40)
  - **normaliza números de teléfono a formato e164**:
    - limpia caracteres no numéricos (espacios, guiones, paréntesis)
    - detecta formato argentino típico: `011-1554259622` → `+5491154259622`
    - reglas de normalización:
      - si empieza con `011` o `11` → código país 54 + eliminar 0 inicial del área + número
      - si empieza con `0` seguido de código área (ej. `0351`) → +54 + código área sin 0 + número
      - si ya tiene `+54` o `54` → validar longitud y formato
      - longitud esperada: 13 caracteres con `+` (ej. `+5491154259622`)
    - si no puede normalizar → marca `tiene_whatsapp = false` (teléfono inválido)
  - normaliza coordenadas (microgrados si > 180)
  - calcula distancias haversine a 26 puntos pickit
  - marca fuera_de_rango si distancia > distancia_max
  - deduplica por nro_cliente (fallback: telefono_principal normalizado)
  - agrupa múltiples work orders por persona (nros_cliente[], nros_wo[], cantidad_decos)
  - **validación whatsapp (pending validation)**: 
    - endpoint a validar: `GET https://api.kapso.ai/meta/whatsapp/v23.0/{phone_number_id}/contacts/{wa_id}`
    - si existe (200) → tiene_whatsapp = true
    - si no existe (404) o error → tiene_whatsapp = null
    - validación definitiva en primer envío del worker
  - inserta registros en personas_contactar con telefono_principal normalizado
  - actualiza contadores en campañas
  - genera export "fuera de rango" (xlsx) inmediatamente

#### 2. webhook-kapso
- **trigger**: post request desde kapso
- **función**:
  - recibe respuestas de clientes vía whatsapp
  - actualiza estado_contacto
  - guarda respuesta_texto, fecha_respuesta, fecha_compromiso (si confirmado)
  - guarda motivo_negativo (generado por agente kapso)
  - marca solicita_retiro_domicilio si aplica

#### 3. recalcular-distancias
- **trigger**: invocación manual desde frontend
- **función**:
  - recalcula dentro_rango cuando cambia distancia_max
  - actualiza contadores de campaña

### cloudflare worker (enviar-campana)

#### handler fetch (envío manual)
- recibe campaña_id desde frontend
- consulta personas pendientes + dentro_rango + tiene_whatsapp != false
- valida fecha_fin_contactacion (no contactar si ya pasó)
- valida horario según ventanas configuradas (lun-vie 2 franjas, sábado 1 franja, domingo nunca)
- valida que no sea el mismo día de creación de campaña (primer contacto siempre día hábil siguiente)
- si fuera de horario/fecha → marca como encolado
- si dentro de horario → POST a kapso flow principal por cada persona (batch de 10, delay 1s)
- **captura errores de envío**: 
  - si falla con error específico de meta (número inválido, no whatsapp) → marca tiene_whatsapp = false
  - errores meta comunes: code 1357045 (usuario no encontrado), code 131026 (número inválido)
- actualiza estados en supabase

#### handler scheduled (cron contacto inicial)
- ejecuta diariamente a las 12:00 utc (inicio ventana 1)
- consulta personas encoladas + fecha < fecha_fin_contactacion + tiene_whatsapp != false
- POST a kapso flow principal
- captura errores de envío (igual que handler fetch): marca tiene_whatsapp = false si error meta
- actualiza estados en supabase

#### handler scheduled (cron recordatorios)
- ejecuta diariamente a las 09:00 argentina (antes de horario comercial)
- consulta personas confirmadas con fecha_compromiso = hoy y recordatorio_enviado = false
- POST a kapso flow recordatorio
- marca recordatorio_enviado = true

#### generación archivo diario pickit
- ejecuta diariamente a horario_corte_diario (default 20:00 argentina)
- consulta personas confirmadas con fecha_compromiso != null desde último corte
- genera xlsx con template pickit: una fila por work order
- sube a supabase storage y/o notifica al cliente

## integración kapso

### validación whatsapp (pending validation)
**pending**: endpoint a validar en fase de implementación. basado en análisis del sdk kapso.

```bash
# opción a: consultar contacto existente
GET https://api.kapso.ai/meta/whatsapp/v23.0/{phone_number_id}/contacts/{wa_id}
Headers:
  X-API-Key: <api-key>
Response exitoso (200):
  {"id": "...", "wa_id": "5491156571617", "profile_name": "..."}
Response error (404):
  {"error": {"message": "Contact not found", "code": 404}}
```

**nota**: este endpoint consulta la base de contactos de kapso (usuarios ya contactados). 
si el número nunca fue contactado, devolverá 404 aunque tenga whatsapp.

**fallback**: validación definitiva al ejecutar flow. errores meta comunes:
- code 1357045: recipient not found
- code 131026: invalid phone number
- code 131047: re-engagement message

### endpoint ejecución workflow (flow principal)
```bash
POST https://api.kapso.ai/platform/v1/workflows/{workflow_id}/executions
Headers:
  Content-Type: application/json
  X-API-Key: <api-key>
```

### payload workflow principal
```json
{
  "workflow_execution": {
    "phone_number": "+5491156571617",
    "phone_number_id": "<whatsapp_business_phone_number_id>",
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
}
```

### respuesta (202 accepted)
```json
{
  "data": {
    "message": "Workflow execution initiated",
    "workflow_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
    "tracking_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a"
  }
}
```

### payload workflow recordatorio (separado)
```json
{
  "workflow_execution": {
    "phone_number": "+5491156571617",
    "phone_number_id": "<whatsapp_business_phone_number_id>",
    "variables": {
      "nombre_cliente": "ricardo garcia",
      "punto_pickit": "meraki - yaguareté",
      "direccion_punto": "yaguareté, 734, comuna 1, buenos aires",
      "nros_wo": "WO12345, WO12346"
    },
    "context": {
      "source": "sistema_pickit_recordatorio",
      "campana_id": "uuid-campana",
      "persona_id": "uuid-persona"
    }
  }
}
```

### webhook respuesta kapso
**pending**: definir estructura exacta del webhook según configuración del workflow en kapso.

```bash
POST {nuestro_endpoint}/webhook-kapso
Headers:
  X-Kapso-Signature: <signature para validar origen>
Body (estructura estimada):
{
  "tracking_id": "uuid-tracking",
  "workflow_id": "uuid-workflow",
  "phone_number": "+5491156571617",
  "context": {
    "campana_id": "uuid",
    "persona_id": "uuid"
  },
  "variables": {
    "confirmado": true/false,
    "fecha_compromiso": "2025-11-05",
    "motivo_negativo": "no lo tiene más - robado",
    "solicita_retiro_domicilio": true/false
  }
}
```

**nota**: la estructura del webhook depende de cómo se configure el nodo webhook en el workflow de kapso.

## deduplicación de personas

**problema**: misma persona aparece múltiples veces en excel por tener varios decodificadores.

**solución**: 
- agrupar por nro_cliente (columna 0) como llave principal
- fallback: telefono_principal si nro_cliente no está disponible
- consolidar todos los nro_cliente y nro_wo en arrays
- crear un solo registro con cantidad_decos
- enviar un solo mensaje whatsapp adaptado según cantidad

**beneficios**:
- reduce mensajes whatsapp enviados
- mejora experiencia del cliente
- reduce costos de envío

## buckets de dashboard (fase 1)

### 1. comprometidos
- estado_contacto = confirmado
- tiene fecha_compromiso
- aparecen en archivo diario pickit en el corte de las 20:00 del día del compromiso
- si se comprometió post-corte (ej. 02:00am miércoles), aparece en corte del miércoles 20:00 para entrega desde jueves

### 2. in progress / contactados
- estado_contacto in (encolado, enviado_whatsapp, respondio)
- conversación activa

### 3. fuera de rango
- fuera_de_rango = true
- distancia > distancia_max
- export xlsx generado al crear campaña para devolver a directv

### 4. sin whatsapp válido
- tiene_whatsapp = false
- detectado por validación kapso o error en envío
- export xlsx descargable desde dashboard

### 5. atención especial
- estado_contacto = rechazado o solicita_retiro_domicilio = true
- motivo_negativo contiene texto explicativo generado por agente kapso
- casos: no lo tiene, ya lo devolvió, robado/perdido, datos incorrectos, servicio activo, otros
- export xlsx descargable con columna motivo_negativo

## funcionalidades clave

### 1. cargar campaña (wizard simple)
- paso 1: subir excel dtv
  - validación estricta de columnas requeridas
  - abort si faltan columnas; mostrar alerta con nombres faltantes
- paso 2: configuración
  - distancia_max (default 2000m)
  - fecha_fin_contactacion (obligatorio)
  - horario_corte_diario (default 20:00)
  - ventanas horarias lun-vie (2 franjas), sábado (1 franja), domingo off
- paso 3: confirmación
  - resumen: total personas, dentro de rango, fuera de rango, con/sin teléfono
  - genera export "fuera de rango" inmediatamente
- sistema procesa en background
- valida whatsapp de cada número vía endpoint kapso
- calcula distancias automáticamente

### 2. configurar distancia (opcional post-creación)
- usuario modifica distancia_max
- sistema recalcula dentro_rango vía edge function
- no reenvía whatsapp automáticamente

### 3. enviar mensajes
- automático: cron diario a las 12:00 (inicio ventana 1)
- manual: botón "iniciar contacto" desde dashboard
- valida fecha_fin_contactacion, horario según ventanas, no contactar mismo día de carga
- envía a todos los dentro_rango + tiene_whatsapp != false + pendientes
- encola si fuera de horario/fecha
- batch de 10 mensajes, delay 1s entre batches

### 4. recordatorios automáticos
- cron diario a las 09:00 argentina
- consulta confirmados con fecha_compromiso = hoy y recordatorio_enviado = false
- envía mensaje vía flow recordatorio de kapso (separado del principal)

### 5. generación archivo diario pickit
- cron diario a horario_corte_diario (default 20:00 gmt-3)
- consulta confirmados desde último corte
- genera xlsx con template pickit: una fila por work order
- si compromiso post-corte (ej. 02:00am miércoles), aparece en corte del miércoles para entrega desde jueves

### 6. monitorear respuestas (dashboard)
- 5 buckets: comprometidos, in progress, fuera de rango, sin whatsapp, atención especial
- filtros por campaña, estado, punto pickit
- exports descargables por bucket (xlsx)


## formato archivo excel dtv

**estructura confirmada del archivo real:**
- hoja: primera hoja del workbook
- col 0: `NroCliente` (número de cliente)
- col 1: `NroWO` (work order / número de orden)
- col 28: `ApellidoNombre` (nombre completo)
- col 32: `X` (longitud en microgrados)
- col 33: `Y` (latitud en microgrados)
- col 38: `TelefonoParticularIns` (teléfono particular instalación)
- col 39: `TelefonoLaboralIns` (teléfono laboral instalación)
- col 40: `FaxInstalacion` (fax 1 - **suele contener el teléfono móvil principal**)
- col 41: `Fax2Instalacion` (fax 2)

**coordenadas**: microgrados (dividir por 1,000,000), ej: `-58837959` → `-58.837959`

**teléfonos**: prioridad de búsqueda 40 > 41 > 38 > 39 (primer no-null)

**formato teléfono**: `011-1565716179` (requiere normalización a e164: `+5491165716179`)

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
- tasa de conversión (comprometidos / enviados)
- cobertura de puntos pickit (% dentro de rango)
