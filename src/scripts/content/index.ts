// Initialise custom logger first
import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { PORT_NAMES, ContentInitMsg, ContentDeltaMsg, GetCurrentTabIdMsg, GetCurrentTabIdResponseMsg } from '@src/types/messaging';
import { ContentScraperService } from '@src/services/contentScraper';
import { get } from '@src/services/storage';
import { parseKeybind, matchesKeybind } from '@src/utils/keybind';
import { IframeInjector, IframeInstance } from '@src/utils/iframeInjector';
import { MessageBus } from '@src/utils/messageHandler';
import { TabConversationManager } from '@src/utils/tabConversationManager';

// Prevent content script from running in extension contexts
const isExtensionContext = (): boolean => {
  if (window.location.protocol === 'chrome-extension:' || 
      window.location.protocol === 'moz-extension:' ||
      window.location.protocol === 'ms-browser-extension:') {
    return true;
  }
  
  if (window.location.href.includes('chrome-extension://') ||
      window.location.href.includes('moz-extension://')) {
    return true;
  }
  
  return false;
};

// Exit early if we're in an extension context
if (isExtensionContext()) {
  console.log('Sol Content Script: Skipping execution in extension context');
} else {

class SolContentScript {
  // AskBar (iframe-based UI)
  private askBarInstance: IframeInstance | null = null;
  private isAskBarVisible = false;
  private askBarEnabled = false;
  private targetKeybind: any = null;
  private tabManager: TabConversationManager;

  // Auto-scraping (multi-tab support)
  private port: browser.Runtime.Port | null = null;
  private tabId: number;
  private currentUrl: string;
  private scrapeDebounceTimer: number | null = null;
  private mutationObserver: MutationObserver | null = null;
  private lastScrapeContent = '';
  
  constructor() {
    this.currentUrl = window.location.href;
    this.tabManager = TabConversationManager.getInstance();
    this.tabId = Date.now() + Math.floor(Math.random() * 1000); // Fallback
    this.initialize();
  }

  private async getRealTabId(): Promise<void> {
    try {
      const message: GetCurrentTabIdMsg = { type: 'GET_CURRENT_TAB_ID' };
      const response = await browser.runtime.sendMessage(message) as GetCurrentTabIdResponseMsg;
      
      if (response?.tabId && typeof response.tabId === 'number') {
        this.tabId = response.tabId;
        console.log('Sol Content Script: Got real tab ID:', this.tabId);
      }
    } catch (error) {
      console.log('Sol Content Script: Using fallback tab ID:', this.tabId);
    }
  }

  async initialize(): Promise<void> {
    console.log('Sol Content Script: Starting initialization...');
    
    // Get real tab ID
    await this.getRealTabId();
    
    // Initialize AskBar
    await this.initializeAskBar();
    
    // Set up scraping infrastructure but don't start scraping yet
    this.setupScrapingInfrastructure();
    
    // Setup message handlers
    this.setupMessageHandlers();
    
    console.log('Sol Content Script: Initialization complete');
  }

  // ========================================
  // AUTO-SCRAPING (On-Demand Only)
  // ========================================

  private setupScrapingInfrastructure(): void {
    console.log('Sol Content Script: Setting up scraping infrastructure...');
    
    // Connect to background for when scraping is needed
    this.connectPort();
    
    // Setup mutation observer (but don't start observing yet)
    this.prepareMutationObserver();
    
    // Setup navigation hooks (but don't activate yet)
    this.prepareNavigationHooks();
    
    console.log('Sol Content Script: Scraping infrastructure ready');
  }

  private startActiveScraping(): void {
    console.log('Sol Content Script: Starting active scraping...');
    
    // Perform initial scrape
    setTimeout(() => {
      this.performInitialScrape();
    }, 100);
    
    // Start mutation observation
    if (this.mutationObserver) {
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      console.log('Sol Content Script: MutationObserver started');
    }
    
    // Activate navigation hooks
    this.activateNavigationHooks();
  }

  private stopActiveScraping(): void {
    console.log('Sol Content Script: Stopping active scraping...');
    
    // Stop mutation observation
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      console.log('Sol Content Script: MutationObserver stopped');
    }
    
    // Clear any pending scrapes
    if (this.scrapeDebounceTimer) {
      clearTimeout(this.scrapeDebounceTimer);
      this.scrapeDebounceTimer = null;
    }
  }

  private connectPort(): void {
    try {
      this.port = browser.runtime.connect({ name: PORT_NAMES.CONTENT_PORT });
      
      this.port.onDisconnect.addListener(() => {
        console.log('Sol Content Script: Port disconnected');
        this.port = null;
        // Try to reconnect after a delay
        setTimeout(() => this.connectPort(), 1000);
      });

      console.log('Sol Content Script: Port connected');
    } catch (error) {
      console.error('Sol Content Script: Failed to connect port:', error);
    }
  }

  private async performInitialScrape(): Promise<void> {
    if (!this.port) return;

    try {
      console.log('Sol Content Script: Performing initial scrape...');
      
      const scrapedContent = await ContentScraperService.getInstance().scrapePageContent();
      this.lastScrapeContent = scrapedContent.text;
      
      const message: ContentInitMsg = {
        type: 'INIT_SCRAPE',
        tabId: this.tabId,
        url: window.location.href,
        title: document.title,
        html: scrapedContent.text,
        timestamp: Date.now()
      };

      this.port.postMessage(message);
      console.log(`Sol Content Script: Initial scrape sent (${scrapedContent.text.length} chars)`);
      
    } catch (error) {
      console.error('Sol Content Script: Initial scrape failed:', error);
    }
  }

  private prepareMutationObserver(): void {
    if (this.mutationObserver) return;
    
    this.mutationObserver = new MutationObserver((mutations) => {
      // Filter out trivial mutations
      const significantMutations = mutations.filter(mutation => {
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          // Skip style/class changes
          return attrName !== 'style' && attrName !== 'class';
        }
        
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          return parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName);
        }
        
        if (mutation.type === 'childList') {
          const hasContentNodes = Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes))
            .some(node => {
              if (node.nodeType === Node.TEXT_NODE) {
                return (node.textContent?.trim().length || 0) > 0;
              }
              if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element;
                return !['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(el.tagName);
              }
              return false;
            });
          
          return hasContentNodes;
        }
        
        return true;
      });

      if (significantMutations.length > 0) {
        this.debouncedScrape('mutation');
      }
    });
  }

  private prepareNavigationHooks(): void {
    // Hook into History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    // Store original methods
    (window as any).__solOriginalPushState = originalPushState;
    (window as any).__solOriginalReplaceState = originalReplaceState;

    console.log('Sol Content Script: Navigation hooks prepared');
  }

  private activateNavigationHooks(): void {
    // Replace History API methods
    history.pushState = (...args) => {
      (window as any).__solOriginalPushState.apply(history, args);
      this.handleNavigation();
    };

    history.replaceState = (...args) => {
      (window as any).__solOriginalReplaceState.apply(history, args);
      this.handleNavigation();
    };

    // Listen for popstate events
    window.addEventListener('popstate', () => this.handleNavigation());

    console.log('Sol Content Script: Navigation hooks activated');
  }

  private deactivateNavigationHooks(): void {
    // Restore original methods
    if ((window as any).__solOriginalPushState) {
      history.pushState = (window as any).__solOriginalPushState;
    }
    if ((window as any).__solOriginalReplaceState) {
      history.replaceState = (window as any).__solOriginalReplaceState;
    }

    // Remove popstate listener
    window.removeEventListener('popstate', () => this.handleNavigation());

    console.log('Sol Content Script: Navigation hooks deactivated');
  }

  private handleNavigation(): void {
    const newUrl = window.location.href;
    
    if (newUrl !== this.currentUrl) {
      console.log(`Sol Content Script: Navigation detected: ${this.currentUrl} → ${newUrl}`);
      this.currentUrl = newUrl;
      
      // Wait for content to load, then scrape
      setTimeout(() => {
        this.debouncedScrape('navigation');
      }, 500);
    }
  }

  private debouncedScrape(changeType: 'mutation' | 'navigation' | 'manual'): void {
    if (this.scrapeDebounceTimer) {
      clearTimeout(this.scrapeDebounceTimer);
    }
    
    this.scrapeDebounceTimer = setTimeout(() => {
      this.performDeltaScrape(changeType);
    }, 300) as any;
  }

  private async performDeltaScrape(changeType: 'mutation' | 'navigation' | 'manual'): Promise<void> {
    if (!this.port) return;

    try {
      const scrapedContent = await ContentScraperService.getInstance().scrapePageContent();
      
      // Check if content actually changed
      if (!this.hasSignificantContentChange(scrapedContent.text, changeType)) {
        return;
      }
      
      this.lastScrapeContent = scrapedContent.text;
      
      const message: ContentDeltaMsg = {
        type: 'DELTA_SCRAPE',
        tabId: this.tabId,
        url: window.location.href,
        html: scrapedContent.text,
        changeType,
        timestamp: Date.now()
      };

      this.port.postMessage(message);
      console.log(`Sol Content Script: Delta scrape sent (${changeType}, ${scrapedContent.text.length} chars)`);
      
    } catch (error) {
      console.error('Sol Content Script: Delta scrape failed:', error);
    }
  }

  private hasSignificantContentChange(newContent: string, changeType: 'mutation' | 'navigation' | 'manual'): boolean {
    if (!this.lastScrapeContent) return true; // First scrape
    if (changeType === 'manual' || changeType === 'navigation') return true; // Always send these

    // Check if content length changed significantly (>10%)
    const lengthDiff = Math.abs(newContent.length - this.lastScrapeContent.length);
    const lengthChangePercent = lengthDiff / this.lastScrapeContent.length;
    
    return lengthChangePercent > 0.1;
  }

  // ========================================
  // ASKBAR (iframe-based UI)
  // ========================================

  private async initializeAskBar(): Promise<void> {
    try {
      const settings = await get();
      
      this.askBarEnabled = settings?.features?.askBar?.isEnabled ?? false;
      this.targetKeybind = parseKeybind(settings?.features?.askBar?.keybind);

      if (this.askBarEnabled) {
        this.setupKeybindListener();
        this.setupStorageListener();
        console.log(`Sol Content Script: AskBar enabled with keybind: ${settings?.features?.askBar?.keybind}`);
      }
      
    } catch (error) {
      console.error('Sol Content Script: Failed to initialize AskBar:', error);
    }
  }

  private setupKeybindListener(): void {
    // Add debugging for all keydown events when askbar is enabled
    const keydownHandler = async (event: KeyboardEvent) => {
      // (silenced verbose keydown logs)
      
      if (!this.askBarEnabled) return;
      
      if (matchesKeybind(event, this.targetKeybind)) {
        console.log('Sol Content Script: Target keybind detected!', {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          askBarEnabled: this.askBarEnabled,
          isAskBarVisible: this.isAskBarVisible,
          askBarInstance: !!this.askBarInstance
        });
        
        event.preventDefault();
        event.stopPropagation();
        
        // Toggle behavior: show if hidden, hide if visible
        if (!this.isAskBarVisible) {
          console.log('Sol Content Script: Attempting to show AskBar...');
          await this.showAskBar();
        } else {
          console.log('Sol Content Script: Attempting to hide AskBar...');
          this.isAskBarVisible = false;
          this.hideAskBar();
        }
      }
    };

    // Ensure we're attaching to document and store reference for debugging
    document.addEventListener('keydown', keydownHandler, { 
      capture: true, // Use capture to ensure we get the event first
      passive: false // Allow preventDefault
    });
    
    // Store the handler for potential cleanup/debugging
    (this as any).keydownHandler = keydownHandler;
    
    console.log('Sol Content Script: Keybind listener setup complete with capture=true');
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.features) {
        const newFeatures = changes.features.newValue as any;
        if (newFeatures?.askBar) {
          this.askBarEnabled = newFeatures.askBar.isEnabled;
          this.targetKeybind = parseKeybind(newFeatures.askBar.keybind);

          if (!this.askBarEnabled && this.isAskBarVisible) {
            this.isAskBarVisible = false;
            this.removeAskBar();
          }
        }
      }
    });
  }

  private async showAskBar(): Promise<void> {
    console.log('Sol Content Script: showAskBar called', {
      isAskBarVisible: this.isAskBarVisible,
      askBarInstance: !!this.askBarInstance
    });
    
    if (this.isAskBarVisible) {
      console.log('Sol Content Script: AskBar already visible, skipping');
      return;
    }

    const settings = await get();
    console.log('Sol Content Script: Retrieved settings:', {
      askBarEnabled: settings?.features?.askBar?.isEnabled,
      position: settings?.features?.askBar?.position
    });
    
    const existingConversation = this.prepareExistingConversation();
    console.log('Sol Content Script: Existing conversation:', {
      hasConversation: !!existingConversation,
      messageCount: existingConversation?.messages?.length || 0
    });

    try {
      // Start active scraping when AskBar opens
      this.startActiveScraping();

      this.askBarInstance = await IframeInjector.inject({
        iframeUrl: browser.runtime.getURL('src/pages/askbar/index.html'),
        containerId: 'sol-askbar-container',
        settings,
        position: settings.features?.askBar?.position || 'top-right',
        existingConversation
      });

      this.isAskBarVisible = true;
      console.log('Sol Content Script: AskBar shown successfully', {
        isAskBarVisible: this.isAskBarVisible,
        askBarInstance: !!this.askBarInstance
      });
      
    } catch (error) {
      console.error('Sol Content Script: Failed to show AskBar:', error);
      // Reset state on error
      this.isAskBarVisible = false;
      this.askBarInstance = null;
    }
  }

  private removeAskBar(): void {
    console.log('Sol Content Script: Removing AskBar');
    
    if (this.askBarInstance) {
      this.askBarInstance.cleanup();
      this.askBarInstance = null;
    }
    
    // Stop active scraping when AskBar closes
    this.stopActiveScraping();
    
    // Ensure state is properly reset
    this.isAskBarVisible = false;
    
    // IMPORTANT: Restore focus to document to ensure keybind listener works
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }
    document.body.focus();
    
    console.log('Sol Content Script: AskBar removed and cleaned up, focus restored');
  }

  private prepareExistingConversation(): any {
    console.log('Sol Content Script: Preparing existing conversation...');
    
    const conversation = this.tabManager.getConversation();
    console.log('Sol Content Script: Retrieved conversation from TabManager:', {
      hasConversation: !!conversation,
      messageCount: conversation?.messages?.length || 0,
      conversationId: conversation?.conversationId,
      messages: conversation?.messages
    });
    
    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      console.log('Sol Content Script: No existing conversation found');
      return null;
    }

    const result = {
      messages: conversation.messages,
      conversationId: conversation.conversationId
    };
    
    console.log('Sol Content Script: Returning existing conversation:', result);
    return result;
  }

  private hideAskBar(): void {
    console.log('Sol Content Script: Hiding AskBar');
    
    // Use setTimeout to allow CSS transition to complete
    setTimeout(() => {
      this.removeAskBar();
    }, 350);
  }

  // ========================================
  // MESSAGE HANDLING
  // ========================================

  private setupMessageHandlers(): void {
    // Handle askbar close requests
    MessageBus.addHandler('sol-close-askbar', () => {
      console.log('Sol Content Script: Received close-askbar message');
      if (this.isAskBarVisible) {
        this.isAskBarVisible = false;
        this.hideAskBar();
      }
    });

    // Handle tab conversation updates
    MessageBus.addHandler('sol-update-tab-conversation', (data) => {
      console.log('Sol Content Script: Received conversation update:', {
        messageCount: data.messages?.length || 0,
        conversationId: data.conversationId
      });
      this.tabManager.setConversation(data.messages, data.conversationId);
    });

    // Handle current tab requests (for AskBar to get current tab info)
    MessageBus.addHandler('sol-get-current-tab', () => {
      if (this.askBarInstance) {
        this.askBarInstance.sendMessage({
          type: 'sol-current-tab-response',
          tabId: this.tabId,
          url: window.location.href,
          title: document.title
        });
      }
    });
  }

  // ========================================
  // CLEANUP
  // ========================================

  cleanup(): void {
    console.log('Sol Content Script: Cleaning up...');
    
    // Stop active scraping
    this.stopActiveScraping();
    
    // Deactivate navigation hooks
    this.deactivateNavigationHooks();
    
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    
    if (this.isAskBarVisible) {
      this.removeAskBar();
    }
    
    MessageBus.cleanup();
  }

  // Public method for debugging
  public triggerManualScrape(): void {
    console.log('Sol Content Script: Manual scrape triggered');
    this.debouncedScrape('manual');
  }
}

// Prevent multiple initializations
if (!(window as any).solContentScript) {
  console.log('Sol Content Script: First initialization');
  
  // Initialize the content script
  const solContentScript = new SolContentScript();

  // Expose for debugging
  (window as any).solContentScript = solContentScript;

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    solContentScript.cleanup();
  });

  console.log('Sol Content Script: Script loaded, infrastructure ready');
} else {
  console.log('Sol Content Script: Already initialized, skipping re-initialization');
  console.log('Sol Content Script: Existing instance state:', {
    askBarEnabled: (window as any).solContentScript.askBarEnabled,
    isAskBarVisible: (window as any).solContentScript.isAskBarVisible,
    hasKeydownHandler: !!(window as any).solContentScript.keydownHandler
  });
}

} 