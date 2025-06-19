import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Message } from '@src/services/storage';
import { ScrapedContent } from '@src/services/contentScraper';
import {
  ConversationList,
  ChatInput,
  useCopyMessage,
  useConversationStorage,
  useStreamingChat
} from '@src/components/index';

interface AskBarProps {
  position?: string;
  onUnmount?: () => void;
  initialConversation?: Message[];
  initialConversationId?: string | null;
  onConversationUpdate?: (messages: Message[], conversationId: string | null) => void;
}

export const AskBar: React.FC<AskBarProps> = ({
  position = 'top-right',
  onUnmount,
  initialConversation = [],
  initialConversationId = null,
  onConversationUpdate
}) => {
  // State
  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Message[]>(initialConversation);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(initialConversationId);
  const [isExpanded, setIsExpanded] = useState(initialConversation.length > 0);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [scrapedContent, setScrapedContent] = useState<ScrapedContent | null>(null);
  const [pageContent, setPageContent] = useState<any>(null);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');

  // Refs
  const askBarRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();
  
  useConversationStorage(
    conversationHistory,
    currentConversationId,
    setCurrentConversationId,
    pageUrl
  );

  const { isStreaming, handleSubmit: handleStreamingSubmit } = useStreamingChat({
    conversationHistory,
    setConversationHistory,
    scrapedContent,
    pageUrl,
    pageTitle,
    onConversationStart: () => setIsExpanded(true)
  });

  // Effects
  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (onConversationUpdate) {
      onConversationUpdate(conversationHistory, currentConversationId);
    }
  }, [conversationHistory, currentConversationId, onConversationUpdate]);

  // Message handling
  useEffect(() => {
    let contentReceived = false;
    const contentTimestamp = Date.now();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sol-page-content') {
        const source = contentReceived ? 'DUPLICATE' : 'FIRST';
        const timing = Date.now() - contentTimestamp;
        
        console.log(`Sol AskBar: [${source}] Received page content after ${timing}ms:`, {
          url: event.data.url,
          title: event.data.title,
          contentLength: event.data.content?.text?.length || 0,
          source: event.data.source || 'unknown'
        });
        
        if (!contentReceived) {
          setPageUrl(event.data.url || '');
          setPageTitle(event.data.title || '');
          setPageContent(event.data.content);
          
          if (event.data.content) {
            console.log('Sol AskBar: [ACCEPTED] Setting scraped content with', event.data.content.text?.length || 0, 'characters');
            setScrapedContent(event.data.content);
            contentReceived = true;
          }
        } else {
          console.log('Sol AskBar: [IGNORED] Content already received, ignoring duplicate');
        }
      } else if (event.data?.type === 'sol-init') {
        console.log('Sol AskBar: Received init message:', event.data);
        // Handle initialization if needed
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Request content from parent after iframe is ready
    const contentRequestTimeout = setTimeout(() => {
      if (!contentReceived) {
        console.log('Sol AskBar: [PRIMARY] Requesting content from parent');
        window.parent.postMessage({ type: 'sol-request-content' }, '*');
      }
    }, 100); // Much faster since this is now the primary method
    
    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(contentRequestTimeout);
    };
  }, []);

  // Clear the fallback timeout when content is received
  useEffect(() => {
    if (scrapedContent && scrapedContent.text && scrapedContent.text.length > 0) {
      console.log('Sol AskBar: Content received, no need for fallback');
      return;
    }
    
    // Only set default content after a delay if we still haven't received any
    const timeoutId = setTimeout(() => {
      // Check current state when timeout fires, not when it's set
      setScrapedContent(current => {
        if (current && current.text && current.text.length > 0) {
          console.log('Sol AskBar: Content already exists, skipping fallback');
          return current; // Don't overwrite existing content
        }
        
        console.log('Sol AskBar: Setting fallback content after timeout');
        return {
          text: '',
          markdown: '',
          title: '',
          excerpt: '',
          metadata: {
            hostname: 'pending',
            url: 'pending',
            title: '',
            byline: null,
            dir: null,
            lang: null,
            contentLength: 0,
            wordCount: 0,
            readingTimeMinutes: 0,
            hasContent: false,
            extractionMethod: 'waiting-for-parent',
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
              contentSelectors: ['waiting-for-parent'],
              imageCount: 0,
              linkCount: 0,
              paragraphCount: 0,
            }
          }
        };
      });
    }, 1000); // Wait 1 second for parent content

    return () => clearTimeout(timeoutId);
  }, [scrapedContent]);

  // Click-through functionality - expose bounds to parent for pointer events management
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

  // Pointer events management for hover states
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

  // Handlers
  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      if (onUnmount) {
        onUnmount();
      }
      if (window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'sol-close-askbar' }, '*');
        } catch (error) {
          // Ignore cross-origin errors
        }
      }
    }, 300);
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    handleStreamingSubmit(input);
    setInput('');
  };

  return (
    <div className={`askbar-container ${position}`}>
      <div 
        ref={askBarRef}
        className={`sol-ask-bar bg-white/80 backdrop-blur-md rounded-[20px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.10)] outline outline-1 outline-offset-[-0.5px] outline-black/[0.07] ${
          isClosing ? 'animate-out' : isVisible ? 'opacity-100 scale-100 translate-y-0 transition-all duration-300 ease-out' : 'opacity-0 scale-95 -translate-y-2'
        } ${isExpanded ? 'w-[560px] h-auto' : 'w-[450px] h-[60px] py-3.5 pl-5 pr-3.5'}`}
        style={{ 
          pointerEvents: 'auto'
        }}
      >
        {/* Conversation History */}
        <ConversationList
          messages={conversationHistory}
          isStreaming={isStreaming}
          copiedMessageIndex={copiedMessageIndex}
          onCopyMessage={handleCopyMessage}
          mountTime={mountTimeRef.current}
          className={`
            transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)
            ${isExpanded ? 'max-h-[300px] pt-5 mb-0 pb-3.5 px-5 sol-conversation-divider' : 'max-h-0'}
            sol-conversation
          `}
        />

        {/* Input Area */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onClose={handleClose}
          placeholder={isExpanded ? "Ask a follow-up..." : "Ask a question about this page..."}
          isStreaming={isStreaming}
          className={isExpanded ? 'py-3.5 pl-5 pr-3.5' : ''}
        />
      </div>
    </div>
  );
};

export default AskBar;