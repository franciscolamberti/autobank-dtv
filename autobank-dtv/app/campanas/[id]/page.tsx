"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Activity, ChevronLeft, CheckCircle2, XCircle, Clock, Send, AlertCircle, Download, Package } from "lucide-react"
import Link from "next/link"
import { redirect, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import * as XLSX from 'xlsx'

interface CampaignData {
  id: string
  nombre: string
  distancia_max: number
  estado: 'activa' | 'pausada' | 'finalizada'
  created_at: string
}

interface Persona {
  id: string
  apellido_nombre: string
  telefono_principal: string
  distancia_metros: number
  estado_contacto: string
  fecha_envio_whatsapp: string | null
  fecha_respuesta: string | null
  respuesta_texto: string | null
  fecha_compromiso: string | null
  motivo_negativo: string | null
  solicita_retiro_domicilio: boolean
  tiene_whatsapp: boolean | null
  fuera_de_rango: boolean
  punto_pickit: { nombre: string; direccion: string } | null
  decodificador_devuelto: boolean
  fecha_devolucion: string | null
}

interface PersonasSections {
  comprometidos: Persona[] // PRD bucket 1: confirmado con fecha_compromiso
  inProgress: Persona[] // PRD bucket 2: encolado, enviado_whatsapp, respondio
  fueraDeRango: Persona[] // PRD bucket 3: fuera_de_rango = true
  sinWhatsapp: Persona[] // PRD bucket 4: tiene_whatsapp = false
  atencionEspecial: Persona[] // PRD bucket 5: rechazado OR solicita_retiro_domicilio
}

export default function CampaignDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [personas, setPersonas] = useState<PersonasSections>({
    comprometidos: [],
    inProgress: [],
    fueraDeRango: [],
    sinWhatsapp: [],
    atencionEspecial: []
  })
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Redirect if someone tries to access /campanas/nueva through the dynamic route
  if (id === "nueva") {
    redirect("/campanas/nueva")
  }

  useEffect(() => {
    loadCampaignData()
    
    // Set up real-time subscription
    const channel = supabase
      .channel(`campaign-${id}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'campanas', filter: `id=eq.${id}` },
        () => loadCampaignData()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'personas_contactar', filter: `campana_id=eq.${id}` },
        () => loadCampaignData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  const loadCampaignData = async () => {
    try {
      // Load campaign
      const { data: campaignData, error: campaignError } = await supabase
        .from('campanas')
        .select('id, nombre, distancia_max, estado, created_at')
        .eq('id', id)
        .single()

      if (campaignError) throw campaignError
      setCampaign(campaignData)

      // Load personas con todos los campos necesarios para PRD buckets
      const { data: personasData, error: personasError } = await supabase
        .from('personas_contactar')
        .select('id, apellido_nombre, dni, telefono_principal, nro_cliente, nro_wo, nros_cliente, nros_wo, cantidad_decos, distancia_metros, estado_contacto, dentro_rango, fuera_de_rango, tiene_whatsapp, fecha_envio_whatsapp, fecha_respuesta, respuesta_texto, fecha_compromiso, motivo_negativo, solicita_retiro_domicilio, decodificador_devuelto, fecha_devolucion, direccion_completa, cp, localidad, provincia, punto_pickit:puntos_pickit(nombre, direccion)')
        .eq('campana_id', id)

      if (personasError) throw personasError

      // Categorizar personas según los 5 buckets del PRD
      const sections: PersonasSections = {
        comprometidos: [], // bucket 1: confirmado con fecha_compromiso
        inProgress: [], // bucket 2: encolado, enviado_whatsapp, respondio
        fueraDeRango: [], // bucket 3: fuera_de_rango = true
        sinWhatsapp: [], // bucket 4: tiene_whatsapp = false
        atencionEspecial: [] // bucket 5: rechazado OR solicita_retiro_domicilio
      }

      personasData?.forEach((persona: any) => {
        // Normalizar punto_pickit (Supabase retorna array para relación)
        const personaNormalizada = {
          ...persona,
          punto_pickit: Array.isArray(persona.punto_pickit) ? persona.punto_pickit[0] : persona.punto_pickit
        }

        // Bucket 1: Comprometidos - estado_contacto = confirmado Y tiene fecha_compromiso
        if (personaNormalizada.estado_contacto === 'confirmado' && personaNormalizada.fecha_compromiso) {
          sections.comprometidos.push(personaNormalizada)
        }
        // Bucket 2: In Progress - encolado, enviado_whatsapp, respondio
        else if (['encolado', 'enviado_whatsapp', 'respondio'].includes(personaNormalizada.estado_contacto)) {
          sections.inProgress.push(personaNormalizada)
        }
        // Bucket 3: Fuera de rango - fuera_de_rango = true
        else if (personaNormalizada.fuera_de_rango) {
          sections.fueraDeRango.push(personaNormalizada)
        }
        // Bucket 4: Sin WhatsApp - tiene_whatsapp = false
        else if (personaNormalizada.tiene_whatsapp === false) {
          sections.sinWhatsapp.push(personaNormalizada)
        }
        // Bucket 5: Atención especial - rechazado OR solicita_retiro_domicilio
        else if (personaNormalizada.estado_contacto === 'rechazado' || personaNormalizada.solicita_retiro_domicilio) {
          sections.atencionEspecial.push(personaNormalizada)
        }
        // Personas pendientes sin categoría específica van a inProgress
        else if (personaNormalizada.estado_contacto === 'pendiente') {
          sections.inProgress.push(personaNormalizada)
        }
      })

      setPersonas(sections)
    } catch (error) {
      console.error('Error loading campaign:', error)
      toast.error('Error al cargar los datos de la campaña')
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessages = async () => {
    setSending(true)
    try {
      const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'https://enviar-campana.your-worker.workers.dev'
      
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campana_id: id
        })
      })

      if (!response.ok) {
        throw new Error('Error al enviar mensajes')
      }

      const result = await response.json()
      toast.success(`Mensajes iniciados. ${result.resumen?.exitosas || 0} enviados`)
      
      await loadCampaignData()
    } catch (error) {
      console.error('Error sending messages:', error)
      toast.error('Error al enviar mensajes. Por favor intente nuevamente.')
    } finally {
      setSending(false)
    }
  }

  const handleToggleDevolucion = async (personaId: string, currentValue: boolean) => {
    try {
      const newValue = !currentValue
      const updateData: any = {
        decodificador_devuelto: newValue,
        fecha_devolucion: newValue ? new Date().toISOString() : null
      }

      const { error } = await supabase
        .from('personas_contactar')
        .update(updateData)
        .eq('id', personaId)

      if (error) throw error

      toast.success(newValue ? 'Decodificador marcado como devuelto' : 'Marca de devolución removida')
    } catch (error) {
      console.error('Error updating decoder return:', error)
      toast.error('Error al actualizar el estado de devolución')
    }
  }

  const handleExportBucket = async (bucketName: string, personas: Persona[]) => {
    if (personas.length === 0) {
      toast.error(`No hay personas en el bucket ${bucketName}`)
      return
    }

    try {
      toast.info(`Preparando export de ${bucketName}...`)

      const excelData = personas.map((persona: any) => ({
        'Apellido y Nombre': persona.apellido_nombre || '',
        'DNI': persona.dni || '',
        'Teléfono': persona.telefono_principal || '',
        'Nro Cliente': persona.nro_cliente || '',
        'Nro WO': persona.nro_wo || '',
        'Nros Cliente': persona.nros_cliente?.join(', ') || '',
        'Nros WO': persona.nros_wo?.join(', ') || '',
        'Cantidad Decodificadores': persona.cantidad_decos || 1,
        'Dirección': persona.direccion_completa || '',
        'CP': persona.cp || '',
        'Localidad': persona.localidad || '',
        'Provincia': persona.provincia || '',
        'Punto Pickit': persona.punto_pickit?.nombre || '',
        'Dirección Punto Pickit': persona.punto_pickit?.direccion || '',
        'Distancia (metros)': Math.round(persona.distancia_metros),
        'Estado Contacto': persona.estado_contacto || '',
        'Fecha Compromiso': persona.fecha_compromiso 
          ? new Date(persona.fecha_compromiso).toLocaleDateString('es-AR') 
          : '',
        'Motivo Negativo': persona.motivo_negativo || '',
        'Solicita Retiro Domicilio': persona.solicita_retiro_domicilio ? 'Sí' : 'No',
        'Fecha Envío WhatsApp': persona.fecha_envio_whatsapp 
          ? new Date(persona.fecha_envio_whatsapp).toLocaleDateString('es-AR') 
          : '',
        'Fecha Respuesta': persona.fecha_respuesta 
          ? new Date(persona.fecha_respuesta).toLocaleDateString('es-AR') 
          : '',
        'Respuesta Texto': persona.respuesta_texto || ''
      }))

      const ws = XLSX.utils.json_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, bucketName)

      const fileName = `${campaign?.nombre || 'campaign'}-${bucketName}-${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast.success(`Export de ${bucketName} descargado exitosamente`)
    } catch (error) {
      console.error('Error exporting bucket:', error)
      toast.error(`Error al generar el export de ${bucketName}`)
    }
  }

  const handleExportToExcel = async () => {
    try {
      toast.info('Preparando archivo Excel...')

      // Fetch all personas with all fields including punto_pickit
      const { data: personasData, error } = await supabase
        .from('personas_contactar')
        .select(`
          *,
          punto_pickit:puntos_pickit(nombre, direccion)
        `)
        .eq('campana_id', id)

      if (error) throw error

      // Helper function to determine section
      const getSeccion = (persona: any): string => {
        if (persona.dentro_rango && persona.estado_contacto === 'enviado_whatsapp') {
          return 'Contactados'
        } else if (!persona.dentro_rango) {
          return 'No Contactados'
        } else if (persona.estado_contacto === 'confirmado') {
          return 'Confirmados'
        } else if (['pendiente', 'encolado', 'respondio', 'no_responde'].includes(persona.estado_contacto)) {
          return 'En Progreso'
        }
        return 'Otros'
      }

      // Map data for Excel
      const excelData = personasData?.map((persona: any) => ({
        'Sección': getSeccion(persona),
        'Apellido y Nombre': persona.apellido_nombre || '',
        'DNI': persona.dni || '',
        'Teléfono': persona.telefono_principal || '',
        'Nro Cliente': persona.nro_cliente || '',
        'Nro WO': persona.nro_wo || '',
        'Cantidad Decodificadores': persona.cantidad_decos || 1,
        'Dirección': persona.direccion_completa || '',
        'CP': persona.cp || '',
        'Localidad': persona.localidad || '',
        'Provincia': persona.provincia || '',
        'Latitud': persona.lat || '',
        'Longitud': persona.lon || '',
        'Punto Pickit': persona.punto_pickit?.nombre || '',
        'Dirección Punto Pickit': persona.punto_pickit?.direccion || '',
        'Distancia (metros)': Math.round(persona.distancia_metros),
        'Dentro de Rango': persona.dentro_rango ? 'Sí' : 'No',
        'Estado de Contacto': persona.estado_contacto || '',
        'Fecha Envío WhatsApp': persona.fecha_envio_whatsapp 
          ? new Date(persona.fecha_envio_whatsapp).toLocaleDateString('es-AR') 
          : '',
        'Fecha Respuesta': persona.fecha_respuesta 
          ? new Date(persona.fecha_respuesta).toLocaleDateString('es-AR') 
          : '',
        'Respuesta Texto': persona.respuesta_texto || '',
        'Decodificador Devuelto': persona.decodificador_devuelto ? 'Sí' : 'No',
        'Fecha Devolución': persona.fecha_devolucion 
          ? new Date(persona.fecha_devolucion).toLocaleDateString('es-AR') 
          : '',
        'Razón Creación': persona.razon_creacion || '',
        'Estado Cliente Original': persona.estado_cliente_original || '',
        'Notas': persona.notas || '',
        'Intentos de Envío': persona.intentos_envio || 0,
        'Fila Archivo': persona.fila_archivo || '',
      })) || []

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Personas')

      // Auto-size columns
      const maxWidth = 50
      const colWidths = Object.keys(excelData[0] || {}).map(key => {
        const maxLength = Math.max(
          key.length,
          ...excelData.map(row => String(row[key as keyof typeof row] || '').length)
        )
        return { wch: Math.min(maxLength + 2, maxWidth) }
      })
      ws['!cols'] = colWidths

      // Generate filename
      const fileName = `campana-${campaign?.nombre?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`

      // Download file
      XLSX.writeFile(wb, fileName)

      toast.success('Archivo Excel descargado exitosamente')
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      toast.error('Error al generar el archivo Excel')
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      activa: { label: "Activa", className: "bg-green-500/10 text-green-700" },
      pausada: { label: "Pausada", className: "bg-yellow-500/10 text-yellow-700" },
      finalizada: { label: "Finalizada", className: "bg-gray-500/10 text-gray-700" },
    }
    const variant = variants[status] || variants.activa
    return <Badge className={variant.className}>{variant.label}</Badge>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando campaña...</p>
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Campaña no encontrada</h2>
          <p className="text-muted-foreground mb-4">La campaña que buscas no existe o fue eliminada.</p>
          <Link href="/">
            <Button>Volver al Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">{campaign.nombre}</h1>
                  <p className="text-sm text-muted-foreground">
                    Creada el {new Date(campaign.created_at).toLocaleDateString('es-AR')} • {getStatusBadge(campaign.estado)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleExportToExcel}
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar Excel
              </Button>
              <Button 
                onClick={handleSendMessages}
                disabled={sending || campaign.estado !== 'activa'}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="mr-2 h-4 w-4" />
                {sending ? 'Enviando...' : 'Enviar Mensajes'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* Bucket 1: Comprometidos - PRD */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <CardTitle>Comprometidos</CardTitle>
                  <Badge variant="secondary">{personas.comprometidos.length}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportBucket('Comprometidos', personas.comprometidos)}
                  disabled={personas.comprometidos.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
              <CardDescription>Personas confirmadas con fecha de compromiso. Aparecen en archivo diario Pickit en el corte del día del compromiso</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.comprometidos.length > 0 ? (
                <div className="space-y-2">
                  {personas.comprometidos.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 bg-green-50/50">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={persona.decodificador_devuelto}
                          onCheckedChange={() => handleToggleDevolucion(persona.id, persona.decodificador_devuelto)}
                          className="shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{persona.apellido_nombre}</p>
                            {persona.decodificador_devuelto && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <Package className="h-3 w-3 mr-1" />
                                Devuelto
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                          <p className="text-sm font-semibold text-green-700 mt-1">
                            Comprometido: {persona.fecha_compromiso ? new Date(persona.fecha_compromiso).toLocaleDateString('es-AR') : 'Sin fecha'}
                          </p>
                          {persona.punto_pickit && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {persona.punto_pickit.nombre}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {persona.fecha_respuesta && (
                          <p>Confirmado: {new Date(persona.fecha_respuesta).toLocaleDateString('es-AR')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay compromisos aún</p>
              )}
            </CardContent>
          </Card>

          {/* Bucket 2: In Progress - PRD */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  <CardTitle>In Progress / Contactados</CardTitle>
                  <Badge variant="secondary">{personas.inProgress.length}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportBucket('InProgress', personas.inProgress)}
                  disabled={personas.inProgress.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
              <CardDescription>Conversación activa: encolado, enviado WhatsApp, o respondió</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.inProgress.length > 0 ? (
                <div className="space-y-2">
                  {personas.inProgress.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={persona.decodificador_devuelto}
                          onCheckedChange={() => handleToggleDevolucion(persona.id, persona.decodificador_devuelto)}
                          className="shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{persona.apellido_nombre}</p>
                            {persona.decodificador_devuelto && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <Package className="h-3 w-3 mr-1" />
                                Devuelto
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                          {persona.respuesta_texto && (
                            <p className="text-sm text-orange-700 mt-1 italic">"{persona.respuesta_texto}"</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="capitalize">
                          {persona.estado_contacto === 'encolado' && 'Encolado'}
                          {persona.estado_contacto === 'enviado_whatsapp' && 'Enviado'}
                          {persona.estado_contacto === 'respondio' && 'Respondió'}
                          {persona.estado_contacto === 'pendiente' && 'Pendiente'}
                        </Badge>
                        {persona.fecha_envio_whatsapp && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(persona.fecha_envio_whatsapp).toLocaleDateString('es-AR')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay personas en progreso</p>
              )}
            </CardContent>
          </Card>

          {/* Bucket 3: Fuera de Rango - PRD */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <CardTitle>Fuera de Rango</CardTitle>
                  <Badge variant="secondary">{personas.fueraDeRango.length}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportBucket('FueraDeRango', personas.fueraDeRango)}
                  disabled={personas.fueraDeRango.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
              <CardDescription>Distancia mayor a {campaign?.distancia_max || 2000}m. Export generado al crear campaña</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.fueraDeRango.length > 0 ? (
                <div className="space-y-2">
                  {personas.fueraDeRango.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={persona.decodificador_devuelto}
                          onCheckedChange={() => handleToggleDevolucion(persona.id, persona.decodificador_devuelto)}
                          className="shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{persona.apellido_nombre}</p>
                            {persona.decodificador_devuelto && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <Package className="h-3 w-3 mr-1" />
                                Devuelto
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                          {persona.punto_pickit && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Más cercano: {persona.punto_pickit.nombre} ({Math.round(persona.distancia_metros)}m)
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-red-600 border-red-200">
                          {Math.round(persona.distancia_metros)}m
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">Fuera de rango</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Todas las personas están dentro del rango</p>
              )}
            </CardContent>
          </Card>

          {/* Bucket 4: Sin WhatsApp - PRD */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <CardTitle>Sin WhatsApp Válido</CardTitle>
                  <Badge variant="secondary">{personas.sinWhatsapp.length}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportBucket('SinWhatsapp', personas.sinWhatsapp)}
                  disabled={personas.sinWhatsapp.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
              <CardDescription>Detectado por validación Kapso o error en envío</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.sinWhatsapp.length > 0 ? (
                <div className="space-y-2">
                  {personas.sinWhatsapp.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 bg-yellow-50/50">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={persona.decodificador_devuelto}
                          onCheckedChange={() => handleToggleDevolucion(persona.id, persona.decodificador_devuelto)}
                          className="shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{persona.apellido_nombre}</p>
                            {persona.decodificador_devuelto && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <Package className="h-3 w-3 mr-1" />
                                Devuelto
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                          <p className="text-xs text-yellow-700 mt-1">Número inválido o sin WhatsApp</p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <Badge variant="outline" className="text-yellow-600 border-yellow-200">
                          Sin WhatsApp
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Todos los números tienen WhatsApp válido</p>
              )}
            </CardContent>
          </Card>

          {/* Bucket 5: Atención Especial - PRD */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-purple-600" />
                  <CardTitle>Atención Especial</CardTitle>
                  <Badge variant="secondary">{personas.atencionEspecial.length}</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportBucket('AtencionEspecial', personas.atencionEspecial)}
                  disabled={personas.atencionEspecial.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
              <CardDescription>Rechazados o solicita retiro domicilio. Motivo negativo generado por agente Kapso</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.atencionEspecial.length > 0 ? (
                <div className="space-y-2">
                  {personas.atencionEspecial.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 bg-purple-50/50">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={persona.decodificador_devuelto}
                          onCheckedChange={() => handleToggleDevolucion(persona.id, persona.decodificador_devuelto)}
                          className="shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{persona.apellido_nombre}</p>
                            {persona.solicita_retiro_domicilio && (
                              <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">
                                Retiro Domicilio
                              </Badge>
                            )}
                            {persona.decodificador_devuelto && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <Package className="h-3 w-3 mr-1" />
                                Devuelto
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                          {persona.motivo_negativo && (
                            <p className="text-sm font-semibold text-purple-700 mt-1">
                              Motivo: {persona.motivo_negativo}
                            </p>
                          )}
                          {persona.respuesta_texto && (
                            <p className="text-sm text-purple-600 mt-1 italic">"{persona.respuesta_texto}"</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {persona.estado_contacto === 'rechazado' && (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            Rechazado
                          </Badge>
                        )}
                        {persona.fecha_respuesta && (
                          <p className="text-xs mt-1">
                            {new Date(persona.fecha_respuesta).toLocaleDateString('es-AR')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay casos que requieran atención especial</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
