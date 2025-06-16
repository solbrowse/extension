import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { HiXMark, HiClipboardDocument, HiArrowRight, HiCheck } from 'react-icons/hi2';
import browser from 'webextension-polyfill';
import { get, saveConversation, updateConversation, Message } from '@src/utils/storage';
import { createSystemPrompt } from '@src/services/prompts';
import { ContentScraperService, ScrapedContent } from '@src/services/contentScraper';

interface AskBarProps {
  position?: string;
  onUnmount?: () => void;
  initialConversation?: Message[];
  initialConversationId?: string | null;
  onConversationUpdate?: (messages: Message[], conversationId: string | null) => void;
}

export default function AskBar({ 
  position = 'top-right', 
  onUnmount, 
  initialConversation = [], 
  initialConversationId = null,
  onConversationUpdate 
}: AskBarProps) {
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Message[]>(initialConversation);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(initialConversationId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isExpanded, setIsExpanded] = useState(initialConversation.length > 0);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [scrapedContent, setScrapedContent] = useState<ScrapedContent | null>(null);
  const [currentPosition, setCurrentPosition] = useState<string>(position);
  const [pageContent, setPageContent] = useState<any>(null);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');
  
  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const askBarRef = useRef<HTMLDivElement>(null);
  const contentScraper = ContentScraperService.getInstance();

  // Animation and visibility effects
  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => {
      setIsVisible(true);
      inputRef.current?.focus();
    }, 10);

    // Request content from parent window if we're in iframe
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'sol-request-content' }, '*');
    }
  }, []);

  // Conversation loading is now handled via pre-loaded data from parent (no async loading needed)

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sol-page-content') {
        setPageContent(event.data.content);
        setPageUrl(event.data.url);
        setPageTitle(event.data.title);
        
        // Update position if provided
        if (event.data.position) {
          setCurrentPosition(event.data.position);
        }
        
        // Update scraped content state with received content
        if (event.data.content) {
          setScrapedContent(event.data.content);
        }
        
        // Load pre-existing conversation if provided (already pre-loaded, no async needed)
        if (event.data.existingConversation && event.data.existingConversation.messages.length > 0) {
          setConversationHistory(event.data.existingConversation.messages);
          setCurrentConversationId(event.data.existingConversation.id);
          setIsExpanded(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Note: Conversation loading is now handled via pre-loaded data from parent

  // Update conversation in parent when it changes
  useEffect(() => {
    if (onConversationUpdate) {
      onConversationUpdate(conversationHistory, currentConversationId);
    }
    
    // Also save to tab-specific session storage for same-tab persistence
    if (conversationHistory.length > 0) {
      try {
        window.parent.postMessage({
          type: 'sol-update-tab-conversation',
          messages: conversationHistory,
          conversationId: currentConversationId
        }, '*');
      } catch (error) {
        // Ignore cross-origin errors
      }
    }
  }, [conversationHistory, currentConversationId, onConversationUpdate]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  // Initialize with empty content - will be replaced by parent content
  useEffect(() => {
    if (!pageContent) {
      setScrapedContent({
        text: '',
        metadata: {
          hostname: 'iframe-context',
          contentLength: 0,
          wordCount: 0,
          hasContent: false,
          hasSiteSpecificSelectors: false,
          siteSpecificSelectors: [],
          extractionMethod: 'iframe-pending'
        }
      });
    }
  }, [pageContent]);

  const getDebugInfo = useCallback(() => {
    if (!scrapedContent) {
      return {
        hostname: window.location.hostname,
        hasSiteSpecificSelectors: false,
        siteSpecificSelectors: [],
        contentLength: 0,
        wordCount: 0,
        hasContent: false,
        extractionMethod: 'none'
      };
    }

    try {
      return contentScraper.getDebugInfo(scrapedContent);
    } catch (error) {
      console.error('Sol: Error getting debug info:', error);
      return {
        hostname: window.location.hostname,
        hasSiteSpecificSelectors: false,
        siteSpecificSelectors: [],
        contentLength: scrapedContent.text?.length || 0,
        wordCount: scrapedContent.text?.split(/\s+/).length || 0,
        hasContent: Boolean(scrapedContent.text?.length),
        extractionMethod: scrapedContent.metadata?.extractionMethod || 'unknown'
      };
    }
  }, [scrapedContent, contentScraper]);

  const parseResponseForQuotes = useCallback((text: string): string => {
    return text.replace(/<quote>(.*?)<\/quote>/g, (_match, quoteText) => {
      return `<blockquote class="sol-quote">${quoteText}</blockquote>`;
    });
  }, []);

  const saveConversationToStorage = useCallback(async () => {
    try {
      const currentUrl = pageUrl || window.location.href;
      if (!currentConversationId) {
        // Create new conversation
        const title = conversationHistory[0]?.content.substring(0, 50) + '...' || 'New Conversation';
        const newId = await saveConversation({
          url: currentUrl,
          title,
          messages: conversationHistory
        });
        setCurrentConversationId(newId);
      } else {
        // Update existing conversation
        try {
          await updateConversation(currentConversationId, {
            messages: conversationHistory
          });
        } catch (updateError) {
          // If update fails (conversation not found), create a new one
          const title = conversationHistory[0]?.content.substring(0, 50) + '...' || 'New Conversation';
          const newId = await saveConversation({
            url: currentUrl,
            title,
            messages: conversationHistory
          });
          setCurrentConversationId(newId);
        }
      }
    } catch (error) {
      console.error('Sol: Failed to save conversation:', error);
    }
  }, [conversationHistory, currentConversationId, pageUrl]);

  const handleCopyMessage = useCallback(async (content: string, messageIndex: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(messageIndex);
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, []);

  const expandToConversation = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isStreaming || !input.trim()) return;

    const query = input.trim();
    const userMessage: Message = {
      type: 'user',
      content: query,
      timestamp: Date.now()
    };

    // Add user message to history
    setConversationHistory(prev => [...prev, userMessage]);
    setInput('');

    // Expand to conversation view if this is the first message
    if (conversationHistory.length === 0) {
      expandToConversation();
    }

    const settings = await get();
    const pageContent = scrapedContent?.text || '';
    const systemPrompt = createSystemPrompt({
      url: pageUrl || window.location.href,
      title: pageTitle || document.title,
      content: pageContent
    });

    const messages = [
      { role: 'system', content: systemPrompt },
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
    
    // Check if background script is available
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
  }, [input, isStreaming, conversationHistory, scrapedContent, expandToConversation]);

  // Save conversation when history changes (debounced to prevent race conditions)
  useEffect(() => {
    if (conversationHistory.length > 0) {
      const timeoutId = setTimeout(() => {
        saveConversationToStorage();
      }, 100); // Small delay to prevent rapid successive saves
      
      return () => clearTimeout(timeoutId);
    }
  }, [conversationHistory, saveConversationToStorage]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      if (onUnmount) {
        onUnmount();
      }
      // For iframe context, send message to parent to hide the iframe
      if (window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'sol-close-askbar' }, '*');
        } catch (error) {
        }
      }
    }, 300); // Wait for animation to complete
  }, [onUnmount]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  }, [handleSubmit, handleClose]);

  const buildContext = useCallback((): string => {
    if (!scrapedContent) return '';
    
    const context = [`You are an AI assistant integrated into a web browser extension named "Sol".`];
    
    // Use parent page URL and title if available, fallback to current context
    const contextUrl = pageUrl || window.location.href;
    const contextTitle = pageTitle || document.title;
    
    context.push(`Current webpage: ${contextTitle} (${contextUrl})`);
    
    if (scrapedContent.text && scrapedContent.text.trim()) {
      context.push('Page content:');
      context.push(scrapedContent.text.trim());
    } else {
      context.push('Note: No meaningful content was extracted from this page.');
    }
    
    context.push('\nPlease provide helpful, accurate responses based on this context. If you reference specific information from the page, you can wrap it in <quote></quote> tags to highlight it.');
    
    return context.join('\n\n');
  }, [scrapedContent, pageUrl, pageTitle]);

  // ---------------------
  // Expose AskBar bounds to parent so content script can enable pointer-events
  // ---------------------
  useLayoutEffect(() => {
    const sendBounds = () => {
      if (window.parent === window) return; // Not inside iframe
      if (!askBarRef.current) return;
      const rect = askBarRef.current.getBoundingClientRect();
      window.parent.postMessage({
        type: 'sol-askbar-bounds',
        bounds: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        }
      }, '*');
    };

    // Send once after mount
    sendBounds();

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => sendBounds());
    if (askBarRef.current) {
      resizeObserver.observe(askBarRef.current);
    }

    // Listen for explicit requests from parent
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'sol-request-askbar-bounds') {
        sendBounds();
      }
    };

    window.addEventListener('message', messageHandler);
    window.addEventListener('resize', sendBounds);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('message', messageHandler);
      window.removeEventListener('resize', sendBounds);
    };
  }, []);

  return (
    <div className={`askbar-container ${currentPosition}`}>
      <div 
        ref={askBarRef}
        className={`sol-ask-bar bg-white/95 backdrop-blur-md rounded-2xl transition-all duration-300 ${
          isClosing ? 'animate-out' : isVisible ? 'sol-visible' : ''
        } ${isExpanded ? 'w-[500px] p-3' : 'w-[400px] p-2'}`}
        style={{ 
          pointerEvents: 'auto'
        }}
      >
        {/* Conversation History */}
        <div
          ref={conversationRef}
          className={`
            overflow-y-auto scroll-smooth
            transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)
            ${isExpanded ? 'max-h-[300px] mb-3 pb-3 px-1 sol-conversation-divider' : 'max-h-0'}
            sol-conversation
          `}
        >
          {conversationHistory.map((message, index) => (
            <div
              key={index}
              className={`
                mb-3 last:mb-0 relative group
                opacity-0 translate-y-2 animate-in
                transition-all duration-300 ease-out
                ${message.type === 'user' ? 'text-right' : 'text-left'}
              `}
              style={{
                animationDelay: `${index * 50}ms`,
                animationFillMode: 'forwards'
              }}
            >
              {message.type === 'user' ? (
                <div className="text-gray-900 font-semibold text-sm leading-relaxed">
                  {message.content}
                </div>
              ) : (
                <>
                  <div 
                    className={`
                      text-gray-700 text-sm font-normal leading-relaxed pb-4
                      ${isStreaming && index === conversationHistory.length - 1 ? 'sol-streaming' : ''}
                    `}
                    dangerouslySetInnerHTML={{ 
                      __html: parseResponseForQuotes(message.content) 
                    }}
                  />
                  {message.content && (
                    <button
                      onClick={() => handleCopyMessage(message.content, index)}
                      className="
                        absolute bottom-1 right-1
                        w-6 h-6 flex items-center justify-center
                        text-gray-400 hover:text-gray-600 hover:bg-black/5
                        rounded transition-all duration-200
                        opacity-0 group-hover:opacity-100
                      "
                      title={copiedMessageIndex === index ? "Copied!" : "Copy response"}
                    >
                      {copiedMessageIndex === index ? (
                        <HiCheck className="w-3 h-3 text-gray-600" />
                      ) : (
                        <HiClipboardDocument className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExpanded ? "Ask a follow-up..." : "Ask anything about this page..."}
            className="
              flex-1 bg-transparent border-none outline-none
              text-sm font-medium text-gray-900 placeholder-gray-500
              px-1 py-1
            "
            disabled={isStreaming}
          />
          
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !input.trim()}
            className="
              px-3 py-1.5 text-xs font-semibold h-8
              bg-black/12 hover:bg-black/18 border border-black/15
              rounded-lg transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-1
            "
          >
            Ask <HiArrowRight className="w-3 h-3 opacity-50" />
          </button>
          
          <button
            onClick={handleClose}
            className="
              w-8 h-8 flex items-center justify-center
              bg-black/12 hover:bg-black/18 border border-black/15
              rounded-lg transition-all duration-150
              text-gray-600 hover:text-gray-800
            "
          >
            <HiXMark className="w-5 h-5" />
          </button>
        </div>

        {/* Debug Section */}
        {showDebug && (
          <div className="mt-3 pt-3 border-t border-gray-200/50 text-xs text-gray-500">
            <div className="space-y-1">
              <div>URL: {pageUrl || window.location.href}</div>
              <div>Title: {pageTitle || document.title}</div>
              <div>Content Length: {scrapedContent?.text?.length || 0} chars</div>
              <div>Has Content: {scrapedContent?.text ? 'Yes' : 'No'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 