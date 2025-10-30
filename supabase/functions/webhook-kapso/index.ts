// Supabase Edge Function: webhook-kapso
// Receives webhook responses from Kapso API when users respond to WhatsApp messages

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface KapsoWebhookPayload {
  execution_id: string
  phone_number: string
  status: 'completed' | 'failed' | 'in_progress'
  variables?: Record<string, any>
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
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

    // Parse request body
    const payload: KapsoWebhookPayload = await req.json()
    console.log('Received Kapso webhook:', JSON.stringify(payload, null, 2))

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

    // Extract last user message
    const lastUserMessage = payload.last_user_message || 
      payload.messages?.filter(m => m.role === 'user').pop()?.content ||
      null

    // Determine new status based on response
    let nuevoEstado = 'respondio'
    
    if (lastUserMessage) {
      const mensajeLower = lastUserMessage.toLowerCase()
      
      // Keywords for confirmation
      const confirmacionKeywords = ['si', 'sí', 'confirmo', 'acepto', 'ok', 'dale', 'genial', 'perfecto', 'voy']
      // Keywords for rejection
      const rechazoKeywords = ['no', 'rechaz', 'cancel', 'imposible', 'no puedo', 'no voy']
      
      if (confirmacionKeywords.some(keyword => mensajeLower.includes(keyword))) {
        nuevoEstado = 'confirmado'
      } else if (rechazoKeywords.some(keyword => mensajeLower.includes(keyword))) {
        nuevoEstado = 'rechazado'
      }
    }

    // Update persona record
    const { error: updateError } = await supabaseClient
      .from('personas_contactar')
      .update({
        estado_contacto: nuevoEstado,
        respuesta_texto: lastUserMessage,
        fecha_respuesta: new Date().toISOString(),
      })
      .eq('id', personaId)

    if (updateError) {
      console.error('Error updating persona:', updateError)
      throw updateError
    }

    console.log(`Updated persona ${personaId} to status: ${nuevoEstado}`)

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
        nuevo_estado: nuevoEstado,
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
  3. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/webhook-kapso' \
    --header 'Authorization: Bearer YOUR_ANON_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
      "execution_id": "exec-123",
      "phone_number": "+5491156571617",
      "status": "completed",
      "context": {
        "source": "sistema_pickit",
        "campana_id": "uuid-campana",
        "persona_id": "uuid-persona"
      },
      "last_user_message": "Si, confirmo que voy"
    }'

  For production, configure Kapso webhook URL to:
  https://YOUR_PROJECT.supabase.co/functions/v1/webhook-kapso
*/
