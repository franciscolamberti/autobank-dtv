import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
}

interface PuntoPickit {
  id: string
  nombre: string
  direccion: string
  lat: number
  lon: number
}

interface PersonaExcel {
  fila: number
  nroCliente: string
  nroWO: string
  apellidoNombre: string
  dni: string
  telefonoPrincipal: string
  telefonoPrincipalNormalizado: string
  direccionCompleta: string
  cp: string
  localidad: string
  provincia: string
  lat: number
  lon: number
  razonCreacion: string
  estadoCliente: string
}

interface PersonaDeduplicated extends PersonaExcel {
  nrosCliente: string[]
  nrosWO: string[]
  cantidadDecos: number
}

/**
 * Normaliza número de teléfono argentino a formato E.164
 * Reglas según PRD:
 * - Si empieza con 011 o 11 → +54 + código área sin 0 + número
 * - Si empieza con 0 seguido de código área → +54 + código área sin 0 + número
 * - Si ya tiene +54 o 54 → validar longitud
 * - Longitud esperada: 13 caracteres con + (ej: +5491154259622)
 */
function normalizarTelefonoE164(telefono: string): { normalizado: string | null; invalido: boolean } {
  if (!telefono) {
    return { normalizado: null, invalido: true }
  }

  // Limpiar caracteres no numéricos excepto +
  let limpio = telefono.trim().replace(/[^\d+]/g, '')
  
  if (!limpio || limpio.length < 8) {
    return { normalizado: null, invalido: true }
  }

  // Si ya está en formato E.164 (+54...)
  if (limpio.startsWith('+54')) {
    // Validar longitud (debe ser +54 + 9 dígitos de área + número = 13 chars total)
    if (limpio.length === 13) {
      return { normalizado: limpio, invalido: false }
    }
    return { normalizado: null, invalido: true }
  }

  // Si empieza con 54 sin +
  if (limpio.startsWith('54')) {
    const sinPrefijo = limpio.substring(2)
    if (sinPrefijo.length === 10) {
      return { normalizado: `+54${sinPrefijo}`, invalido: false }
    }
    return { normalizado: null, invalido: true }
  }

  // Si empieza con 011 (Buenos Aires con 0)
  if (limpio.startsWith('011')) {
    const sin011 = limpio.substring(3) // Remover 011
    if (sin011.length === 8) {
      // 011 + 8 dígitos = número BA
      return { normalizado: `+54911${sin011}`, invalido: false }
    }
    // Si tiene 10 dígitos después de 011, es número celular BA (15 + 8 dígitos)
    if (sin011.length === 10) {
      return { normalizado: `+54911${sin011}`, invalido: false }
    }
    return { normalizado: null, invalido: true }
  }

  // Si empieza con 11 (Buenos Aires sin 0)
  if (limpio.startsWith('11') && limpio.length >= 10) {
    const sin11 = limpio.substring(2)
    if (sin11.length === 8) {
      return { normalizado: `+54911${sin11}`, invalido: false }
    }
    if (sin11.length === 10) {
      // Número completo: 11 + 8 dígitos o 11 + 15 + 8 dígitos
      return { normalizado: `+54911${sin11}`, invalido: false }
    }
    return { normalizado: null, invalido: true }
  }

  // Si empieza con 0 seguido de código área (ej: 0351)
  if (limpio.startsWith('0') && limpio.length >= 8) {
    const codigoArea = limpio.substring(0, 4) // ej: 0351
    const numero = limpio.substring(4)
    
    if (codigoArea.length === 4 && numero.length >= 6) {
      // Remover el 0 inicial del código área
      const codigoSinCero = codigoArea.substring(1) // ej: 351
      return { normalizado: `+54${codigoSinCero}${numero}`, invalido: false }
    }
    return { normalizado: null, invalido: true }
  }

  // Si tiene 10 dígitos, asumir que es número argentino sin prefijo
  if (limpio.length === 10 && !limpio.startsWith('0')) {
    // Intentar detectar si es BA (11) o provincia
    // Por defecto, asumir BA si no se puede determinar
    return { normalizado: `+54911${limpio}`, invalido: false }
  }

  return { normalizado: null, invalido: true }
}

