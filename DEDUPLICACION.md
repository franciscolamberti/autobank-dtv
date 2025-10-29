# deduplicación de personas con múltiples decos

## contexto

en los archivos excel de dtv, la misma persona puede aparecer múltiples veces porque tiene varios decodificadores en su poder. esto genera:
- múltiples mensajes whatsapp a la misma persona
- experiencia negativa para el cliente (spam)
- costos innecesarios de envío
- métricas incorrectas (una persona cuenta como varias)

## solución

agrupar personas por `telefono_principal` y consolidar todos sus decodificadores en un solo registro.

## cambios necesarios

### 1. schema de base de datos

agregar campos a tabla `personas_contactar`:

```sql
-- migration: add_deduplication_fields
ALTER TABLE personas_contactar
ADD COLUMN nros_cliente text[] DEFAULT ARRAY[]::text[],
ADD COLUMN nros_wo text[] DEFAULT ARRAY[]::text[],
ADD COLUMN cantidad_decos integer DEFAULT 1;

-- actualizar registros existentes
UPDATE personas_contactar
SET nros_cliente = ARRAY[nro_cliente],
    nros_wo = ARRAY[nro_wo],
    cantidad_decos = 1
WHERE nros_cliente IS NULL OR array_length(nros_cliente, 1) IS NULL;

-- crear índice para búsquedas por teléfono
CREATE INDEX idx_personas_telefono ON personas_contactar(telefono_principal);
```

### 2. edge function `procesar-archivo`

modificar lógica de procesamiento:

```typescript
// después de leer todas las personas del excel
const personas = leerPersonasDtv(workbook)

// agrupar por teléfono
const personasAgrupadas = new Map<string, {
  persona: PersonaExcel,
  nrosCliente: string[],
  nrosWO: string[],
  filas: number[]
}>()

for (const persona of personas) {
  const key = persona.telefonoPrincipal
  
  if (!personasAgrupadas.has(key)) {
    personasAgrupadas.set(key, {
      persona: persona,
      nrosCliente: [persona.nroCliente],
      nrosWO: [persona.nroWO],
      filas: [persona.fila]
    })
  } else {
    const grupo = personasAgrupadas.get(key)!
    grupo.nrosCliente.push(persona.nroCliente)
    grupo.nrosWO.push(persona.nroWO)
    grupo.filas.push(persona.fila)
  }
}

// insertar personas deduplicadas
const personasParaInsertar = []

for (const [telefono, grupo] of personasAgrupadas) {
  const { punto, distancia } = encontrarPuntoMasCercano(grupo.persona, puntosPickit)
  const dentroRango = distancia <= distanciaMax
  
  if (dentroRango) personasDentroRango++
  
  personasParaInsertar.push({
    campana_id,
    fila_archivo: grupo.filas[0], // primera fila donde apareció
    nro_cliente: grupo.nrosCliente[0], // mantener primer nro por compatibilidad
    nro_wo: grupo.nrosWO[0],
    nros_cliente: grupo.nrosCliente, // 🆕 array completo
    nros_wo: grupo.nrosWO, // 🆕 array completo
    cantidad_decos: grupo.nrosCliente.length, // 🆕 contador
    apellido_nombre: grupo.persona.apellidoNombre,
    dni: grupo.persona.dni,
    telefono_principal: grupo.persona.telefonoPrincipal,
    direccion_completa: grupo.persona.direccionCompleta,
    cp: grupo.persona.cp,
    localidad: grupo.persona.localidad,
    provincia: grupo.persona.provincia,
    lat: grupo.persona.lat,
    lon: grupo.persona.lon,
    punto_pickit_id: punto?.id,
    distancia_metros: distancia,
    dentro_rango: dentroRango,
    razon_creacion: grupo.persona.razonCreacion,
    estado_cliente_original: grupo.persona.estadoCliente
  })
}

// actualizar contadores
const { error: updateError } = await supabase
  .from('campanas')
  .update({
    total_personas: personasAgrupadas.size, // 🆕 contar personas únicas
    personas_dentro_rango: personasDentroRango
  })
  .eq('id', campana_id)
```

### 3. variables para mensaje whatsapp

actualizar envío a kapso en cloudflare worker:

```typescript
// formatear nros de cliente para mensaje
const formatearNrosCliente = (nros: string[]): string => {
  if (nros.length === 1) return nros[0]
  if (nros.length === 2) return `${nros[0]} y ${nros[1]}`
  const ultimoNro = nros[nros.length - 1]
  const restantes = nros.slice(0, -1).join(', ')
  return `${restantes} y ${ultimoNro}`
}

// preparar variables
const variables = {
  nombre_cliente: persona.apellido_nombre,
  nro_cliente: persona.nros_cliente[0], // primer nro
  nros_cliente: formatearNrosCliente(persona.nros_cliente),
  cantidad_decos: persona.cantidad_decos,
  texto_deco: persona.cantidad_decos === 1 ? 'el decodificador' : 'los decodificadores',
  texto_deco_numero: persona.cantidad_decos === 1 ? 'el decodificador nro' : 'los decodificadores nro',
  punto_pickit: puntoPickit.nombre,
  direccion_punto: puntoPickit.direccion,
  distancia: `${Math.round(persona.distancia_metros)} metros`
}

// ejemplo de uso en template kapso:
// "hola {nombre_cliente}, tenés {texto_deco_numero} {nros_cliente} para devolver..."
```

