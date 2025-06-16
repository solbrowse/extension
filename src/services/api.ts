export interface Model {
  id: string;
  name: string;
  provider: string;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  modelsEndpoint: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelsEndpoint: '/models',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsEndpoint: '/models',
  },
  {
    id: 'custom',
    name: 'Custom Endpoint',
    baseUrl: '',
    modelsEndpoint: '/models',
  },
];

export class ApiService {
  static async fetchModels(provider: string, apiKey: string, customEndpoint?: string): Promise<Model[]> {
    const providerConfig = PROVIDERS.find(p => p.id === provider);
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const baseUrl = provider === 'custom' && customEndpoint ? customEndpoint : providerConfig.baseUrl;
    const url = `${baseUrl}${providerConfig.modelsEndpoint}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (provider !== 'custom') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Sol API: Fetch models error for ${provider}:`, response.status, errorText);
        throw new Error(`API error for ${provider}: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return this.parseModels(data, provider);
    } catch (error) {
      console.error(`Error fetching models for ${provider}:`, error);
      return this.getDefaultModels(provider);
    }
  }

  private static parseModels(data: any, provider: string): Model[] {
    if (!data || !Array.isArray(data.data)) {
      return this.getDefaultModels(provider);
    }

    return data.data
      .filter((model: any) => model.id && !model.id.includes('whisper') && !model.id.includes('tts'))
      .map((model: any) => ({
        id: model.id,
        name: model.id,
        provider,
      }))
      .sort((a: Model, b: Model) => a.name.localeCompare(b.name));
  }

  static getDefaultModels(provider: string): Model[] {
    switch (provider) {
      case 'openai':
        return [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider },
          { id: 'gpt-4o', name: 'GPT-4o', provider },
        ];
      case 'gemini':
        return [
          { id: 'models/gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash (Preview 05/20)', provider },
          { id: 'models/gemini-2.5-pro-preview-06-05', name: 'Gemini 2.5 Pro (Preview 06/05)', provider }
        ];
      case 'openrouter':
        return [
          { id: 'openai/gpt-4o', name: 'GPT-4o', provider },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider },
          { id: 'google/gemini-flash-2.5-preview', name: 'Gemini 2.5 Flash (Preview)', provider },
          { id: 'google/gemini-pro-2.5-preview', name: 'Gemini 2.5 Pro (Preview)', provider },
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider },
        ];
      default:
        return [];
    }
  }

  static async streamChatCompletion({
    provider,
    apiKey,
    model,
    messages,
    customEndpoint,
    abortSignal,
    onDelta,
    onComplete,
    onError,
  }: {
    provider: string;
    apiKey: string;
    model: string;
    messages: { role: string; content: string }[];
    customEndpoint?: string;
    abortSignal: AbortSignal;
    onDelta: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    const providerConfig = PROVIDERS.find(p => p.id === provider);
    if (!providerConfig) {
      onError(new Error(`Unsupported provider: ${provider}`));
      return;
    }

    const baseUrl = provider === 'custom' && customEndpoint ? customEndpoint : providerConfig.baseUrl;

    try {
      console.log(`Sol API: Starting stream completion for provider: ${provider}, model: ${model}`);
      
      await this.streamOpenAICompletion({
        baseUrl,
        apiKey,
        model,
        messages,
        abortSignal,
        onDelta,
        onComplete,
        onError,
      });
    } catch (error) {
      console.error(`Sol API: Error during ${provider} chat completion:`, error);
      onError(error as Error);
    }
  }

  private static async streamOpenAICompletion({
    baseUrl,
    apiKey,
    model,
    messages,
    abortSignal,
    onDelta,
    onComplete,
    onError,
  }: {
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: { role: string; content: string }[];
    abortSignal: AbortSignal;
    onDelta: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    const url = `${baseUrl}/chat/completions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Sol API: OpenAI-compatible API error response:`, errorText);
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (abortSignal.aborted) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: [DONE]')) {
            break;
          }
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                onDelta(delta);
              }
            } catch (parseError) {
              console.warn('Failed to parse response chunk:', parseError, 'Line:', line);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Sol API: Error in streamOpenAICompletion:', error);
        onError(error as Error);
      }
    } finally {
      onComplete();
    }
  }
} 