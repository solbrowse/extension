import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { ApiService } from '@src/services/api';
import { needsSchemaReset, resetToDefaults, get } from '@src/services/storage';
import { PortManager } from '@src/services/messaging/portManager';
import { TabSnapshotManager } from '@src/services/scraping/tabSnapshotManager';
import { createSystemPrompt, createWebsiteContext } from '@src/utils/prompts';
import { 
  ContentInitMsg, 
  ContentDeltaMsg, 
  UiGetContentMsg, 
  UiUserPromptMsg,
  UiListTabsMsg,
  UiContentResponseMsg,
  UiTabsResponseMsg,
  GetCurrentTabIdResponseMsg
} from '@src/types/messaging';

console.log("Sol Background Script Loaded");

// Initialize managers
const portManager = PortManager.getInstance();
const snapshotManager = TabSnapshotManager.getInstance();

// Enable debug mode if storage flag set (supports both new `debug` flag and legacy `debugScraping` flag)
browser.storage.local.get(['debug', 'debugScraping']).then(res => {
  const enabled = !!res.debug || !!res.debugScraping;
  snapshotManager.setDebug(enabled);
});

// Listen for storage changes to toggle debug flag
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.debug) {
      snapshotManager.setDebug(!!changes.debug.newValue);
    } else if (changes.debugScraping) { // Backward compatibility
      snapshotManager.setDebug(!!changes.debugScraping.newValue);
    }
  }
});

// Check for schema updates and reset if needed
const checkAndResetSchema = async () => {
  try {
    if (await needsSchemaReset()) {
      console.log('Sol Background: Resetting storage due to schema change');
      await resetToDefaults();
      console.log('Sol Background: Storage reset completed');
    }
  } catch (error) {
    console.error('Sol Background: Error during schema check:', error);
  }
};

// Keep the service worker alive
const keepAlive = () => {
  setInterval(() => {
    browser.runtime.getPlatformInfo().catch(() => {
      // Ignore errors, this is just to keep the service worker alive
    });
  }, 20000);
};

// Consolidated function to process tab snapshots into page format
const processTabSnapshots = (snapshots: Array<any>, tabIds: number[]) => {
  return snapshots.map((snapshot, index) => {
    const tabId = tabIds[index];
    if (!snapshot) {
      return {
        tabId,
        url: '',
        title: `Tab ${tabId}`,
        content: '[No content available]',
        lastUpdated: 0
      };
    }
    
    return {
      tabId: snapshot.tabId,
      url: snapshot.url,
      title: snapshot.title,
      content: snapshot.content,
      lastUpdated: snapshot.timestamp
    };
  });
};

// Simplified function to ensure content availability for tabs
const ensureTabsHaveContent = async (tabIds: number[]): Promise<void> => {
  const maxWaitTimeMs = 5000; // total time to wait
  const pollIntervalMs = 500; // how often to check

  // Helper for snapshot existence check
  const needsContent = (id: number) => {
    const snapshot = snapshotManager.getLatestSnapshot(id);
    return !snapshot || snapshot.content === '[No content available]' || Date.now() - snapshot.timestamp > 60000;
  };

  const logSnapshotState = (ids: number[]) => {
    ids.forEach(id => {
      const snap = snapshotManager.getLatestSnapshot(id);
      console.log(`Sol Background: Snapshot for tab ${id}:`, snap ? `content length ${snap.content?.length || 0}, ts ${snap.timestamp}` : 'NONE');
    });
  };

  let tabsWithoutContent = tabIds.filter(needsContent);
  if (tabsWithoutContent.length === 0) {
    console.log('Sol Background: All mentioned tabs already have fresh content.');
    return;
  }

  console.log(`Sol Background: Ensuring content is available for tabs: ${tabsWithoutContent.join(', ')}`);
  logSnapshotState(tabsWithoutContent);

  // Trigger scraping for tabs without content
  for (const tabId of tabsWithoutContent) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        continue;
      }

      await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          if ((window as any).solContentScript?.scraper?.triggerManualScrape) {
            (window as any).solContentScript.scraper.triggerManualScrape();
            console.log('Sol: Triggered manual scrape for multi-tab context');
          }
        }
      });
    } catch (error) {
      console.warn(`Sol Background: Could not trigger scrape for tab ${tabId}:`, error);
    }
  }

  // Poll until all required content is available or timeout reached
  const start = Date.now();
  while (Date.now() - start < maxWaitTimeMs) {
    await new Promise(res => setTimeout(res, pollIntervalMs));
    tabsWithoutContent = tabIds.filter(needsContent);
    if (tabsWithoutContent.length === 0) {
      console.log('Sol Background: All tab content retrieved within wait period.');
      break;
    }
  }

  if (tabsWithoutContent.length > 0) {
    console.warn('Sol Background: Some tabs still lack content after wait:', tabsWithoutContent);
    logSnapshotState(tabsWithoutContent);
  }
};

