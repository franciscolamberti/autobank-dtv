# Progress

## Completado

### Base de Datos
- Tabla `puntos_pickit` con 26 puntos
- Tabla `campañas` con configuración completa
- Tabla `personas_contactar` con ubicación, distancias y estados
  - Campos array `nros_cliente` y `nros_wo`
  - Campo `cantidad_decos` para contador
- Storage bucket `archivos-dtv` con políticas
- Índices optimizados y triggers

### Backend
- Edge function `procesar-archivo` deployada y actualizada
  - Procesa Excel desde storage
  - Calcula distancias haversine
  - **Deduplicación por telefono_principal**
  - Agrupa múltiples decoders por persona
  - Inserta personas deduplicated en DB
  - Actualiza contadores de campaña
  
- Edge function `webhook-kapso` deployada
  - Recibe POST requests desde Kapso
  - Extrae persona_id del context
  - Actualiza estado_contacto, respuesta_texto, fecha_respuesta
  - Detecta confirmación/rechazo por keywords
  - Actualiza contadores de campaña
  
- Edge function `recalcular-distancias` deployada
  - Acepta campana_id y distancia_max
  - Recalcula dentro_rango para todas las personas
  - Actualiza contadores de campaña
  - Retorna estadísticas actualizadas

- Cloudflare worker `enviar-campana` implementado (dry-run)
  - Handler fetch para envío manual
  - Handler scheduled con cron 12:00 UTC
  - Validación de horarios
  - Integración Supabase
  - **Soporte completo para deduplicación**
  - Variables Kapso: nros_cliente, cantidad_decos, texto_deco

### Frontend
- Proyecto Next.js 16 `autobank-dtv`

- Página dashboard (/)
  - Muestra campañas desde DB
  - **5 cards de estadísticas** (incluye total decodificadores)
  - Estadísticas en tiempo real
  - Tabla de campañas con filtros
  - Links a detalle de campaña

- Página nueva campaña (/campañas/nueva)
  - Wizard de 3 pasos
  - Upload a storage
  - Invoca edge function
  - Configuración de distancia_max

- **Página detalle de campaña** (/campañas/[id])
  - Métricas en tiempo real con actualización automática
  - Botón "Enviar Mensajes" integrado con Cloudflare Worker
  - Progreso visual con barra de progreso
  - Estadísticas detalladas por estado
  - Tasas de respuesta y confirmación
  - Total de decodificadores en la campaña
  - Configuración de campaña (distancia, horario, zona horaria)
  - Link a vista de personas
  
- **Página lista de personas** (/campañas/[id]/personas)
  - Tabla completa de personas con paginación
  - **Filtros avanzados:**
    - Búsqueda por nombre, teléfono, DNI, nro cliente
    - Estado de contacto
    - Dentro/fuera de rango
    - Localidad
    - Punto Pickit
  - **Exportar a Excel** con todos los datos
  - Cambio manual de estado por persona
  - Muestra cantidad de decodificadores por persona
  - Información de punto Pickit más cercano
  - Distancia en metros

- Integración Supabase client configurada
- UI con shadcn/ui components
- Instalada librería xlsx para exportación

### Testing
- Script Python `generar_archivo_prueba.py`
  - Genera 100 personas con datos dummy
  - Coordenadas en formato correcto
  - 76 dentro de rango, 24 fuera
  
- Script Python `generar_prueba_duplicados.py`
  - Genera casos de prueba para deduplicación
  - 3 personas únicas con múltiples decoders cada una
  - Valida agrupación correcta por teléfono

### Documentación
- `decisiones-cliente.md`: registro de decisiones técnicas pendientes de validación
- **`DEPLOYMENT.md`**: guía completa de deployment con instrucciones paso a paso
  - Configuración de Cloudflare Worker
  - Obtención de credenciales Kapso
  - Testing end-to-end
  - Activación de producción
  - Troubleshooting
  - Comandos útiles
- Documentación actualizada en WARP.md, PRD.md, README.md
- Cleanup de archivos obsoletos

---

## Pendiente (Requiere Acción Manual)

### 1. Obtener Credenciales Kapso
**Estado**: ⏳ Requiere acceso a plataforma Kapso

**Pasos necesarios:**
1. Acceder a https://app.kapso.ai
2. Obtener API Key desde Settings > API Keys
3. Crear flow de recupero DTV con variables:
   - `nombre_cliente`
   - `nro_cliente` (legacy)
   - `nros_cliente` (lista completa)
   - `cantidad_decos` (número)
   - `texto_deco` (singular/plural)
   - `punto_pickit`
   - `direccion_punto`
   - `distancia`
