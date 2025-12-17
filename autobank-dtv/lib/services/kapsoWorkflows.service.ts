import { KAPSO_WORKFLOW_IDS } from "../constants/kapso.constants";
import { Kapso } from "../integrations/kapso";
import {
  PersonaWithPickit,
  updatePersonaKapsoTracking,
} from "../repositories/personas.repository";
import { Logger } from "../utils/logger";

function buildPickitVariables(
  persona: PersonaWithPickit
): Record<string, string> {
  const cantidadDecos = persona.cantidad_decos ?? 1;
  const nrosWO = persona.nros_wo?.length
    ? persona.nros_wo
    : persona.nro_wo
    ? [persona.nro_wo]
    : [];

  const textoDeco =
    cantidadDecos === 1 ? "el decodificador" : "los decodificadores";
  const nrosWOStr = nrosWO.join(", ");

  return {
    nombre_cliente: persona.apellido_nombre || "",
    nro_cliente: persona.nro_cliente || "",
    nros_cliente: nrosWOStr,
    cantidad_decos: String(cantidadDecos),
    texto_deco: textoDeco,
    punto_pickit: persona.punto_pickit?.nombre || "N/A",
    direccion_punto: persona.punto_pickit?.direccion || "N/A",
    distancia:
      persona.distancia_metros != null
        ? `${Math.round(persona.distancia_metros)} metros`
        : "",
    persona_id: persona.id!,
    horarios_punto: persona.punto_pickit?.horario || "N/A",
  };
}

export async function startPickitWorkflowForPersona(
  persona: PersonaWithPickit,
  logger: Logger
) {
  const variables = buildPickitVariables(persona);

  const data = await Kapso.executeWorkflow(
    KAPSO_WORKFLOW_IDS.PICKIT_CONTACTO_INICIAL,
    persona.telefono_principal!,
    variables,
    {
      campana_id: persona.campana_id!,
      persona_id: persona.id!,
    }
  );

  const trackingId: string | undefined = data?.data?.id;

  if (!trackingId) {
    logger.warn("Workflow started but no tracking_id returned", {
      personaId: persona.id,
    });

    return;
  }

  await updatePersonaKapsoTracking(persona.id!, trackingId, logger);

  logger.info("Started initial Pickit workflow for persona", {
    personaId: persona.id,
    workflowId: KAPSO_WORKFLOW_IDS.PICKIT_CONTACTO_INICIAL,
    trackingId,
  });
}
