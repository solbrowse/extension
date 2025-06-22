import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { TabConversationManager } from '@src/utils/tabConversationManager';
import { AskBarController } from './AskBarController';
import { ScraperController } from './ScraperController';

// Detect whether we are executing inside an extension-origin page
const isExtensionContext = (): boolean => {
  if (
    window.location.protocol === 'chrome-extension:' ||
    window.location.protocol === 'moz-extension:' ||
    window.location.protocol === 'ms-browser-extension:'
  ) {
    return true;
  }
  if (
    window.location.href.includes('chrome-extension://') ||
    window.location.href.includes('moz-extension://')
  ) {
    return true;
  }
  return false;
};

// Ask background script for the tab ID
async function getTabId(): Promise<number | null> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'GET_CURRENT_TAB_ID',
    })) as { tabId?: number };
    return typeof response?.tabId === 'number' ? response.tabId : null;
  } catch {
    return null;
  }
}

// Entry point
if (isExtensionContext()) {
  console.log('Sol Content Script: Skipping execution in extension context');
} else {
  (async () => {
    // Prevent multiple injections (e.g. due to SPA re-rendering)
    if ((window as any).solContentScript) {
      console.log('Sol Content Script: Already initialised');
      return;
    }

    const tabId = await getTabId();
    if (tabId == null) {
      console.warn('Sol Content Script: Could not obtain tab ID – aborting initialisation.');
      return;
    }

    // Expose for debugging
    (window as any).solTabId = tabId;

    // Instantiate controllers
    const tabManager = TabConversationManager.getInstance();
    const askBar = new AskBarController(tabManager);
    const scraper = new ScraperController(tabId);

    // Connect scraper to ask bar state
    scraper.setAskBarOpenCallback(() => askBar.isVisible());
    askBar.setOnOpenCallback(() => scraper.triggerManualScrape());

    await Promise.all([askBar.init(), scraper.init()]);

    // Start scraping immediately; controllers can later coordinate if needed
    scraper.start();

    // Expose globally for debugging/testing
    (window as any).solContentScript = { askBar, scraper };

    // Listen for debug context requests from the AskBar iframe
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sol-copy-context') {
        const context = {
          url: window.location.href,
          title: document.title,
          lastScrape: scraper.getLastScrapeContent(),
        };
        // Cast to any to satisfy TS overload ambiguity between targetOrigin and options object
        (event.source as Window)?.postMessage({ type: 'sol-context-response', context }, '*' as any);
      }
    });

    // Cleanup
    window.addEventListener('beforeunload', () => {
      askBar.cleanup();
      scraper.cleanup();
    });

    console.log('Sol Content Script: Controllers initialised');
  })();
} 