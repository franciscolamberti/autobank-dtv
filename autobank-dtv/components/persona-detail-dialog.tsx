"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase, Tables } from "@/lib/supabase";
import { formatDateTimeArgentina, formatDuration, formatIsoDateToDmy } from "@/lib/utils/date";
import { Phone, MessageSquare } from "lucide-react";
import type { KapsoMessage } from "@/lib/types/kapso.types";

type Persona = Tables<"personas_contactar">;
type Llamada = Tables<"llamadas">;

interface PersonaDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona: Persona | null;
}

// Componente para el reproductor de audio inline con controles HTML5
function AudioPlayer({ url }: { url: string }) {
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef) {
        audioRef.pause();
        audioRef.src = "";
      }
    };
  }, [audioRef]);

  if (!url) {
    return <span className="text-muted-foreground text-sm">Sin audio</span>;
  }

  return (
    <div className="flex items-center gap-2 w-full min-w-[250px]">
      <audio
        ref={setAudioRef}
        src={url}
        preload="metadata"
        controls
        className="w-full h-8"
      >
        Tu navegador no soporta el elemento de audio.
      </audio>
    </div>
  );
}

// Función para obtener el badge de resultado con color según especificaciones
function ResultadoBadge({ resultado }: { resultado: string | null }) {
  if (!resultado) {
    return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">Sin resultado</Badge>;
  }

  // Colores según especificaciones:
  // contestada → Verde
  // no_contestada → Amarillo
  // ocupado → Naranja
  // fallida → Rojo
  const colors: Record<string, string> = {
    contestada: "bg-green-500/10 text-green-700 border-green-500/20",
    no_contestada: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    ocupado: "bg-orange-500/10 text-orange-700 border-orange-500/20",
    fallida: "bg-red-500/10 text-red-700 border-red-500/20",
  };

  const colorClass = colors[resultado] || "bg-gray-100 text-gray-800 border-gray-200";

  // Capitalizar y formatear el texto del resultado
  const formatResultado = (resultado: string): string => {
    return resultado
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <Badge variant="outline" className={colorClass}>
      {formatResultado(resultado)}
    </Badge>
  );
}

