import { Message } from '../services/storage';

export interface TabConversation {
  messages: Message[];
  conversationId: string | null;
}

export class TabConversationManager {
  private static instance: TabConversationManager;
  private tabId: string;
  private conversationKey: string;
  private currentUrl: string;
  private currentHost: string;
  private navigationHandlers: (() => void)[] = [];

  private constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.conversationKey = `sol-tab-conversation-${this.tabId}`;
    this.currentUrl = window.location.href;
    this.currentHost = window.location.hostname;
    this.setupNavigationListeners();
  }

  static getInstance(): TabConversationManager {
    if (!this.instance) {
      this.instance = new TabConversationManager();
    }
    return this.instance;
  }

  getConversation(): TabConversation {
    try {
      const stored = sessionStorage.getItem(this.conversationKey);
      return stored ? JSON.parse(stored) : { messages: [], conversationId: null };
    } catch {
      return { messages: [], conversationId: null };
    }
  }

  setConversation(messages: Message[], conversationId: string | null): void {
    try {
      sessionStorage.setItem(this.conversationKey, JSON.stringify({ messages, conversationId }));
    } catch (error) {
      console.error('Sol: Failed to save tab conversation:', error);
    }
  }

  clearConversation(): void {
    try {
      sessionStorage.removeItem(this.conversationKey);
    } catch (error) {
      console.error('Sol: Failed to clear tab conversation:', error);
    }
  }

  addNavigationHandler(handler: () => void): () => void {
    this.navigationHandlers.push(handler);
    
    // Return cleanup function
    return () => {
      const index = this.navigationHandlers.indexOf(handler);
      if (index > -1) {
        this.navigationHandlers.splice(index, 1);
      }
    };
  }

  private setupNavigationListeners(): void {
    const handleNavigation = () => {
      const newUrl = window.location.href;
      const newHost = window.location.hostname;
      
      // Simple navigation detection
      if (newUrl !== this.currentUrl || newHost !== this.currentHost) {
        this.currentUrl = newUrl;
        this.currentHost = newHost;
        this.clearConversation();
        
        // Notify all handlers
        this.navigationHandlers.forEach(handler => {
          try {
            handler();
          } catch (error) {
            console.error('Sol: Error in navigation handler:', error);
          }
        });
      }
    };

    // Listen for navigation changes
    window.addEventListener('popstate', handleNavigation);
    
    // Override pushState and replaceState to catch programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(handleNavigation, 0);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(handleNavigation, 0);
    };
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  getCurrentHost(): string {
    return this.currentHost;
  }

  getTabId(): string {
    return this.tabId;
  }
} 