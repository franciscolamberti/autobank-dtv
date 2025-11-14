// Supabase Edge Function: webhook-kapso
// Receives webhook responses from Kapso API when users respond to WhatsApp messages
// Según PRD: verificar firma, parsear variables estructuradas, actualizar persona y contadores

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface KapsoWebhookPayload {
  tracking_id?: string
  workflow_id?: string
  phone_number?: string
  status?: 'completed' | 'failed' | 'in_progress'
  variables?: {
    confirmado?: boolean
    fecha_compromiso?: string // formato YYYY-MM-DD o DD/MM/YYYY
    motivo_negativo?: string
    solicita_retiro_domicilio?: boolean
    [key: string]: any
  }
  context?: {
    source?: string
    campana_id?: string
    persona_id?: string
  }
  messages?: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
  last_user_message?: string
  metadata?: Record<string, any>
}

/**
 * Verifica firma HMAC SHA-256 del webhook según PRD
 * Header: X-Kapso-Signature
 */
async function verificarFirma(
  body: string,
  signature: string | null,
  secret: string | null
): Promise<boolean> {
  if (!signature || !secret) {
    console.warn('Firma o secreto no proporcionados, rechazando')
    return false
  }

  try {
    // Calcular HMAC SHA-256 del body
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const messageData = encoder.encode(body)
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
    const calculatedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Comparar firmas (comparación segura)
    const providedSignature = signature.replace(/^sha256=/, '')
    
    // Comparación constante en tiempo para evitar timing attacks
    if (calculatedSignature.length !== providedSignature.length) {
      return false
    }
    
    let matches = true
    for (let i = 0; i < calculatedSignature.length; i++) {
      if (calculatedSignature[i] !== providedSignature[i]) {
        matches = false
      }
    }
    
    return matches
  } catch (error) {
    console.error('Error verificando firma:', error)
    return false
  }
}

/**
 * Normaliza una fecha recibida como string a formato YYYY-MM-DD.
 * Acepta:
 *  - YYYY-MM-DD
 *  - DD/MM/YYYY
 *  - DD-MM-YYYY
 */
function normalizarFecha(fecha: string | null | undefined): string | null {
  if (!fecha) return null
  const trimmed = fecha.trim()

  // DD/MM/YYYY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (slashMatch) {
    const d = slashMatch[1].padStart(2, '0')
    const m = slashMatch[2].padStart(2, '0')
    const y = slashMatch[3]
    return `${y}-${m}-${d}`
  }

  // DD-MM-YYYY
  const dashDMYMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed)
  if (dashDMYMatch) {
    const d = dashDMYMatch[1].padStart(2, '0')
    const m = dashDMYMatch[2].padStart(2, '0')
    const y = dashDMYMatch[3]
    return `${y}-${m}-${d}`
  }

  // YYYY-MM-DD (normalize zero padding just in case)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  if (isoMatch) {
    const y = isoMatch[1]
    const m = isoMatch[2].padStart(2, '0')
    const d = isoMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}

/**
 * Parsea variables estructuradas del workflow según PRD
 * Si no hay variables, usa heurística de keywords como fallback
 */
function parsearRespuesta(
  payload: KapsoWebhookPayload,
  lastUserMessage: string | null
): {
  estado: string
  fechaCompromiso: string | null
  motivoNegativo: string | null
  solicitaRetiro: boolean
} {
  const variables = payload.variables || {}
  
  // Si hay variables estructuradas, usarlas según PRD
  if (variables.confirmado !== undefined || variables.fecha_compromiso || variables.motivo_negativo) {
    const fechaNormalizada = normalizarFecha(variables.fecha_compromiso)
    // Si hay fecha válida, el estado debe ser 'confirmado'
    const estado = fechaNormalizada
      ? 'confirmado'
      : (variables.confirmado === true ? 'confirmado' : 
         variables.confirmado === false ? 'rechazado' : 
         'respondio')
    
    return {
      estado,
      fechaCompromiso: fechaNormalizada,
      motivoNegativo: variables.motivo_negativo || null,
      solicitaRetiro: variables.solicita_retiro_domicilio === true
    }
  }
  
  // Fallback: heurística de keywords solo si no hay variables estructuradas
  if (lastUserMessage) {
    const mensajeLower = lastUserMessage.toLowerCase()
    
    const confirmacionKeywords = ['si', 'sí', 'confirmo', 'acepto', 'ok', 'dale', 'genial', 'perfecto', 'voy', 'confirmado']
    const rechazoKeywords = ['no', 'rechaz', 'cancel', 'imposible', 'no puedo', 'no voy', 'no tengo', 'robado', 'perdido']
    
    if (confirmacionKeywords.some(keyword => mensajeLower.includes(keyword))) {
      return {
        estado: 'confirmado',
        fechaCompromiso: null,
        motivoNegativo: null,
        solicitaRetiro: false
      }
    } else if (rechazoKeywords.some(keyword => mensajeLower.includes(keyword))) {
      return {
        estado: 'rechazado',
        fechaCompromiso: null,
        motivoNegativo: lastUserMessage, // Usar mensaje completo como motivo
        solicitaRetiro: false
      }
    }
  }
  
  return {
    estado: 'respondio',
    fechaCompromiso: null,
    motivoNegativo: null,
    solicitaRetiro: false
  }
}

