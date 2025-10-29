# progreso del proyecto

## completado ✅

### base de datos
- ✅ tabla `puntos_pickit` (26 puntos pre-cargados)
- ✅ tabla `campanas` (con configuración, horarios, kapso credentials)
- ✅ tabla `personas_contactar` (con ubicación, distancia, estado contacto)
- ✅ índices optimizados para queries comunes
- ✅ triggers para updated_at automático
- ✅ storage bucket `archivos-dtv` creado con políticas
  - bucket creado: `archivos-dtv`
  - política de upload para authenticated users
  - política de lectura para acceso desde edge functions

### supabase edge functions
- ✅ `procesar-archivo` - deployada y funcionando (v2)
  - lee excel desde storage usando service role
  - calcula distancias haversine
  - encuentra punto pickit más cercano
  - inserta personas en db
  - actualiza contadores de campaña
  - cors headers configurados correctamente
  - maneja coordenadas en formato microgrados
- ⏳ `webhook-kapso` - pendiente implementar
- ⏳ `recalcular-distancias` - pendiente implementar

### cloudflare worker
- ✅ worker `enviar-campana` implementado con dry-run
  - handler fetch para envío manual
  - handler scheduled para cron diario 12:00 utc
  - lógica de validación de horarios (12:00-15:00 argentina)
  - integración con supabase (queries + updates)
  - simulación de integración kapso (dry-run mode)
  - manejo de encolado y batching
  - logging detallado para debugging
  - wrangler.toml configurado

### frontend
- ✅ proyecto next.js 16 creado: `autobank-dtv`
- ✅ página dashboard (`/`) con supabase integration
  - muestra campañas reales desde db
  - estadísticas: activas, contactados hoy, tasa confirmación, pendientes
  - tabla de campañas recientes
  - cards con métricas en tiempo real
- ✅ página nueva campaña (`/campañas/nueva`)
  - wizard de 3 pasos: configuración, upload, confirmación
  - upload de archivo excel a storage
  - invocación de edge function `procesar-archivo`
  - feedback en tiempo real del procesamiento
  - configuración de distancia_max con slider
  - configuración opcional de flow_id y whatsapp_config_id
- ✅ integración supabase client configurada
  - url y anon key en .env.local
  - cliente compartido en lib/supabase.ts
- ✅ ui con shadcn/ui components
  - theming configurado
  - componentes: card, button, input, slider, badge, table, etc.

### testing
- ✅ script python para generar archivo excel de prueba
  - archivo: `generar_archivo_prueba.py`
  - requiere: `pip3 install openpyxl`
  - comando: `python3 generar_archivo_prueba.py`
  - output: `archivo_prueba_dtv_100_personas.xlsx`
  - genera 100 personas con datos dummy
  - 76 dentro de 2000m de puntos pickit
  - 24 fuera del rango
  - estructura correcta según edge function (cols 0-40)
  - coordenadas en formato microgrados
  - nombres, localidades y teléfonos realistas
- ✅ test de creación de campaña end-to-end exitoso
  - upload de archivo excel a storage
  - procesamiento por edge function
  - inserción correcta en db
  - cálculo correcto de distancias haversine
  - asignación de punto pickit más cercano
  - actualización de contadores en campaña

### documentación
- ✅ prd completo (PRD.md) - documento de requisitos del producto
- ✅ progress.md actualizado - estado actual y próximos pasos
- ✅ deduplicacion.md - especificación técnica de edge case
- ✅ comandos.md - guía rápida con comandos útiles
- ✅ warp.md actualizado
- ✅ readme actualizado

## pendiente ⏳

### edge case: personas duplicadas 🔴 importante
**problema**: en los archivos excel, la misma persona puede aparecer múltiples veces porque tiene varios decos en su poder.

**solución propuesta**:
1. **deduplicación por teléfono**: agrupar personas por `telefono_principal`
2. **agregar campo**: `nros_cliente` (array o json) para guardar todos los nros de cliente
3. **modificar edge function `procesar-archivo`**:
   - detectar duplicados por teléfono
   - agrupar todos los `nro_cliente` y `nro_wo` de esa persona
   - crear un solo registro en `personas_contactar` con array de decos
4. **modificar mensaje whatsapp**:
   - si tiene 1 deco: "tenés el deco xxx"
   - si tiene múltiples: "tenés los decos xxx, yyy, zzz"
5. **actualizar schema db**:
   - agregar campo `nros_cliente` (text[] o jsonb)
   - agregar campo `nros_wo` (text[] o jsonb)
   - agregar campo `cantidad_decos` (int)

**impacto**:
- reduce cantidad de mensajes whatsapp enviados
- mejora experiencia del cliente (un solo mensaje)
- necesita cambios en: db schema, edge function, mensaje kapso

### cloudflare worker
- ✅ worker implementado en dry-run
- ⏳ obtener credenciales kapso reales
- ⏳ configurar secrets en cloudflare
- ⏳ cambiar de dry-run a producción
- ⏳ testing con kapso real

### edge functions restantes
- ⏳ `webhook-kapso`: recibir respuestas de kapso
- ⏳ `recalcular-distancias`: recalcular cuando cambia distancia_max

