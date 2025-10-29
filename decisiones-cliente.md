# decisiones y dependencias del cliente

este documento registra todas las decisiones técnicas y de negocio que requieren validación o confirmación del cliente antes de su implementación definitiva.

---

## deduplicación de personas

### decisión: criterio de deduplicación
**fecha**: 2025-10-29  
**estado**: ✅ definido (pendiente validación final)

**contexto**:  
en el archivo excel de dtv, la misma persona puede aparecer múltiples veces con diferentes decoders. necesitamos determinar qué criterio usar para identificar registros duplicados.

**opciones evaluadas**:
1. **telefono_principal** (implementado actualmente)
   - pros: simple, directo, el telefono identifica al cliente
   - contras: posible (pero poco probable) que dos personas diferentes compartan telefono
   
2. **latitud + longitud** (alternativa)
   - pros: identifica ubicación física exacta
   - contras: puede haber múltiples clientes en misma dirección (familias, edificios)
   
3. **combinación dni + telefono**
   - pros: más robusto
   - contras: el dni puede no estar siempre presente o correcto en el excel

**decisión tomada**: usar `telefono_principal` como clave de deduplicación

**justificación**:
- el telefono es el canal de contacto whatsapp
- es el dato más confiable y completo en el excel
- si dos personas comparten telefono, igual recibirían un solo mensaje (comportamiento deseado)

**pendiente validar**:
- ¿es correcto usar solo telefono_principal?
- ¿existen casos donde múltiples personas usen el mismo telefono? (ej: familiar compartido)
- ¿debemos considerar validación adicional por dni o dirección?

---

## formato de mensaje whatsapp

### decisión: adaptación para múltiples decoders
**fecha**: 2025-10-29  
**estado**: 🟡 implementado (pendiente revisión de template kapso)

**contexto**:  
cuando una persona tiene múltiples decoders, el mensaje debe adaptarse para mencionar todos los números.

**implementación actual**:
- variable `nros_cliente`: "cli10000, cli10003, cli10007"
- variable `cantidad_decos`: 3
- variable `texto_deco`: "el decodificador" vs "los decodificadores"

**ejemplo de template sugerido**:
```
hola {{nombre_cliente}}, 
necesitamos que devuelvas {{texto_deco}} {{nros_cliente}} 
en el punto {{punto_pickit}} ubicado en {{direccion_punto}}.
está a {{distancia}} de tu domicilio.
```

**pendiente validar**:
- ¿el template de kapso está preparado para estas variables?
- ¿necesitamos ajustar el formato del mensaje?
- ¿hay límite de caracteres en el mensaje?

---

## validación de coordenadas

### decisión: formato de coordenadas en excel
**fecha**: 2025-10-29  
**estado**: ✅ implementado

**contexto**:  
el excel de dtv entrega coordenadas en formato microgrados (multiplicado por 1,000,000).

**implementación**:
- si `abs(lat) > 180` → dividir por 1,000,000
- si `abs(lon) > 180` → dividir por 1,000,000

**pendiente validar**:
- ¿este formato es consistente en todos los archivos de dtv?
- ¿existen casos donde las coordenadas vengan en formato decimal directo?

---

## prioridad de teléfonos

### decisión: orden de preferencia
**fecha**: 2025-10-29  
**estado**: ✅ implementado

**contexto**:  
el excel tiene 4 columnas de teléfono (indices 37-40).

**decisión tomada**: prioridad de izquierda a derecha
- columna 37: máxima prioridad
- columna 38: segunda opción
- columna 39: tercera opción
- columna 40: cuarta opción

**pendiente validar**:
- ¿esta prioridad refleja la preferencia real del cliente?
- ¿debemos considerar teléfonos alternativos si el principal falla?

---

## distancia máxima por defecto

### decisión: radio de búsqueda inicial
**fecha**: anterior  
**estado**: ✅ implementado

**valor actual**: 2000 metros (configurable por campaña)

**pendiente validar**:
- ¿este radio es apropiado para el negocio?
- ¿debería variar según zona geográfica?

---

## horario de envío

### decisión: ventana de tiempo para mensajes
**fecha**: anterior  
**estado**: ✅ implementado

**horario actual**: 12:00 - 15:00 (america/argentina/buenos_aires)

**pendiente validar**:
- ¿este horario maximiza la tasa de respuesta?
- ¿debería ser configurable por campaña?

---

## template

para agregar nuevas decisiones, usar este formato:

```markdown
## título de la decisión

### decisión: descripción breve
**fecha**: yyyy-mm-dd  
**estado**: ✅ implementado | 🟡 en progreso | ❌ pendiente | 🔄 en revisión

**contexto**:  
[explicación del problema o situación]

**opciones evaluadas**:
1. opción a
2. opción b

**decisión tomada**: [qué se decidió]

**justificación**: [por qué]

**pendiente validar**:
- pregunta 1
- pregunta 2
```
