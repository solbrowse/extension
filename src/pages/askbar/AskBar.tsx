import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { HiXMark, HiOutlineClipboard, HiArrowRight, HiCheck } from 'react-icons/hi2';
import browser from 'webextension-polyfill';
import ReactMarkdown from 'react-markdown';
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
  const [showDebug, setShowDebug] = useState(true);
  const [scrapedContent, setScrapedContent] = useState<ScrapedContent | null>(null);
  const [currentPosition, setCurrentPosition] = useState<string>(position);
  const [pageContent, setPageContent] = useState<any>(null);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');
  
  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const askBarRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const contentScraper = ContentScraperService.getInstance();
  const hasAnimatedRef = useRef(false);

  // Animation and visibility effects – run once on mount
  useEffect(() => {
    if (hasAnimatedRef.current) return; // already animated
    hasAnimatedRef.current = true;
    // Trigger entrance animation INSTANTLY
    setIsVisible(true);
    inputRef.current?.focus();
  }, []);

  // Conversation loading is now handled via pre-loaded data from parent (no async loading needed)

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sol-init') {
        // Fast path: receive preloaded conversation & position
        if (event.data.position) {
          setCurrentPosition(event.data.position);
        }

        if (event.data.existingConversation && event.data.existingConversation.messages.length > 0) {
          setConversationHistory(event.data.existingConversation.messages);
          setCurrentConversationId(event.data.existingConversation.id);
          setIsExpanded(true);
        }

      } else if (event.data?.type === 'sol-page-content') {
        console.log('Sol AskBar: Received page content message');
        console.log('Sol AskBar: Content data:', event.data.content);
        console.log('Sol AskBar: URL:', event.data.url);
        console.log('Sol AskBar: Title:', event.data.title);
        
        // Always update URL and title first
        setPageUrl(event.data.url);
        setPageTitle(event.data.title);
        setPageContent(event.data.content);
        
        // Update position if provided
        if (event.data.position) {
          setCurrentPosition(event.data.position);
        }
        
        // Update scraped content state with received content
        if (event.data.content && event.data.content.text) {
          console.log('Sol AskBar: Setting scraped content - Text length:', event.data.content.text.length);
          console.log('Sol AskBar: Content preview:', event.data.content.text.substring(0, 100));
          setScrapedContent(event.data.content);
        } else {
          console.warn('Sol AskBar: Received content but no text property');
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
        markdown: '',
        title: '',
        excerpt: '',
        metadata: {
          hostname: 'iframe-context',
          url: window.location.href,
          title: '',
          byline: null,
          dir: null,
          lang: null,
          contentLength: 0,
          wordCount: 0,
          readingTimeMinutes: 0,
          hasContent: false,
          extractionMethod: 'iframe-pending',
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0,
          contentDensity: 0,
          isArticle: false,
          publishedTime: null,
          siteName: null,
          fallbackUsed: false,
          debugInfo: {
            originalLength: 0,
            cleanedLength: 0,
            removedElements: [],
            contentSelectors: ['iframe-pending'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: 0,
          }
        }
      });
    }
  }, [pageContent]);

  const getDebugInfo = useCallback(() => {
    if (!scrapedContent) {
      return {
        hostname: window.location.hostname,
        extractionMethod: 'none',
        fallbackUsed: false,
        isArticle: false,
        contentLength: 0,
        wordCount: 0,
        hasContent: false,
        readingTimeMinutes: 0,
        readabilityScore: 0,
        contentDensity: '0%',
        shadowDOMCount: 0,
        iframeCount: 0
      };
    }

    try {
      return contentScraper.getDebugInfo(scrapedContent);
    } catch (error) {
      console.error('Sol: Error getting debug info:', error);
      return {
        hostname: window.location.hostname,
        extractionMethod: scrapedContent.metadata?.extractionMethod || 'unknown',
        fallbackUsed: scrapedContent.metadata?.fallbackUsed || false,
        isArticle: scrapedContent.metadata?.isArticle || false,
        contentLength: scrapedContent.text?.length || 0,
        wordCount: scrapedContent.text?.split(/\s+/).length || 0,
        hasContent: Boolean(scrapedContent.text?.length),
        readingTimeMinutes: scrapedContent.metadata?.readingTimeMinutes || 0,
        readabilityScore: scrapedContent.metadata?.readabilityScore || 0,
        contentDensity: '0%',
        shadowDOMCount: scrapedContent.metadata?.shadowDOMCount || 0,
        iframeCount: scrapedContent.metadata?.iframeCount || 0
      };
    }
  }, [scrapedContent, contentScraper]);

  const MarkdownRenderer = useCallback(({ content }: { content: string }) => {
    return (
      <ReactMarkdown
        components={{
          // Style headings with minimal design
          h1: ({ children }) => <h3 className="text-base font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-semibold text-gray-900 mt-3 mb-2 first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-medium text-gray-900 mt-3 mb-1 first:mt-0">{children}</h5>,
          h4: ({ children }) => <h6 className="text-sm font-medium text-gray-800 mt-2 mb-1 first:mt-0">{children}</h6>,
          h5: ({ children }) => <h6 className="text-sm text-gray-800 mt-2 mb-1 first:mt-0">{children}</h6>,
          h6: ({ children }) => <span className="text-sm text-gray-700 font-medium">{children}</span>,
          
          // Clean list styling
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 ml-2 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 ml-2 my-2">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
          
          // Inline code and code blocks
          code: ({ node, children, className, ...props }) => {
            const isInline = !className?.includes('language-');
            return isInline ? (
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
            ) : (
              <pre className="bg-gray-100 p-3 rounded-lg my-2 overflow-x-auto">
                <code className="text-xs font-mono text-gray-800">{children}</code>
              </pre>
            );
          },
          
          // Blockquotes (including custom quote tags)
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-gray-200 pl-3 my-2 italic text-gray-700">
              {children}
            </blockquote>
          ),
          
          // Clean paragraph styling
          p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
          
          // Strong and emphasis
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          
          // Links with external indicator
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline decoration-1 underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {content.replace(/<quote>(.*?)<\/quote>/g, '> $1')}
      </ReactMarkdown>
    );
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
    // Only expand if not already expanded to prevent double animations
    setIsExpanded(prev => prev ? prev : true);
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
    
    console.log('Sol: Creating system prompt with:');
    console.log('- URL:', pageUrl || window.location.href);
    console.log('- Title:', pageTitle || document.title);
    console.log('- Content length:', pageContent.length);
    console.log('- Has markdown:', !!scrapedContent?.markdown);
    console.log('- Content preview:', pageContent.substring(0, 200));
    
    const systemPrompt = createSystemPrompt({
      url: pageUrl || window.location.href,
      title: pageTitle || document.title,
      content: pageContent,
      markdown: scrapedContent?.markdown,
      excerpt: scrapedContent?.excerpt,
      metadata: scrapedContent?.metadata
    });
    
    console.log('Sol: Generated system prompt length:', systemPrompt.length);

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

  useEffect(() => {
    if (window.parent === window) return; // Not inside iframe
    const el = askBarRef.current;
    if (!el) return;

    const handleEnter = () => {
      try {
        window.parent.postMessage({ type: 'sol-pointer-lock', enabled: true }, '*');
      } catch (_) {
        // Ignore cross-origin errors
      }
    };

    const handleLeave = () => {
      try {
        window.parent.postMessage({ type: 'sol-pointer-lock', enabled: false }, '*');
      } catch (_) {
        // Ignore cross-origin errors
      }
    };

    el.addEventListener('mouseenter', handleEnter);
    el.addEventListener('mouseleave', handleLeave);

    return () => {
      el.removeEventListener('mouseenter', handleEnter);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  return (
    <div className={`askbar-container ${currentPosition}`}>
      <div 
        ref={askBarRef}
        className={`sol-ask-bar bg-white/70 backdrop-blur-md rounded-2xl ${
          isClosing ? 'animate-out' : isVisible ? 'opacity-100 scale-100 translate-y-0 transition-all duration-300 ease-out' : 'opacity-0 scale-95 -translate-y-2'
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
          {conversationHistory.map((message, index) => {
            const isNew = message.timestamp > mountTimeRef.current;
            return (
            <div
              key={index}
              className={`
                mb-3 last:mb-0 relative group
                ${isNew && false ? 'opacity-0 translate-y-2 animate-in' : ''}
                transition-all duration-300 ease-out
                ${message.type === 'user' ? 'text-right' : 'text-left'}
              `}
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
                  >
                    <MarkdownRenderer content={message.content} />
                  </div>
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
                        <HiOutlineClipboard className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
            );
          })}
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
              <div>URL: {pageUrl || '(loading...)'}</div>
              <div>Title: {pageTitle || '(loading...)'}</div>
              <div>Content Length: {scrapedContent?.text?.length || 0} chars</div>
              <div>Has Content: {scrapedContent?.text && scrapedContent.text.length > 0 ? 'Yes' : 'No'}</div>
              <div>Method: {scrapedContent?.metadata?.extractionMethod || 'pending'}</div>
              <div className="flex gap-1">
                <button
                  className="px-2 py-1 bg-gray-100 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-200 transition"
                  onClick={async () => {
                    if (scrapedContent?.text) {
                      await navigator.clipboard.writeText(scrapedContent.text);
                    }
                  }}
                  disabled={!scrapedContent?.text}
                  title="Copy the full scraped text to clipboard"
                >
                  Copy Text
                </button>
                <button
                  className="px-2 py-1 bg-blue-100 rounded border border-blue-300 text-xs text-blue-700 hover:bg-blue-200 transition"
                  onClick={() => {
                    console.log('Sol Debug: scrapedContent:', scrapedContent);
                    console.log('Sol Debug: text length:', scrapedContent?.text?.length);
                    console.log('Sol Debug: pageUrl:', pageUrl);
                    console.log('Sol Debug: pageTitle:', pageTitle);
                  }}
                  title="Log debug info to console"
                >
                  Debug
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 