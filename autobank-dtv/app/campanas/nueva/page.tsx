"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Activity, AlertCircle, ChevronDown, ChevronLeft, Clock, FileSpreadsheet, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

export default function NewCampaignPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState("")

  // Form state
  const [campaignName, setCampaignName] = useState("")
  const [maxDistance, setMaxDistance] = useState([2000])
  const [horarioInicio, setHorarioInicio] = useState("12:00")
  const [horarioFin, setHorarioFin] = useState("15:00")
  const [flowId, setFlowId] = useState("")
  const [whatsappConfigId, setWhatsappConfigId] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // validar tamaño (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "Archivo muy grande",
          description: "El archivo no puede superar los 50MB",
          variant: "destructive"
        })
        return
      }
      setSelectedFile(file)
    }
  }

  const handleCreateCampaign = async () => {
    if (!selectedFile) return
    
    setIsProcessing(true)
    setProcessingStatus("Creando campaña...")

    try {
      // 1. crear registro de campaña
      const { data: campana, error: campanaError } = await supabase
        .from('campanas')
        .insert({
          nombre: campaignName,
          distancia_max: maxDistance[0],
          horario_envio_inicio: horarioInicio,
          horario_envio_fin: horarioFin,
          archivo_url: '', // se actualizará después de subir archivo
          kapso_flow_id: flowId || null,
          kapso_whatsapp_config_id: whatsappConfigId || null,
          estado: 'activa'
        })
        .select()
        .single()

      if (campanaError) {
        throw new Error(`Error creando campaña: ${campanaError.message}`)
      }

      setProcessingStatus("Subiendo archivo...")

      // 2. subir archivo a storage
      const fileName = `${campana.id}/${selectedFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('archivos-dtv')
        .upload(fileName, selectedFile)

      if (uploadError) {
        throw new Error(`Error subiendo archivo: ${uploadError.message}`)
      }

      // 3. actualizar url del archivo
      await supabase
        .from('campanas')
        .update({ archivo_url: fileName })
        .eq('id', campana.id)

      setProcessingStatus("Procesando archivo Excel...")

      // 4. llamar edge function para procesar archivo
      const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke(
        'procesar-archivo',
        {
          body: {
            campana_id: campana.id,
            bucket: 'archivos-dtv',
            path: fileName
          }
        }
      )

      if (edgeFunctionError) {
        throw new Error(`Error procesando archivo: ${edgeFunctionError.message}`)
      }

      toast({
        title: "Campaña creada exitosamente",
        description: `${edgeFunctionData.total_personas} personas cargadas, ${edgeFunctionData.personas_dentro_rango} dentro del rango`
      })

      // redirigir a detalle de campaña
      router.push(`/campanas/${campana.id}`)

    } catch (error) {
      console.error('Error:', error)
      toast({
        title: "Error creando campaña",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive"
      })
      setIsProcessing(false)
    }
  }

  const steps = [
    { number: 1, title: "Configuración" },
    { number: 2, title: "Cargar Archivo" },
    { number: 3, title: "Confirmar" },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
                <h1 className="text-xl font-semibold text-foreground">Nueva Campaña de Recupero</h1>
                <p className="text-sm text-muted-foreground">Configurá y procesá tu campaña DTV</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Stepper */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-colors ${
                      currentStep >= step.number
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {step.number}
                  </div>
                  <span
                    className={`mt-2 text-sm font-medium ${
                      currentStep >= step.number ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-4 transition-colors ${
                      currentStep > step.number ? "bg-blue-600" : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Configuration */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuración de Campaña</CardTitle>
                <CardDescription>Definí los parámetros básicos de tu campaña de recupero</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Nombre de Campaña</Label>
                  <Input
                    id="campaign-name"
                    placeholder="Recupero DTV - Enero 2025"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Distancia Máxima a Punto Pickit</Label>
                    <div className="pt-2">
                      <Slider
                        value={maxDistance}
                        onValueChange={setMaxDistance}
                        min={500}
                        max={5000}
                        step={100}
                        className="w-full"
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">500m</span>
                      <Badge variant="secondary" className="font-mono">
                        {maxDistance[0]}m
                      </Badge>
                      <span className="text-muted-foreground">5000m</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Clientes dentro de esta distancia serán contactados</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Horario de Contacto</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="horario-inicio" className="text-sm text-muted-foreground">Hora Inicio</Label>
                      <Input
                        id="horario-inicio"
                        type="time"
                        value={horarioInicio}
                        onChange={(e) => setHorarioInicio(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="horario-fin" className="text-sm text-muted-foreground">Hora Fin</Label>
                      <Input
                        id="horario-fin"
                        type="time"
                        value={horarioFin}
                        onChange={(e) => setHorarioFin(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Los mensajes se enviarán automáticamente en este rango horario (zona horaria: Argentina)</p>
                </div>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <span>Configuración Avanzada (Opcional)</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="flow-id">Flow ID de Kapso</Label>
                      <Input
                        id="flow-id"
                        placeholder="Dejar vacío para usar valor por defecto"
                        value={flowId}
                        onChange={(e) => setFlowId(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-config">WhatsApp Config ID</Label>
                      <Input
                        id="whatsapp-config"
                        placeholder="Dejar vacío para usar valor por defecto"
                        value={whatsappConfigId}
                        onChange={(e) => setWhatsappConfigId(e.target.value)}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Si no se completa, se usarán los valores por defecto del sistema
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => setCurrentStep(2)}
                disabled={!campaignName}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Upload File */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cargar Archivo DTV</CardTitle>
                <CardDescription>Subí el archivo Excel con los datos de clientes a contactar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!selectedFile ? (
                  <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-blue-600 transition-colors cursor-pointer">
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-foreground font-medium mb-2">
                        Arrastrá el archivo Excel de DTV o hacé click para seleccionar
                      </p>
                      <p className="text-sm text-muted-foreground">Solo archivos .xlsx o .xls (máx. 50MB)</p>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                        <FileSpreadsheet className="h-6 w-6 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{selectedFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => setSelectedFile(null)}>
                        Cambiar archivo
                      </Button>
                    </div>
                  </div>
                )}

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    El archivo debe incluir: <strong>teléfono, nombre, ubicación (lat/lon), nro cliente</strong>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                Volver
              </Button>
              <Button
                onClick={() => setCurrentStep(3)}
                disabled={!selectedFile}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Confirmar y Procesar</CardTitle>
                <CardDescription>Revisá la configuración antes de crear la campaña</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Nombre de campaña:</span>
                    <span className="font-medium text-foreground">{campaignName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Distancia máxima:</span>
                    <span className="font-medium text-foreground">{maxDistance[0]}m</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Archivo seleccionado:</span>
                    <span className="font-medium text-foreground">{selectedFile?.name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Horario de envío:</span>
                    <span className="font-medium text-foreground">{horarioInicio} - {horarioFin} (Argentina)</span>
                  </div>
                  {flowId && (
                    <div className="flex justify-between py-2 border-b border-border">
                      <span className="text-muted-foreground">Flow ID:</span>
                      <span className="font-medium text-foreground font-mono text-sm">{flowId}</span>
                    </div>
                  )}
                </div>

                <Alert className="bg-yellow-500/10 border-yellow-500/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    El procesamiento puede tomar unos minutos dependiendo del tamaño del archivo
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                Volver
              </Button>
              <Button onClick={handleCreateCampaign} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
                {isProcessing ? "Procesando..." : "Crear Campaña y Procesar"}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-96">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-border border-t-blue-600" />
                <div>
                  <h3 className="font-semibold text-lg text-foreground mb-2">{processingStatus}</h3>
                  <p className="text-sm text-muted-foreground">Esto puede tomar unos momentos...</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
