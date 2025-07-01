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
  colorScheme?: 'light' | 'dark';
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
    const { iframeUrl, containerId, position, existingConversation, colorScheme } = config;
    
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
    const pointerEventsManager = this.createPointerEventsManager(iframe, containerId);
    
    // Set up iframe load handler
    iframe.onload = () => {
      this.initializeIframe(iframe, { existingConversation, position, colorScheme }, containerId);
    };
    
    // Inject iframe
    document.body.appendChild(iframe);
    console.log(`Sol Content Script: ${containerId} iframe injected`);
    
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
  
  private static createPointerEventsManager(iframe: HTMLIFrameElement, containerId: string) {
    let isPointerEventsEnabled = false;
    // Store overlay bounds (AskBar or SideBar) specific to this iframe instance
    let overlayBounds: any = null;
    
    const togglePointerEvents = (enable: boolean) => {
      if (enable !== isPointerEventsEnabled) {
        iframe.style.pointerEvents = enable ? 'auto' : 'none';
        isPointerEventsEnabled = enable;
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!overlayBounds) return;
      
      // More generous padding for dropdowns and expanded UI
      const padding = 50;
      
      // Check if mouse is near the AskBar area (including potential dropdowns)
      const isNearOverlay = e.clientX >= overlayBounds.left - padding &&
                            e.clientX <= overlayBounds.right + padding &&
                            e.clientY >= overlayBounds.top - padding &&
                            e.clientY <= overlayBounds.bottom + 300; // Extra space below for dropdowns / menus
      
      togglePointerEvents(isNearOverlay);
    };
    
    const handlePointerLockMsg = (event: MessageEvent) => {
      if (event.data?.type === 'sol-pointer-lock') {
        togglePointerEvents(!!event.data.enabled);
      }
    };
    
    const handleBoundsMessage = (event: MessageEvent) => {
      // Update bounds only if the message corresponds to this iframe's container
      if (containerId === 'sol-askbar-container' && event.data?.type === 'sol-askbar-bounds') {
        overlayBounds = event.data.bounds;
      } else if (containerId === 'sol-sidebar-container' && event.data?.type === 'sol-sidebar-bounds') {
        overlayBounds = event.data.bounds;
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
    colorScheme?: 'light' | 'dark';
  }, containerId: string): void {
    try {
      console.log(`Sol: Initializing ${containerId} iframe`);

      // Send initialization data - simplified to avoid duplication
      iframe.contentWindow?.postMessage({
        type: 'sol-init',
        position: data.position,
        conversationHistory: data.existingConversation?.messages?.map((msg: any) => ({
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp
        })) || [],
        conversationId: data.existingConversation?.id || null,
        colorScheme: data.colorScheme || null
      }, '*');

      console.log(`Sol: ${containerId} iframe initialized`);

      // Request initial bounds for overlays so we can enable click-through accurately
      setTimeout(() => {
        if (containerId === 'sol-askbar-container') {
          iframe.contentWindow?.postMessage({ type: 'sol-request-askbar-bounds' }, '*');
        } else if (containerId === 'sol-sidebar-container') {
          iframe.contentWindow?.postMessage({ type: 'sol-request-sidebar-bounds' }, '*');
        }
      }, 100);
    } catch (error) {
      console.error(`Sol: Failed to initialize ${containerId} iframe:`, error);
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