/**
 * Valida columnas requeridas en el Excel
 * Según PRD: nro_cliente (0), nro_wo (1), telefono, nombre (28), lat (33), lon (32)
 */
function validarColumnasRequeridas(data: any[], rowIndex: number): { valido: boolean; faltantes: string[] } {
  const faltantes: string[] = []
  
  // Verificar que hay suficientes columnas
  if (!data || data.length === 0) {
    return { valido: false, faltantes: ['Archivo vacío o sin datos'] }
  }

  // Verificar primera fila de datos (índice 1, después del header)
  const primeraFila = data[1] || []
  
  // Validar col 0: NroCliente
  if (!primeraFila[0] || String(primeraFila[0]).trim() === '') {
    faltantes.push('NroCliente (columna 0)')
  }

  // Validar col 1: NroWO
  if (!primeraFila[1] || String(primeraFila[1]).trim() === '') {
    faltantes.push('NroWO (columna 1)')
  }

  // Validar col 28: ApellidoNombre
  if (!primeraFila[28] || String(primeraFila[28]).trim() === '') {
    faltantes.push('ApellidoNombre (columna 28)')
  }

  // Validar col 32: X (longitud)
  if (primeraFila[32] == null) {
    faltantes.push('X - Longitud (columna 32)')
  }

  // Validar col 33: Y (latitud)
  if (primeraFila[33] == null) {
    faltantes.push('Y - Latitud (columna 33)')
  }

  // Validar que haya al menos un teléfono en cols 38-41
  const telefonos = [primeraFila[40], primeraFila[41], primeraFila[38], primeraFila[39]]
    .filter(t => t && String(t).trim())
  
  if (telefonos.length === 0) {
    faltantes.push('Teléfono (columna 38, 39, 40 o 41)')
  }

  return { valido: faltantes.length === 0, faltantes }
}

/**
 * Obtiene teléfono principal según prioridad PRD: 40 > 41 > 38 > 39
 */
function obtenerTelefonoPrincipal(row: any): string | null {
  // Prioridad: 40 > 41 > 38 > 39
  const telefonos = [
    row[40], // FaxInstalacion (prioridad 1)
    row[41], // Fax2Instalacion (prioridad 2)
    row[38], // TelefonoParticularIns (prioridad 3)
    row[39]  // TelefonoLaboralIns (prioridad 4)
  ]
  
  for (const tel of telefonos) {
    if (tel && String(tel).trim()) {
      return String(tel).trim()
    }
  }
  
  return null
}

function calcularDistanciaHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Radio de la Tierra en metros
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180
  
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
  return R * c
}

/**
 * Lee personas del Excel según formato PRD
 * Columnas según archivo default: 2025.10.27.Piloto Autobank - DTV - Estatus - Archivo de datos.xlsx
 */
function leerPersonasDtv(workbook: any): PersonaExcel[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const personas: PersonaExcel[] = []
  
  // Validar columnas requeridas antes de procesar
  const validacion = validarColumnasRequeridas(data, 1)
  if (!validacion.valido) {
    throw new Error(`Columnas requeridas faltantes: ${validacion.faltantes.join(', ')}`)
  }
  
  for (let i = 1; i < data.length; i++) {
    const row: any = data[i]
    
    // Validar coordenadas (col 32 = X/lon, col 33 = Y/lat)
    const lonRaw = row[32]
    const latRaw = row[33]
    
    if (latRaw == null || lonRaw == null) {
      continue // Saltar filas sin coordenadas
    }
    
    let latNum = parseFloat(latRaw)
    let lonNum = parseFloat(lonRaw)
    
    if (isNaN(latNum) || isNaN(lonNum)) {
      continue // Saltar coordenadas inválidas
    }
    
    // Normalizar microgrados (si > 180, dividir por 1,000,000)
    if (Math.abs(latNum) > 180) latNum = latNum / 1000000
    if (Math.abs(lonNum) > 180) lonNum = lonNum / 1000000
    
    // Obtener teléfono principal según prioridad
    const telefonoRaw = obtenerTelefonoPrincipal(row)
    if (!telefonoRaw) {
      continue // Saltar filas sin teléfono
    }
    
    // Normalizar teléfono a E.164
    const { normalizado, invalido } = normalizarTelefonoE164(telefonoRaw)
    
    personas.push({
      fila: i + 1,
      nroCliente: String(row[0] || '').trim(),
      nroWO: String(row[1] || '').trim(),
      apellidoNombre: String(row[28] || '').trim(),
      dni: String(row[29] || '').trim(),
      telefonoPrincipal: telefonoRaw,
      telefonoPrincipalNormalizado: normalizado || telefonoRaw, // Usar original si no se pudo normalizar
      direccionCompleta: `${String(row[30] || '').trim()} ${String(row[31] || '').trim()}`.trim(),
      cp: String(row[35] || '').trim(),
      localidad: String(row[36] || '').trim(),
      provincia: String(row[37] || '').trim(), // PRD dice col 34 pero el archivo tiene 37
      lat: latNum,
      lon: lonNum,
      razonCreacion: String(row[3] || '').trim(),
      estadoCliente: String(row[26] || '').trim()
    })
  }
  
  return personas
}

