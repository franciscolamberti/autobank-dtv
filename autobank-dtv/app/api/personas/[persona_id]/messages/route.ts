import { Kapso } from "@/lib/integrations/kapso";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ persona_id: string }> }
) {
  try {
    // Step 1: Extract persona_id from params
    const { persona_id: personaId } = await params;

    // Step 2: Retrieve persona from database
    const { data: persona, error: personaError } = await supabase
      .from("personas_contactar")
      .select("id, kapso_tracking_id, campana_id, telefono_principal")
      .eq("id", personaId)
      .maybeSingle();

    if (personaError || !persona) {
      console.error(
        `[api/personas/messages] Persona not found: ${personaId}`,
        personaError || "Unexpected error"
      );

      return NextResponse.json(
        { error: "Persona no encontrada" },
        { status: 404 }
      );
    }

    // Step 3: Validate kapso_tracking_id
    if (!persona.kapso_tracking_id) {
      return NextResponse.json(
        {
          error: "No kapso_tracking_id found",
          message: "Esta persona todavía no recibió un mensaje de WhatsApp",
        },
        { status: 404 }
      );
    }

    // Step 5: Get workflow execution
    const { whatsapp_conversation_id: conversationId } =
      await Kapso.getWorkflowExecution(persona.kapso_tracking_id);

    if (!conversationId) {
      return NextResponse.json(
        {
          error: "Conversation ID not found",
          message:
            "The workflow execution does not contain a whatsapp_conversation_id",
        },
        { status: 404 }
      );
    }

    const { messages = [] } = await Kapso.listAllMessages(conversationId);

    return NextResponse.json(messages);
  } catch (error) {
    console.error("[api/personas/messages] Error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
