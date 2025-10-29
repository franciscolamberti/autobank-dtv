# progress

## completado

### base de datos
- tabla `puntos_pickit` con 26 puntos
- tabla `campañas` con configuración completa
- tabla `personas_contactar` con ubicación, distancias y estados
- storage bucket `archivos-dtv` con políticas
- índices optimizados y triggers

### backend
- edge function `procesar-archivo` deployada
  - procesa excel desde storage
  - calcula distancias haversine
  - inserta personas en db
  - actualiza contadores de campaña
- cloudflare worker `enviar-campana` implementado (dry-run)
  - handler fetch para envío manual
  - handler scheduled con cron 12:00 utc
  - validación de horarios
  - integración supabase

### frontend
- proyecto next.js 16 `autobank-dtv`
- página dashboard (/)
  - muestra campañas desde db
  - estadísticas en tiempo real
- página nueva campaña (/campañas/nueva)
  - wizard de 3 pasos
  - upload a storage
  - invoca edge function
  - configuración de distancia_max
- integración supabase client configurada
- ui con shadcn/ui components

### testing
- script python `generar_archivo_prueba.py`
  - genera 100 personas con datos dummy
  - coordenadas en formato correcto
  - 76 dentro de rango, 24 fuera
- test end-to-end exitoso de creación de campaña

## pendiente

### edge case crítico: personas duplicadas
**estado**: documentado, no implementado
**qué falta**:
- crear migration db para agregar campos array
- modificar edge function con lógica de deduplicación
- actualizar cloudflare worker para variables kapso
- actualizar frontend para mostrar múltiples decos

### edge functions faltantes
- `webhook-kapso`: recibir respuestas de kapso
- `recalcular-distancias`: recalcular cuando cambia distancia_max

### frontend faltante
- página `/campañas/[id]` (detalle de campaña)
  - botón enviar mensajes
  - métricas en tiempo real
  - progreso de envío
- página `/campañas/[id]/personas` (lista con filtros)
  - tabla de personas con estados
  - filtros y búsqueda
  - exportar resultados

### configuración
- cloudflare worker:
  - login y deploy (`wrangler login && wrangler deploy`)
  - configurar secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAPSO_API_KEY, KAPSO_FLOW_ID, KAPSO_WHATSAPP_CONFIG_ID)
  - cambiar de dry-run a producción
- obtener credenciales kapso reales
- configurar webhook kapso apuntando a edge function

## próximos pasos

1. resolver deduplicación de personas (crítico)
2. implementar página detalle de campaña
3. implementar webhook-kapso edge function
4. obtener credenciales kapso
5. deployar cloudflare worker
6. testing end-to-end con kapso
