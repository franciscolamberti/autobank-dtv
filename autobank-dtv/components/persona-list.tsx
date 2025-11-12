import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Constants } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

interface PuntoPickitOption {
  id: string;
  label: string;
}

export interface PersonaBase {
  id: string;
  estado_contacto?: string | null;
  punto_pickit?: {
    id?: string;
    external_id?: number | null;
    nombre?: string | null;
    direccion?: string | null;
  } | null;
}

interface PersonaListProps<T extends PersonaBase> {
  personas: T[];
  renderItem: (persona: T) => React.ReactNode;
  emptyFilteredMessage?: string;
  puntosPickit: Array<{
    id: string;
    nombre: string | null;
    external_id: number | null;
    direccion?: string | null;
  }>;
}

export function PersonaList<T extends PersonaBase>({
  personas,
  renderItem,
  emptyFilteredMessage = "No hay resultados con los filtros seleccionados",
  puntosPickit,
}: PersonaListProps<T>) {
  const [selectedPickit, setSelectedPickit] = useState<string>("all");
  const [selectedEstado, setSelectedEstado] = useState<string>("all");

  const pickitOptions: PuntoPickitOption[] = useMemo(() => {
    return [
      { id: "none", label: "Sin punto Pickit" },
      ...puntosPickit.map((p) => ({
        id: p.id,
        label: `${p.nombre ?? "Sin nombre"}${
          p.external_id != null ? ` (${p.external_id})` : ""
        }`,
      })),
    ];
  }, [puntosPickit]);

  const estadoOptions = Constants.public.Enums.estado_contacto_enum;

  const anyFilterActive = selectedPickit !== "all" || selectedEstado !== "all";

  const clearFilters = () => {
    setSelectedPickit("all");
    setSelectedEstado("all");
  };

  const filtered = useMemo(() => {
    return personas.filter((p) => {
      const matchesPickit =
        selectedPickit === "all" ||
        (p.punto_pickit?.id ?? "none") === selectedPickit;
      const matchesEstado =
        selectedEstado === "all" ||
        (p.estado_contacto ?? "") === selectedEstado;
      return matchesPickit && matchesEstado;
    });
  }, [personas, selectedPickit, selectedEstado]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div className="w-full md:w-auto flex flex-col md:flex-row md:items-end gap-2">
            <section className="flex items-center gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Punto Pickit
                </Label>
                <Select
                  value={selectedPickit}
                  onValueChange={setSelectedPickit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Punto Pickit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los puntos</SelectItem>
                    {pickitOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Estado de contacto
                </Label>
                <Select
                  value={selectedEstado}
                  onValueChange={setSelectedEstado}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Estado de contacto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {estadoOptions.map((estado) => (
                      <SelectItem key={estado} value={estado}>
                        {estado.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>
          </div>
          <section className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!anyFilterActive}
              className="text-muted-foreground md:ml-1"
            >
              Limpiar filtros
            </Button>
            <div className="flex items-center md:justify-end">
              <span className="text-sm text-muted-foreground">
                {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
          </section>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((persona) => renderItem(persona))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">
            {emptyFilteredMessage}
          </p>
          {anyFilterActive && (
            <Button
              variant="link"
              className="text-blue-600 mt-1"
              onClick={clearFilters}
            >
              Quitar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
