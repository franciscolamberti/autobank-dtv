/**
 * Kapso API Types
 * Based on OpenAPI specifications from Kapso documentation
 */

// ============================================================================
// Workflow Execution Types (from platform/v1 API)
// ============================================================================

export interface KapsoPaging {
  cursors: {
    before?: string;
    after?: string;
  };
}

export interface KapsoWorkflowReference {
  id: string;
  name: string;
  status: string;
}

export interface KapsoStepPosition {
  x: number;
  y: number;
}

export interface KapsoStepReference {
  id: string;
  identifier: string;
  stepable_type: string | null;
  position: KapsoStepPosition | null;
}

export interface KapsoExecutionContextVars {
  [key: string]: unknown;
}

export interface KapsoExecutionContextSystem {
  trigger_type: string;
  tracking_id: string;
  [key: string]: unknown;
}

export interface KapsoExecutionContextContext {
  channel: string;
  phone_number: string;
  [key: string]: unknown;
}

export interface KapsoExecutionContextMetadata {
  request?: {
    ip: string;
    user_agent: string;
    timestamp: string;
  };
  [key: string]: unknown;
}

export interface KapsoExecutionContext {
  vars: KapsoExecutionContextVars | null;
  system: KapsoExecutionContextSystem | null;
  context: KapsoExecutionContextContext | null;
  metadata: KapsoExecutionContextMetadata | null;
}

export interface KapsoWorkflowEvent {
  id: string;
  event_type: string;
  created_at: string;
  direction: string | null;
  edge_label: string | null;
  payload: Record<string, unknown>;
  step: KapsoStepReference;
}

export interface KapsoWorkflowExecution {
  id: string;
  status: "running" | "waiting" | "ended" | "failed" | "handoff";
  started_at: string;
  last_event_at: string;
  ended_at: string | null;
  tracking_id: string | null;
  whatsapp_conversation_id: string | null;
  workflow: KapsoWorkflowReference;
  current_step: KapsoStepReference | null;
  error_details: Record<string, unknown> | null;
  execution_context: KapsoExecutionContext;
  events: KapsoWorkflowEvent[];
}

export interface KapsoWorkflowExecutionResponse {
  data: KapsoWorkflowExecution;
}

// ============================================================================
// Messages Types (from meta/whatsapp API)
// ============================================================================

export interface KapsoMessageKapso {
  direction: "inbound" | "outbound";
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  processing_status: "pending" | "processing" | "completed" | "failed";
  phone_number: string;
  has_media: boolean;
  whatsapp_conversation_id: string;
  contact_name: string | null;
  content: string | null;
  media_data?: {
    url: string;
    filename: string;
    content_type: string;
    byte_size: number;
  };
  media_url?: string;
  message_type_data?: Record<string, unknown>;
  flow_response?: Record<string, unknown>;
  flow_token?: string;
  flow_name?: string;
  order_text?: string;
}

export interface KapsoMessage {
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "contacts"
    | "interactive"
    | "template"
    | "reaction";
  from: string;
  to?: string;
  text?: {
    body: string;
    preview_url?: boolean;
  };
  image?: {
    id?: string;
    link?: string;
    caption?: string;
    filename?: string;
  };
  video?: {
    id?: string;
    link?: string;
    caption?: string;
    filename?: string;
  };
  audio?: {
    id?: string;
    link?: string;
    voice?: boolean;
  };
  document?: {
    id?: string;
    link?: string;
    caption?: string;
    filename?: string;
  };
  sticker?: {
    id?: string;
    link?: string;
    mime_type?: string;
    animated?: boolean;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  interactive?: {
    type: "button_reply" | "list_reply" | "nfm_reply";
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
    nfm_reply?: {
      name: string;
      response_json: string;
      body: string;
    };
  };
  template?: Record<string, unknown>;
  reaction?: {
    message_id: string;
    emoji: string;
  };
  context?: {
    from?: string;
    id?: string;
    referred_product?: {
      catalog_id?: string;
      product_retailer_id?: string;
    };
  };
  kapso?: KapsoMessageKapso;
}

export interface KapsoMessagesResponse {
  data: KapsoMessage[];
  paging?: KapsoPaging;
}

export interface KapsoListMessagesResult {
  messages: KapsoMessage[];
  total: number;
}
