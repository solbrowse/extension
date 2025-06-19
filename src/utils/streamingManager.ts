import browser from 'webextension-polyfill';
import { Message } from '../services/storage';

export interface StreamingConfig {
  provider: string;
  apiKey: string;
  model: string;
  messages: any[];
  customEndpoint?: string;
}

export interface StreamingCallbacks {
  onDelta?: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: string) => void;
}

export class StreamingManager {
  private static activeStreams = new Map<string, AbortController>();
  private messageListener: ((request: any) => void) | null = null;
  private streamId: string;
  private fullResponse = '';

  constructor(streamId: string = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`) {
    this.streamId = streamId;
  }

  async startStream(config: StreamingConfig, callbacks: StreamingCallbacks): Promise<void> {
    // Stop any existing stream for this ID
    this.stopStream();

    const { onDelta, onComplete, onError } = callbacks;

    // Create message listener for this stream
    this.messageListener = (request: any) => {
      if (request.type === 'streamDelta') {
        this.fullResponse += request.data;
        onDelta?.(request.data);
      } else if (request.type === 'streamComplete') {
        onComplete?.(this.fullResponse);
        this.cleanup();
      } else if (request.type === 'streamError') {
        onError?.(request.error);
        this.cleanup();
      }
    };

    // Register listener
    browser.runtime.onMessage.addListener(this.messageListener);

    try {
      // Check if background script is available
      const runtime = browser.runtime.getURL('');
      if (!runtime) {
        throw new Error('Extension runtime not available');
      }

      // Send request to background script
      const response = await browser.runtime.sendMessage({
        type: 'streamChat',
        data: config
      });

      const ack = response as { status: string };
      if (ack?.status !== 'STREAM_STARTED') {
        throw new Error('Background script acknowledgement error.');
      }

    } catch (error) {
      let errorMessage = "Could not connect to background service.";
      
      if (error instanceof Error) {
        if (error.message?.includes("Receiving end does not exist")) {
          errorMessage = "Extension background service is not running. Please try reloading the extension or refreshing the page.";
        } else if (error.message?.includes("Extension context invalidated")) {
          errorMessage = "Extension was updated or reloaded. Please refresh the page to continue.";
        }
      }

      onError?.(errorMessage);
      this.cleanup();
    }
  }

  stopStream(): void {
    if (this.messageListener) {
      browser.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }
    
    // Clear response
    this.fullResponse = '';
  }

  private cleanup(): void {
    this.stopStream();
  }

  static stopAllStreams(): void {
    this.activeStreams.forEach(controller => controller.abort());
    this.activeStreams.clear();
  }

  getFullResponse(): string {
    return this.fullResponse;
  }

  isStreaming(): boolean {
    return this.messageListener !== null;
  }
}

// Utility function to create streaming manager with conversation context
export function createStreamingSession(
  conversationHistory: Message[],
  userQuery: string,
  settings: any,
  systemPrompt: string,
  websiteContext: string
): { config: StreamingConfig; messages: any[] } {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: websiteContext },
    ...conversationHistory.map(item => ({ role: item.type, content: item.content })),
    { role: 'user', content: userQuery }
  ];

  const config: StreamingConfig = {
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model || 'default',
    messages,
    customEndpoint: settings.customEndpoint
  };

  return { config, messages };
} 