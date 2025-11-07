import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analisis: {
        Row: {
          archivo_url: string | null
          created_at: string | null
          distancia_max: number
          id: string
          personas_cercanas: number
          porcentaje: number | null
          resultados: Json | null
          total_personas: number
        }
        Insert: {
          archivo_url?: string | null
          created_at?: string | null
          distancia_max: number
          id?: string
          personas_cercanas: number
          porcentaje?: number | null
          resultados?: Json | null
          total_personas: number
        }
        Update: {
          archivo_url?: string | null
          created_at?: string | null
          distancia_max?: number
          id?: string
          personas_cercanas?: number
          porcentaje?: number | null
          resultados?: Json | null
          total_personas?: number
        }
        Relationships: []
      }
      campanas: {
        Row: {
          archivo_url: string
          contactar_domingo: boolean | null
          created_at: string
          distancia_max: number
          estado: string
          fecha_fin_contactacion: string | null
          horario_corte_diario: string | null
          horario_sabado_fin: string | null
          horario_sabado_inicio: string | null
          horario_ventana_1_fin: string | null
          horario_ventana_1_inicio: string | null
          horario_ventana_2_fin: string | null
          horario_ventana_2_inicio: string | null
          id: string
          kapso_phone_number_id: string | null
          kapso_workflow_id: string | null
          kapso_workflow_id_recordatorio: string | null
          nombre: string
          personas_confirmadas: number
          personas_contactadas: number
          personas_dentro_rango: number
          timezone: string
          total_personas: number
          updated_at: string
        }
        Insert: {
          archivo_url: string
          contactar_domingo?: boolean | null
          created_at?: string
          distancia_max?: number
          estado?: string
          fecha_fin_contactacion?: string | null
          horario_corte_diario?: string | null
          horario_sabado_fin?: string | null
          horario_sabado_inicio?: string | null
          horario_ventana_1_fin?: string | null
          horario_ventana_1_inicio?: string | null
          horario_ventana_2_fin?: string | null
          horario_ventana_2_inicio?: string | null
          id?: string
          kapso_phone_number_id?: string | null
          kapso_workflow_id?: string | null
          kapso_workflow_id_recordatorio?: string | null
          nombre: string
          personas_confirmadas?: number
          personas_contactadas?: number
          personas_dentro_rango?: number
          timezone?: string
          total_personas?: number
          updated_at?: string
        }
        Update: {
          archivo_url?: string
          contactar_domingo?: boolean | null
          created_at?: string
          distancia_max?: number
          estado?: string
          fecha_fin_contactacion?: string | null
          horario_corte_diario?: string | null
          horario_sabado_fin?: string | null
          horario_sabado_inicio?: string | null
          horario_ventana_1_fin?: string | null
          horario_ventana_1_inicio?: string | null
          horario_ventana_2_fin?: string | null
          horario_ventana_2_inicio?: string | null
          id?: string
          kapso_phone_number_id?: string | null
          kapso_workflow_id?: string | null
          kapso_workflow_id_recordatorio?: string | null
          nombre?: string
          personas_confirmadas?: number
          personas_contactadas?: number
          personas_dentro_rango?: number
          timezone?: string
          total_personas?: number
          updated_at?: string
        }
        Relationships: []
      }
      personas_contactar: {
        Row: {
          apellido_nombre: string
          campana_id: string
          cantidad_decos: number | null
          cp: string | null
          created_at: string
          decodificador_devuelto: boolean
          dentro_rango: boolean
          direccion_completa: string | null
          distancia_metros: number | null
          dni: string | null
          email: string | null
          error_envio_kapso: string | null
          estado_cliente_original: string | null
          estado_contacto: Database["public"]["Enums"]["estado_contacto_enum"]
          fecha_compromiso: string | null
          fecha_devolucion: string | null
          fecha_envio_recordatorio: string | null
          fecha_envio_whatsapp: string | null
          fecha_respuesta: string | null
          fila_archivo: number
          fuera_de_rango: boolean | null
          id: string
          intentos_envio: number
          kapso_tracking_id: string | null
          lat: number | null
          localidad: string | null
          lon: number | null
          motivo_negativo: string | null
          notas: string | null
          nro_cliente: string | null
          nro_wo: string | null
          nros_cliente: string[] | null
          nros_wo: string[] | null
          provincia: string | null
          punto_pickit_id: string | null
          razon_creacion: string | null
          recordatorio_enviado: boolean | null
          respuesta_texto: string | null
          solicita_retiro_domicilio: boolean | null
          telefono_principal: string
          tiene_whatsapp: boolean | null
          updated_at: string
        }
        Insert: {
          apellido_nombre: string
          campana_id: string
          cantidad_decos?: number | null
          cp?: string | null
          created_at?: string
          decodificador_devuelto?: boolean
          dentro_rango?: boolean
          direccion_completa?: string | null
          distancia_metros?: number | null
          dni?: string | null
          email?: string | null
          error_envio_kapso?: string | null
          estado_cliente_original?: string | null
          estado_contacto?: Database["public"]["Enums"]["estado_contacto_enum"]
          fecha_compromiso?: string | null
          fecha_devolucion?: string | null
          fecha_envio_recordatorio?: string | null
          fecha_envio_whatsapp?: string | null
          fecha_respuesta?: string | null
          fila_archivo: number
          fuera_de_rango?: boolean | null
          id?: string
          intentos_envio?: number
          kapso_tracking_id?: string | null
          lat?: number | null
          localidad?: string | null
          lon?: number | null
          motivo_negativo?: string | null
          notas?: string | null
          nro_cliente?: string | null
          nro_wo?: string | null
          nros_cliente?: string[] | null
          nros_wo?: string[] | null
          provincia?: string | null
          punto_pickit_id?: string | null
          razon_creacion?: string | null
          recordatorio_enviado?: boolean | null
          respuesta_texto?: string | null
          solicita_retiro_domicilio?: boolean | null
          telefono_principal: string
          tiene_whatsapp?: boolean | null
          updated_at?: string
        }
        Update: {
          apellido_nombre?: string
          campana_id?: string
          cantidad_decos?: number | null
          cp?: string | null
          created_at?: string
          decodificador_devuelto?: boolean
          dentro_rango?: boolean
          direccion_completa?: string | null
          distancia_metros?: number | null
          dni?: string | null
          email?: string | null
          error_envio_kapso?: string | null
          estado_cliente_original?: string | null
          estado_contacto?: Database["public"]["Enums"]["estado_contacto_enum"]
          fecha_compromiso?: string | null
          fecha_devolucion?: string | null
          fecha_envio_recordatorio?: string | null
          fecha_envio_whatsapp?: string | null
          fecha_respuesta?: string | null
          fila_archivo?: number
          fuera_de_rango?: boolean | null
          id?: string
          intentos_envio?: number
          kapso_tracking_id?: string | null
          lat?: number | null
          localidad?: string | null
          lon?: number | null
          motivo_negativo?: string | null
          notas?: string | null
          nro_cliente?: string | null
          nro_wo?: string | null
          nros_cliente?: string[] | null
          nros_wo?: string[] | null
          provincia?: string | null
          punto_pickit_id?: string | null
          razon_creacion?: string | null
          recordatorio_enviado?: boolean | null
          respuesta_texto?: string | null
          solicita_retiro_domicilio?: boolean | null
          telefono_principal?: string
          tiene_whatsapp?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_contactar_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_contactar_punto_pickit_id_fkey"
            columns: ["punto_pickit_id"]
            isOneToOne: false
            referencedRelation: "puntos_pickit"
            referencedColumns: ["id"]
          },
        ]
      }
      puntos_pickit: {
        Row: {
          created_at: string | null
          direccion: string
          external_id: number | null
          id: string
          lat: number
          lon: number
          nombre: string
        }
        Insert: {
          created_at?: string | null
          direccion: string
          external_id?: number | null
          id?: string
          lat: number
          lon: number
          nombre: string
        }
        Update: {
          created_at?: string | null
          direccion?: string
          external_id?: number | null
          id?: string
          lat?: number
          lon?: number
          nombre?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      estado_contacto_enum:
        | "pendiente"
        | "encolado"
        | "enviado_whatsapp"
        | "respondio"
        | "confirmado"
        | "rechazado"
        | "no_responde"
        | "error_envio"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_contacto_enum: [
        "pendiente",
        "encolado",
        "enviado_whatsapp",
        "respondio",
        "confirmado",
        "rechazado",
        "no_responde",
        "error_envio",
      ],
    },
  },
} as const
