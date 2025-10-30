import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

function calcularDistanciaHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
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

function leerPersonasDtv(workbook: any): PersonaExcel[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const personas: PersonaExcel[] = []
  
  for (let i = 1; i < data.length; i++) {
    const row: any = data[i]
    const lon = row[32]
    const lat = row[33]
    
    if (lat != null && lon != null) {
      let latNum = parseFloat(lat)
      let lonNum = parseFloat(lon)
      
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        if (Math.abs(latNum) > 180) latNum = latNum / 1000000
        if (Math.abs(lonNum) > 180) lonNum = lonNum / 1000000
        
        const telefonos = [row[37], row[38], row[39], row[40]]
          .filter(t => t && String(t).trim())
          .map(t => String(t).trim())
        
        const telefonoPrincipal = telefonos[0] || ''
        
        if (!telefonoPrincipal) continue
        
        personas.push({
          fila: i + 1,
          nroCliente: row[0] || '',
          nroWO: row[1] || '',
          apellidoNombre: row[28] || '',
          dni: row[29] || '',
          telefonoPrincipal,
          direccionCompleta: `${row[30] || ''} ${row[31] || ''}`.trim(),
          cp: row[35] || '',
          localidad: row[36] || '',
          provincia: row[34] || '',
          lat: latNum,
          lon: lonNum,
          razonCreacion: row[3] || '',
          estadoCliente: row[26] || ''
        })
      }
    }
  }
  
  return personas
}

function deduplicarPersonas(personas: PersonaExcel[]): PersonaDeduplicated[] {
  const agrupadas = new Map<string, PersonaDeduplicated>()
  
  for (const persona of personas) {
    const telefono = persona.telefonoPrincipal
    
    if (!agrupadas.has(telefono)) {
      // primera vez que vemos este telefono
      agrupadas.set(telefono, {
        ...persona,
        nrosCliente: [persona.nroCliente],
        nrosWO: [persona.nroWO],
        cantidadDecos: 1
      })
    } else {
      // ya existe este telefono, agregamos los datos
      const existente = agrupadas.get(telefono)!
      existente.nrosCliente.push(persona.nroCliente)
      existente.nrosWO.push(persona.nroWO)
      existente.cantidadDecos++
    }
  }
  
  return Array.from(agrupadas.values())
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

serve(async (req) => {
  try {
    // manejar preflight cors
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

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
    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucket)
      .download(path)
    
    if (downloadError) {
      throw new Error(`error descargando archivo: ${downloadError.message}`)
    }
    
    const arrayBuffer = await fileData.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
    
    const { data: puntosPickit, error: puntosError } = await supabase
      .from('puntos_pickit')
      .select('id, nombre, direccion, lat, lon')
    
    if (puntosError) {
      throw new Error(`error consultando puntos pickit: ${puntosError.message}`)
    }
    
    const { data: campana, error: campanaError } = await supabase
      .from('campanas')
      .select('distancia_max')
      .eq('id', campana_id)
      .single()
    
    if (campanaError) {
      throw new Error(`error consultando campaña: ${campanaError.message}`)
    }
    
    const distanciaMax = campana.distancia_max
    
    // leer todas las personas del excel
    const personasRaw = leerPersonasDtv(workbook)
    
    // deduplicar por telefono_principal
    const personasDeduplicated = deduplicarPersonas(personasRaw)
    
    const personasParaInsertar = []
    let personasDentroRango = 0
    
    for (const persona of personasDeduplicated) {
      const { punto, distancia } = encontrarPuntoMasCercano(persona, puntosPickit)
      const dentroRango = distancia <= distanciaMax
      
      if (dentroRango) personasDentroRango++
      
      personasParaInsertar.push({
        campana_id,
        fila_archivo: persona.fila,
        nro_cliente: persona.nroCliente,
        nro_wo: persona.nroWO,
        nros_cliente: persona.nrosCliente,
        nros_wo: persona.nrosWO,
        cantidad_decos: persona.cantidadDecos,
        apellido_nombre: persona.apellidoNombre,
        dni: persona.dni,
        telefono_principal: persona.telefonoPrincipal,
        direccion_completa: persona.direccionCompleta,
        cp: persona.cp,
        localidad: persona.localidad,
        provincia: persona.provincia,
        lat: persona.lat,
        lon: persona.lon,
        punto_pickit_id: punto?.id,
        distancia_metros: distancia,
        dentro_rango: dentroRango,
        razon_creacion: persona.razonCreacion,
        estado_cliente_original: persona.estadoCliente
      })
    }
    
    const { error: insertError } = await supabase
      .from('personas_contactar')
      .insert(personasParaInsertar)
    
    if (insertError) {
      throw new Error(`error insertando personas: ${insertError.message}`)
    }
    
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
    
    return new Response(
      JSON.stringify({
        success: true,
        campana_id,
        total_personas: personasDeduplicated.length,
        total_filas_excel: personasRaw.length,
        personas_dentro_rango: personasDentroRango,
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
