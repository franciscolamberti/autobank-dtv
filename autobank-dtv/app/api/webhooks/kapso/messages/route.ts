import { getPersonaWithPickitByTelefonoPrincipal } from "@/lib/repositories/personas.repository";
import { startPickitWorkflowForPersona } from "@/lib/services/kapsoWorkflows.service";
import { KapsoMessage } from "@/lib/types/kapso.types";
import { stringifyError } from "@/lib/utils/errors";
import { createLogger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

const logger = createLogger("kapso-messages-webhook");

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let payload: KapsoMessage;

    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      logger.error("Invalid JSON payload", {
        error: stringifyError(err),
      });

      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!payload.is_new_conversation) {
      logger.info("Ignoring Kapso webhook for existing conversation", {
        messageId: payload.message.id,
        conversationId: payload.conversation.id,
      });

      return NextResponse.json(
        {
          message: "Event ignored",
          reason: "not_new_conversation",
        },
        { status: 200 }
      );
    }

    const phoneNumber = payload.conversation.phone_number;

    logger.info("Incoming Kapso message", {
      messageId: payload.message.id,
      conversationId: payload.conversation.id,
      phoneNumber,
      isNewConversation: payload.is_new_conversation,
    });

    const persona = await getPersonaWithPickitByTelefonoPrincipal(
      phoneNumber,
      logger
    );

    if (!persona) {
      logger.warn("Persona not found for phone number", { phoneNumber });

      return NextResponse.json(
        { error: "Persona not found for phone number" },
        { status: 404 }
      );
    }

    try {
      await startPickitWorkflowForPersona(persona, logger);
    } catch (err) {
      logger.error("Error starting initial Pickit workflow", {
        personaId: persona.id,
        error: stringifyError(err),
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("Unexpected error in webhook handler", {
      error: stringifyError(error),
    });

    return NextResponse.json({
      error: "Internal server error",
      message: stringifyError(error),
    });
  }
}