### frontend pendiente
- ⏳ página: `/campañas/[id]` (detalle de campaña) 🔴
  - información general: nombre, fecha, distancia_max
  - métricas en cards: total personas, dentro rango, contactados, confirmados
  - progreso visual (progress bar o circular)
  - estado de la campaña (activa/pausada/finalizada)
  - botón "enviar mensajes" para invocar cloudflare worker
  - mostrar progreso de envío en tiempo real
  - sección con archivo excel subido (link para descargar)
  - timeline de eventos de la campaña
- ⏳ página: `/campañas/[id]/personas` (lista con filtros)
  - tabla de personas con estados
  - filtros por estado, localidad, punto pickit
  - búsqueda por nombre/teléfono
  - acciones individuales (marcar confirmado, agregar notas)
  - exportar lista filtrada a excel
  - mostrar badge cuando persona tiene múltiples decos
- ⏳ llamada a cloudflare worker desde frontend

### configuración
- ✅ supabase configurado:
  - project ref: fobaguhlzpwrzdhyyyje
  - url: https://fobaguhlzpwrzdhyyyje.supabase.co
  - anon key configurada en frontend (.env.local)
  - service role key en edge functions (automático)
  - storage bucket `archivos-dtv` creado
  - políticas de storage configuradas (upload + lectura)
- ✅ edge function deployada:
  - función: `procesar-archivo` (v2)
  - cors headers configurados
  - accesible desde frontend con anon key
- ⏳ cloudflare worker (no deployado aún):
  - código listo en src/enviar-campana.js
  - wrangler.toml configurado con cron
  - modo dry-run implementado
  - pendiente: `wrangler login` y `wrangler deploy`
- ⏳ secrets cloudflare worker:
  - SUPABASE_URL (pendiente agregar con `wrangler secret put`)
  - SUPABASE_SERVICE_ROLE_KEY (pendiente agregar)
  - KAPSO_API_KEY (pendiente obtener)
  - KAPSO_FLOW_ID (pendiente obtener)
  - KAPSO_WHATSAPP_CONFIG_ID (pendiente obtener)
- ⏳ credenciales kapso (obtener de dashboard)

## arquitectura implementada

```
frontend (v0/nextjs)
    ↓ upload excel
supabase storage (archivos-dtv)
    ↓ llama
edge function: procesar-archivo ✅
    ↓ guarda en
supabase db (campañas, personas_contactar) ✅
    ↓ consulta
cloudflare worker: enviar-campana ⏳
    ↓ POST
kapso api
    ↓ callback
edge function: webhook-kapso ⏳
    ↓ actualiza
supabase db
```

## notas importantes

- edge function `procesar-archivo` ya puede:
  - leer archivo excel desde storage
  - extraer datos de personas (col 0-40)
  - calcular coordenadas (dividing por 1000000 si > 180)
  - encontrar teléfono principal (cols 37-40)
  - calcular distancia a 26 puntos pickit
  - determinar dentro_rango según distancia_max
  - insertar todo en db

- falta conectar:
  - frontend que llame a esta edge function
  - cloudflare worker que envíe mensajes
  - webhook que reciba respuestas

## problemas resueltos durante desarrollo

### 1. error "failed to send a request to the edge function"
**causa**: faltaban cors headers en la edge function
**solución**: agregar `corsHeaders` y manejar OPTIONS request
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### 2. error "cannot read properties of undefined (reading 'className')"
**causa**: mapeo incorrecto de estados de campaña (inglés vs español)
**solución**: cambiar de `active/paused/completed` a `activa/pausada/finalizada`

### 3. storage bucket no existía
**causa**: bucket no creado en supabase
**solución**: 
- crear bucket: `INSERT INTO storage.buckets (id, name, public) VALUES ('archivos-dtv', 'archivos-dtv', false)`
- agregar políticas de upload y lectura

### 4. edge function con permisos insuficientes
**causa**: edge function usa mismo permiso que cliente que la invoca
**solución**: edge function usa internamente `SUPABASE_SERVICE_ROLE_KEY` para acceso completo

### 5. proyecto supabase incorrecto
**causa**: intentando usar project ref de otra cuenta
**solución**: usar mcp tools para obtener project ref correcto: `fobaguhlzpwrzdhyyyje`

## lecciones aprendidas

1. **edge functions cors**: siempre incluir cors headers cuando se invocan desde frontend
2. **storage policies**: crear políticas explícitas para upload y download
3. **service role vs anon**: edge functions necesitan service role para operaciones privilegiadas
4. **estados consistentes**: usar mismos valores en db, backend y frontend (evitar traducciones)
5. **deduplicación**: detectar edge cases temprano (personas duplicadas) antes de ir a producción
6. **testing con datos reales**: script de generación de prueba facilita desarrollo y testing
7. **documentación continua**: mantener progress.md actualizado facilita retomar trabajo

## próximos pasos inmediatos

1. 🔴 **resolver edge case de personas duplicadas**
   - modificar schema db (agregar campos array)
   - actualizar edge function `procesar-archivo` con deduplicación
   - modificar variables kapso para múltiples decos
2. implementar página detalle de campaña
   - botón enviar mensajes
   - invocar cloudflare worker
3. implementar página lista personas
   - tabla con filtros
   - estados en tiempo real
4. implementar webhook-kapso edge function
5. obtener credenciales kapso reales
6. configurar secrets cloudflare worker
7. testing end-to-end con kapso producción
8. implementar recalcular-distancias edge function
