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
    baseUrl: 'https://api.openai.com',
    modelsEndpoint: '/v1/models',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    modelsEndpoint: '/v1/models',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    modelsEndpoint: '/v1/models',
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

      if (provider === 'openai' || provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else if (provider === 'gemini') {
        // Gemini uses API key as query parameter
        const urlWithKey = `${url}?key=${apiKey}`;
        const response = await fetch(urlWithKey, { headers });
        const data = await response.json();
        return this.parseGeminiModels(data);
      }

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return this.parseModels(data, provider);
    } catch (error) {
      console.error('Error fetching models:', error);
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

  private static parseGeminiModels(data: any): Model[] {
    if (!data || !Array.isArray(data.models)) {
      return this.getDefaultModels('gemini');
    }

    return data.models
      .filter((model: any) => model.name && model.name.includes('generateContent'))
      .map((model: any) => ({
        id: model.name.replace('models/', ''),
        name: model.displayName || model.name.replace('models/', ''),
        provider: 'gemini',
      }));
  }

  static getDefaultModels(provider: string): Model[] {
    switch (provider) {
      case 'openai':
        return [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider },
          { id: 'gpt-4o', name: 'GPT-4o', provider },
          { id: 'gpt-4.1', name: 'GPT-4.1', provider },
        ];
      case 'gemini':
        return [
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider },
          { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider },
        ];
      case 'openrouter':
        return [
          { id: 'openai/gpt-4o', name: 'GPT-4o', provider },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider },
          { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash (Preview)', provider },
          { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro (Preview)', provider },
          { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider },
          { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider },
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
    onDelta,
    onComplete,
    onError,
  }: {
    provider: string;
    apiKey: string;
    model: string;
    messages: { role: string; content: string }[];
    customEndpoint?: string;
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
    const url = `${baseUrl}/v1/chat/completions`; // Common endpoint for OpenAI-compatible APIs

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
      });

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
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
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices[0]?.delta?.content;
            if (delta) {
              onDelta(delta);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during chat completion:', error);
      onError(error as Error);
    } finally {
      onComplete();
    }
  }
} 