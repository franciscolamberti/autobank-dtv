import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types para las tablas
export interface Campana {
  id: string
  nombre: string
  archivo_url: string
  distancia_max: number
  estado: 'activa' | 'pausada' | 'finalizada'
  total_personas: number
  personas_dentro_rango: number
  personas_contactadas: number
  personas_confirmadas: number
  kapso_flow_id: string | null
  kapso_whatsapp_config_id: string | null
  horario_envio_inicio: string
  horario_envio_fin: string
  timezone: string
  created_at: string
  updated_at: string
}

export interface PersonaContactar {
  id: string
  campana_id: string
  fila_archivo: number
  nro_cliente: string | null
  nro_wo: string | null
  apellido_nombre: string
  dni: string | null
  telefono_principal: string
  direccion_completa: string | null
  cp: string | null
  localidad: string | null
  provincia: string | null
  lat: number
  lon: number
  punto_pickit_id: string | null
  distancia_metros: number
  dentro_rango: boolean
  estado_contacto: 'pendiente' | 'encolado' | 'enviado_whatsapp' | 'respondio' | 'confirmado' | 'rechazado' | 'no_responde' | 'error_envio'
  fecha_envio_whatsapp: string | null
  fecha_respuesta: string | null
  respuesta_texto: string | null
  intentos_envio: number
  razon_creacion: string | null
  estado_cliente_original: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface PuntoPickit {
  id: string
  nombre: string
  direccion: string
  lat: number
  lon: number
  created_at: string
}
