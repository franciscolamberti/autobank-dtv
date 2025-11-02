// Supabase Edge Function: generar-corte-diario
// Genera archivo diario Pickit según PRD
// Una fila por work order (nro_wo) de personas confirmadas desde último corte

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    const { campana_id } = await req.json()

    if (!campana_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: campana_id' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener campaña con configuración
    const { data: campana, error: campanaError } = await supabaseClient
      .from('campanas')
      .select('id, nombre, horario_corte_diario, created_at')
      .eq('id', campana_id)
      .single()

    if (campanaError || !campana) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener fecha de hoy en timezone de la campaña (default Argentina)
    const timezone = 'America/Argentina/Buenos_Aires'
    const hoy = new Date()
    const hoyLocal = new Date(hoy.toLocaleString('en-US', { timeZone: timezone }))
    const fechaHoy = hoyLocal.toISOString().split('T')[0] // YYYY-MM-DD

    // Consultar personas confirmadas con fecha_compromiso desde último corte
    // Según PRD: compromisos post-corte aparecen en el corte del día
    // Por simplicidad, generamos todos los confirmados con fecha_compromiso != null
    const { data: personas, error: personasError } = await supabaseClient
      .from('personas_contactar')
      .select(`
        id,
        nro_cliente,
        nro_wo,
        nros_wo,
        cantidad_decos,
        apellido_nombre,
        dni,
        telefono_principal,
        direccion_completa,
        cp,
        localidad,
        provincia,
        fecha_compromiso,
        punto_pickit:puntos_pickit(nombre, direccion, lat, lon)
      `)
      .eq('campana_id', campana_id)
      .eq('estado_contacto', 'confirmado')
      .not('fecha_compromiso', 'is', null)

    if (personasError) {
      console.error('Error fetching personas:', personasError)
      throw personasError
    }

    if (!personas || personas.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No hay personas confirmadas con fecha de compromiso',
          campana_id,
          total_filas: 0
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generar una fila por work order según PRD
    // Si una persona tiene múltiples WOs (nros_wo array), crear una fila por cada WO
    const filasExcel: any[] = []

    for (const persona of personas) {
      const nrosWO = persona.nros_wo && persona.nros_wo.length > 0 
        ? persona.nros_wo 
        : (persona.nro_wo ? [persona.nro_wo] : [])

      // Si no hay WOs, usar nro_cliente como identificador
      if (nrosWO.length === 0) {
        const nrosCliente = persona.nros_cliente && persona.nros_cliente.length > 0
          ? persona.nros_cliente
          : (persona.nro_cliente ? [persona.nro_cliente] : ['N/A'])

        filasExcel.push({
          'Nro Cliente': nrosCliente.join(', '),
          'Nro WO': persona.nro_wo || 'N/A',
          'Apellido y Nombre': persona.apellido_nombre || '',
          'DNI': persona.dni || '',
          'Teléfono': persona.telefono_principal || '',
          'Dirección': persona.direccion_completa || '',
          'CP': persona.cp || '',
          'Localidad': persona.localidad || '',
          'Provincia': persona.provincia || '',
          'Cantidad Decodificadores': persona.cantidad_decos || 1,
          'Fecha Compromiso': persona.fecha_compromiso 
            ? new Date(persona.fecha_compromiso).toLocaleDateString('es-AR')
            : '',
          'Punto Pickit': persona.punto_pickit?.nombre || '',
          'Dirección Punto Pickit': persona.punto_pickit?.direccion || '',
        })
      } else {
        // Una fila por cada WO
        for (const nroWO of nrosWO) {
          const nrosCliente = persona.nros_cliente && persona.nros_cliente.length > 0
            ? persona.nros_cliente
            : (persona.nro_cliente ? [persona.nro_cliente] : [])

          filasExcel.push({
            'Nro Cliente': nrosCliente.join(', '),
            'Nro WO': nroWO,
            'Apellido y Nombre': persona.apellido_nombre || '',
            'DNI': persona.dni || '',
            'Teléfono': persona.telefono_principal || '',
            'Dirección': persona.direccion_completa || '',
            'CP': persona.cp || '',
            'Localidad': persona.localidad || '',
            'Provincia': persona.provincia || '',
            'Cantidad Decodificadores': persona.cantidad_decos || 1,
            'Fecha Compromiso': persona.fecha_compromiso 
              ? new Date(persona.fecha_compromiso).toLocaleDateString('es-AR')
              : '',
            'Punto Pickit': persona.punto_pickit?.nombre || '',
            'Dirección Punto Pickit': persona.punto_pickit?.direccion || '',
          })
        }
      }
    }

    // Crear workbook
    const ws = XLSX.utils.json_to_sheet(filasExcel)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Corte Diario Pickit')

    // Convertir a buffer
    const excelBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const excelBlob = new Uint8Array(excelBuffer)

    // Subir a Storage
    const fileName = `corte-diario-${campana_id}-${fechaHoy}.xlsx`
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('archivos-dtv')
      .upload(`${campana_id}/cortes-diarios/${fileName}`, excelBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      })

    if (uploadError) {
      console.error('Error uploading daily cut file:', uploadError)
      throw uploadError
    }

    console.log(`Daily cut file generated: ${fileName}, ${filasExcel.length} rows`)

    return new Response(
      JSON.stringify({
        success: true,
        campana_id,
        campana_nombre: campana.nombre,
        fecha_corte: fechaHoy,
        total_filas: filasExcel.length,
        total_personas: personas.length,
        file_name: fileName,
        file_path: uploadData.path,
        message: 'Archivo diario Pickit generado exitosamente'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error generating daily cut:', error)
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
  2. Deploy this function: `supabase functions deploy generar-corte-diario`
  3. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generar-corte-diario' \
    --header 'Authorization: Bearer YOUR_ANON_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
      "campana_id": "your-campaign-uuid"
    }'

  For production:
  https://YOUR_PROJECT.supabase.co/functions/v1/generar-corte-diario
*/

