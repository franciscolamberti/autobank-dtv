import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Activity, CheckCircle2, MapPin, MoreVertical, Plus, Search, Users } from "lucide-react"
import Link from "next/link"
import { supabase, type Campana } from "@/lib/supabase"

async function getDashboardData() {
  // obtener campañas
  const { data: campaigns, error: campaignsError } = await supabase
    .from('campanas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (campaignsError) {
    console.error('error cargando campañas:', campaignsError)
    return { campaigns: [], stats: { activeCampaigns: 0, contactedToday: 0, avgConfirmationRate: 0, pendingRecovery: 0 } }
  }

  // calcular stats
  const activeCampaigns = campaigns?.filter(c => c.estado === 'activa').length || 0
  
  // personas contactadas hoy
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: contactedToday } = await supabase
    .from('personas_contactar')
    .select('*', { count: 'exact', head: true })
    .gte('fecha_envio_whatsapp', today.toISOString())

  // tasa de confirmación promedio
  const { data: allPersonas } = await supabase
    .from('personas_contactar')
    .select('estado_contacto')
  
  const totalEnviados = allPersonas?.filter(p => 
    ['enviado_whatsapp', 'respondio', 'confirmado', 'rechazado'].includes(p.estado_contacto)
  ).length || 0
  
  const totalConfirmados = allPersonas?.filter(p => p.estado_contacto === 'confirmado').length || 0
  const avgConfirmationRate = totalEnviados > 0 ? (totalConfirmados / totalEnviados * 100) : 0

  // pendientes de recupero
  const { count: pendingRecovery } = await supabase
    .from('personas_contactar')
    .select('*', { count: 'exact', head: true })
    .eq('dentro_rango', true)
    .in('estado_contacto', ['pendiente', 'encolado'])

  return {
    campaigns: campaigns || [],
    stats: {
      activeCampaigns,
      contactedToday: contactedToday || 0,
      avgConfirmationRate: Math.round(avgConfirmationRate * 10) / 10,
      pendingRecovery: pendingRecovery || 0
    }
  }
}

export default async function DashboardPage() {
  const { campaigns, stats } = await getDashboardData()

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      activa: { label: "activa", className: "bg-green-500/10 text-green-700 hover:bg-green-500/20" },
      pausada: { label: "pausada", className: "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20" },
      finalizada: { label: "finalizada", className: "bg-gray-500/10 text-gray-700 hover:bg-gray-500/20" },
    }
    const variant = variants[status] || variants.activa
    return <Badge className={variant.className}>{variant.label}</Badge>
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
        {/* Stats Cards */}
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Contactados Hoy</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.contactedToday}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tasa de Confirmación</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.avgConfirmationRate}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendientes de Recupero</CardTitle>
              <MapPin className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stats.pendingRecovery}</div>
            </CardContent>
          </Card>
        </div>

        {/* Campaigns Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">Campañas Recientes</CardTitle>
              <div className="flex gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar campañas..." className="w-64 pl-9" />
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activas</SelectItem>
                    <SelectItem value="paused">Pausadas</SelectItem>
                    <SelectItem value="completed">Finalizadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {campaigns.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Fecha Creación</TableHead>
                    <TableHead className="text-right">Total Clientes</TableHead>
                    <TableHead className="text-right">Dentro Rango</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">{campaign.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(campaign.created_at).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">{campaign.total_personas}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-green-600 font-medium">{campaign.personas_dentro_rango}</span>
                        <span className="text-muted-foreground text-sm ml-1">
                          ({campaign.total_personas > 0 ? Math.round((campaign.personas_dentro_rango / campaign.total_personas) * 100) : 0}%)
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(campaign.estado)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/campanas/${campaign.id}`}>Ver detalle</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>Editar</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
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