4. Copiar Flow ID
5. Obtener WhatsApp Config ID
6. Configurar webhook apuntando a:
   ```
   https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/webhook-kapso
   ```

**Referencia:** Ver sección 2 de DEPLOYMENT.md

---

### 2. Configurar y Deployar Cloudflare Worker
**Estado**: ⏳ Requiere credenciales de Kapso

**Pasos necesarios:**
1. Instalar wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. Configurar secrets:
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_KEY
   wrangler secret put KAPSO_API_KEY
   wrangler secret put KAPSO_FLOW_ID
   wrangler secret put KAPSO_WHATSAPP_CONFIG_ID
   ```
4. Deploy: `wrangler deploy`
5. Copiar URL del worker deployado
6. Configurar en frontend: `NEXT_PUBLIC_WORKER_URL` en `.env.local`

**Referencia:** Ver sección 1 de DEPLOYMENT.md

---

### 3. Testing End-to-End
**Estado**: ⏳ Requiere worker deployado

**Pasos necesarios:**
1. Cargar campaña con `archivo_prueba_duplicados.xlsx`
2. Verificar deduplicación correcta
3. Probar envío en modo DRY_RUN
4. Verificar estados en DB
5. Simular webhook de respuesta
6. Probar recalcular distancias
7. Validar que todos los flujos funcionan

**Referencia:** Ver sección 4 de DEPLOYMENT.md

---

### 4. Validación con Cliente
**Estado**: ⏳ Requiere testing completado

**Checklist:**
- [ ] Criterio de deduplicación por teléfono es correcto
- [ ] Template de Kapso valida variables nuevas
- [ ] Flujo de mensajes es el esperado
- [ ] Horarios correctos (12:00-15:00 Argentina)
- [ ] Distancia máxima default apropiada (2000m)
- [ ] 26 puntos Pickit correctos

**Referencia:** Ver sección 5 de DEPLOYMENT.md

---

### 5. Activación de Producción
**Estado**: ⏳ Requiere validación del cliente

**Pasos necesarios:**
1. Modificar `src/enviar-campana.js`: cambiar `DRY_RUN = false`
2. Re-deploy: `wrangler deploy`
3. Crear campaña pequeña de prueba (5-10 personas)
4. Monitorear envío real
5. Verificar mensajes llegan a WhatsApp
6. Confirmar webhook actualiza estados
7. Revisar logs en Cloudflare y Supabase

**Referencia:** Ver sección 6 de DEPLOYMENT.md

---

## Métricas del Sistema

### Código Implementado
- **Frontend**: 3 páginas completas + componentes
- **Backend**: 3 edge functions deployadas
- **Worker**: 1 Cloudflare worker (modo dry-run)
- **Testing**: 2 scripts Python de generación de datos

### Edge Functions Deployadas
1. `procesar-archivo` - Procesamiento de Excel con deduplicación
2. `webhook-kapso` - Receptor de respuestas de Kapso
3. `recalcular-distancias` - Actualización de rangos

### URLs del Sistema
- **Supabase Project**: `https://fobaguhlzpwrzdhyyyje.supabase.co`
- **Edge Functions Base**: `https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/`
- **Frontend Local**: `http://localhost:3000`
- **Worker** (pendiente deploy): `https://enviar-campana.*.workers.dev`

---

## Próximos Pasos (En Orden)

1. **Obtener credenciales Kapso** (manual)
   - API Key
   - Flow ID
   - WhatsApp Config ID
   - Configurar webhook

2. **Deployar Cloudflare Worker** (manual)
   - Configurar secrets
   - Deploy con wrangler
   - Actualizar frontend con URL

3. **Testing end-to-end** (manual)
   - Modo DRY_RUN
   - Validar todos los flujos
   - Verificar deduplicación

4. **Validación con cliente** (coordinación)
   - Confirmar criterios
   - Validar templates
   - Aprobar flujo

5. **Activar producción** (manual)
   - Cambiar DRY_RUN = false
   - Monitorear campaña piloto
   - Validar envíos reales

---

## Comandos Útiles

```bash
# Supabase
supabase status
supabase functions deploy FUNCTION_NAME
supabase functions logs FUNCTION_NAME --follow

# Cloudflare Worker
wrangler login
wrangler deploy
wrangler tail
wrangler secret put SECRET_NAME

# Frontend
cd autobank-dtv
pnpm dev
pnpm build

# Testing
python generar_prueba_duplicados.py
```

---

## Soporte y Documentación

- **DEPLOYMENT.md**: Guía completa de deployment
- **PRD.md**: Especificación del producto
- **decisiones-cliente.md**: Decisiones técnicas pendientes
- **WARP.md**: Documentación técnica detallada
