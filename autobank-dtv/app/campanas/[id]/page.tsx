"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, ChevronLeft, CheckCircle2, XCircle, Clock, Send, AlertCircle } from "lucide-react"
import Link from "next/link"
import { redirect, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

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
}

interface PersonasSections {
  contactados: Persona[]
  noContactados: Persona[]
  confirmados: Persona[]
  enProgreso: Persona[]
}

export default function CampaignDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [personas, setPersonas] = useState<PersonasSections>({
    contactados: [],
    noContactados: [],
    confirmados: [],
    enProgreso: []
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

      // Load personas
      const { data: personasData, error: personasError } = await supabase
        .from('personas_contactar')
        .select('id, apellido_nombre, telefono_principal, distancia_metros, estado_contacto, dentro_rango, fecha_envio_whatsapp, fecha_respuesta, respuesta_texto')
        .eq('campana_id', id)

      if (personasError) throw personasError

      // Categorizar personas según las 4 secciones
      const sections: PersonasSections = {
        contactados: [],
        noContactados: [],
        confirmados: [],
        enProgreso: []
      }

      personasData?.forEach((persona) => {
        // ✅ Contactados: dentro de rango Y enviado
        if (persona.dentro_rango && persona.estado_contacto === 'enviado_whatsapp') {
          sections.contactados.push(persona)
        }
        // ❌ No Contactados: fuera de rango
        else if (!persona.dentro_rango) {
          sections.noContactados.push(persona)
        }
        // 📞 Confirmados
        else if (persona.estado_contacto === 'confirmado') {
          sections.confirmados.push(persona)
        }
        // ⏳ En Progreso: pendientes, encolados, respondió sin confirmar, no responde
        else if (['pendiente', 'encolado', 'respondio', 'no_responde'].includes(persona.estado_contacto)) {
          sections.enProgreso.push(persona)
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
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="space-y-6">
          {/* Sección 1: ✅ Contactados */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle>Contactados</CardTitle>
                <Badge variant="secondary">{personas.contactados.length}</Badge>
              </div>
              <CardDescription>Personas dentro de rango a las que se les envió mensaje</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.contactados.length > 0 ? (
                <div className="space-y-2">
                  {personas.contactados.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50">
                      <div className="flex-1">
                        <p className="font-medium">{persona.apellido_nombre}</p>
                        <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {persona.fecha_envio_whatsapp && (
                          <p>Enviado: {new Date(persona.fecha_envio_whatsapp).toLocaleDateString('es-AR')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay personas contactadas aún</p>
              )}
            </CardContent>
          </Card>

          {/* Sección 2: ❌ No Contactados */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <CardTitle>No Contactados</CardTitle>
                <Badge variant="secondary">{personas.noContactados.length}</Badge>
              </div>
              <CardDescription>Personas fuera del rango de distancia configurado ({campaign.distancia_max}m)</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.noContactados.length > 0 ? (
                <div className="space-y-2">
                  {personas.noContactados.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50">
                      <div className="flex-1">
                        <p className="font-medium">{persona.apellido_nombre}</p>
                        <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
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

          {/* Sección 3: 📞 Confirmados */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <CardTitle>Confirmados</CardTitle>
                <Badge variant="secondary">{personas.confirmados.length}</Badge>
              </div>
              <CardDescription>Personas que confirmaron que van a llevar el equipo</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.confirmados.length > 0 ? (
                <div className="space-y-2">
                  {personas.confirmados.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 bg-blue-50/50">
                      <div className="flex-1">
                        <p className="font-medium">{persona.apellido_nombre}</p>
                        <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                        {persona.respuesta_texto && (
                          <p className="text-sm text-blue-700 mt-1 italic">"{persona.respuesta_texto}"</p>
                        )}
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {persona.fecha_respuesta && (
                          <p>{new Date(persona.fecha_respuesta).toLocaleDateString('es-AR')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay confirmaciones aún</p>
              )}
            </CardContent>
          </Card>

          {/* Sección 4: ⏳ Sin Respuesta / En Progreso */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                <CardTitle>Sin Respuesta / En Progreso</CardTitle>
                <Badge variant="secondary">{personas.enProgreso.length}</Badge>
              </div>
              <CardDescription>Personas pendientes de envío o sin respuesta todavía</CardDescription>
            </CardHeader>
            <CardContent>
              {personas.enProgreso.length > 0 ? (
                <div className="space-y-2">
                  {personas.enProgreso.map((persona) => (
                    <div key={persona.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50">
                      <div className="flex-1">
                        <p className="font-medium">{persona.apellido_nombre}</p>
                        <p className="text-sm text-muted-foreground">{persona.telefono_principal}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="capitalize">
                          {persona.estado_contacto === 'pendiente' && 'Pendiente'}
                          {persona.estado_contacto === 'encolado' && 'Encolado'}
                          {persona.estado_contacto === 'respondio' && 'Respondió'}
                          {persona.estado_contacto === 'no_responde' && 'No responde'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No hay personas en progreso</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
