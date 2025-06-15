import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HiXMark, HiClipboardDocument, HiArrowRight, HiCheck } from 'react-icons/hi2';
import browser from 'webextension-polyfill';
import { get, saveConversation, updateConversation, Message } from '@src/utils/storage';
import { createSystemPrompt } from '@src/services/prompts';

interface AskBarProps {
  position: string;
  onUnmount?: () => void;
  initialConversation?: Message[];
  initialConversationId?: string | null;
  onConversationUpdate?: (messages: Message[], conversationId: string | null) => void;
}

export default function AskBar({ 
  position, 
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
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  
  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Position styles mapping
  const positionStyles = {
    'top-left': 'top-6 left-6',
    'top-right': 'top-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'bottom-right': 'bottom-6 right-6'
  };

  const positionClass = positionStyles[position as keyof typeof positionStyles] || positionStyles['top-right'];

  // Animation and visibility effects
  useEffect(() => {
    console.log('Sol AskBar: Component mounted');
    // Trigger entrance animation
    setTimeout(() => {
      setIsVisible(true);
      inputRef.current?.focus();
      console.log('Sol AskBar: Visibility set to true, input focused');
    }, 10);
  }, []);

  // Update conversation in parent when it changes
  useEffect(() => {
    if (onConversationUpdate) {
      onConversationUpdate(conversationHistory, currentConversationId);
    }
  }, [conversationHistory, currentConversationId, onConversationUpdate]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  const scrapePageContent = useCallback((): string => {
    // Create a deep clone of the body to work with, preserving the original page
    const content = document.body.cloneNode(true) as HTMLElement;

    // Remove elements that are typically not part of the main content
    const selectorsToRemove = [
      'script', 'style', 'noscript', 'nav', 'footer', 'aside', 'header',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
      '#comments', '.comments', '#sidebar', '.sidebar', 'button', 'form'
    ];

    content.querySelectorAll(selectorsToRemove.join(', ')).forEach(el => el.remove());
    
    // Attempt to find the main content block for better focus
    let mainContent: HTMLElement | null = content.querySelector('main, article, [role="main"]');
    const textSource = mainContent || content;
    
    // Use innerText as it approximates the rendered text and handles line breaks better
    let text = textSource.innerText;

    // Clean up excessive whitespace and newlines for a cleaner output
    text = text
      .replace(/([ \t]){2,}/g, ' ') // Collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n');   // Collapse 3+ newlines into a paragraph break

    return text.trim();
  }, []);

  const parseResponseForQuotes = useCallback((text: string): string => {
    return text.replace(/<quote>(.*?)<\/quote>/g, (_match, quoteText) => {
      return `<blockquote class="sol-quote">${quoteText}</blockquote>`;
    });
  }, []);

  const saveConversationToStorage = useCallback(async () => {
    try {
      console.log('Sol: Saving conversation to storage...', { 
        currentConversationId, 
        historyLength: conversationHistory.length 
      });
      
      if (!currentConversationId) {
        // Create new conversation
        const title = conversationHistory[0]?.content.substring(0, 50) + '...' || 'New Conversation';
        const newId = await saveConversation({
          url: window.location.href,
          title,
          messages: conversationHistory
        });
        setCurrentConversationId(newId);
        console.log('Sol: Created new conversation with ID:', newId);
      } else {
        // Update existing conversation
        await updateConversation(currentConversationId, {
          messages: conversationHistory
        });
        console.log('Sol: Updated existing conversation:', currentConversationId);
      }
    } catch (error) {
      console.error('Sol: Failed to save conversation:', error);
    }
  }, [conversationHistory, currentConversationId]);

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
    const pageContent = scrapePageContent();
    const systemPrompt = createSystemPrompt({
      url: window.location.href,
      title: document.title,
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
    console.log("Sol Content Script: Sending streamChat message to background.");
    browser.runtime.sendMessage({
      type: 'streamChat',
      data: { ...settings, messages }
    }).catch(error => {
      console.error("Sol Content Script: Error sending message to background script.", error);
      setConversationHistory(prev => {
        const newHistory = [...prev];
        const lastMessage = newHistory[newHistory.length - 1];
        if (lastMessage && lastMessage.type === 'assistant') {
          lastMessage.content = `Error: Could not connect to background service. Please try reloading the extension.`;
        }
        return newHistory;
      });
      setIsStreaming(false);
      browser.runtime.onMessage.removeListener(messageListener);
    });
  }, [input, isStreaming, conversationHistory, scrapePageContent, expandToConversation]);

  // Save conversation when history changes
  useEffect(() => {
    if (conversationHistory.length > 0) {
      saveConversationToStorage();
    }
  }, [conversationHistory, saveConversationToStorage]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      if (onUnmount) {
        onUnmount();
      }
    }, 300);
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

  return (
    <div
      className={`
        sol-ask-bar ${positionClass}
        ${isExpanded ? 'w-[500px] p-3' : 'w-[400px] p-2'} max-w-[calc(100vw-48px)]
        bg-white/70 backdrop-blur-md backdrop-saturate-150
        rounded-2xl
        transition-all duration-300 ease-out
        ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2'}
      `}
    >
      {/* Conversation History */}
      <div
        ref={conversationRef}
        className={`
          overflow-y-auto scroll-smooth
          transition-all duration-300 ease-out
          ${isExpanded ? 'max-h-[300px] mb-3 pb-3 sol-conversation-divider' : 'max-h-0'}
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
    </div>
  );
} 