import { get } from '@src/utils/storage';
import { parseKeybind, matchesKeybind } from '@src/utils/keybind';
import { Message } from '@src/utils/storage';
import { ContentScraperService } from '@src/services/contentScraper';
import browser from 'webextension-polyfill';

let iframeAskBarVisible = false;

// Tab-specific conversation storage with unique tab identifier
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const TAB_CONVERSATION_KEY = `sol-tab-conversation-${TAB_ID}`;

function getTabConversation(): { messages: Message[], conversationId: string | null } {
  try {
    const stored = sessionStorage.getItem(TAB_CONVERSATION_KEY);
    return stored ? JSON.parse(stored) : { messages: [], conversationId: null };
  } catch {
    return { messages: [], conversationId: null };
  }
}

function setTabConversation(messages: Message[], conversationId: string | null) {
  try {
    sessionStorage.setItem(TAB_CONVERSATION_KEY, JSON.stringify({ messages, conversationId }));
  } catch (error) {
    console.error('Sol: Failed to save tab conversation:', error);
  }
}

function clearTabConversation() {
  try {
    sessionStorage.removeItem(TAB_CONVERSATION_KEY);
  } catch (error) {
    console.error('Sol: Failed to clear tab conversation:', error);
  }
}

async function injectIframeAskBar(settings: any) {
  const iframeUrl = chrome.runtime.getURL('src/pages/askview/index.html');
  
  // Pre-load existing conversation for this tab/URL combination
  let existingConversation = null;
  try {
    // First check tab-specific session storage (same tab only)
    const tabConversation = getTabConversation();
    if (tabConversation.messages.length > 0) {
      existingConversation = {
        id: tabConversation.conversationId,
        messages: tabConversation.messages,
        url: window.location.href,
        title: document.title,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }
  } catch (error) {
    console.error('Sol: Failed to pre-load tab conversation:', error);
  }
  
  const iframe = document.createElement('iframe');
  iframe.id = 'sol-askview-container';
  iframe.src = iframeUrl;
  
  // Smart overlay: start with pointer-events: none for full hover/cursor preservation
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
  
  // Allow transparency for older browsers
  iframe.setAttribute('allowtransparency', 'true');
  
  // Track pointer events state for smart toggling
  let isPointerEventsEnabled = false;
  
  const togglePointerEvents = (enable: boolean) => {
    if (enable !== isPointerEventsEnabled) {
      iframe.style.pointerEvents = enable ? 'auto' : 'none';
      isPointerEventsEnabled = enable;
    }
  };
  
  // Global mouse move handler for smart pointer-events toggling
  const handleMouseMove = (e: MouseEvent) => {
    const askBarBounds = (iframe as any).__askBarBounds;
    if (!askBarBounds) return;
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Add padding around AskBar for better UX (20px buffer zone)
    const padding = 20;
    const isNearAskBar = mouseX >= askBarBounds.left - padding &&
                        mouseX <= askBarBounds.right + padding &&
                        mouseY >= askBarBounds.top - padding &&
                        mouseY <= askBarBounds.bottom + padding;
    
    togglePointerEvents(isNearAskBar);
  };
  
  const handlePointerLockMsg = (event: MessageEvent) => {
    if (event.data?.type === 'sol-pointer-lock') {
      togglePointerEvents(!!event.data.enabled);
    }
  };
  
  // Send conversation immediately, then scrape content asynchronously
  iframe.onload = () => {
    try {
      // 1) Send initial conversation + position so AskBar can render instantly
      iframe.contentWindow?.postMessage({
        type: 'sol-init',
        existingConversation,
        position: settings.features?.askBar?.position || 'top-right'
      }, '*');

      // 2) Start scraping page content in the background
      const contentScraper = ContentScraperService.getInstance();
      contentScraper.scrapePageContent()
        .then(scrapedContent => {
          iframe.contentWindow?.postMessage({
            type: 'sol-page-content',
            content: scrapedContent,
            url: window.location.href,
            title: document.title
          }, '*');

          // Request AskBar bounds once the AskBar has potentially resized after receiving content
          setTimeout(() => {
            iframe.contentWindow?.postMessage({ type: 'sol-request-askbar-bounds' }, '*');
          }, 100);
        })
        .catch(() => {/* ignore scrape errors */});
    } catch {
      // ignore
    }
  };
  
  iframe.onerror = (error) => {
  };
  
  document.body.appendChild(iframe);
  
  // Add global mouse move listener
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  
  // Listen for pointer lock messages
  window.addEventListener('message', handlePointerLockMsg);
  
  // Store cleanup function on iframe for later removal
  (iframe as any).__solCleanup = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('message', handlePointerLockMsg);
  };
  
  return iframe;
}

