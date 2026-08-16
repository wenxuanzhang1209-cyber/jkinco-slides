import type { AIProvider, AiRequest, AiResponse } from './types';

export class AiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export interface OpenAIClientOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAIClient implements AIProvider {
  id = 'openai';
  private opts: OpenAIClientOptions;

  constructor(opts: OpenAIClientOptions = {}) {
    this.opts = opts;
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const baseURL = this.opts.baseURL ?? 'https://api.openai.com/v1';
    const url = `${baseURL}/chat/completions`;
    const doFetch = this.opts.fetchImpl ?? fetch;

    const messages: Array<{ role: string; content: string }> = [];
    if (request.system !== undefined) messages.push({ role: 'system', content: request.system });
    messages.push({ role: 'user', content: request.prompt });

    const body: Record<string, unknown> = {
      model: this.opts.model ?? 'gpt-4o-mini',
      messages,
    };
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.apiKey !== undefined) headers.Authorization = `Bearer ${this.opts.apiKey}`;

    const response = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AiError(`OpenAI 请求失败: ${response.status}`, response.status);
    }

    const data = (await response.json()) as OpenAIResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    return { text, provider: this.id, task: request.task };
  }
}
