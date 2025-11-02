# Sistema Gestión Campañas Pickit - Autobank DTV

Sistema para gestionar campañas de contacto WhatsApp destinadas a la devolución de decodificadores DTV en puntos Pickit cercanos.

## Características Principales

- ✅ Carga y procesamiento de archivos Excel con datos de clientes (642+ filas)
- ✅ Normalización de teléfonos a formato E.164 argentino
- ✅ Detección automática de teléfonos fijos vs móviles
- ✅ Cálculo automático de distancias a puntos Pickit usando fórmula Haversine
- ✅ Deduplicación inteligente de personas con múltiples decodificadores
- ✅ Envío automático de mensajes WhatsApp vía Kapso
- ✅ Dashboard de monitoreo en tiempo real con 5 buckets PRD
- ✅ Gestión de estados y respuestas de clientes
- ✅ Generación automática de Excel "Fuera de Rango"

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

- **frontend**: aplicación next.js 16 en `/autobank-dtv` (deployada en Vercel)
- **backend**: supabase con postgresql y storage
- **edge functions**: 4 funciones serverless para procesamiento
  - `procesar-archivo` (v37) - procesamiento Excel completo ✅
  - `webhook-kapso` - receptor de respuestas Kapso ✅
  - `recalcular-distancias` - actualización de rangos ✅
  - `generar-corte-diario` - export diario Pickit ✅
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
- columna AG (índice 32): longitud (X)
- columna AH (índice 33): latitud (Y)
- coordenadas en microgrados (se convierten automáticamente a grados)
- teléfonos prioritarios:
  - columna AO (índice 40): FaxInstalacion (móvil, WhatsApp válido)
  - columna AP (índice 41): Fax2Instalacion (móvil, WhatsApp válido)
  - columna AM (índice 38): TelefonoParticularIns (fijo, sin WhatsApp)
  - columna AN (índice 39): Telefono (fijo, sin WhatsApp)
- columna AC (índice 28): ApellidoNombre
- columna A (índice 0): NroCliente
- columna B (índice 1): NroWO

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
- `PROGRESS.md`: estado actual del desarrollo y pendientes
- `EDGE_FUNCTION_RESOLUTION.md`: resolución completa del bug BOOT_ERROR
- `DEPLOYMENT_STATUS.md`: estado de deployments
- `SETUP_GUIDE.md`: guía de configuración inicial
- `bug-edgefunction.md`: registro del bug y resolución (RESUELTO ✅)

## licencia

uso interno.
