import { KAPSO_WORKFLOW_IDS } from "@/lib/constants/kapso.constants";
import { Kapso } from "@/lib/integrations/kapso";
import { Database, supabase } from "@/lib/supabase";
import { RetellCall } from "@/lib/types/retell.types";
import { verifyWebhookSignature } from "@/lib/utils/retell";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const retellApiKey = process.env.RETELL_API_KEY;

    if (!retellApiKey) {
      console.error("[retell-webhook] RETELL_API_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const bodyText = await request.text();
    const signature = request.headers.get("x-retell-signature");

    if (!verifyWebhookSignature(bodyText, signature, retellApiKey)) {
      console.error("[retell-webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: RetellCall;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      console.error("[retell-webhook] Invalid JSON payload:", error);
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (payload.event !== "call_analyzed") {
      console.log(`[retell-webhook] Ignoring event: ${payload.event}`);
      return NextResponse.json({ message: "Event ignored" }, { status: 200 });
    }

    const { call } = payload;

    if (!call.call_id || !call.call_analysis) {
      console.error("[retell-webhook] Missing required call data");
      return NextResponse.json(
        { error: "Missing required call data" },
        { status: 400 }
      );
    }

    const { data: existingCall } = await supabase
      .from("llamadas")
      .select("id")
      .eq("external_id", call.call_id)
      .maybeSingle();

    if (existingCall) {
      console.log(
        `[retell-webhook] Call ${call.call_id} already exists, skipping`
      );
      return NextResponse.json(
        { message: "Call already processed" },
        { status: 200 }
      );
    }

    const personaId = call.retell_llm_dynamic_variables.persona_id;
    const { data: persona, error: personaError } = await supabase
      .from("personas_contactar")
      .select(
        `id, telefono_principal, nros_wo, nro_wo, cantidad_decos, punto_pickit:puntos_pickit(id, nombre, direccion, horario)`
      )
      .eq("id", personaId)
      .maybeSingle();

    if (personaError || !persona) {
      console.error(
        `[retell-webhook] Persona ${personaId} not found:`,
        personaError || "Unexpected error"
      );
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    const analysis = call.call_analysis;
    const customData = analysis.custom_analysis_data || {};

    const llamadaData: Database["public"]["Tables"]["llamadas"]["Insert"] = {
      persona_id: personaId,
      external_id: call.call_id,
      fecha_llamada: new Date(call.start_timestamp).toISOString(),
      duracion_segundos: Math.round(call.duration_ms / 1000),
      transcript: call.transcript || "",
      recording_url: call.recording_url || "",
      resultado: customData.resultado,
    };

    const { data: insertedCall, error: insertError } = await supabase
      .from("llamadas")
      .insert(llamadaData)
      .select()
      .single();

    if (insertError) {
      console.error(`[retell-webhook] Eror inserting llamada:`, insertError);

      return NextResponse.json(
        { error: "Failed to save call data", details: insertError.message },
        { status: 500 }
      );
    }

    const personaUpdateData: Database["public"]["Tables"]["personas_contactar"]["Update"] =
      {
        fecha_compromiso: customData.fecha_compromiso || null,
        solicita_retiro_domicilio:
          customData.solicita_retiro_domicilio ?? false,
        motivo_negativo: customData.motivo_negativo || null,
        fuente_confirmacion: "llamada",
      };

    if (customData.confirmado === true) {
      personaUpdateData.estado_contacto = "confirmado";

      const nrosWO = persona.nros_wo?.length
        ? persona.nros_wo
        : persona.nros_wo
        ? [persona.nro_wo]
        : [];

      const nrosOrden = nrosWO.join(", ");
      const cantidadDecos = persona.cantidad_decos ?? 1;
      const textoDeco =
        cantidadDecos === 1 ? "el decodificador" : "los decodificadores";

      try {
        const context = {
          nros_orden: nrosOrden,
          punto_pickit: persona.punto_pickit?.nombre || "N/A",
          direccion_punto: persona.punto_pickit?.direccion || "N/A",
          horarios_punto: persona.punto_pickit?.horario || "N/A",
          fecha_compromiso: customData.fecha_compromiso || "",
          texto_deco: textoDeco,
        };

        await Kapso.executeWorkflow(
          KAPSO_WORKFLOW_IDS.CONFIRMACION_LLAMADA,
          persona.telefono_principal,
          context
        );

        console.log(
          `[retell-webhook] Successfully triggered Kapso workflow ${KAPSO_WORKFLOW_IDS.CONFIRMACION_LLAMADA} for persona ${personaId} with payload ${JSON.stringify(context)}`
        );
      } catch (kapsoError) {
        console.error(
          `[retell-webhook] Failed to call Kapso workflow for persona ${personaId}:`,
          kapsoError instanceof Error ? kapsoError.message : String(kapsoError)
        );
      }
    }

    const { error: updatePersonaError } = await supabase
      .from("personas_contactar")
      .update(personaUpdateData)
      .eq("id", personaId);

    if (updatePersonaError) {
      console.error(
        `[retell-webhook] Error updating persona ${personaId}:`,
        updatePersonaError
      );
    }

    console.log(
      `[retell-webhook] Successfully saved call ${call.call_id} as llamada ${insertedCall.id}`
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[retell-webhook] Unexpected error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-retell-signature",
    },
  });
}
