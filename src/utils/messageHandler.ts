export interface MessageHandler {
  type: string;
  handler: (data: any, source?: Window) => void;
}

export class MessageBus {
  private static handlers = new Map<string, MessageHandler[]>();
  private static isListening = false;
  
  static addHandler(type: string, handler: (data: any, source?: Window) => void): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    
    const messageHandler: MessageHandler = { type, handler };
    this.handlers.get(type)!.push(messageHandler);
    
    // Start listening if not already
    if (!this.isListening) {
      this.startListening();
    }
    
    // Return cleanup function
    return () => this.removeHandler(type, messageHandler);
  }
  
  static removeHandler(type: string, targetHandler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(targetHandler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      
      if (handlers.length === 0) {
        this.handlers.delete(type);
      }
    }
  }
  
  static sendMessage(target: Window, type: string, data?: any): void {
    try {
      target.postMessage({ type, ...data }, '*');
    } catch (error) {
      console.error('Sol: Failed to send message:', error);
    }
  }
  
  static sendToParent(type: string, data?: any): void {
    if (window.parent !== window) {
      this.sendMessage(window.parent, type, data);
    }
  }
  
  static sendToIframe(iframeId: string, type: string, data?: any): void {
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      this.sendMessage(iframe.contentWindow, type, data);
    }
  }
  
  private static startListening(): void {
    if (this.isListening) return;
    
    window.addEventListener('message', this.handleMessage.bind(this));
    this.isListening = true;
  }
  
  private static handleMessage(event: MessageEvent): void {
    const { type, ...data } = event.data || {};
    if (!type) return;
    
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(({ handler }) => {
        try {
          handler(data, event.source as Window);
        } catch (error) {
          console.error(`Sol: Error in message handler for type ${type}:`, error);
        }
      });
    }
  }
  
  static cleanup(): void {
    this.handlers.clear();
    if (this.isListening) {
      window.removeEventListener('message', this.handleMessage.bind(this));
      this.isListening = false;
    }
  }
} 