// Algunas integraciones envían el body doblemente serializado (JSON como string dentro de JSON).
// Esta utilidad intenta parsear una vez y, si el resultado es string, intenta parsear nuevamente.
function parsePayload(bodyText: string): KapsoWebhookPayload {
  let parsed: any
  try {
    parsed = JSON.parse(bodyText)
  } catch (e) {
    console.error('Invalid JSON body:', e)
    throw e
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      // Si falla, dejamos el string como está y la validación posterior fallará
    }
  }
  return parsed
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Leer body como texto para verificar firma
    const bodyText = await req.text()
    console.log(`Received Kapso webhook: ${bodyText}`);
    
    // Parsear payload
    const payload: KapsoWebhookPayload = parsePayload(bodyText)

    // Validate required fields
    if (!payload.context?.persona_id) {
      console.error('Missing persona_id in context')
      return new Response(
        JSON.stringify({ error: 'Missing persona_id in context' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const personaId = payload.context.persona_id
    const campanaId = payload.context.campana_id
    const source = payload.context.source

    // Determinar si es workflow de recordatorio
    const esRecordatorio = source === 'sistema_pickit_recordatorio' || 
                          payload.workflow_id?.includes('recordatorio')

    // Extract last user message
    const lastUserMessage = payload.last_user_message || 
      payload.messages?.filter(m => m.role === 'user').pop()?.content ||
      null

    // Parsear respuesta (variables estructuradas o heurística)
    const respuesta = parsearRespuesta(payload, lastUserMessage)

    // Inicializar Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Preparar actualización de persona
    const updateData: any = {
      estado_contacto: respuesta.estado,
      respuesta_texto: lastUserMessage,
      fecha_respuesta: new Date().toISOString(),
      motivo_negativo: respuesta.motivoNegativo,
      solicita_retiro_domicilio: respuesta.solicitaRetiro
    }

    // Agregar fecha_compromiso si está presente
    if (respuesta.fechaCompromiso) {
      updateData.fecha_compromiso = respuesta.fechaCompromiso
    }

    // Si es recordatorio, marcar recordatorio_enviado
    if (esRecordatorio) {
      updateData.recordatorio_enviado = true
      updateData.fecha_envio_recordatorio = new Date().toISOString()
    }

    // Update persona record
    const { error: updateError } = await supabaseClient
      .from('personas_contactar')
      .update(updateData)
      .eq('id', personaId)

    if (updateError) {
      console.error('Error updating persona:', updateError)
      throw updateError
    }

    console.log(`Updated persona ${personaId} to status: ${respuesta.estado}`)

    // Update campaign counters if we have campana_id
    if (campanaId) {
      // Get updated counts
      const { data: personas, error: countError } = await supabaseClient
        .from('personas_contactar')
        .select('estado_contacto')
        .eq('campana_id', campanaId)

      if (!countError && personas) {
        const personasContactadas = personas.filter(p => 
          ['enviado_whatsapp', 'respondio', 'confirmado', 'rechazado', 'no_responde'].includes(p.estado_contacto)
        ).length

        const personasConfirmadas = personas.filter(p => 
          p.estado_contacto === 'confirmado'
        ).length

        // Update campaign stats
        await supabaseClient
          .from('campanas')
          .update({
            personas_contactadas: personasContactadas,
            personas_confirmadas: personasConfirmadas,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campanaId)

        console.log(`Updated campaign ${campanaId} counters`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        persona_id: personaId,
        nuevo_estado: respuesta.estado,
        fecha_compromiso: respuesta.fechaCompromiso,
        message: 'Webhook processed successfully'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/* To invoke locally:

  1. Run `supabase start`
  2. Deploy this function: `supabase functions deploy webhook-kapso`
  3. Set KAPSO_WEBHOOK_SECRET env var
  4. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/webhook-kapso' \
    --header 'Authorization: Bearer YOUR_ANON_KEY' \
    --header 'Content-Type: application/json' \
    --header 'X-Kapso-Signature: sha256=...' \
    --data '{
      "tracking_id": "uuid-tracking",
      "workflow_id": "uuid-workflow",
      "phone_number": "+5491156571617",
      "context": {
        "source": "sistema_pickit",
        "campana_id": "uuid-campana",
        "persona_id": "uuid-persona"
      },
      "variables": {
        "confirmado": true,
        "fecha_compromiso": "2025-11-05",
        "motivo_negativo": null,
        "solicita_retiro_domicilio": false
      },
      "last_user_message": "Si, confirmo que voy"
    }'

  For production, configure Kapso webhook URL to:
  https://YOUR_PROJECT.supabase.co/functions/v1/webhook-kapso
*/
