export interface RetellCall {
  event: "call_started" | "call_ended" | "call_analyzed";
  call: Call;
}

export interface Call {
  call_id: string;
  call_type: string;
  agent_id: string;
  agent_version: number;
  agent_name: string;
  retell_llm_dynamic_variables: RetellLlmDynamicVariables;
  call_status: string;
  start_timestamp: number;
  end_timestamp: number;
  duration_ms: number;
  transcript: string;
  transcript_object: Transcript[];
  transcript_with_tool_calls: Transcript[];
  knowledge_base_retrieved_contents_url: string;
  recording_url: string;
  recording_multi_channel_url: string;
  public_log_url: string;
  disconnection_reason: string;
  latency: { [key: string]: Latency };
  call_cost: CallCost;
  call_analysis: CallAnalysis;
  data_storage_setting: string;
  opt_in_signed_url: boolean;
  llm_token_usage: LlmTokenUsage;
  tool_calls: any[];
  access_token: string;
}

export interface CallAnalysis {
  call_summary: string;
  in_voicemail: boolean;
  user_sentiment: string;
  call_successful: boolean;
  custom_analysis_data: CustomAnalysisData;
}

export interface CustomAnalysisData {
  resultado: "contestada" | "no_contestada" | "ocupado" | "fallida";
  confirmado: boolean;
  solicita_retiro_domicilio: boolean;
  fecha_compromiso?: string;
  motivo_negativo?: string;
}

export interface CallCost {
  product_costs: ProductCost[];
  total_duration_unit_price: number;
  total_duration_seconds: number;
  combined_cost: number;
}

export interface ProductCost {
  product: string;
  unit_price: number;
  cost: number;
}

export interface Latency {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  num: number;
  values: number[];
}

export interface LlmTokenUsage {
  values: number[];
  average: number;
  num_requests: number;
}

export interface RetellLlmDynamicVariables {
  nombre_cliente: string;
  direccion_cliente: string;
  cantidad_decos: string;
  texto_decos: string;
  nros_orden: string;
  punto_pickit: string;
  direccion_punto: string;
  horario_punto_pickit: string;
  nro_orden_1: string;
  nro_orden_2: string;
  persona_id: string;
}

export interface Transcript {
  role: Role;
  content: string;
  words: Word[];
  metadata?: Metadata;
}

export interface Metadata {
  response_id: number;
}

export enum Role {
  Agent = "agent",
  User = "user",
}

export interface Word {
  word: string;
  start: number;
  end: number;
}
