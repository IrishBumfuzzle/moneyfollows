/**
 * Provider-neutral port. Generators depend on this, never on a vendor, so tests
 * use a fake client and the provider can change without touching prompts.
 */
export interface LlmRequest {
  system: string;
  prompt: string;
  /** When set, the provider is asked for JSON matching this schema. Callers still validate with zod. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
