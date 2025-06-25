import { Message } from '../services/storage';

export interface InjectionConfig {
  iframeUrl: string;
  containerId: string;
  settings: any;
  position: string;
  existingConversation?: {
    id: string | null;
    messages: Message[];
    url: string;
    title: string;
    createdAt: number;
    updatedAt: number;
  } | null;
}

export interface IframeInstance {
  iframe: HTMLIFrameElement;
  cleanup: () => void;
  remove: () => void;
  sendMessage: (message: any) => void;
}

export class IframeInjector {
  private static instances = new Map<string, IframeInstance>();
  
  static async inject(config: InjectionConfig): Promise<IframeInstance> {
    const { iframeUrl, containerId, position, existingConversation } = config;
    
    // Remove existing instance if it exists
    if (this.instances.has(containerId)) {
      this.instances.get(containerId)?.remove();
    }
    
    const iframe = document.createElement('iframe');
    iframe.id = containerId;
    iframe.src = iframeUrl;
    
    // Set base iframe styles
    this.applyIframeStyles(iframe);
    
    // Set up pointer events management
    const pointerEventsManager = this.createPointerEventsManager(iframe);
    
    // Set up iframe load handler
    iframe.onload = () => {
      this.initializeIframe(iframe, { existingConversation, position });
    };
    
    // Inject iframe
    document.body.appendChild(iframe);
    console.log('Sol Content Script: Ask Bar iframe injected');
    
    const instance: IframeInstance = {
      iframe,
      cleanup: pointerEventsManager.cleanup,
      remove: () => this.removeInstance(containerId),
      sendMessage: (message: any) => this.sendMessageToIframe(iframe, message)
    };
    
    this.instances.set(containerId, instance);
    return instance;
  }
  
  static removeInstance(containerId: string): void {
    const instance = this.instances.get(containerId);
    if (instance) {
      instance.cleanup();
      instance.iframe.remove();
      this.instances.delete(containerId);
      console.log(`Sol: Iframe ${containerId} removed`);
    }
  }
  
  static getInstance(containerId: string): IframeInstance | undefined {
    return this.instances.get(containerId);
  }
  
  private static applyIframeStyles(iframe: HTMLIFrameElement): void {
    iframe.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      border: none !important;
      background: transparent !important;
      background-color: transparent !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      overflow: visible !important;
    `;
    iframe.setAttribute('allowtransparency', 'true');
  }
  
  private static createPointerEventsManager(iframe: HTMLIFrameElement) {
    let isPointerEventsEnabled = false;
    let askBarBounds: any = null;
    
    const togglePointerEvents = (enable: boolean) => {
      if (enable !== isPointerEventsEnabled) {
        iframe.style.pointerEvents = enable ? 'auto' : 'none';
        isPointerEventsEnabled = enable;
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!askBarBounds) return;
      
      // More generous padding for dropdowns and expanded UI
      const padding = 50;
      
      // Check if mouse is near the AskBar area (including potential dropdowns)
      const isNearAskBar = e.clientX >= askBarBounds.left - padding &&
                          e.clientX <= askBarBounds.right + padding &&
                          e.clientY >= askBarBounds.top - padding &&
                          e.clientY <= askBarBounds.bottom + 300; // Extra space below for dropdowns
      
      togglePointerEvents(isNearAskBar);
    };
    
    const handlePointerLockMsg = (event: MessageEvent) => {
      if (event.data?.type === 'sol-pointer-lock') {
        togglePointerEvents(!!event.data.enabled);
      }
    };
    
    const handleBoundsMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sol-askbar-bounds') {
        askBarBounds = event.data.bounds;
      }
    };
    
    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('message', handlePointerLockMsg);
    window.addEventListener('message', handleBoundsMessage);
    
    return {
      cleanup: () => {
        document.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('message', handlePointerLockMsg);
        window.removeEventListener('message', handleBoundsMessage);
      }
    };
  }
  
  private static initializeIframe(iframe: HTMLIFrameElement, data: {
    existingConversation: any;
    position: string;
  }): void {
    try {
      console.log('Sol: Initializing iframe');

      // Send initialization data - simplified to avoid duplication
      iframe.contentWindow?.postMessage({
        type: 'sol-init',
        position: data.position,
        conversationHistory: data.existingConversation?.messages?.map((msg: any) => ({
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp
        })) || [],
        conversationId: data.existingConversation?.id || null
      }, '*');

      console.log('Sol: Iframe initialized');

      // Request AskBar bounds
      setTimeout(() => {
        iframe.contentWindow?.postMessage({ type: 'sol-request-askbar-bounds' }, '*');
      }, 100);
    } catch (error) {
      console.error('Sol: Failed to initialize iframe:', error);
    }
  }
  
  private static sendMessageToIframe(iframe: HTMLIFrameElement, message: any): void {
    try {
      iframe.contentWindow?.postMessage(message, '*');
    } catch (error) {
      console.error('Sol: Failed to send message to iframe:', error);
    }
  }
} 