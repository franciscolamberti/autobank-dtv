# Bug: Edge Function procesar-archivo - RESUELTO

**Fecha:** 2 de Noviembre, 2025  
**Estado:** RESUELTO ✅  
**Versión:** v35

---

## Resolución Final

La Edge Function `procesar-archivo` ahora funciona correctamente:
1. Lee el Excel completo (642 filas usando decode_range)
2. Normaliza teléfonos a formato E.164 argentino (elimina '15' tras código de área)
3. Deduplica por `nro_cliente` (primary) y teléfono (fallback)
4. Calcula distancias a puntos Pickit
5. Inserta personas en la base de datos en lotes de 500
6. Genera Excel de "fuera de rango"
7. Incluye filas sin coordenadas como fuera_de_rango

**Cambios aplicados:**
- Skeleton mínimo con boot estable (Deno.serve)
- Import dinámico de xlsx y supabase-js
- Lectura completa por decode_range (no sheet_to_json)
- Normalización E.164 mejorada
- Schema DB: lat/lon/distancia_metros ahora nullable
- Derivación de campana_id desde path si falta
- Hardening: validaciones, caps, timeouts

---

## Cómo Reproducir

1. **Test rápido:**
```bash
curl -X OPTIONS https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/procesar-archivo
```

**Resultado esperado:** 200 OK  
**Resultado actual:** 503 con `{"code":"BOOT_ERROR","message":"Function failed to start"}`

2. **Desde el frontend:**
   - Ir a https://autobank-dtv.vercel.app/campanas/nueva
   - Crear campaña y subir archivo
   - **Error:** "Failed to send a request to the Edge Function"

---

## Lo que Funciona vs Lo que Crashea

### ✅ Esta versión SÍ arranca (pero tiene otro bug):

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  
  // Código simple...
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  
  // El problema: data.length = 18 (debería ser 642)
})
```

**Resultado:** HTTP 200 OK ✅ pero solo lee 18 filas de 642 ❌

### ❌ Esta versión crashea (BOOT_ERROR):

Archivo actual: `supabase/functions/procesar-archivo/index.ts`

**Incluye:**
- TypeScript interfaces (`PersonaExcel`, `PersonaDeduplicated`)
- Función `leerPersonasDtv()` con validaciones
- Función `deduplicarPersonas()` con Maps
- Función `generarExportFueraRango()` que crea Excel
- Función `validarWhatsApp()` que llama API Kapso

**Resultado:** HTTP 503 BOOT_ERROR ❌

---

## Archivos Relevantes

**Función problemática:**
```
supabase/functions/procesar-archivo/index.ts
supabase/functions/procesar-archivo/deno.json
```

**Backups disponibles:**
```
supabase/functions/procesar-archivo/index-full.ts      (versión completa que crashea)
supabase/functions/procesar-archivo/index-backup.ts    (otro backup)
supabase/functions/procesar-archivo/index-working.ts   (del commit 125b876)
```

**Comando para deploy:**
```bash
cd supabase
supabase functions deploy procesar-archivo --no-verify-jwt
```

**Test después de deploy:**
```bash
curl -X OPTIONS https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/procesar-archivo
# Debe devolver: 200 (actualmente: 503)
```

---

## Dos Problemas Separados

### 🔴 Problema A: BOOT_ERROR (503)
- **Qué:** La función no arranca
- **Dónde:** `index.ts` completo con TypeScript
- **Solución necesaria:** Encontrar qué línea/sintaxis causa el crash en Deno

### 🟡 Problema B: Solo lee 18 filas de 642
- **Qué:** XLSX.js parsea mal el archivo
- **Dónde:** Línea con `XLSX.utils.sheet_to_json(sheet, { header: 1 })`
- **Solución necesaria:** Leer el rango completo directamente en vez de usar `sheet_to_json`

**Solución propuesta para Problema B:**
```typescript
// En lugar de:
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

// Usar:
const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
const data: any[] = []
for (let R = 0; R <= range.e.r; R++) {
  const row: any[] = []
  for (let C = 0; C <= range.e.c; C++) {
    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
    const cell = sheet[cellAddress]
    row.push(cell ? cell.v : null)
  }
  data.push(row)
}
// Esto debería leer las 642 filas completas
```

---

## Información del Sistema

**Supabase Project:**
- URL: `https://fobaguhlzpwrzdhyyyje.supabase.co`
- Project ID: `fobaguhlzpwrzdhyyyje`

**Edge Function:**
- Nombre: `procesar-archivo`
- Versión actual: 22 (aprox)
- Estado: ACTIVE (pero crashea)

**Archivo de prueba:**
- Ubicación local: `2025.10.27.Piloto Autobank - DTV - Estatus - Archivo de datos.xlsx`
- Filas reales: 642
- Alternativa: `/Users/franciscolamberti/Downloads/Listado DTV - Test.xlsx`

---

## Próximos Pasos Recomendados

1. **Prioridad ALTA:** Resolver BOOT_ERROR (Problema A)
   - Simplificar código TypeScript a JavaScript
   - Eliminar interfaces y usar `any`
   - Probar deploy gradual agregando funciones una por una

2. **Prioridad MEDIA:** Resolver lectura de Excel (Problema B)
   - Implementar lectura directa de celdas (código arriba)
   - Probar con archivo más pequeño primero

3. **Verificación:**
   - Test OPTIONS debe devolver 200
   - Test POST debe procesar 642 personas
   - Frontend debe mostrar personas en dashboard

---

## Comandos Útiles

**Deploy function:**
```bash
supabase functions deploy procesar-archivo --no-verify-jwt
```

**Test OPTIONS (preflight):**
```bash
curl -X OPTIONS https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/procesar-archivo
```

**Test POST (procesar):**
```bash
curl -X POST https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/procesar-archivo \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "campana_id": "UUID_CAMPANA",
    "bucket": "archivos-dtv",
    "path": "UUID_CAMPANA/archivo.xlsx"
  }'
```

**Ver logs:**
```bash
# Supabase Dashboard
https://supabase.com/dashboard/project/fobaguhlzpwrzdhyyyje/logs/edge-functions
```

---

## Contexto Adicional

**Todo lo demás está funcionando:**
- ✅ Base de datos migrada
- ✅ Otras 3 Edge Functions funcionan
- ✅ Cloudflare Worker deployado
- ✅ Frontend en Vercel deployado
- ✅ Solo falta arreglar esta Edge Function

**El sistema está 95% completo**, solo este bug bloquea el procesamiento de archivos.

