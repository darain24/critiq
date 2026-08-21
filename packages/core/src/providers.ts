import type { ReviewLLMClient } from './types.js';

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
  }
}

interface ProviderOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  baseUrl?: string;
}

abstract class OpenAICompatibleProvider implements ReviewLLMClient {
  protected abstract readonly providerName: string;
  protected abstract readonly defaultModel: string;
  protected abstract readonly defaultBaseUrl: string;

  constructor(protected readonly options: ProviderOptions) {}

  async review(prompt: string): Promise<string> {
    const response = await requestWithTimeout(
      `${this.options.baseUrl ?? this.defaultBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model ?? this.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        }),
      },
      this.options.timeoutMs,
      this.providerName,
    );
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new ProviderError(this.providerName, 'response contained no text', false);
    return content;
  }
}

export class GroqProvider extends OpenAICompatibleProvider {
  protected readonly providerName = 'Groq';
  protected readonly defaultModel = 'openai/gpt-oss-120b';
  protected readonly defaultBaseUrl = 'https://api.groq.com/openai/v1';
}

export class CerebrasProvider extends OpenAICompatibleProvider {
  protected readonly providerName = 'Cerebras';
  protected readonly defaultModel = 'llama-3.3-70b';
  protected readonly defaultBaseUrl = 'https://api.cerebras.ai/v1';
}

export class GeminiProvider implements ReviewLLMClient {
  constructor(private readonly options: ProviderOptions) {}

  async review(prompt: string): Promise<string> {
    const model = this.options.model ?? 'gemini-2.0-flash';
    const baseUrl = this.options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const response = await requestWithTimeout(
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.options.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      },
      this.options.timeoutMs,
      'Gemini',
    );
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new ProviderError('Gemini', 'response contained no text', false);
    return content;
  }
}

export class FallbackLLMClient implements ReviewLLMClient {
  constructor(
    private readonly providers: Array<{ name: string; client: ReviewLLMClient }>,
    private readonly logger: Pick<Console, 'warn'> = console,
  ) {
    if (providers.length === 0)
      throw new Error('No LLM providers are configured. Add at least one API key.');
  }

  async review(prompt: string): Promise<string> {
    for (const [index, provider] of this.providers.entries()) {
      try {
        return await provider.client.review(prompt);
      } catch (error) {
        const retryable = error instanceof ProviderError && error.retryable;
        const hasNext = index < this.providers.length - 1;
        this.logger.warn(
          `${provider.name} review failed: ${errorMessage(error)}.${retryable && hasNext ? ` Trying ${this.providers[index + 1]?.name}.` : ''}`,
        );
        if (!retryable || !hasNext) throw error;
      }
    }
    throw new Error('Every configured LLM provider failed.');
  }
}

export function createLLMClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  preferredProvider: 'auto' | 'groq' | 'cerebras' | 'gemini' = 'auto',
): ReviewLLMClient {
  const available = {
    groq: env.GROQ_API_KEY ? new GroqProvider({ apiKey: env.GROQ_API_KEY }) : undefined,
    cerebras: env.CEREBRAS_API_KEY
      ? new CerebrasProvider({ apiKey: env.CEREBRAS_API_KEY })
      : undefined,
    gemini: env.GEMINI_API_KEY ? new GeminiProvider({ apiKey: env.GEMINI_API_KEY }) : undefined,
  };
  const order =
    preferredProvider === 'auto'
      ? (['groq', 'cerebras', 'gemini'] as const)
      : ([preferredProvider] as const);
  const providers = order.flatMap((name) =>
    available[name] ? [{ name, client: available[name] }] : [],
  ) as Array<{ name: string; client: ReviewLLMClient }>;
  if (providers.length === 0) {
    throw new Error(
      `No ${preferredProvider === 'auto' ? '' : `${preferredProvider} `}LLM API key is configured. Set GROQ_API_KEY, CEREBRAS_API_KEY, or GEMINI_API_KEY.`,
    );
  }
  return new FallbackLLMClient(providers);
}

async function requestWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
  provider: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new ProviderError(
        provider,
        `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status === 429,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError(provider, `timed out after ${timeoutMs}ms`, true);
    }
    throw new ProviderError(provider, errorMessage(error), false);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
