// configuración
const DRY_RUN = true // cambiar a false para envíos reales
const HORARIO_INICIO = 12 // 12:00
const HORARIO_FIN = 15 // 15:00
const TIMEZONE = 'America/Argentina/Buenos_Aires'
const BATCH_SIZE = 10 // mensajes por batch
const DELAY_BETWEEN_BATCHES = 1000 // ms entre batches

function getHoraArgentina() {
  const now = new Date()
  const argTime = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
  return {
    hora: argTime.getHours(),
    minuto: argTime.getMinutes(),
    fecha: argTime.toISOString(),
    fechaLegible: argTime.toLocaleString('es-AR', { timeZone: TIMEZONE })
  }
}

function estaDentroDeHorario() {
  const { hora } = getHoraArgentina()
  return hora >= HORARIO_INICIO && hora < HORARIO_FIN
}

async function consultarSupabase(env, campaID) {
  const url = `${env.SUPABASE_URL}/rest/v1/personas_contactar`
  const params = new URLSearchParams({
    select: '*,campanas(*),puntos_pickit(*)',
    campana_id: `eq.${campaID}`,
    dentro_rango: 'eq.true',
    estado_contacto: 'in.(pendiente,encolado)'
  })
  
  const response = await fetch(`${url}?${params}`, {
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`
    }
  })
  
  if (!response.ok) {
    throw new Error(`error consultando supabase: ${response.status}`)
  }
  
  return await response.json()
}

async function simularEnvioKapso(persona, campana, env) {
  // construir variables con soporte para deduplicación
  const cantidadDecos = persona.cantidad_decos || 1
  const nrosCliente = persona.nros_cliente || [persona.nro_cliente]
  const textoDeco = cantidadDecos === 1 ? 'el decodificador' : 'los decodificadores'
  const nrosClienteStr = nrosCliente.join(', ')
  
  const mensaje = {
    phone_number: persona.telefono_principal,
    whatsapp_config_id: campana.kapso_whatsapp_config_id || env.KAPSO_WHATSAPP_CONFIG_ID,
    variables: {
      nombre_cliente: persona.apellido_nombre,
      nro_cliente: persona.nro_cliente, // compatibilidad
      nros_cliente: nrosClienteStr, // nuevo: lista completa
      cantidad_decos: cantidadDecos, // nuevo: contador
      texto_deco: textoDeco, // nuevo: singular/plural
      punto_pickit: persona.puntos_pickit?.nombre || 'N/A',
      direccion_punto: persona.puntos_pickit?.direccion || 'N/A',
      distancia: `${Math.round(persona.distancia_metros)} metros`
    },
    context: {
      source: 'sistema_pickit',
      campana_id: persona.campana_id,
      persona_id: persona.id
    },
    initial_data: {}
  }
  
  return {
    persona_id: persona.id,
    telefono: persona.telefono_principal,
    nombre: persona.apellido_nombre,
    cantidad_decos: cantidadDecos,
    mensaje,
    timestamp: new Date().toISOString(),
    simulated: true
  }
}

async function enviarKapso(persona, campana, env) {
  if (DRY_RUN) {
    return await simularEnvioKapso(persona, campana, env)
  }
  
  const url = `https://app.kapso.ai/api/v1/flows/${campana.kapso_flow_id || env.KAPSO_FLOW_ID}/executions`
  
  // construir variables con soporte para deduplicación
  const cantidadDecos = persona.cantidad_decos || 1
  const nrosCliente = persona.nros_cliente || [persona.nro_cliente]
  const textoDeco = cantidadDecos === 1 ? 'el decodificador' : 'los decodificadores'
  const nrosClienteStr = nrosCliente.join(', ')
  
  const body = {
    phone_number: persona.telefono_principal,
    whatsapp_config_id: campana.kapso_whatsapp_config_id || env.KAPSO_WHATSAPP_CONFIG_ID,
    variables: {
      nombre_cliente: persona.apellido_nombre,
      nro_cliente: persona.nro_cliente, // compatibilidad
      nros_cliente: nrosClienteStr, // nuevo: lista completa
      cantidad_decos: cantidadDecos, // nuevo: contador
      texto_deco: textoDeco, // nuevo: singular/plural
      punto_pickit: persona.puntos_pickit?.nombre || 'N/A',
      direccion_punto: persona.puntos_pickit?.direccion || 'N/A',
      distancia: `${Math.round(persona.distancia_metros)} metros`
    },
    context: {
      source: 'sistema_pickit',
      campana_id: persona.campana_id,
      persona_id: persona.id
    },
    initial_data: {}
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': env.KAPSO_API_KEY
    },
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    throw new Error(`error kapso: ${response.status}`)
  }
  
  return {
    persona_id: persona.id,
    response: await response.json(),
    timestamp: new Date().toISOString()
  }
}

async function actualizarEstado(env, personaID, estado, fechaEnvio = null) {
  if (DRY_RUN) {
    return { simulated: true, persona_id: personaID, nuevo_estado: estado }
  }
  
  const url = `${env.SUPABASE_URL}/rest/v1/personas_contactar`
  const params = new URLSearchParams({ id: `eq.${personaID}` })
  
  const body = {
    estado_contacto: estado,
    intentos_envio: 'intentos_envio + 1'
  }
  
  if (fechaEnvio) {
    body.fecha_envio_whatsapp = fechaEnvio
  }
  
  const response = await fetch(`${url}?${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  })
  
  return { success: response.ok, status: response.status }
}

async function procesarCampana(env, campaID, esManual = true) {
  const timeInfo = getHoraArgentina()
  const dentroHorario = estaDentroDeHorario()
  
  const log = {
    timestamp: timeInfo.fecha,
    timestamp_legible: timeInfo.fechaLegible,
    campana_id: campaID,
    modo: DRY_RUN ? 'DRY_RUN' : 'PRODUCCION',
    tipo_ejecucion: esManual ? 'manual' : 'cron',
    horario: {
      actual: `${timeInfo.hora}:${String(timeInfo.minuto).padStart(2, '0')}`,
      permitido: `${HORARIO_INICIO}:00 - ${HORARIO_FIN}:00`,
      dentro_horario: dentroHorario
    },
    pasos: []
  }
  
  try {
    // paso 1: consultar personas
    log.pasos.push({ paso: 1, accion: 'consultando personas pendientes/encoladas' })
    const personas = await consultarSupabase(env, campaID)
    log.pasos.push({ 
      paso: 1, 
      resultado: 'ok', 
      personas_encontradas: personas.length 
    })
    
    if (personas.length === 0) {
      log.pasos.push({ paso: 2, resultado: 'no hay personas para procesar' })
      return log
    }
    
    const campana = personas[0].campanas
    
    // paso 2: validar horario
    if (!dentroHorario && esManual) {
      log.pasos.push({
        paso: 2,
        accion: 'fuera de horario - encolando mensajes',
        personas_encoladas: personas.length
      })
      
      // encolar todas
      for (const persona of personas) {
        await actualizarEstado(env, persona.id, 'encolado')
      }
      
      log.resultado = 'encolado'
      log.mensaje = `${personas.length} personas encoladas para envío mañana a las 12:00`
      return log
    }
    
    // paso 3: procesar en batches
    log.pasos.push({ paso: 3, accion: 'iniciando envío de mensajes' })
    const resultados = []
    const errores = []
    
    for (let i = 0; i < personas.length; i += BATCH_SIZE) {
      const batch = personas.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(personas.length / BATCH_SIZE)
      
      log.pasos.push({
        paso: `3.${batchNum}`,
        accion: `procesando batch ${batchNum}/${totalBatches}`,
        personas_en_batch: batch.length
      })
      
      // procesar batch en paralelo
      const promesas = batch.map(async (persona) => {
        try {
          const resultado = await enviarKapso(persona, campana, env)
          await actualizarEstado(env, persona.id, 'enviado_whatsapp', new Date().toISOString())
          return { success: true, ...resultado }
        } catch (error) {
          await actualizarEstado(env, persona.id, 'error_envio')
          return { 
            success: false, 
            persona_id: persona.id, 
            error: error.message 
          }
        }
      })
      
      const resultadosBatch = await Promise.all(promesas)
      
      resultadosBatch.forEach(r => {
        if (r.success) {
          resultados.push(r)
        } else {
          errores.push(r)
        }
      })
      
      // delay entre batches
      if (i + BATCH_SIZE < personas.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
      }
    }
    
    // resumen final
    log.resultado = 'completado'
    log.resumen = {
      total_procesadas: personas.length,
      exitosas: resultados.length,
      con_error: errores.length,
      tasa_exito: personas.length > 0 
        ? `${Math.round(resultados.length / personas.length * 100)}%` 
        : '0%'
    }
    
    if (DRY_RUN) {
      log.dry_run_info = {
        mensaje: 'MODO DRY_RUN: no se enviaron mensajes reales a kapso',
        mensajes_simulados: resultados.slice(0, 3) // primeros 3 como ejemplo
      }
    }
    
    if (errores.length > 0) {
      log.errores = errores
    }
    
    return log
    
  } catch (error) {
    log.resultado = 'error'
    log.error = error.message
    log.stack = error.stack
    return log
  }
}

export default {
  // handler para requests http (manual)
  async fetch(request, env, ctx) {
    // cors
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'método no permitido' }),
        { 
          status: 405,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
    
    try {
      const { campana_id } = await request.json()
      
      if (!campana_id) {
        return new Response(
          JSON.stringify({ error: 'falta campana_id' }),
          { 
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        )
      }
      
      const resultado = await procesarCampana(env, campana_id, true)
      
      return new Response(
        JSON.stringify(resultado, null, 2),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
      
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: error.message,
          stack: error.stack
        }),
        {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }
  },
  
  // handler para cron trigger
  async scheduled(event, env, ctx) {
    console.log('cron trigger ejecutado:', new Date().toISOString())
    
    try {
      // consultar todas las campañas activas con personas encoladas
      const url = `${env.SUPABASE_URL}/rest/v1/campanas`
      const params = new URLSearchParams({
        select: 'id',
        estado: 'eq.activa'
      })
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'apikey': env.SUPABASE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_KEY}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`error consultando campañas: ${response.status}`)
      }
      
      const campanas = await response.json()
      
      console.log(`encontradas ${campanas.length} campañas activas`)
      
      // procesar cada campaña
      const resultados = []
      for (const campana of campanas) {
        const resultado = await procesarCampana(env, campana.id, false)
        resultados.push(resultado)
        console.log(`campaña ${campana.id} procesada:`, resultado.resultado)
      }
      
      console.log('cron completado:', {
        total_campanas: campanas.length,
        resultados
      })
      
    } catch (error) {
      console.error('error en cron:', error)
    }
  }
}
