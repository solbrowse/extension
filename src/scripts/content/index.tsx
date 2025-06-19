import { get } from '@src/services/storage';
import { parseKeybind, matchesKeybind } from '@src/utils/keybind';
import { ContentScraperService } from '@src/services/contentScraper';
import { IframeInjector, IframeInstance } from '@src/utils/iframeInjector';
import { MessageBus } from '@src/utils/messageHandler';
import { TabConversationManager } from '@src/utils/tabConversationManager';
import browser from 'webextension-polyfill';

// Prevent content script from running in extension contexts (iframes, extension pages)
const isExtensionContext = () => {
  // Check if we're in an extension page or iframe
  if (window.location.protocol === 'chrome-extension:' || 
      window.location.protocol === 'moz-extension:' ||
      window.location.protocol === 'ms-browser-extension:') {
    return true;
  }
  
  // Additional Chrome-specific checks
  if (window.location.href.includes('chrome-extension://') ||
      window.location.href.includes('moz-extension://')) {
    return true;
  }
  
  // Check if we're in an iframe that belongs to the extension
  if (window !== window.top) {
    try {
      // If we can access parent window and it's an extension context, exit
      if (window.parent.location.protocol.includes('extension')) {
        return true;
      }
      // Check if iframe src is an extension URL
      const iframes = window.parent.document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        if (iframe.contentWindow === window && 
            iframe.src && 
            (iframe.src.includes('extension') || iframe.src.includes('chrome-extension'))) {
          return true;
        }
      }
    } catch (e) {
      // Cross-origin iframe, but check if current URL is extension
      if (window.location.href.includes('extension') || 
          window.location.href.includes('chrome-extension')) {
        return true;
      }
    }
  }
  
  return false;
};

// Exit early if we're in an extension context
if (isExtensionContext()) {
  console.log('Sol Content Script: Skipping execution in extension context');
} else {

class ContentScriptManager {
  private askBarInstance: IframeInstance | null = null;
  private isAskBarVisible = false;
  private askBarEnabled = false;
  private targetKeybind: any = null;
  private tabManager: TabConversationManager;
  private messageCleanupFunctions: (() => void)[] = [];

  constructor() {
    this.tabManager = TabConversationManager.getInstance();
    this.setupMessageHandlers();
    this.setupNavigationHandlers();
  }

  async initialize(): Promise<void> {
    console.log('Sol Content Script: Starting initialization...');
    
    const settings = await get();
    console.log('Sol Content Script: Loaded settings:', settings);
    
    this.askBarEnabled = settings.features.askBar.isEnabled;
    this.targetKeybind = parseKeybind(settings.features.askBar.keybind);

    if (!this.askBarEnabled) {
      console.log('Sol Content Script: AskBar initially disabled');
    }

    this.setupKeybindListener();
    this.setupStorageListener();
    
    console.log('Sol Content Script: AskBar listener ready. Current keybind:', settings.features.askBar.keybind);
    console.log('Sol AI Search listener active.');
  }

  private setupMessageHandlers(): void {
    // Handle askbar close requests
    const closeCleanup = MessageBus.addHandler('sol-close-askbar', () => {
      if (this.isAskBarVisible) {
        this.isAskBarVisible = false;
        // Remove iframe after animation completes
        setTimeout(() => {
          this.removeAskBar();
        }, 350);
      }
    });

    // Handle tab conversation updates
    const conversationCleanup = MessageBus.addHandler('sol-update-tab-conversation', (data) => {
      this.tabManager.setConversation(data.messages, data.conversationId);
    });

    // Handle content requests (primary method for sending content)
    const contentCleanup = MessageBus.addHandler('sol-request-content', async () => {
      if (this.askBarInstance) {
        try {
          const scrapedContent = await ContentScraperService.getInstance().scrapePageContent();
          console.log('Sol Content Script: [PRIMARY] Sending content to iframe:', scrapedContent?.text?.length, 'chars');
          this.askBarInstance.sendMessage({
            type: 'sol-page-content',
            content: scrapedContent,
            url: window.location.href,
            title: document.title,
            source: 'content-script-primary'
          });
        } catch (error) {
          console.error('Sol: Failed to scrape content:', error);
        }
      }
    });

    this.messageCleanupFunctions.push(closeCleanup, conversationCleanup, contentCleanup);
  }

  private setupNavigationHandlers(): void {
    const navigationCleanup = this.tabManager.addNavigationHandler(() => {
      // Hide iframe AskBar if it's visible on navigation
      if (this.isAskBarVisible) {
        this.isAskBarVisible = false;
        this.removeAskBar();
      }
    });

    this.messageCleanupFunctions.push(navigationCleanup);
  }

  private setupKeybindListener(): void {
    document.addEventListener('keydown', async (event) => {
      if (!this.askBarEnabled) return;
      if (matchesKeybind(event, this.targetKeybind)) {
        // Only open AskBar, don't toggle
        if (!this.isAskBarVisible) {
          await this.showAskBar();
        }
      }
    });
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.features) {
        const newFeatures = changes.features.newValue as any;
        if (newFeatures?.askBar) {
          this.askBarEnabled = newFeatures.askBar.isEnabled;
          this.targetKeybind = parseKeybind(newFeatures.askBar.keybind);
          console.log('Sol Content Script: AskBar settings updated', { 
            askBarEnabled: this.askBarEnabled, 
            targetKeybind: this.targetKeybind 
          });

          if (!this.askBarEnabled && this.isAskBarVisible) {
            // Feature disabled while AskBar is open -> close it
            this.isAskBarVisible = false;
            this.removeAskBar();
          }
        }
      }
    });
  }

  private async showAskBar(): Promise<void> {
    if (this.isAskBarVisible) return;

    const settings = await get();
    const existingConversation = this.prepareExistingConversation();

    try {
      this.askBarInstance = await IframeInjector.inject({
        iframeUrl: chrome.runtime.getURL('src/pages/askbar/index.html'),
        containerId: 'sol-askbar-container',
        settings,
        position: settings.features?.askBar?.position || 'top-right',
        existingConversation
      });

      this.isAskBarVisible = true;
      console.log('Sol Content Script: Ask Bar iframe injected');
    } catch (error) {
      console.error('Sol Content Script: Failed to inject Ask Bar:', error);
    }
  }

  private removeAskBar(): void {
    if (this.askBarInstance) {
      this.askBarInstance.remove();
      this.askBarInstance = null;
      console.log('Sol Content Script: Ask Bar iframe removed');
    }
  }

  private prepareExistingConversation(): any {
    const tabConversation = this.tabManager.getConversation();
    if (tabConversation.messages.length > 0) {
      return {
        id: tabConversation.conversationId,
        messages: tabConversation.messages,
        url: this.tabManager.getCurrentUrl(),
        title: document.title,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
    return null;
  }

  cleanup(): void {
    // Clean up all message handlers
    this.messageCleanupFunctions.forEach(cleanup => cleanup());
    this.messageCleanupFunctions = [];
    
    // Remove askbar if visible
    if (this.isAskBarVisible) {
      this.removeAskBar();
    }
    
    // Clean up message bus
    MessageBus.cleanup();
  }
}

// Initialize content script
const contentScript = new ContentScriptManager();
contentScript.initialize().catch(console.error);

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  contentScript.cleanup();
});

} 