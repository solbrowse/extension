import { ContentScraperService } from '../services/contentScraper';
import { Message } from '../services/storage';

export interface InjectionConfig {
  iframeUrl: string;
  containerId: string;
  settings: any;
  position?: string;
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
    const { iframeUrl, containerId, settings, position = 'top-right', existingConversation } = config;
    
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
    
    // Pre-scrape content to avoid including iframe in content
    const contentScraper = ContentScraperService.getInstance();
    
    try {
      const scrapedContent = await contentScraper.scrapePageContent();
      console.log('Sol: Scraped content BEFORE iframe injection:', scrapedContent.text.length, 'chars');
      
      // Set up iframe load handler
      iframe.onload = () => {
        this.initializeIframe(iframe, {
          existingConversation,
          position,
          scrapedContent: null, // Don't send content here - it gets lost
          url: window.location.href,
          title: document.title
        });
      };
      
      // Inject iframe after scraping
      document.body.appendChild(iframe);
      
    } catch (error) {
      console.error('Sol: Content scraping failed:', error);
      
      // Still inject iframe even if scraping fails
      iframe.onload = () => {
        this.initializeIframe(iframe, {
          existingConversation,
          position,
          scrapedContent: null, // Don't send content here - timing issue
          url: window.location.href,
          title: document.title
        });
      };
      
      document.body.appendChild(iframe);
    }
    
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
      z-index: 2147483647 !important;
      pointer-events: none !important;
      overflow: hidden !important;
    `;
    iframe.setAttribute('allowtransparency', 'true');
  }
  
  private static createPointerEventsManager(iframe: HTMLIFrameElement) {
    let isPointerEventsEnabled = false;
    
    const togglePointerEvents = (enable: boolean) => {
      if (enable !== isPointerEventsEnabled) {
        iframe.style.pointerEvents = enable ? 'auto' : 'none';
        isPointerEventsEnabled = enable;
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      const askBarBounds = (iframe as any).__askBarBounds;
      if (!askBarBounds) return;
      
      const padding = 20;
      const isNearAskBar = e.clientX >= askBarBounds.left - padding &&
                          e.clientX <= askBarBounds.right + padding &&
                          e.clientY >= askBarBounds.top - padding &&
                          e.clientY <= askBarBounds.bottom + padding;
      
      togglePointerEvents(isNearAskBar);
    };
    
    const handlePointerLockMsg = (event: MessageEvent) => {
      if (event.data?.type === 'sol-pointer-lock') {
        togglePointerEvents(!!event.data.enabled);
      }
    };
    
    const handleBoundsMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sol-askbar-bounds') {
        (iframe as any).__askBarBounds = event.data.bounds;
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
    scrapedContent: any;
    url: string;
    title: string;
  }): void {
    try {
      console.log('Sol: Initializing iframe with content:', {
        hasScrapedContent: !!data.scrapedContent,
        contentLength: data.scrapedContent?.text?.length || 0,
        url: data.url,
        title: data.title
      });

      // Send initial conversation + position
      iframe.contentWindow?.postMessage({
        type: 'sol-init',
        existingConversation: data.existingConversation,
        position: data.position
      }, '*');

      // Content sending removed - timing issue causes messages to be lost
      // AskBar will request content via sol-request-content message instead
      console.log('Sol: Iframe initialized, content will be sent on request');

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