import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types para las tablas según PRD

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
  // Kapso config
  kapso_workflow_id: string | null
  kapso_workflow_id_recordatorio: string | null
  kapso_phone_number_id: string | null
  // Configuración de contactación
  fecha_fin_contactacion: string | null // date
  horario_corte_diario: string | null // time (default 20:00)
  // Ventanas horarias Lunes-Viernes
  horario_ventana_1_inicio: string | null // time (default 12:00)
  horario_ventana_1_fin: string | null // time (default 15:00)
  horario_ventana_2_inicio: string | null // time (default 18:00)
  horario_ventana_2_fin: string | null // time (default 20:30)
  // Ventana horaria Sábado
  horario_sabado_inicio: string | null // time (default 10:00)
  horario_sabado_fin: string | null // time (default 13:00)
  contactar_domingo: boolean // default false
  timezone: string // default 'America/Argentina/Buenos_Aires'
  created_at: string
  updated_at: string
}

export interface PersonaContactar {
  id: string
  campana_id: string
  fila_archivo: number
  // Datos del cliente
  nro_cliente: string | null
  nro_wo: string | null
  nros_cliente: string[] | null // array para múltiples decos
  nros_wo: string[] | null // array para múltiples work orders
  cantidad_decos: number // cantidad de decodificadores
  apellido_nombre: string
  dni: string | null
  telefono_principal: string // clave de deduplicación
  direccion_completa: string | null
  cp: string | null
  localidad: string | null
  provincia: string | null
  // Ubicación
  lat: number
  lon: number
  // Distancia y punto pickit
  punto_pickit_id: string | null
  distancia_metros: number
  dentro_rango: boolean
  fuera_de_rango: boolean // true si distancia > distancia_max
  // Estado de contacto
  estado_contacto: 'pendiente' | 'encolado' | 'enviado_whatsapp' | 'respondio' | 'confirmado' | 'rechazado' | 'no_responde' | 'error_envio'
  fecha_envio_whatsapp: string | null
  fecha_respuesta: string | null
  fecha_compromiso: string | null // date - día que el cliente se comprometió a entregar
  recordatorio_enviado: boolean // default false
  fecha_envio_recordatorio: string | null
  respuesta_texto: string | null
  motivo_negativo: string | null // generado por agente kapso en caso de rechazo
  intentos_envio: number
  tiene_whatsapp: boolean | null // null inicial, false si validación kapso falla
  solicita_retiro_domicilio: boolean // default false
  // Info adicional
  razon_creacion: string | null
  estado_cliente_original: string | null
  notas: string | null
  // Tracking de devolución (no PRD pero existe en DB)
  decodificador_devuelto: boolean
  fecha_devolucion: string | null
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