// Setup messaging handlers
const setupMessageHandlers = () => {
  // Content script handlers
  portManager.addContentHandler<ContentInitMsg>('INIT_SCRAPE', (message, port) => {
    console.log(`Sol Background: Initial scrape for tab ${message.tabId}, content length: ${message.html.length}`);
    
    snapshotManager.addSnapshot({
      tabId: message.tabId,
      url: message.url,
      title: message.title,
      content: message.html,
      changeType: 'init'
    });
  });

  portManager.addContentHandler<ContentDeltaMsg>('DELTA_SCRAPE', (message, port) => {
    console.log(`Sol Background: Delta scrape for tab ${message.tabId}, change: ${message.changeType}, content length: ${message.html.length}`);
    
    snapshotManager.addSnapshot({
      tabId: message.tabId,
      url: message.url,
      title: '', // Delta messages don't include title
      content: message.html,
      changeType: message.changeType
    });
  });

  // UI request handlers (these send responses)
  portManager.addRequestHandler<UiGetContentMsg, UiContentResponseMsg>('GET_CONTENT', async (message, port) => {
    console.log(`Sol Background: Content request for tabs: ${message.tabIds.join(', ')}`);
    
    const snapshots = snapshotManager.getLatestSnapshots(message.tabIds);
    const pages = processTabSnapshots(snapshots, message.tabIds);

    return {
      type: 'CONTENT_RESPONSE',
      requestId: message.requestId,
      pages
    };
  });

  portManager.addRequestHandler<UiListTabsMsg, UiTabsResponseMsg>('LIST_TABS', async (message, port) => {
    try {
      const tabs = await browser.tabs.query({ currentWindow: true });
      const tabList = tabs
        .filter(tab => tab.id !== undefined)
        .map(tab => ({
          id: tab.id!,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl
        }));

      return {
        type: 'TABS_RESPONSE',
        requestId: message.requestId,
        tabs: tabList
      };
    } catch (error) {
      console.error('Sol Background: Error listing tabs:', error);
      return {
        type: 'TABS_RESPONSE',
        requestId: message.requestId,
        tabs: []
      };
    }
  });

  portManager.addUiHandler<UiUserPromptMsg>('USER_PROMPT', async (message, port) => {
    console.log(`Sol Background: User prompt for tabs: ${message.tabIds.join(', ')}`);
    
    try {
      await ensureTabsHaveContent(message.tabIds);

      const snapshots = snapshotManager.getLatestSnapshots(message.tabIds);
      const pages = processTabSnapshots(snapshots, message.tabIds);

      console.log('Sol Background: Retrieved page snapshots:', pages.map(p => ({ id: p.tabId, title: p.title, contentLen: p.content.length })));

      const settings = await get();
      
      // Separate available and unavailable content
      const availablePages = pages.filter(page => page.content && page.content !== '[No content available]');
      const unavailablePages = pages.filter(page => page.content === '[No content available]');
      
      // Create context from available pages
      const contextMessage = availablePages
        .map(page => createWebsiteContext({
          url: page.url,
          title: page.title,
          content: page.content,
          metadata: { tabId: page.tabId, lastUpdated: page.lastUpdated }
        }))
        .join('\n\n');
      
      // Create user notice for unavailable tabs
      const contextNotice = unavailablePages.length > 0 
        ? `\n\nNote: Content from ${unavailablePages.length} mentioned tab(s) (${unavailablePages.map(p => p.tabId).join(', ')}) is not available.`
        : '';
      
      // Build messages array
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: createSystemPrompt() }
      ];

      // Add tab content if available
      if (contextMessage) {
        messages.push({ role: 'system', content: contextMessage });
      }

      // Add conversation history (last 12 messages to avoid context window issues)
      if (message.conversationHistory?.length) {
        message.conversationHistory.slice(-12).forEach(historyMessage => {
          messages.push({
            role: historyMessage.role,
            content: historyMessage.content
          });
        });
      }

      // Add current user message with notice
      messages.push({ role: 'user', content: message.prompt + contextNotice });

      console.log(`Sol Background: Sending ${messages.length} messages to LLM (${message.conversationHistory?.length || 0} history messages)`);
      
      // Start streaming
      await ApiService.streamChatCompletion({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        customEndpoint: settings.customEndpoint,
        abortSignal: new AbortController().signal,
        onDelta: (chunk: string) => {
          portManager.sendToUiPort(port, {
            type: 'LLM_DELTA',
            requestId: message.requestId,
            delta: chunk
          });
        },
        onComplete: () => {
          portManager.sendToUiPort(port, {
            type: 'LLM_DONE',
            requestId: message.requestId,
            fullResponse: ''
          });
        },
        onError: (error: Error) => {
          portManager.sendToUiPort(port, {
            type: 'LLM_ERROR',
            requestId: message.requestId,
            error: error.message
          });
        }
      });

    } catch (error) {
      console.error('Sol Background: Error handling user prompt:', error);
      portManager.sendToUiPort(port, {
        type: 'LLM_ERROR',
        requestId: message.requestId,
        error: `Failed to process request: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  });
};

// Setup direct message handler for content script requests
browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message?.type === 'GET_CURRENT_TAB_ID' && sender.tab?.id) {
    console.log(`Sol Background: Providing tab ID ${sender.tab.id} to content script`);
    const response: GetCurrentTabIdResponseMsg = {
      tabId: sender.tab.id
    };
    sendResponse(response);
  }
  return true; // Always return true to keep channel open
});

// Initialize everything
setupMessageHandlers();
keepAlive();

browser.runtime.onStartup.addListener(async () => {
  console.log('Sol Background: onStartup event fired, extension is active.');
  await checkAndResetSchema();
});

// Clean up snapshots when tabs are closed or updated
browser.tabs.onRemoved.addListener((tabId) => {
  console.log(`Sol Background: Tab ${tabId} closed, cleaning up snapshots`);
  snapshotManager.clearTab(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    console.log(`Sol Background: Tab ${tabId} navigating to ${changeInfo.url}, will clear snapshots if needed`);
  }
});

browser.runtime.onInstalled.addListener(async (details) => {
  console.log('Sol Background: onInstalled event fired with reason: ', details.reason);
  if (details.reason === 'install') {
    const url = browser.runtime.getURL('src/pages/dashboard/index.html');
    browser.tabs.create({ url: url });
  }
});