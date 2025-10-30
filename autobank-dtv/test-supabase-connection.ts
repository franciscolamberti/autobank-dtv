// Cargar variables de entorno manualmente
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const envPath = resolve(__dirname, '.env.local')
const envContent = readFileSync(envPath, 'utf-8')

envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=')
  if (key && values.length > 0) {
    const value = values.join('=').trim()
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = value
    }
  }
})

// Crear cliente de Supabase directamente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Faltan variables de entorno de Supabase')
  console.error('   Asegúrate de tener NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  console.log('🔌 Probando conexión a Supabase...\n')

  try {
    // Prueba básica: obtener información de las tablas
    console.log('📊 Verificando tablas disponibles...\n')
    
    // Contar campañas
    const { count: countCampanas, error: campanasError } = await supabase
      .from('campanas')
      .select('*', { count: 'exact', head: true })

    if (campanasError) {
      console.error('❌ Error al consultar tabla campanas:', campanasError.message)
      return false
    }

    // Obtener algunas campañas de ejemplo
    const { data: campanasEjemplo } = await supabase
      .from('campanas')
      .select('nombre, estado')
      .limit(3)

    console.log(`✅ Tabla 'campanas': ${countCampanas || 0} registros`)
    if (campanasEjemplo && campanasEjemplo.length > 0) {
      console.log(`   Ejemplos: ${campanasEjemplo.map(c => c.nombre).join(', ')}`)
    }

    // Contar personas_contactar
    const { count: countPersonas, error: personasError } = await supabase
      .from('personas_contactar')
      .select('*', { count: 'exact', head: true })

    if (personasError) {
      console.error('❌ Error al consultar tabla personas_contactar:', personasError.message)
      return false
    }

    console.log(`✅ Tabla 'personas_contactar': ${countPersonas || 0} registros`)

    // Contar puntos_pickit
    const { count: countPuntos, error: puntosError } = await supabase
      .from('puntos_pickit')
      .select('*', { count: 'exact', head: true })

    if (puntosError) {
      console.error('❌ Error al consultar tabla puntos_pickit:', puntosError.message)
      return false
    }

    // Obtener algunos puntos de ejemplo
    const { data: puntosEjemplo } = await supabase
      .from('puntos_pickit')
      .select('nombre')
      .limit(3)

    console.log(`✅ Tabla 'puntos_pickit': ${countPuntos || 0} registros`)
    if (puntosEjemplo && puntosEjemplo.length > 0) {
      console.log(`   Ejemplos: ${puntosEjemplo.map(p => p.nombre).join(', ')}`)
    }

    console.log('\n✅ Conexión a Supabase exitosa!')
    return true

  } catch (error) {
    console.error('❌ Error de conexión:', error)
    return false
  }
}

// Ejecutar si se llama directamente
testConnection()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('Error fatal:', error)
    process.exit(1)
  })

export { testConnection }