// Tab de Llamadas
function LlamadasTab({ personaId, personaConfirmado, personaFechaCompromiso }: { personaId: string; personaConfirmado: boolean; personaFechaCompromiso: string | null }) {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personaId) return;

    const loadLlamadas = async () => {
      try {
        const { data, error } = await supabase
          .from("llamadas")
          .select("*")
          .eq("persona_id", personaId)
          .order("fecha_llamada", { ascending: false });

        if (error) throw error;
        setLlamadas(data || []);
        setLoading(false);
      } catch (error) {
        console.error("Error loading llamadas:", error);
        setLoading(false);
      }
    };

    loadLlamadas();

    // Suscripción en tiempo real
    const channel = supabase
      .channel(`llamadas-${personaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "llamadas",
          filter: `persona_id=eq.${personaId}`,
        },
        () => {
          loadLlamadas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [personaId]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando...</div>;
  }

  if (llamadas.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay llamadas registradas para esta persona
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">Fecha/Hora</TableHead>
              <TableHead className="min-w-[80px]">Duración</TableHead>
              <TableHead className="min-w-[120px]">Resultado</TableHead>
              <TableHead className="min-w-[100px]">Confirmado</TableHead>
              <TableHead className="min-w-[120px]">Fecha Compromiso</TableHead>
              <TableHead className="min-w-[250px]">Audio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {llamadas.map((llamada) => (
              <TableRow key={llamada.id}>
                <TableCell className="font-medium text-sm whitespace-nowrap">
                  {formatDateTimeArgentina(llamada.fecha_llamada)}
                </TableCell>
                <TableCell className="text-sm font-mono whitespace-nowrap">
                  {formatDuration(llamada.duracion_segundos)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <ResultadoBadge resultado={llamada.resultado} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {personaConfirmado ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                      Sí
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                      No
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {personaFechaCompromiso ? (
                    <span className="font-medium">{formatIsoDateToDmy(personaFechaCompromiso)}</span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <AudioPlayer url={llamada.recording_url} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Tab de Mensajes
function MensajesTab({ personaId }: { personaId: string }) {
  const [messages, setMessages] = useState<KapsoMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personaId) return;

    const loadMessages = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/personas/${personaId}/messages`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 404) {
            setError(errorData.message || "No hay mensajes disponibles");
          } else {
            setError("Error al cargar los mensajes");
          }
          setMessages([]);
          setLoading(false);
          return;
        }

        const data = await response.json();
        // The API returns an array of messages directly
        setMessages(Array.isArray(data) ? data : []);
        setLoading(false);
      } catch (error) {
        console.error("Error loading messages:", error);
        setError("Error al cargar los mensajes");
        setLoading(false);
      }
    };

    loadMessages();
  }, [personaId]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando mensajes...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {error}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay mensajes disponibles para esta persona
      </div>
    );
  }

  const formatMessageTime = (timestamp: string) => {
    try {
      const date = new Date(parseInt(timestamp) * 1000);
      return date.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const formatMessageDate = (timestamp: string) => {
    try {
      const date = new Date(parseInt(timestamp) * 1000);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return "Hoy";
      } else if (date.toDateString() === yesterday.toDateString()) {
        return "Ayer";
      } else {
        return date.toLocaleDateString("es-AR", {
          day: "numeric",
          month: "long",
        });
      }
    } catch {
      return "";
    }
  };

  const getMessageContent = (message: KapsoMessage): string => {
    if (message.text?.body) return message.text.body;
    if (message.kapso?.content) return message.kapso.content;
    
    switch (message.type) {
      case "image":
        return message.image?.caption || "📷 Imagen";
      case "video":
        return message.video?.caption || "🎥 Video";
      case "audio":
        return "🎵 Audio";
      case "document":
        return message.document?.filename || "📄 Documento";
      case "location":
        return message.location?.name || "📍 Ubicación";
      case "sticker":
        return "😊 Sticker";
      case "interactive":
        if (message.interactive?.button_reply) {
          return `🔘 ${message.interactive.button_reply.title}`;
        }
        if (message.interactive?.list_reply) {
          return `📋 ${message.interactive.list_reply.title}`;
        }
        return "💬 Mensaje interactivo";
      case "template":
        return "📋 Plantilla";
      case "reaction":
        return `👍 ${message.reaction?.emoji || "Reacción"}`;
      default:
        return `Mensaje tipo: ${message.type}`;
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((acc, message) => {
    const date = formatMessageDate(message.timestamp);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(message);
    return acc;
  }, {} as Record<string, KapsoMessage[]>);

  return (
    <div className="flex flex-col h-[600px] bg-gray-50 rounded-lg border overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            <div className="flex items-center justify-center my-4">
              <div className="bg-white px-3 py-1 rounded-full text-xs text-muted-foreground border">
                {date}
              </div>
            </div>
            {dateMessages.map((message) => {
              const isInbound = message.kapso?.direction === "inbound";
              const status = message.kapso?.status;
              const hasMedia = message.kapso?.has_media;

              return (
                <div
                  key={message.id}
                  className={`flex mb-2 ${
                    isInbound ? "justify-start" : "justify-end"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
                      isInbound
                        ? "bg-white rounded-tl-none border border-gray-200"
                        : "bg-blue-500 text-white rounded-tr-none"
                    }`}
                  >
                    {hasMedia && message.kapso?.media_url && (
                      <div className="mb-2">
                        <a
                          href={message.kapso.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-sm underline ${
                            isInbound ? "text-blue-600" : "text-blue-100"
                          }`}
                        >
                          📎 Ver archivo adjunto
                        </a>
                      </div>
                    )}
                    <p
                      className={`text-sm whitespace-pre-wrap break-words ${
                        isInbound ? "text-gray-900" : "text-white"
                      }`}
                    >
                      {getMessageContent(message)}
                    </p>
                    <div
                      className={`flex items-center justify-end gap-1 mt-1 ${
                        isInbound ? "text-gray-500" : "text-blue-100"
                      }`}
                    >
                      <span className="text-xs">
                        {formatMessageTime(message.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// Tab de Información General
function InfoTab({ persona }: { persona: Persona }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Nombre</p>
          <p className="mt-1 text-sm font-semibold">{persona.apellido_nombre}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Teléfono</p>
          <p className="mt-1 text-sm">{persona.telefono_principal}</p>
        </div>
        {persona.dni && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">DNI</p>
            <p className="mt-1 text-sm">{persona.dni}</p>
          </div>
        )}
        {persona.nro_cliente && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Nro. Cliente</p>
            <p className="mt-1 text-sm">{persona.nro_cliente}</p>
          </div>
        )}
        {persona.direccion_completa && (
          <div className="col-span-2">
            <p className="text-sm font-medium text-muted-foreground">Dirección</p>
            <p className="mt-1 text-sm">{persona.direccion_completa}</p>
          </div>
        )}
        {persona.cantidad_decos && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Cantidad Decos</p>
            <p className="mt-1 text-sm">{persona.cantidad_decos}</p>
          </div>
        )}
        {persona.distancia_metros && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Distancia (metros)</p>
            <p className="mt-1 text-sm">{Math.round(persona.distancia_metros)} m</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PersonaDetailDialog({
  open,
  onOpenChange,
  persona,
}: PersonaDetailDialogProps) {
  if (!persona) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-y-auto min-w-[75vw]">
        <DialogHeader>
          <DialogTitle>{persona.apellido_nombre}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="llamadas">
              <Phone className="h-4 w-4 mr-2" />
              Llamadas
            </TabsTrigger>
            <TabsTrigger value="mensajes">
              <MessageSquare className="h-4 w-4 mr-2" />
              Mensajes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <InfoTab persona={persona} />
          </TabsContent>

          <TabsContent value="llamadas" className="mt-4">
            <LlamadasTab 
              personaId={persona.id} 
              personaConfirmado={persona.estado_contacto === "confirmado"}
              personaFechaCompromiso={persona.fecha_compromiso}
            />
          </TabsContent>

          <TabsContent value="mensajes" className="mt-4">
            <MensajesTab personaId={persona.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}