/**
 * Deduplica por nro_cliente (primary), fallback a telefono_principal normalizado
 * Según PRD: agrupar por nro_cliente como llave principal, fallback a telefono si nro_cliente no está disponible
 */
function deduplicarPersonas(personas: PersonaExcel[]): PersonaDeduplicated[] {
  // Primero agrupar por nro_cliente (primary key)
  const agrupadasPorCliente = new Map<string, PersonaDeduplicated>()
  
  // Segundo mapa para fallback por teléfono (si nro_cliente no está disponible)
  const agrupadasPorTelefono = new Map<string, PersonaDeduplicated>()
  
  for (const persona of personas) {
    const nroCliente = persona.nroCliente
    const telefonoNormalizado = persona.telefonoPrincipalNormalizado || persona.telefonoPrincipal
    
    // Intentar agrupar por nro_cliente primero
    if (nroCliente && nroCliente.trim()) {
      if (!agrupadasPorCliente.has(nroCliente)) {
        agrupadasPorCliente.set(nroCliente, {
          ...persona,
          nrosCliente: [persona.nroCliente],
          nrosWO: [persona.nroWO],
          cantidadDecos: 1
        })
      } else {
        const existente = agrupadasPorCliente.get(nroCliente)!
        existente.nrosCliente.push(persona.nroCliente)
        existente.nrosWO.push(persona.nroWO)
        existente.cantidadDecos++
      }
    } else {
      // Fallback: agrupar por teléfono si nro_cliente no está disponible
      if (!agrupadasPorTelefono.has(telefonoNormalizado)) {
        agrupadasPorTelefono.set(telefonoNormalizado, {
          ...persona,
          nrosCliente: persona.nroCliente ? [persona.nroCliente] : [],
          nrosWO: [persona.nroWO],
          cantidadDecos: 1
        })
      } else {
        const existente = agrupadasPorTelefono.get(telefonoNormalizado)!
        if (persona.nroCliente) existente.nrosCliente.push(persona.nroCliente)
        existente.nrosWO.push(persona.nroWO)
        existente.cantidadDecos++
      }
    }
  }
  
  // Combinar ambos mapas
  const resultado: PersonaDeduplicated[] = []
  
  for (const persona of agrupadasPorCliente.values()) {
    resultado.push(persona)
  }
  
  for (const persona of agrupadasPorTelefono.values()) {
    // Solo agregar si no fue ya agregado por nro_cliente
    const yaExiste = resultado.some(p => 
      p.telefonoPrincipalNormalizado === persona.telefonoPrincipalNormalizado
    )
    if (!yaExiste) {
      resultado.push(persona)
    }
  }
  
  return resultado
}

function encontrarPuntoMasCercano(
  persona: PersonaExcel | PersonaDeduplicated,
  puntos: PuntoPickit[]
): { punto: PuntoPickit | null; distancia: number } {
  let distanciaMinima = Infinity
  let puntoMasCercano: PuntoPickit | null = null
  
  for (const punto of puntos) {
    const distancia = calcularDistanciaHaversine(
      persona.lat,
      persona.lon,
      punto.lat,
      punto.lon
    )
    
    if (distancia < distanciaMinima) {
      distanciaMinima = distancia
      puntoMasCercano = punto
    }
  }
  
  return { punto: puntoMasCercano, distancia: distanciaMinima }
}

