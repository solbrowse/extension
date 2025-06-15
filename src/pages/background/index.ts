import browser from 'webextension-polyfill';
import { ApiService } from '@src/services/api';
import { StorageData } from '@src/utils/storage';

console.log("Sol Background Script Loaded");

browser.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    browser.runtime.openOptionsPage();
  }
});

interface StreamChatMessage {
  type: 'streamChat';
  data: {
    provider: string;
    apiKey: string;
    model: string;
    messages: { role: string; content: string }[];
    customEndpoint?: string;
  }
}

browser.runtime.onMessage.addListener((request: any, sender: browser.Runtime.MessageSender) => {
  console.log("Sol Background Script received message:", request.type);
  if (request.type === 'streamChat') {
    const { provider, apiKey, model, messages, customEndpoint } = request.data;
    const tabId = sender.tab?.id;

    if (!tabId) {
      console.error("Cannot stream response to a tab without an ID.");
      return false;
    }

    ApiService.streamChatCompletion({
      provider,
      apiKey,
      model,
      messages,
      customEndpoint,
      onDelta: (chunk) => {
        if (sender.tab?.id) {
          browser.tabs.sendMessage(sender.tab.id, { type: 'streamDelta', data: chunk });
        }
      },
      onComplete: () => {
        if (sender.tab?.id) {
          browser.tabs.sendMessage(sender.tab.id, { type: 'streamComplete' });
        }
      },
      onError: (error) => {
        if (sender.tab?.id) {
          browser.tabs.sendMessage(sender.tab.id, { type: 'streamError', error: error.message });
        }
      }
    });
    
    return true; 
  }
  return false;
}); 