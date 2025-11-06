"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Activity, Clock, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase, Tables } from "@/lib/supabase"

export default function DashboardPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Tables<'campanas'>[]>([])
  const [stats, setStats] = useState({ activeCampaigns: 0, totalPending: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // obtener campañas
      const { data: campaigns, error: campaignsError } = await supabase
        .from('campanas')
        .select('*')
        .order('created_at', { ascending: false })

      if (campaignsError) {
        console.error('error cargando campañas:', campaignsError)
        return
      }

      setCampaigns(campaigns || [])

      // calcular stats simples
      const activeCampaigns = campaigns?.filter(c => c.estado === 'activa').length || 0
      
      // total de personas pendientes (dentro de rango y pendientes/encoladas)
      const { count: totalPending } = await supabase
        .from('personas_contactar')
        .select('*', { count: 'exact', head: true })
        .eq('dentro_rango', true)
        .in('estado_contacto', ['pendiente', 'encolado'])

      setStats({
        activeCampaigns,
        totalPending: totalPending || 0
      })
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      activa: { label: "activa", className: "bg-green-500/10 text-green-700 hover:bg-green-500/20" },
      pausada: { label: "pausada", className: "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20" },
      finalizada: { label: "finalizada", className: "bg-gray-500/10 text-gray-700 hover:bg-gray-500/20" },
    }
    const variant = variants[status] || variants.activa
    return <Badge className={variant.className}>{variant.label}</Badge>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando dashboard...</p>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Autobank</h1>
                <p className="text-sm text-muted-foreground">Recupero DTV</p>
              </div>
            </div>
            <Link href="/campanas/nueva">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Nueva Campaña
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Stats Cards - Simplificado */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Campañas Activas</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.activeCampaigns}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Personas Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.totalPending}</div>
              <p className="text-xs text-muted-foreground mt-1">Dentro de rango y listas para contactar</p>
            </CardContent>
          </Card>
        </div>

        {/* Campaigns Table - Simplificado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Campañas</CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Fecha Creación</TableHead>
                    <TableHead className="text-right">Total Personas</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow 
                      key={campaign.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/campanas/${campaign.id}`)}
                    >
                      <TableCell className="font-medium">{campaign.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(campaign.created_at).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">{campaign.total_personas}</TableCell>
                      <TableCell>{getStatusBadge(campaign.estado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No hay campañas todavía</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  Comenzá creando tu primera campaña de recupero DTV
                </p>
                <Link href="/campanas/nueva">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Crear Primera Campaña
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
