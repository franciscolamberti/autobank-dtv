import { supabase, Tables } from "../supabase";
import { Logger } from "../utils/logger";

export type PersonaWithPickit = Partial<Tables<"personas_contactar">> & {
  punto_pickit: Partial<Tables<"puntos_pickit">> | null;
};

export async function getPersonaWithPickitByTelefonoPrincipal(
  telefono: string,
  logger: Logger
): Promise<PersonaWithPickit | null> {
  const { data, error } = await supabase
    .from("personas_contactar")
    .select(
      `
        id,
        campana_id,
        apellido_nombre,
        telefono_principal,
        nro_cliente,
        nro_wo,
        nros_wo,
        cantidad_decos,
        distancia_metros,
        punto_pickit:puntos_pickit(id, nombre, direccion, horario)
      `
    )
    .eq("telefono_principal", telefono)
    .maybeSingle();

  if (error) {
    logger.error(
      "Error querying personas_contactar by telefono_principal",
      error
    );

    throw error;
  }

  return data || null;
}

export async function updatePersonaKapsoTracking(
  personaId: string,
  trackingId: string,
  logger: Logger
) {
  const { error } = await supabase
    .from("personas_contactar")
    .update({ kapso_tracking_id: trackingId })
    .eq("id", personaId);

  if (error) {
    logger.error("Failed to update kapso_tracking_id for persona", {
      personaId,
      error,
    });

    throw error;
  }
}