function removeIframeAskBar() {
  const existingIframe = document.getElementById('sol-askview-container') as HTMLIFrameElement & { __solCleanup?: () => void };
  if (existingIframe) {
    // Clean up event listeners
    if (existingIframe.__solCleanup) {
      existingIframe.__solCleanup();
    }
    existingIframe.remove();
    console.log('Sol Content Script: AskView iframe removed');
  }
}

async function main() {
  console.log('Sol Content Script: Starting main function...');
  
  const settings = await get();
  console.log('Sol Content Script: Loaded settings:', settings);
  
  let askBarEnabled = settings.features.askBar.isEnabled;
  let targetKeybind = parseKeybind(settings.features.askBar.keybind);

  if (!askBarEnabled) {
    console.log('Sol Content Script: AskBar initially disabled (can be enabled live via Options)');
  }

  console.log('Sol Content Script: AskBar listener ready. Current keybind:', settings.features.askBar.keybind);

  // Clear conversation when navigating to a new page/site
  let currentUrl = window.location.href;
  let currentHost = window.location.hostname;
  
  const handleNavigation = () => {
    const newUrl = window.location.href;
    const newHost = window.location.hostname;
    
    // Clear conversation if URL or hostname changes
    if (newUrl !== currentUrl || newHost !== currentHost) {
      currentUrl = newUrl;
      currentHost = newHost;
      clearTabConversation();
      
      // Hide iframe AskBar if it's visible
      if (iframeAskBarVisible) {
        iframeAskBarVisible = false;
        removeIframeAskBar();
      }
    }
  };

  // Listen for messages from iframe (e.g., close requests)
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'sol-askbar-bounds') {
      // Store AskBar bounds for smart pointer-events toggling
      const iframe = document.getElementById('sol-askview-container') as HTMLIFrameElement & { __askBarBounds?: DOMRect };
      if (iframe && iframe.__askBarBounds !== event.data.bounds) {
        iframe.__askBarBounds = event.data.bounds;
      }
    } else if (event.data?.type === 'sol-close-askbar') {
      if (iframeAskBarVisible) {
        iframeAskBarVisible = false;
        // Remove iframe after animation completes
        setTimeout(() => {
          removeIframeAskBar();
        }, 350); // Wait for full animation to complete (300ms + buffer)
      }
    } else if (event.data?.type === 'sol-update-tab-conversation') {
      // Update tab-specific conversation storage
      setTabConversation(event.data.messages, event.data.conversationId);
    } else if (event.data?.type === 'sol-request-content') {
      const iframe = document.getElementById('sol-askview-container') as HTMLIFrameElement;
      if (iframe) {
        // Re-scrape and send fresh content
        ContentScraperService.getInstance().scrapePageContent()
          .then(scrapedContent => {
            iframe.contentWindow?.postMessage({
              type: 'sol-page-content',
              content: scrapedContent,
              url: window.location.href,
              title: document.title
            }, '*');
          })
          .catch(error => {
          });
      }
    }
  });

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

  document.addEventListener('keydown', async (event) => {
    if (!askBarEnabled) return;
    if (matchesKeybind(event, targetKeybind)) {
      // Only open AskBar, don't toggle
      if (!iframeAskBarVisible) {
        iframeAskBarVisible = true;
        await injectIframeAskBar(await get()); // fetch latest settings for position etc.
      }
    }
  });

  // Listen for live storage updates to features/keybind
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.features) {
      const newFeatures = changes.features.newValue as any;
      if (newFeatures?.askBar) {
        askBarEnabled = newFeatures.askBar.isEnabled;
        targetKeybind = parseKeybind(newFeatures.askBar.keybind);
        console.log('Sol Content Script: AskBar settings updated', { askBarEnabled, targetKeybind });

        if (!askBarEnabled && iframeAskBarVisible) {
          // Feature disabled while AskBar is open -> close it
          iframeAskBarVisible = false;
          removeIframeAskBar();
        }
      }
    }
  });

  console.log('Sol AI Search listener active.');
}

main().catch(console.error);
