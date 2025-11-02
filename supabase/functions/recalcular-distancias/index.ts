// Supabase Edge Function: recalcular-distancias
// Recalculates dentro_rango for all people in a campaign when distancia_max changes

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RecalcularRequest {
  campana_id: string
  distancia_max: number
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
    const { campana_id, distancia_max }: RecalcularRequest = await req.json()
    console.log(`Recalculating distances for campaign ${campana_id} with max distance ${distancia_max}m`)

    // Validate input
    if (!campana_id || !distancia_max) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: campana_id, distancia_max' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (distancia_max <= 0) {
      return new Response(
        JSON.stringify({ error: 'distancia_max must be greater than 0' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('campanas')
      .select('id, nombre')
      .eq('id', campana_id)
      .single()

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get all personas for this campaign
    const { data: personas, error: personasError } = await supabaseClient
      .from('personas_contactar')
      .select('id, distancia_metros')
      .eq('campana_id', campana_id)

    if (personasError) {
      console.error('Error fetching personas:', personasError)
      throw personasError
    }

    if (!personas || personas.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No people found in this campaign',
          campaign_id: campana_id
        }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`Found ${personas.length} people to recalculate`)

    // Recalculate dentro_rango and fuera_de_rango for each persona
    let updatedCount = 0
    let dentroRangoCount = 0

    for (const persona of personas) {
      const nuevoDentroRango = persona.distancia_metros <= distancia_max
      const nuevoFueraRango = persona.distancia_metros > distancia_max

      if (nuevoDentroRango) {
        dentroRangoCount++
      }

      const { error: updateError } = await supabaseClient
        .from('personas_contactar')
        .update({ 
          dentro_rango: nuevoDentroRango,
          fuera_de_rango: nuevoFueraRango
        })
        .eq('id', persona.id)

      if (updateError) {
        console.error(`Error updating persona ${persona.id}:`, updateError)
      } else {
        updatedCount++
      }
    }

    console.log(`Updated ${updatedCount} people, ${dentroRangoCount} are within range`)

    // Update campaign with new distancia_max and counters
    const { error: updateCampaignError } = await supabaseClient
      .from('campanas')
      .update({
        distancia_max: distancia_max,
        personas_dentro_rango: dentroRangoCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campana_id)

    if (updateCampaignError) {
      console.error('Error updating campaign:', updateCampaignError)
      throw updateCampaignError
    }

    console.log('Campaign updated successfully')

    return new Response(
      JSON.stringify({ 
        success: true,
        campaign_id: campana_id,
        campaign_name: campaign.nombre,
        distancia_max: distancia_max,
        total_personas: personas.length,
        personas_dentro_rango: dentroRangoCount,
        personas_fuera_rango: personas.length - dentroRangoCount,
        porcentaje_en_rango: personas.length > 0 
          ? ((dentroRangoCount / personas.length) * 100).toFixed(2) 
          : '0',
        updated_count: updatedCount,
        message: 'Distances recalculated successfully'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error recalculating distances:', error)
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
  2. Deploy this function: `supabase functions deploy recalcular-distancias`
  3. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/recalcular-distancias' \
    --header 'Authorization: Bearer YOUR_ANON_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
      "campana_id": "your-campaign-uuid",
      "distancia_max": 3000
    }'

  For production:
  https://YOUR_PROJECT.supabase.co/functions/v1/recalcular-distancias
*/
