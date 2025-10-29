# sistema gestión campañas pickit

sistema para gestionar campañas de contacto whatsapp destinadas a la devolución de decodificadores dtv en puntos pickit cercanos.

## características

- carga y procesamiento de archivos excel con datos de clientes
- cálculo automático de distancias a puntos pickit usando fórmula haversine
- deduplicación inteligente de personas con múltiples decodificadores
- envío automático de mensajes whatsapp vía kapso
- dashboard de monitoreo en tiempo real
- gestión de estados y respuestas de clientes

## arquitectura

```
frontend (next.js)
    ↓
supabase (storage + postgresql)
    ↓
edge functions (procesamiento)
    ↓
cloudflare workers (envío whatsapp)
    ↓
kapso api (mensajería)
```

### componentes

- **frontend**: aplicación next.js 16 en `/autobank-dtv`
- **backend**: supabase con postgresql y storage
- **edge functions**: 3 funciones serverless para procesamiento
- **cloudflare worker**: envío programado y manual de mensajes
- **kapso**: integración para whatsapp business

## estructura del proyecto

```
worker-distancias/
├── autobank-dtv/          # frontend next.js
├── src/
│   └── enviar-campana.js  # cloudflare worker
├── supabase/
│   └── functions/         # edge functions
│       ├── procesar-archivo/
│       ├── webhook-kapso/
│       └── recalcular-distancias/
├── generar_archivo_prueba.py  # script de testing
├── wrangler.toml          # config cloudflare
├── PRD.md                 # requisitos del producto
└── Progress.md            # estado del desarrollo
```

## instalación

### prerrequisitos

- node.js 18+
- python 3.8+ (para script de prueba)
- cuenta supabase
- cuenta cloudflare workers
- cuenta kapso

### setup

1. clonar repositorio
```bash
git clone <repo-url>
cd worker-distancias
```

2. instalar dependencias
```bash
npm install
```

3. configurar variables de entorno

crear `.env.local` en `/autobank-dtv`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

4. configurar secrets cloudflare worker
```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put KAPSO_API_KEY
wrangler secret put KAPSO_FLOW_ID
wrangler secret put KAPSO_WHATSAPP_CONFIG_ID
```

## uso

### desarrollo local

**frontend**:
```bash
cd autobank-dtv
npm run dev
```

**cloudflare worker**:
```bash
wrangler dev
```

### deployment

**frontend** (vercel/netlify):
```bash
cd autobank-dtv
npm run build
```

**cloudflare worker**:
```bash
wrangler deploy
```

### generar archivo de prueba

```bash
pip3 install openpyxl
python3 generar_archivo_prueba.py
```

genera `archivo_prueba_dtv_100_personas.xlsx` con datos de ejemplo.

## base de datos

### tablas principales

- `puntos_pickit`: 26 puntos de devolución pre-cargados
- `campañas`: información y configuración de campañas
- `personas_contactar`: clientes con ubicación, distancia y estado

ver schema completo en `PRD.md`.

## flujo de trabajo

1. **cargar campaña**
   - usuario sube archivo excel desde frontend
   - sistema procesa automáticamente
   - calcula distancias a puntos pickit

2. **configurar distancia**
   - ajustar radio de cobertura (default: 2000m)
   - recalcular personas dentro del rango

3. **enviar mensajes**
   - envío manual o programado
   - horario permitido: 12:00-15:00 (argentina)
   - mensajes personalizados por persona

4. **monitorear respuestas**
   - dashboard en tiempo real
   - filtros por estado, localidad, punto
   - gestión manual de confirmaciones

## formato archivo excel

el archivo dtv debe tener:
- columna ag (índice 32): longitud
- columna ah (índice 33): latitud
- coordenadas en microgrados (se convierten automáticamente)
- teléfonos en cols 37-40

## cálculo de distancias

usa fórmula haversine con radio terrestre de 6,371km. implementado en javascript para procesamiento eficiente.

## deduplicación

el sistema detecta automáticamente personas con múltiples decodificadores (mismo teléfono) y:
- agrupa todos los números de cliente
- envía un solo mensaje whatsapp
- adapta el mensaje según cantidad de decos
- reduce costos y mejora experiencia

## límites técnicos

- edge functions: 10s timeout, 2mb response
- cloudflare workers: 30s cpu time
- archivos excel: optimizado para <10k filas
- horario envío: 12:00-15:00 (america/argentina/buenos_aires)

## documentación adicional

- `PRD.md`: documento completo de requisitos del producto
- `Progress.md`: estado actual del desarrollo y pendientes

## licencia

uso interno.
