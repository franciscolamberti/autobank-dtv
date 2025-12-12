import {
  KapsoListMessagesResult,
  KapsoMessagesResponse,
  KapsoWorkflowExecution,
  KapsoWorkflowExecutionResponse,
} from "@/lib/types/kapso.types";
import { kapsoClient } from "./client";

export class Kapso {
  private static readonly phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;

  static async getWorkflowExecution(
    executionId: string
  ): Promise<KapsoWorkflowExecution> {
    console.log({ executionId });
    const { data } = await kapsoClient.get<KapsoWorkflowExecutionResponse>(
      `/platform/v1/workflow_executions/${executionId}`
    );

    return data.data;
  }

  static async listAllMessages(
    conversationId: string
  ): Promise<KapsoListMessagesResult> {
    const allMessages: KapsoMessagesResponse["data"] = [];
    let nextCursor: string | undefined = undefined;

    do {
      const queryParams = new URLSearchParams({
        conversation_id: conversationId,
        limit: "100",
        fields:
          "kapso(direction,status,processing_status,phone_number,has_media,whatsapp_conversation_id,contact_name,content)",
      });

      if (nextCursor) {
        queryParams.set("after", nextCursor);
      }

      const { data } = await kapsoClient.get<KapsoMessagesResponse>(
        `/meta/whatsapp/v24.0/${
          this.phoneNumberId
        }/messages?${queryParams.toString()}`
      );

      const messages = data.data || [];
      allMessages.push(...messages);

      nextCursor = data.paging?.cursors?.after;
    } while (nextCursor);

    return {
      messages: allMessages,
      total: allMessages.length,
    };
  }

  static async executeWorkflow(
    workflowId: string,
    phoneNumber: string,
    variables: Record<string, string>
  ) {
    const { data } = await kapsoClient.post(
      `/platform/v1/workflows/${workflowId}/executions`,
      {
        workflow_execution: {
          phone_number: phoneNumber,
          phone_number_id: this.phoneNumberId,
          variables,
        },
      }
    );

    return data;
  }
}
