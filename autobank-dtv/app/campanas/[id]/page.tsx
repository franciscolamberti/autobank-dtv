import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Redirect if someone tries to access /campanas/nueva through the dynamic route
  if (id === "nueva") {
    redirect("/campanas/nueva")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
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
                <h1 className="text-xl font-semibold text-foreground">Detalle de Campaña</h1>
                <p className="text-sm text-muted-foreground">Recupero DTV - Enero 2025</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Campaña creada exitosamente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">La página de detalle completa se implementará en la siguiente fase.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
