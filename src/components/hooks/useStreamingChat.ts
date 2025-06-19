import { useState, useCallback } from 'react';
import browser from 'webextension-polyfill';
import { Message, get } from '../../services/storage';
import { createSystemPrompt, createWebsiteContext } from '../../utils/prompts';
import { ScrapedContent } from '../../services/contentScraper';

interface UseStreamingChatProps {
  conversationHistory: Message[];
  setConversationHistory: React.Dispatch<React.SetStateAction<Message[]>>;
  scrapedContent: ScrapedContent | null;
  pageUrl?: string;
  pageTitle?: string;
  onConversationStart?: () => void;
}

export const useStreamingChat = ({
  conversationHistory,
  setConversationHistory,
  scrapedContent,
  pageUrl,
  pageTitle,
  onConversationStart
}: UseStreamingChatProps) => {
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSubmit = useCallback(async (query: string) => {
    if (isStreaming || !query.trim()) return;

    const userMessage: Message = {
      type: 'user',
      content: query.trim(),
      timestamp: Date.now()
    };

    // Add user message to history
    setConversationHistory(prev => [...prev, userMessage]);

    // Call conversation start callback if this is the first message
    if (conversationHistory.length === 0) {
      onConversationStart?.();
    }

    const settings = await get();
    const pageContent = scrapedContent?.text || '';
    
    console.log('Sol: Creating website context with:');
    console.log('- URL:', pageUrl || window.location.href);
    console.log('- Title:', pageTitle || document.title);
    console.log('- Content length:', pageContent.length);
    console.log('- Has markdown:', !!scrapedContent?.markdown);
    console.log('- Content preview:', pageContent.substring(0, 200));
    
    const systemPrompt = createSystemPrompt();
    const websiteContext = createWebsiteContext({
      url: pageUrl || window.location.href,
      title: pageTitle || document.title,
      content: pageContent,
      markdown: scrapedContent?.markdown,
      excerpt: scrapedContent?.excerpt,
      metadata: scrapedContent?.metadata
    });
    
    console.log('Sol: Generated system prompt length:', systemPrompt.length);
    console.log('Sol: Generated website context length:', websiteContext.length);
    console.log('Sol: Website context:', websiteContext);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: websiteContext },
      ...conversationHistory.map(item => ({ role: item.type, content: item.content })),
      { role: 'user', content: query }
    ];

    let fullResponse = '';
    setIsStreaming(true);

    // Create placeholder for assistant message
    const assistantMessage: Message = {
      type: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    setConversationHistory(prev => [...prev, assistantMessage]);

    // Listener for stream from background script
    const messageListener = (request: any) => {
      if (request.type === 'streamDelta') {
        fullResponse += request.data;
        setConversationHistory(prev => {
          const newHistory = [...prev];
          const lastMessage = newHistory[newHistory.length - 1];
          if (lastMessage && lastMessage.type === 'assistant') {
            lastMessage.content = fullResponse;
          }
          return newHistory;
        });
      } else if (request.type === 'streamComplete') {
        const finalAssistantMessage: Message = {
          type: 'assistant',
          content: fullResponse,
          timestamp: Date.now()
        };
        
        setConversationHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = finalAssistantMessage;
          return newHistory;
        });
        
        setIsStreaming(false);
        browser.runtime.onMessage.removeListener(messageListener);
      } else if (request.type === 'streamError') {
        setConversationHistory(prev => {
          const newHistory = [...prev];
          const lastMessage = newHistory[newHistory.length - 1];
          if (lastMessage && lastMessage.type === 'assistant') {
            lastMessage.content = `Error: ${request.error}`;
          }
          return newHistory;
        });
        setIsStreaming(false);
        browser.runtime.onMessage.removeListener(messageListener);
      }
    };

    browser.runtime.onMessage.addListener(messageListener);

    // Send request to background script
    try {
      const runtime = browser.runtime.getURL('');
      if (!runtime) {
        throw new Error('Extension runtime not available');
      }
    } catch (runtimeError) {
      setConversationHistory(prev => {
        const newHistory = [...prev];
        const lastMessage = newHistory[newHistory.length - 1];
        if (lastMessage && lastMessage.type === 'assistant') {
          lastMessage.content = `Error: Extension not properly loaded. Please refresh the page and try again.`;
        }
        return newHistory;
      });
      setIsStreaming(false);
      browser.runtime.onMessage.removeListener(messageListener);
      return;
    }

    browser.runtime.sendMessage({
      type: 'streamChat',
      data: { ...settings, messages }
    }).then(response => {
      const ack = response as { status: string };
      if (ack?.status !== 'STREAM_STARTED') {
        throw new Error('Background script acknowledgement error.');
      }
    }).catch(error => {
      let errorMessage = "Could not connect to background service.";
      if (error.message?.includes("Receiving end does not exist")) {
        errorMessage = "Extension background service is not running. Please try reloading the extension or refreshing the page.";
      } else if (error.message?.includes("Extension context invalidated")) {
        errorMessage = "Extension was updated or reloaded. Please refresh the page to continue.";
      }
      
      setConversationHistory(prev => {
        const newHistory = [...prev];
        const lastMessage = newHistory[newHistory.length - 1];
        if (lastMessage && lastMessage.type === 'assistant') {
          lastMessage.content = `Error: ${errorMessage}`;
        }
        return newHistory;
      });
      setIsStreaming(false);
      browser.runtime.onMessage.removeListener(messageListener);
    });
  }, [
    isStreaming, 
    conversationHistory, 
    setConversationHistory, 
    scrapedContent, 
    pageUrl, 
    pageTitle, 
    onConversationStart
  ]);

  return {
    isStreaming,
    handleSubmit
  };
};

export default useStreamingChat; 