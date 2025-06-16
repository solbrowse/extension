import browser from 'webextension-polyfill';
import { ApiService } from '@src/services/api';

console.log("Sol Background Script Loaded");

// Keep the service worker alive
const keepAlive = () => {
  setInterval(() => {
    browser.runtime.getPlatformInfo().catch(() => {
      // Ignore errors, this is just to keep the service worker alive
    });
  }, 20000);
};

keepAlive();

browser.runtime.onInstalled.addListener(details => {
  console.log('Sol Background: onInstalled event fired');
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(() => {
  console.log('Sol Background: onStartup event fired, extension is active.');
});

// Keep track of active streaming sessions
const activeStreams = new Map<number, AbortController>();

browser.runtime.onMessage.addListener((request: any, sender: browser.Runtime.MessageSender) => {
  if (request.type !== 'streamChat') {
    return false;
  }

  const tabId = sender.tab?.id;
  console.log(`Sol Background: Received streamChat from tab: ${tabId}`, { data: request.data });

  if (!tabId) {
    console.error("Sol Background: Cannot stream response to a tab without an ID.");
    return false;
  }

  // If there's an existing stream for this tab, cancel it.
  if (activeStreams.has(tabId)) {
    console.log(`Sol Background: Cancelling existing stream for tab ${tabId}`);
    activeStreams.get(tabId)?.abort();
    activeStreams.delete(tabId);
  }

  const abortController = new AbortController();
  activeStreams.set(tabId, abortController);

  const { provider, apiKey, model, messages, customEndpoint } = request.data;
  console.log(`Sol Background: Starting stream for provider: ${provider}, model: ${model}, tab: ${tabId}`);

  const streamRequest = async () => {
    try {
      await ApiService.streamChatCompletion({
        provider,
        apiKey,
        model,
        messages,
        customEndpoint,
        abortSignal: abortController.signal,
        onDelta: (chunk) => {
          if (abortController.signal.aborted) return;
          browser.tabs.sendMessage(tabId, { type: 'streamDelta', data: chunk })
            .catch(error => {
              console.error(`Sol Background: Failed to send delta to tab ${tabId}. It might have been closed.`, error);
              abortController.abort();
              activeStreams.delete(tabId);
            });
        },
        onComplete: () => {
          if (abortController.signal.aborted) return;
          console.log(`Sol Background: Stream completed for tab ${tabId}`);
          browser.tabs.sendMessage(tabId, { type: 'streamComplete' }).catch(() => {});
          activeStreams.delete(tabId);
        },
        onError: (error) => {
          if (abortController.signal.aborted) return;
          console.error(`Sol Background: Stream error for tab ${tabId}:`, error);
          browser.tabs.sendMessage(tabId, { type: 'streamError', error: error.message }).catch(() => {});
          activeStreams.delete(tabId);
        }
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      console.error(`Sol Background: Failed to initiate streaming for tab ${tabId}:`, error);
      browser.tabs.sendMessage(tabId, { type: 'streamError', error: `Failed to start streaming: ${(error as Error).message}` })
        .catch(() => {});
      activeStreams.delete(tabId);
    }
  };

  streamRequest();
  
  // Acknowledge the request and keep the channel open for streaming
  return Promise.resolve({ status: 'STREAM_STARTED' });
});

// Clean up active streams when tabs are closed or updated
browser.tabs.onRemoved.addListener((tabId) => {
  if (activeStreams.has(tabId)) {
    console.log(`Sol Background: Cleaning up stream for closed tab ${tabId}`);
    activeStreams.get(tabId)?.abort();
    activeStreams.delete(tabId);
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Clean up if the tab is navigating to a new page or being reloaded
  if (changeInfo.status === 'loading' && activeStreams.has(tabId)) {
    console.log(`Sol Background: Tab ${tabId} is navigating, cleaning up stream`);
    activeStreams.get(tabId)?.abort();
    activeStreams.delete(tabId);
  }
});

console.log("Sol Background Script: Message listeners registered"); 