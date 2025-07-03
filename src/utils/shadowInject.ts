import chatCss from '@src/assets/styles/chat.css?inline';

export interface ShadowInjectionConfig {
  containerId: string;
  position: string;
  settings?: any;
  existingConversation?: any;
  colorScheme?: 'light' | 'dark';
  mode?: 'open' | 'closed';
}

export interface ShadowInstance {
  shadowRoot: ShadowRoot;
  hostElement: HTMLElement;
  cleanup: () => void;
  remove: () => void;
  sendMessage: (message: any) => void;
  mount: (renderFn: (root: HTMLElement) => void) => void;
}

export class ShadowUiInjector {
  private static instances = new Map<string, ShadowInstance>();
  
  static async inject(config: ShadowInjectionConfig): Promise<ShadowInstance> {
    const { containerId, position, colorScheme, mode = 'open' } = config;
    
    // Remove existing instance if it exists
    if (this.instances.has(containerId)) {
      this.instances.get(containerId)?.remove();
    }
    
    // Create host element as a custom tag for clarity & isolation
    const hostElement = document.createElement('sol-overlay-container');
    hostElement.id = containerId;
    
    // Apply host positioning styles (full-viewport overlay)
    hostElement.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
    `;
    
    // Create shadow root
    const shadowRoot = hostElement.attachShadow({ mode });
    
    // Inject full Tailwind + app styles into shadow root
    this.injectStyles(shadowRoot, colorScheme);
    
    // Create root container for React
    const rootContainer = document.createElement('div');
    rootContainer.id = 'shadow-root';
    rootContainer.style.pointerEvents = 'auto'; // Enable pointer events for content
    shadowRoot.appendChild(rootContainer);
    
    // Insert host right under <html> to avoid site styles from <body>
    document.documentElement.appendChild(hostElement);
    console.log(`Sol Shadow: ${containerId} injected`);
    
    const instance: ShadowInstance = {
      shadowRoot,
      hostElement,
      cleanup: () => this.cleanup(containerId),
      remove: () => this.removeInstance(containerId),
      sendMessage: (message: any) => this.sendMessageToShadow(hostElement, message),
      mount: (renderFn: (root: HTMLElement) => void) => renderFn(rootContainer)
    };
    
    this.instances.set(containerId, instance);
    return instance;
  }
  
  static removeInstance(containerId: string): void {
    const instance = this.instances.get(containerId);
    if (instance) {
      instance.cleanup();
      instance.hostElement.remove();
      this.instances.delete(containerId);
      console.log(`Sol Shadow: ${containerId} removed`);
    }
  }
  
  static getInstance(containerId: string): ShadowInstance | undefined {
    return this.instances.get(containerId);
  }
  
  private static applyHostStyles() {/* deprecated */}
  
  private static injectStyles(shadowRoot: ShadowRoot, colorScheme?: 'light' | 'dark'): void {
    try {
      // Remove @import statements since they're not allowed in Constructable Stylesheets
      const cleanedCss = chatCss.replace(/@import\s+[^;]+;/g, '');
      
      // Use Constructable Stylesheets if supported for better perf
      if ('adoptedStyleSheets' in Document.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cleanedCss);
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
      } else {
        const styleElement = document.createElement('style');
        styleElement.textContent = cleanedCss;
        shadowRoot.appendChild(styleElement);
      }

      // Apply color-scheme to shadow host so UA paints scrollbars correctly
      (shadowRoot.host as HTMLElement).style.colorScheme = colorScheme || 'light';
    } catch (error) {
      console.error('Sol Shadow: Failed to inject styles:', error);
      // Fallback: inject as style element without @imports
      const styleElement = document.createElement('style');
      styleElement.textContent = chatCss.replace(/@import\s+[^;]+;/g, '');
      shadowRoot.appendChild(styleElement);
    }
  }
  
  private static cleanup(containerId: string): void {
    // Any cleanup specific to shadow DOM instances
    // Currently just handled by remove(), but placeholder for future needs
  }
  
  private static sendMessageToShadow(hostElement: HTMLElement, message: any): void {
    try {
      // Dispatch custom event on the host element that components inside can listen to
      hostElement.dispatchEvent(new CustomEvent('sol-shadow-message', {
        detail: message,
        bubbles: false,
        composed: false // Don't cross shadow boundary
      }));
    } catch (error) {
      console.error('Sol Shadow: Failed to send message:', error);
    }
  }
} 