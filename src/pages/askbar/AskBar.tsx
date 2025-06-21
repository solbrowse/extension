import '@src/utils/logger';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Message } from '@src/services/storage';
import { ScrapedContent } from '@src/services/contentScraper';
import {
  ConversationList,
  TabMentionInput,
  useCopyMessage,
  useConversationStorage
} from '@src/components/index';
import { useSimpleChat } from '@src/components/hooks/useSimpleChat';
import { UiPortService } from '@src/services/messaging/uiPortService';
import { get } from '@src/services/storage';

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
  const [pageUrl, setPageUrl] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(false);

  // Refs
  const askBarRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const uiPortService = useRef<UiPortService>(UiPortService.getInstance());

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();
  
  useConversationStorage(
    conversationHistory,
    currentConversationId,
    setCurrentConversationId,
    pageUrl
  );

  // Chat system with conversation history support
  const [chatState, chatActions] = useSimpleChat(
    (message: Message) => {
      setConversationHistory(prev => [...prev, message]);
    },
    (delta: string) => {
      // Update the last assistant message with streaming content
      setConversationHistory(prev => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage && lastMessage.type === 'assistant') {
          lastMessage.content += delta;
        } else {
          // Create new assistant message if none exists
          updated.push({
            type: 'assistant',
            content: delta,
            timestamp: Date.now()
          });
        }
        return updated;
      });
    },
    () => conversationHistory // Provide conversation history to the hook
  );

  // Effects
  useEffect(() => {
    setIsVisible(true);

    // Load debug flag from storage once
    (async () => {
      try {
        const settings = await get();
        setDebugEnabled(!!settings.debug);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    // Send conversation updates to parent content script for persistence
    window.parent.postMessage({
      type: 'sol-update-tab-conversation',
      messages: conversationHistory,
      conversationId: currentConversationId
    }, '*');
    
    // Also call the optional callback if provided
    if (onConversationUpdate) {
      onConversationUpdate(conversationHistory, currentConversationId);
    }
  }, [conversationHistory, currentConversationId, onConversationUpdate]);

  // Initialize current tab and get page content from current tab
  useEffect(() => {
    const initializeCurrentTab = async () => {
      try {
        // Listen for current tab response from parent (content script)
        const handleCurrentTabResponse = (event: MessageEvent) => {
          if (event.data?.type === 'sol-current-tab-response' && event.data.tabId) {
            console.log('Sol AskBar: Received current tab from parent:', event.data.tabId);
            setCurrentTabId(event.data.tabId);
            setPageUrl(event.data.url || window.location.href);
            setPageTitle(event.data.title || document.title);
          }
        };

        window.addEventListener('message', handleCurrentTabResponse);
        
        // Request current tab info from parent (content script)
        window.parent.postMessage({ type: 'sol-get-current-tab' }, '*');

        return () => {
          window.removeEventListener('message', handleCurrentTabResponse);
        };
      } catch (error) {
        console.error('Sol AskBar: Error initializing current tab:', error);
      }
    };

    initializeCurrentTab();
  }, []);

  // Auto-select current tab when available and no tabs selected
  useEffect(() => {
    if (currentTabId && selectedTabIds.length === 0) {
      setSelectedTabIds([currentTabId]);
    }
  }, [currentTabId]);

  // Validate and clean up selected tabs (remove closed tabs)
  useEffect(() => {
    if (selectedTabIds.length === 0) return;

    const validateSelectedTabs = async () => {
      try {
        // Get current live tabs
        const liveTabs = await uiPortService.current.listTabs();
        const liveTabIds = new Set(liveTabs.map(tab => tab.id));
        
        // Filter out closed tabs
        const validTabIds = selectedTabIds.filter(id => liveTabIds.has(id));
        
        // Update selection if any tabs were closed
        if (validTabIds.length !== selectedTabIds.length) {
          console.log(`Sol AskBar: Removed ${selectedTabIds.length - validTabIds.length} closed tabs from selection`);
          setSelectedTabIds(validTabIds);
          
          // Auto-select current tab if no tabs left
          if (validTabIds.length === 0 && currentTabId) {
            setSelectedTabIds([currentTabId]);
          }
        }
      } catch (error) {
        console.error('Sol AskBar: Failed to validate selected tabs:', error);
      }
    };

    // Only validate when window gains focus (user might have closed tabs)
    const handleFocus = () => {
      validateSelectedTabs();
    };

    window.addEventListener('focus', handleFocus);
    
    // Initial validation (but not on every re-render)
    const timer = setTimeout(validateSelectedTabs, 1000);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearTimeout(timer);
    };
  }, []); // Empty dependency array - only run once on mount

  // Position and resize logic
  useLayoutEffect(() => {
    const sendBounds = () => {
      if (askBarRef.current) {
        const rect = askBarRef.current.getBoundingClientRect();
        // Send bounds in the format expected by iframeInjector
        window.parent.postMessage({
          type: 'sol-askbar-bounds',
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          }
        }, '*');
      }
    };

    const observer = new ResizeObserver(sendBounds);
    if (askBarRef.current) {
      observer.observe(askBarRef.current);
    }

    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'sol-request-askbar-bounds') {
        sendBounds();
      } else if (event.data?.type === 'sol-init') {
        console.log('Sol AskBar: Received init message:', event.data);
      }
    };

    window.addEventListener('message', messageHandler);
    
    // Send bounds immediately and after a short delay
    sendBounds();
    setTimeout(sendBounds, 100);

    return () => {
      observer.disconnect();
      window.removeEventListener('message', messageHandler);
    };
  }, [isExpanded, conversationHistory.length]);

  // Mouse interaction handlers for pointer events
  useLayoutEffect(() => {
    const handleEnter = () => {
      // Enable pointer events when mouse enters AskBar
      window.parent.postMessage({ 
        type: 'sol-pointer-lock', 
        enabled: true 
      }, '*');
    };

    const handleLeave = () => {
      // Disable pointer events when mouse leaves AskBar
      window.parent.postMessage({ 
        type: 'sol-pointer-lock', 
        enabled: false 
      }, '*');
    };

    const askBar = askBarRef.current;
    if (askBar) {
      askBar.addEventListener('mouseenter', handleEnter);
      askBar.addEventListener('mouseleave', handleLeave);

      return () => {
        askBar.removeEventListener('mouseenter', handleEnter);
        askBar.removeEventListener('mouseleave', handleLeave);
      };
    }
  }, []);

  const handleClose = () => {
    if (Date.now() - mountTimeRef.current < 200) {
      console.log('Sol AskBar: Ignoring close during mount animation');
      return;
    }

    console.log('Sol AskBar: Close button clicked');
    
    // Ensure conversation is saved before closing
    window.parent.postMessage({
      type: 'sol-update-tab-conversation',
      messages: conversationHistory,
      conversationId: currentConversationId
    }, '*');
    
    setIsClosing(true);
    setIsVisible(false);
    
    // Send close message immediately, but with animation timing
    setTimeout(() => {
      window.parent.postMessage({ type: 'sol-close-askbar' }, '*');
      onUnmount?.();
    }, 200); // Shorter delay for better responsiveness
  };

  const handleTabsChange = (tabIds: number[]) => {
    setSelectedTabIds(tabIds);
  };

  const handleSubmit = () => {
    if (!input.trim()) return;

    // Create user message
    const userMessage: Message = {
      type: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };
    setConversationHistory(prev => [...prev, userMessage]);

    // Determine which tabs to include
    let tabsToUse = selectedTabIds;
    
    // If no tabs selected but we have current tab, auto-include it
    if (tabsToUse.length === 0 && currentTabId) {
      tabsToUse = [currentTabId];
      setSelectedTabIds([currentTabId]);
    }

    // Add empty assistant message placeholder for streaming
    const assistantMessage: Message = {
      type: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    setConversationHistory(prev => [...prev, assistantMessage]);
    
    // Send message with conversation context
    chatActions.sendMessage(input.trim(), tabsToUse, currentConversationId || 'new');

    // Clear input and expand
    setInput('');
    setIsExpanded(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  // Listen for context response to copy to clipboard
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'sol-context-response') {
        const text = JSON.stringify(event.data.context, null, 2);
        navigator.clipboard.writeText(text).then(() => {
          console.log('Sol AskBar: Context copied to clipboard');
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div 
      ref={askBarRef}
      className="fixed top-4 right-4 z-[2147483647] transition-all duration-300 ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible && !isClosing ? 1 : 0.95})`,
        maxWidth: '90vw',
        maxHeight: '70vh',
        minHeight: 'auto'
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-visible" 
           style={{ 
             width: isExpanded ? '480px' : '360px',
             minHeight: '60px'
           }}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold">S</span>
            </div>
            <span className="font-medium">Sol</span>
            {selectedTabIds.length > 0 && (
              <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded-full">
                {selectedTabIds.length} tab{selectedTabIds.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-6 h-6 hover:bg-white hover:bg-opacity-20 rounded-full flex items-center justify-center transition-colors"
          >
            <span className="text-sm">×</span>
          </button>
        </div>

        {/* Conversation */}
        {isExpanded && conversationHistory.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            <ConversationList
              messages={conversationHistory}
              copiedMessageIndex={copiedMessageIndex}
              onCopyMessage={handleCopyMessage}
            />
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-gray-100">
          <TabMentionInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onSelectedTabsChange={handleTabsChange}
            initialSelectedTabs={selectedTabIds}
            placeholder="Ask about this page or @mention other tabs..."
            disabled={chatState.isStreaming}
            showDebug={debugEnabled}
          />
          
          {chatState.error && (
            <div className="mt-2 text-red-600 text-sm">
              {chatState.error}
            </div>
          )}
          
          {chatState.isStreaming && (
            <div className="mt-2 text-blue-600 text-sm flex items-center">
              <div className="animate-spin w-3 h-3 border border-blue-600 border-t-transparent rounded-full mr-2"></div>
              Sol is thinking...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AskBar;