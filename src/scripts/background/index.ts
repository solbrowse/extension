// Initialise custom logger first
import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { ApiService } from '@src/services/api';
import { needsSchemaReset, resetToDefaults, get } from '@src/services/storage';
import { PortManager } from '@src/services/messaging/portManager';
import { TabSnapshotManager } from '@src/services/scraping/tabSnapshotManager';
import { 
  ContentInitMsg, 
  ContentDeltaMsg, 
  UiGetContentMsg, 
  UiUserPromptMsg,
  UiListTabsMsg,
  UiContentResponseMsg,
  UiTabsResponseMsg,
  UiLlmErrorMsg,
  GetCurrentTabIdMsg,
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

// Helper function for creating structured context messages
function createContextMessage(tabContents: { url: string; title: string; content: string; metadata?: any }[]): string {
  if (tabContents.length === 0) {
    return "No content available from selected tabs.";
  }

  if (tabContents.length === 1) {
    const tab = tabContents[0];
    return `Context from ${tab.title}:\n\nURL: ${tab.url}\n\n${tab.content}`;
  }

  // Multiple tabs - create structured format
  const contextSections = tabContents.map((tab, index) => {
    const tabNumber = index + 1;
    let section = `## Tab ${tabNumber}: ${tab.title}\n\nURL: ${tab.url}\n`;
    
    // Add metadata if available
    if (tab.metadata) {
      const meta = tab.metadata;
      if (meta.lastUpdated) section += `Last Updated: ${new Date(meta.lastUpdated).toLocaleString()}\n`;
    }
    
    section += `\nContent:\n${tab.content}`;
    
    return section;
  }).join('\n\n---\n\n');

  const tabTitles = tabContents.map(tab => tab.title).join(', ');
  return `Context from ${tabContents.length} tabs (${tabTitles}):\n\n${contextSections}`;
}

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
    const pages = snapshots.map((snapshot, index) => {
      const tabId = message.tabIds[index];
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
      // Get content for specified tabs
      const snapshots = snapshotManager.getLatestSnapshots(message.tabIds);
      const settings = await get();
      
      // Prepare context from tabs with enhanced structure
      const tabContents = snapshots.map((snapshot, index) => {
        const tabId = message.tabIds[index];
        if (snapshot) {
          return {
            url: snapshot.url,
            title: snapshot.title,
            content: snapshot.content,
            metadata: {
              tabId: snapshot.tabId,
              lastUpdated: snapshot.timestamp
            }
          };
        } else {
          return {
            url: '',
            title: `Tab ${tabId}`,
            content: '[No content available]',
            metadata: { tabId, lastUpdated: 0 }
          };
        }
      });

      // Create structured context message
      const contextMessage = createContextMessage(tabContents);
      
      // Load system prompt
      const systemPrompt = "You are Sol, an AI assistant that helps users understand and interact with web content. You have access to content from browser tabs that the user has referenced. Provide helpful, accurate responses based on the content provided. If no content is provided, you can still help with general questions.";

      // Build messages array with conversation history
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      // Add tab content as system context if available
      if (tabContents.some(tab => tab.content && tab.content !== '[No content available]')) {
        messages.push({ role: 'system', content: contextMessage });
      }

      // Add conversation history if provided
      if (message.conversationHistory && message.conversationHistory.length > 0) {
        // Take last 10 messages to avoid context window issues
        const recentHistory = message.conversationHistory.slice(-10);
        
        recentHistory.forEach(historyMessage => {
          messages.push({
            role: historyMessage.role,
            content: historyMessage.content
          });
        });
      }

      // Add current user message
      messages.push({ role: 'user', content: message.prompt });

      console.log(`Sol Background: Sending ${messages.length} messages to LLM (${message.conversationHistory?.length || 0} history messages)`);
      
      // Debug: Log full message structure for transparency
      if (process.env.NODE_ENV === 'development') {
        console.log('Sol Background: Full LLM message structure:', JSON.stringify(messages, null, 2));
      }

      // Start streaming
      await ApiService.streamChatCompletion({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        customEndpoint: settings.customEndpoint,
        abortSignal: new AbortController().signal, // TODO: Implement proper abort handling
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
            fullResponse: '' // We could track this if needed
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

browser.runtime.onInstalled.addListener(async (details) => {
  console.log('Sol Background: onInstalled event fired');
  
  // Check schema on install/update
  await checkAndResetSchema();
  
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(async () => {
  console.log('Sol Background: onStartup event fired, extension is active.');
  
  // Check schema on startup (browser restart)
  await checkAndResetSchema();
});

// Clean up snapshots when tabs are closed or updated
browser.tabs.onRemoved.addListener((tabId) => {
  console.log(`Sol Background: Tab ${tabId} closed, cleaning up snapshots`);
  snapshotManager.clearTab(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Clear snapshots if the tab is navigating to a completely new page
  if (changeInfo.status === 'loading' && changeInfo.url) {
    console.log(`Sol Background: Tab ${tabId} navigating to ${changeInfo.url}, will clear snapshots if needed`);
    // The content script will send a new INIT_SCRAPE which will handle URL changes
  }
});

console.log("Sol Background Script: New architecture initialized"); 