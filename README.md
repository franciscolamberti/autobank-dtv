# sistema análisis distancias pickit

sistema basado en supabase edge functions para calcular distancias entre personas y puntos pickit.

## arquitectura

```
frontend (v0/nextjs)
    |
    | upload archivo excel
    v
supabase storage
    |
    | trigger on insert
    v
edge function
    |
    | consulta puntos pickit
    | calcula distancias
    v
tabla analisis
```

## base de datos

### tablas

**puntos_pickit** (26 puntos pre-cargados)
- id (uuid)
- nombre (text)
- direccion (text)
- lat (float)
- lon (float)
- created_at (timestamp)

**analisis** (historial de procesamiento)
- id (uuid)
- created_at (timestamp)
- archivo_url (text)
- distancia_max (int)
- total_personas (int)
- personas_cercanas (int)
- porcentaje (float)
- resultados (jsonb)

## flujo de uso

1. usuario sube archivo excel de personas dtv desde frontend
2. archivo se guarda en supabase storage bucket `archivos-dtv`
3. storage trigger activa edge function automáticamente
4. edge function:
   - descarga archivo del storage
   - consulta 26 puntos pickit desde tabla
   - procesa excel y calcula distancias
   - guarda resultados en tabla `analisis`
5. frontend consulta tabla `analisis` y muestra resultados

## desarrollo

### edge function local

```bash
supabase functions serve procesar-distancias
```

### deploy edge function

```bash
supabase functions deploy procesar-distancias
```

## formato archivo dtv

- hoja: primera hoja del workbook
- columna ag (índice 32): longitud (x)
- columna ah (índice 33): latitud (y)
- las coordenadas pueden venir sin punto decimal (ej: -34644255 = -34.644255)

## límites técnicos

- edge functions: 10s timeout, 2mb response
- fórmula de distancia: haversine
- puntos pickit: 26 pre-cargados en db
- distancia máxima default: 2000 metros