### 4. actualizar frontend

mostrar información de múltiples decos:

```tsx
// en tabla de personas
<TableCell>
  {persona.cantidad_decos > 1 ? (
    <div className="flex items-center gap-2">
      <Badge variant="secondary">{persona.cantidad_decos} decos</Badge>
      <span className="text-xs text-muted-foreground">
        {persona.nros_cliente.join(', ')}
      </span>
    </div>
  ) : (
    <span>{persona.nro_cliente}</span>
  )}
</TableCell>

// en detalle de persona
{persona.cantidad_decos > 1 && (
  <Alert>
    <AlertDescription>
      esta persona tiene {persona.cantidad_decos} decodificadores:
      <ul className="list-disc pl-4 mt-2">
        {persona.nros_cliente.map((nro, idx) => (
          <li key={idx}>
            cliente {nro} - wo {persona.nros_wo[idx]}
          </li>
        ))}
      </ul>
    </AlertDescription>
  </Alert>
)}
```

### 5. actualizar script de prueba

modificar `generar_archivo_prueba.py` para incluir duplicados:

```python
# después de generar las 100 personas
# seleccionar 10 personas al azar para duplicar
personas_duplicar = random.sample(range(100), 10)

for idx in personas_duplicar:
    # agregar 2-3 decos adicionales para esta persona
    cantidad_adicionales = random.randint(2, 3)
    persona_original = personas[idx]
    
    for i in range(cantidad_adicionales):
        persona_duplicada = persona_original.copy()
        persona_duplicada["nro_cliente"] = f"CLI{10000 + len(personas) + i}"
        persona_duplicada["nro_wo"] = f"WO{20000 + len(personas) + i}"
        # mismo teléfono, misma ubicación
        personas.append(persona_duplicada)

# resultado esperado:
# - 100 personas únicas (después de deduplicación)
# - 10 personas con múltiples decos (2-3 cada una)
# - total ~120 filas en excel
```

## testing

### 1. test unitario edge function

```typescript
// test: deduplicación por teléfono
const personasExcel = [
  { telefono: '1234567890', nroCliente: 'CLI001', nroWO: 'WO001', ... },
  { telefono: '1234567890', nroCliente: 'CLI002', nroWO: 'WO002', ... },
  { telefono: '9876543210', nroCliente: 'CLI003', nroWO: 'WO003', ... },
]

const resultado = deduplicarPersonas(personasExcel)

expect(resultado.length).toBe(2) // 2 personas únicas
expect(resultado[0].cantidad_decos).toBe(2)
expect(resultado[0].nros_cliente).toEqual(['CLI001', 'CLI002'])
expect(resultado[1].cantidad_decos).toBe(1)
```

### 2. test integración

1. generar archivo excel con duplicados
2. subir a campaña
3. verificar en db:
   - cantidad personas únicas correcta
   - arrays de nros_cliente poblados
   - cantidad_decos correcta
4. verificar mensaje whatsapp:
   - singular/plural correcto
   - todos los nros incluidos

### 3. casos edge a testear

- persona con 1 solo deco (comportamiento normal)
- persona con 2 decos (singular → plural)
- persona con 5+ decos (formateo de lista larga)
- misma persona en múltiples filas no consecutivas
- personas con teléfonos muy similares pero no idénticos

## métricas de éxito

antes de la implementación:
- 100 filas excel → 100 registros db → 100 mensajes whatsapp

después de la implementación:
- 120 filas excel (10 duplicadas) → 100 registros db → 100 mensajes whatsapp
- ahorro: ~17% en mensajes enviados (según tasa de duplicación real)

## rollout plan

### fase 1: preparación
1. ✅ documentar edge case
2. ⏳ crear migration db
3. ⏳ actualizar tipos typescript

### fase 2: backend
4. ⏳ modificar edge function `procesar-archivo`
5. ⏳ agregar tests unitarios
6. ⏳ deployar y testear con archivo de prueba

### fase 3: integración
7. ⏳ actualizar cloudflare worker (variables kapso)
8. ⏳ actualizar template kapso
9. ⏳ test end-to-end

### fase 4: frontend
10. ⏳ actualizar tabla dashboard
11. ⏳ actualizar detalle campaña
12. ⏳ actualizar lista personas

### fase 5: producción
13. ⏳ migrar campañas existentes (si aplica)
14. ⏳ monitorear métricas
15. ⏳ ajustar según feedback

## notas adicionales

### ¿qué pasa con personas ya procesadas?

opción 1: no hacer nada (solo aplica a campañas nuevas)
opción 2: crear script de migración que deduplicue campañas existentes
- más complejo
- requiere merge de estados (¿qué estado toma si uno respondió y otro no?)

recomendación: opción 1, solo aplicar a campañas nuevas

### ¿cómo identificar duplicados reales vs distintas personas?

criterio actual: `telefono_principal`

posibles mejoras futuras:
- combinar teléfono + nombre (más robusto)
- combinar teléfono + dni
- normalizar teléfonos (quitar espacios, guiones, +54, etc)

recomendación: empezar solo con teléfono, iterar según resultados

### consideraciones de performance

- deduplicación en memoria (map javascript) → rápido para archivos <10k filas
- si archivos muy grandes (>50k), considerar procesar en batches
- índice en telefono_principal para queries rápidas