/**
 * Intenta validar WhatsApp vía Kapso Meta API (pending validation)
 * Según PRD: endpoint GET .../contacts/{wa_id}
 * 200 → tiene_whatsapp = true
 * 404 o error → tiene_whatsapp = null (validación definitiva en primer envío)
 */
async function validarWhatsApp(
  telefonoNormalizado: string | null,
  phoneNumberId: string | null,
  kapsoApiKey: string | null
): Promise<boolean | null> {
  if (!telefonoNormalizado || !phoneNumberId || !kapsoApiKey) {
    return null
  }

  // Extraer wa_id del teléfono (sin el +)
  const waId = telefonoNormalizado.replace(/^\+/, '')
  
  try {
    const url = `https://api.kapso.ai/meta/whatsapp/v23.0/${phoneNumberId}/contacts/${waId}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': kapsoApiKey
      }
    })

    if (response.status === 200) {
      return true // Tiene WhatsApp
    } else if (response.status === 404) {
      return null // No encontrado en base de contactos (pero puede tener WhatsApp)
    } else {
      return null // Error, validación definitiva en primer envío
    }
  } catch (error) {
    console.error('Error validando WhatsApp:', error)
    return null // Error, validación definitiva en primer envío
  }
}

/**
 * Genera archivo Excel "Fuera de rango" y lo sube a Storage
 */
async function generarExportFueraRango(
  supabase: any,
  campanaId: string,
  personasFueraRango: any[]
): Promise<string | null> {
  if (personasFueraRango.length === 0) {
    return null
  }

  try {
    // Crear datos para Excel
    const datosExcel = personasFueraRango.map(persona => ({
      'Nro Cliente': persona.nro_cliente || '',
      'Nro WO': persona.nro_wo || '',
      'Nros Cliente': persona.nros_cliente?.join(', ') || '',
      'Nros WO': persona.nros_wo?.join(', ') || '',
      'Cantidad Decos': persona.cantidad_decos || 1,
      'Apellido y Nombre': persona.apellido_nombre || '',
      'DNI': persona.dni || '',
      'Teléfono Principal': persona.telefono_principal || '',
      'Dirección Completa': persona.direccion_completa || '',
      'CP': persona.cp || '',
      'Localidad': persona.localidad || '',
      'Provincia': persona.provincia || '',
      'Latitud': persona.lat || '',
      'Longitud': persona.lon || '',
      'Distancia (metros)': Math.round(persona.distancia_metros || 0),
      'Punto Pickit': persona.punto_pickit?.nombre || '',
      'Dirección Punto Pickit': persona.punto_pickit?.direccion || ''
    }))

    // Crear workbook
    const ws = XLSX.utils.json_to_sheet(datosExcel)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fuera de Rango')

    // Convertir a buffer
    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    // Subir a Storage
    const fileName = `export-fuera-rango-${campanaId}-${Date.now()}.xlsx`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('archivos-dtv')
      .upload(`${campanaId}/${fileName}`, excelBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })

    if (uploadError) {
      console.error('Error subiendo export fuera de rango:', uploadError)
      return null
    }

    return fileName
  } catch (error) {
    console.error('Error generando export fuera de rango:', error)
    return null
  }
}

serve(async (req) => {
  // Manejar preflight CORS PRIMERO antes del try/catch
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { campana_id, bucket, path } = await req.json()
    
    if (!campana_id || !bucket || !path) {
      return new Response(
        JSON.stringify({ error: 'faltan parámetros: campana_id, bucket, path' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Descargar archivo
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(path)
    
    if (downloadError) {
      throw new Error(`error descargando archivo: ${downloadError.message}`)
    }
    
    // Leer Excel
    const arrayBuffer = await fileData.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
    
    // Obtener puntos Pickit
    const { data: puntosPickit, error: puntosError } = await supabase
      .from('puntos_pickit')
      .select('id, nombre, direccion, lat, lon')
    
    if (puntosError) {
      throw new Error(`error consultando puntos pickit: ${puntosError.message}`)
    }
    
    // Obtener campaña con configuración completa
    const { data: campana, error: campanaError } = await supabase
      .from('campanas')
      .select('distancia_max, kapso_phone_number_id')
      .eq('id', campana_id)
      .single()
    
    if (campanaError) {
      throw new Error(`error consultando campaña: ${campanaError.message}`)
    }
    
    const distanciaMax = campana.distancia_max || 2000
    const kapsoPhoneNumberId = campana.kapso_phone_number_id
    const kapsoApiKey = Deno.env.get('KAPSO_API_KEY') || null
    
    // Leer personas del Excel
    const personasRaw = leerPersonasDtv(workbook)
    
    // Deduplicar (por nro_cliente primary, fallback telefono)
    const personasDeduplicated = deduplicarPersonas(personasRaw)
    
    const personasParaInsertar = []
    let personasDentroRango = 0
    let personasFueraRango = 0
    
    // Procesar cada persona deduplicada
    for (const persona of personasDeduplicated) {
      const { punto, distancia } = encontrarPuntoMasCercano(persona, puntosPickit)
      const dentroRango = distancia <= distanciaMax
      const fueraRango = distancia > distanciaMax
      
      if (dentroRango) personasDentroRango++
      if (fueraRango) personasFueraRango++
      
      // Validar WhatsApp (pending validation)
      let tieneWhatsapp: boolean | null = null
      if (persona.telefonoPrincipalNormalizado && persona.telefonoPrincipalNormalizado.startsWith('+54')) {
        tieneWhatsapp = await validarWhatsApp(
          persona.telefonoPrincipalNormalizado,
          kapsoPhoneNumberId,
          kapsoApiKey
        )
      } else if (persona.telefonoPrincipalNormalizado) {
        // Si no se pudo normalizar a E.164 AR, marcar como inválido
        tieneWhatsapp = false
      }
      
      personasParaInsertar.push({
        campana_id,
        fila_archivo: persona.fila,
        nro_cliente: persona.nroCliente || null,
        nro_wo: persona.nroWO || null,
        nros_cliente: persona.nrosCliente,
        nros_wo: persona.nrosWO,
        cantidad_decos: persona.cantidadDecos,
        apellido_nombre: persona.apellidoNombre,
        dni: persona.dni || null,
        telefono_principal: persona.telefonoPrincipalNormalizado || persona.telefonoPrincipal,
        direccion_completa: persona.direccionCompleta || null,
        cp: persona.cp || null,
        localidad: persona.localidad || null,
        provincia: persona.provincia || null,
        lat: persona.lat,
        lon: persona.lon,
        punto_pickit_id: punto?.id || null,
        distancia_metros: distancia,
        dentro_rango: dentroRango,
        fuera_de_rango: fueraRango,
        tiene_whatsapp: tieneWhatsapp,
        estado_contacto: 'pendiente',
        razon_creacion: persona.razonCreacion || null,
        estado_cliente_original: persona.estadoCliente || null
      })
    }
    
    // Insertar personas
    const { error: insertError } = await supabase
      .from('personas_contactar')
      .insert(personasParaInsertar)
    
    if (insertError) {
      throw new Error(`error insertando personas: ${insertError.message}`)
    }
    
    // Actualizar contadores de campaña
    const { error: updateError } = await supabase
      .from('campanas')
      .update({
        total_personas: personasDeduplicated.length,
        personas_dentro_rango: personasDentroRango
      })
      .eq('id', campana_id)
    
    if (updateError) {
      throw new Error(`error actualizando campaña: ${updateError.message}`)
    }
    
    // Generar export "Fuera de rango" inmediatamente
    const personasFueraRango = personasParaInsertar
      .filter(p => p.fuera_de_rango)
      .map(p => ({
        ...p,
        punto_pickit: puntosPickit.find(pp => pp.id === p.punto_pickit_id)
      }))
    
    let exportFileName: string | null = null
    if (personasFueraRango.length > 0) {
      exportFileName = await generarExportFueraRango(supabase, campana_id, personasFueraRango)
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        campana_id,
        total_personas: personasDeduplicated.length,
        total_filas_excel: personasRaw.length,
        personas_dentro_rango: personasDentroRango,
        personas_fuera_rango: personasFueraRango,
        export_fuera_rango: exportFileName,
        porcentaje: personasDeduplicated.length > 0 
          ? Math.round(personasDentroRango / personasDeduplicated.length * 1000) / 10 
          : 0
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('error procesando archivo:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'error desconocido'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
