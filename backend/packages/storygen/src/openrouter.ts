import type { LlmClient, LlmRequest, LlmResponse } from './llm';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

interface ChatCompletion {
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/** OpenRouter speaks the OpenAI chat-completions format. */
export function createOpenRouterClient(config: OpenRouterConfig): LlmClient {
  const baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');

  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Paisa Path content studio',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          response_format: request.jsonSchema
            ? { type: 'json_schema', json_schema: { ...request.jsonSchema, strict: true } }
            : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 500)}`);
      }
      const data = (await res.json()) as ChatCompletion;
      const text = data.choices[0]?.message.content;
      if (!text) throw new Error('OpenRouter returned no content');

      return {
        text,
        model: data.model,
        usage: data.usage && {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        },
      };
    },
  };
}
