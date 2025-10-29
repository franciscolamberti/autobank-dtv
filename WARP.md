# sistema de análisis de distancias pickit

## contexto del proyecto

sistema para comparar ubicaciones de personas (clientes dtv) con puntos pickit (lugares de devolución de decodificadores) y filtrar solo aquellas personas que están a menos de 2000 metros de un punto pickit.

## archivos de entrada

### archivo 1: puntos pickit
- **archivo**: `PUNTOS PICKIT - AR - Red Dev_DO mktplc DTV.v2.xlsx`
- **hoja**: "red total"
- **columnas relevantes**:
  - columna h (índice 7): latitud
  - columna i (índice 8): longitud
  - columna b (índice 1): nombre del punto
  - columna c (índice 2): dirección
- **total**: 81 puntos pickit
- **nota**: este archivo se cargará en la base de datos y no se subirá cada vez

### archivo 2: personas dtv
- **archivo**: `formato ejemplo de info dtv.xlsx`
- **hoja**: primera hoja del workbook
- **columnas relevantes**:
  - columna ag (índice 32): longitud (x)
  - columna ah (índice 33): latitud (y)
- **nota**: las coordenadas vienen sin punto decimal (ej: -34644255 = -34.644255)
- **nota**: este archivo se subirá en cada análisis

## arquitectura decidida

### stack tecnológico

1. **frontend**: v0/nextjs
2. **backend/database**: supabase
3. **procesamiento**: supabase edge functions
4. **storage**: supabase storage

### componentes

#### frontend (v0/nextjs) - pendiente
- formulario de upload de 1 archivo (personas dtv)
- selector de distancia máxima (default: 2000 metros)
- visualización de resultados en tabla
- opción de descarga de resultados

#### backend (supabase)
**tablas**:
- `puntos_pickit`: ✅ creada y poblada con 26 puntos
  - id (uuid, pk)
  - nombre (text)
  - direccion (text)
  - lat (float)
  - lon (float)
  - created_at (timestamp)

- `analisis`: ✅ creada
  - id (uuid, pk)
  - created_at (timestamp)
  - archivo_url (text)
  - distancia_max (int)
  - total_personas (int)
  - personas_cercanas (int)
  - porcentaje (float)
  - resultados (jsonb)

**storage**: - pendiente
- bucket `archivos-dtv`: para archivos excel subidos

**edge functions**: - pendiente
- `procesar-distancias`: recibe archivo excel, calcula distancias, guarda resultados

#### edge function (supabase) - pendiente
- **lógica**: migrada desde cloudflare worker
- **código base**: disponible en `/Users/franciscolamberti/Library/Mobile Documents/com~apple~CloudDocs/worker-distancias/src/index.js`
- **ventajas**: acceso directo a db, sin problemas de cors/waf, todo en supabase

## flujo de usuario propuesto

1. usuario accede al frontend
2. usuario sube archivo excel de personas dtv
3. frontend guarda archivo en supabase storage
4. storage trigger activa edge function automáticamente
5. edge function:
   - obtiene archivo del storage
   - consulta puntos pickit desde tabla (26 puntos pre-cargados)
   - calcula distancias usando haversine
   - guarda resultados en tabla `analisis`
6. frontend consulta tabla `analisis` y muestra resultados
7. usuario puede ver/descargar resultados

## cálculo de distancias

**fórmula**: haversine
**implementación**: ya implementada en worker (javascript) y script python
**radio de la tierra**: 6,371,000 metros

## estado actual

### completado ✅
- script python local (`comparar_distancias.py`)
- lógica de cálculo de distancias (javascript)
- tabla `puntos_pickit` creada y poblada con 26 puntos
- tabla `analisis` creada
- csv de puntos pickit exportado

### pendiente ⏳
1. **configurar supabase storage**:
   - crear bucket `archivos-dtv`
   - configurar políticas de acceso
   - configurar trigger on insert

2. **crear edge function**:
   - migrar lógica desde worker cloudflare
   - conectar con storage y db
   - implementar procesamiento xlsx
   - guardar resultados en tabla `analisis`

3. **crear frontend**:
   - diseño en v0
   - file uploader a supabase storage
   - visualización de resultados desde tabla `analisis`
   - opción de descarga

### decisiones tomadas ✅
- arquitectura: todo en supabase (edge functions + storage + db)
- puntos pickit: 26 puntos pre-cargados en tabla
- procesamiento: automático vía storage trigger
- historial: sí, guardado en tabla `analisis`

### decisiones pendientes ❓
- ¿autenticación necesaria o público?
- ¿visualización en mapa además de tabla?
- ¿formato de descarga: excel, csv o ambos?

## archivos del proyecto

```
~/Library/Mobile Documents/com~apple~CloudDocs/worker-distancias/
├── WARP.md                         # este archivo - documentación completa
├── src/
│   └── index.js                # código del worker
├── package.json
├── wrangler.toml               # config cloudflare
├── README.md                   # documentación del worker
└── test-local.sh               # script de prueba local

/Users/franciscolamberti/
├── comparar_distancias.py          # script python local (funcional)
└── crear_archivo_simple.py         # script para simplificar excel pickit
```

## archivos de datos

```
/Users/franciscolamberti/Downloads/
├── PUNTOS PICKIT - AR - Red Dev_DO mktplc DTV.v2.xlsx  # 3.8mb - original
├── PUNTOS_PICKIT_simple.xlsx                            # 13kb - simplificado
├── Formato ejemplo de info DTV.xlsx                      # 10kb
├── personas_cercanas_pickit.xlsx                        # resultados filtrados
└── todas_personas_con_distancias.xlsx                   # resultados completos
```

## próximos pasos

1. configurar supabase storage bucket
2. crear edge function con lógica de procesamiento
3. configurar storage trigger
4. crear frontend en v0
5. testear flujo end-to-end

## comandos útiles

```bash
# desarrollo local del worker
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/worker-distancias
npm run dev

# deploy del worker
npm run deploy

# ejecutar script python local
python3 /Users/franciscolamberti/comparar_distancias.py

# probar worker local
./test-local.sh
```

## notas técnicas

- se cambió de cloudflare workers a supabase edge functions para simplificar arquitectura
- 26 puntos pickit disponibles (filtrados de los 81 originales)
- edge functions tienen límite de 10s timeout y 2mb response
- procesamiento asíncrono vía storage triggers
- considerar rate limiting si se hace público
