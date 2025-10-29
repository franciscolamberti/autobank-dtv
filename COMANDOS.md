# comandos útiles

guía rápida de comandos para desarrollo y deployment del proyecto.

## setup inicial

### instalar dependencias python (para script de prueba)
```bash
pip3 install openpyxl
```

### instalar wrangler (cloudflare workers cli)
```bash
npm install -g wrangler
```

### autenticar cloudflare
```bash
wrangler login
```

## desarrollo

### generar archivo excel de prueba
```bash
python3 generar_archivo_prueba.py
```
output: `archivo_prueba_dtv_100_personas.xlsx`

### correr frontend localmente
```bash
cd autobank-dtv
npm run dev
```
url: http://localhost:3000

### testear cloudflare worker localmente
```bash
wrangler dev
```

## supabase

### listar edge functions deployadas
usando mcp tools o:
```bash
curl https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/ \
  -H "Authorization: Bearer <anon_key>"
```

### invocar edge function manualmente
```bash
curl -X POST https://fobaguhlzpwrzdhyyyje.supabase.co/functions/v1/procesar-archivo \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "campana_id": "uuid-here",
    "bucket": "archivos-dtv",
    "path": "uuid/archivo.xlsx"
  }'
```

### ver logs de edge function
desde dashboard supabase: edge functions → procesar-archivo → logs

### consultar base de datos
usando mcp tools o psql:
```bash
# listar campañas
SELECT id, nombre, total_personas, personas_dentro_rango, estado 
FROM campanas 
ORDER BY created_at DESC;

# listar personas de una campaña
SELECT apellido_nombre, telefono_principal, distancia_metros, dentro_rango, estado_contacto
FROM personas_contactar
WHERE campana_id = 'uuid-here'
ORDER BY distancia_metros;

# estadísticas de campaña
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE dentro_rango = true) as dentro_rango,
  COUNT(*) FILTER (WHERE estado_contacto = 'enviado_whatsapp') as enviados,
  COUNT(*) FILTER (WHERE estado_contacto = 'confirmado') as confirmados
FROM personas_contactar
WHERE campana_id = 'uuid-here';
```

## cloudflare worker

### configurar secrets
```bash
wrangler secret put SUPABASE_URL
# ingresar: https://fobaguhlzpwrzdhyyyje.supabase.co

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# obtener de supabase dashboard: settings → api → service_role key

wrangler secret put KAPSO_API_KEY
# obtener de kapso dashboard

wrangler secret put KAPSO_FLOW_ID
# id del flow en kapso

wrangler secret put KAPSO_WHATSAPP_CONFIG_ID
# id de config whatsapp en kapso
```

### deployar worker
```bash
wrangler deploy
```

### ver logs del worker
```bash
wrangler tail
```

### invocar worker manualmente (después de deployar)
```bash
curl -X POST https://enviar-campana.<tu-subdominio>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"campana_id": "uuid-here"}'
```

## deployment checklist

### antes de deployar a producción

- [ ] edge function `procesar-archivo` deployada y testeada
- [ ] storage bucket `archivos-dtv` creado con políticas
- [ ] tablas db creadas y migraciones aplicadas
- [ ] frontend testeado localmente
- [ ] worker configurado con secrets correctos
- [ ] credenciales kapso obtenidas
- [ ] template kapso configurado con variables correctas
- [ ] webhook kapso configurado (cuando esté implementado)

### deployment orden recomendado

1. verificar base de datos completa
2. verificar edge function deployada
3. configurar secrets cloudflare worker
4. deployar cloudflare worker en modo dry-run
5. testear con campaña de prueba
6. cambiar worker a producción (quitar dry-run flag)
7. deployar frontend a vercel/netlify
8. configurar webhook kapso apuntando a edge function

## troubleshooting

### edge function no responde
```bash
# verificar que está activa
# usar mcp tool: list_edge_functions

# ver logs en dashboard supabase
```

### error cors en frontend
verificar que edge function tiene:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### storage upload falla
verificar políticas:
```sql
-- verificar bucket existe
SELECT * FROM storage.buckets WHERE id = 'archivos-dtv';

-- verificar políticas
SELECT * FROM storage.policies WHERE bucket_id = 'archivos-dtv';
```

### worker no procesa mensajes
1. verificar secrets configurados: `wrangler secret list`
2. ver logs: `wrangler tail`
3. verificar horarios (12:00-15:00 argentina = 15:00-18:00 utc)
4. verificar dry_run flag

## urls importantes

- **supabase dashboard**: https://supabase.com/dashboard/project/fobaguhlzpwrzdhyyyje
- **supabase api**: https://fobaguhlzpwrzdhyyyje.supabase.co
- **cloudflare dashboard**: https://dash.cloudflare.com
- **kapso dashboard**: https://app.kapso.ai

## variables de entorno

### frontend (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://fobaguhlzpwrzdhyyyje.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ver en supabase dashboard>
```

### cloudflare worker (secrets via wrangler)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- KAPSO_API_KEY
- KAPSO_FLOW_ID
- KAPSO_WHATSAPP_CONFIG_ID

## archivos importantes

- `PROGRESS.md` - estado actual del proyecto
- `PRD.md` - documento de requisitos
- `DEDUPLICACION.md` - especificación de deduplicación
- `generar_archivo_prueba.py` - script de testing
- `src/enviar-campana.js` - cloudflare worker
- `wrangler.toml` - config cloudflare worker
- `autobank-dtv/` - frontend next.js
- `supabase/functions/procesar-archivo/` - edge function
