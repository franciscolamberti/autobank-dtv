# Bug: Edge Function procesar-archivo lee solo 18 filas de 642

## Problema Identificado

La Edge Function `procesar-archivo` está leyendo solo **18 filas** del archivo Excel que tiene **642 filas reales**.

### Evidencia

1. **Archivo original (local):** 642 filas ✅
2. **Archivo en Supabase Storage:** 642 filas ✅ (verificado con curl + Python)
3. **XLSX.js en Edge Function:** Lee solo 18 filas ❌

### Causa Probable

`XLSX.utils.sheet_to_json()` está:
- Filtrando filas que considera "vacías"
- Detectando mal el rango del archivo
- Teniendo problemas con filas que tienen celdas vacías intercaladas

## Código Actual Problemático

```typescript
const data = XLSX.utils.sheet_to_json(sheet, { 
  header: 1,
  defval: null,
  raw: true,
  blankrows: true
})
// Devuelve solo 18 filas en lugar de 642
```

## Soluciones Intentadas

1. ❌ `blankrows: false` - Lee solo 17 filas
2. ❌ `blankrows: true` - Lee solo 18 filas  
3. ❌ `raw: true` - Lee solo 18 filas
4. ❌ `raw: false` - Lee solo 18 filas

## Solución Pendiente

### Opción A: Leer directamente el rango de celdas

```typescript
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

console.log(`Filas leídas: ${data.length}`) // Debería ser 642
```

### Opción B: Usar versión diferente de XLSX

Probar con una versión más reciente de XLSX.js que puede tener el bug arreglado:

```typescript
import * as XLSX from 'https://esm.sh/xlsx@0.20.3'
```

### Opción C: No usar XLSX.js

Parsear el Excel usando otra librería compatible con Deno:
- `npm:xlsx-populate`
- `npm:exceljs`

## Workaround Temporal

Por ahora, la Edge Function funciona correctamente con archivos más pequeños (ej: `archivo_prueba_duplicados.xlsx` que tiene <20 filas).

Para archivos grandes:
1. Dividir el Excel en chunks de <20 filas
2. O procesar localmente y subir solo el resultado

## Archivos Modificados Durante Debugging

- `supabase/functions/procesar-archivo/index.ts` - Versión actual
- `supabase/functions/procesar-archivo/index-full.ts` - Versión completa con export
- `supabase/functions/procesar-archivo/index-backup.ts` - Backup original
- `supabase/functions/procesar-archivo/index-working.ts` - De commit exitoso

## Estado Edge Function

- ✅ CORS funcionando
- ✅ Autenticación funcionando
- ✅ Download de Storage funcionando
- ❌ Parseo de Excel solo lee 18 filas de 642

## Próximos Pasos

1. Implementar Opción A (leer directamente rango de celdas)
2. Probar con archivo de prueba pequeño para validar flujo completo
3. Una vez funcionando con archivo pequeño, arreglar lectura de archivos grandes

