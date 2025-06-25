import '@src/utils/logger';
import React, { useState, useEffect, useRef, useLayoutEffect, KeyboardEvent } from 'react';
import { Message } from '@src/services/storage';
import { ConversationList, useCopyMessage } from '@src/components/index';
import { useSimpleChat } from '@src/components/hooks/useSimpleChat';
import { UiPortService, TabInfo } from '@src/services/messaging/uiPortService';
import { PortManager } from '@src/services/messaging/portManager';
import { IframeActionMsg, IframeCloseMsg, IframeGetCurrentTabMsg, IframeCurrentTabResponseMsg } from '@src/types/messaging';
import TabChipRow from './components/TabChipRow';
import InputArea from './components/InputArea';

interface TabChip {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

interface TabMention {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

// Consolidated tab mention regex pattern
const TAB_MENTION_REGEX = /@tab:(\d+):([^@]*?):/g;

export const AskBar: React.FC = () => {
  // Simple UI state only - no business logic state
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [availableTabs, setAvailableTabs] = useState<TabChip[]>([]);

  // @ mention UI state
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredTabs, setFilteredTabs] = useState<TabInfo[]>([]);
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [mentionedTabs, setMentionedTabs] = useState<TabMention[]>([]);

  // State received from controller (pure rendering component)
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [position, setPosition] = useState<string>('top-right');

  // Refs
  const askBarRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const uiPortService = useRef<UiPortService>(UiPortService.getInstance());
  const portManager = useRef<PortManager>(PortManager.getInstance());

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();

  // Chat system for streaming responses - only for API communication, no state management
  const [chatState, chatActions] = useSimpleChat(
    (message: Message) => {
      // Only dispatch action to controller, no local state management
      if (message.type === 'assistant') {
        const action: IframeActionMsg = {
          type: 'IFRAME_ACTION',
          action: {
            type: 'ADD_ASSISTANT_MESSAGE',
            payload: {
              content: message.content,
              timestamp: message.timestamp
            }
          }
        };
        portManager.current.sendToParent(action);
      }
    },
    (delta: string) => {
      // Only dispatch streaming updates to controller, no local state
      const action: IframeActionMsg = {
        type: 'IFRAME_ACTION',
        action: {
          type: 'UPDATE_STREAMING_MESSAGE',
          payload: {
            content: delta,
            timestamp: Date.now()
          }
        }
      };
      portManager.current.sendToParent(action);
    },
    () => conversationHistory
  );

  // Consolidated function to parse tab mentions from text
  const parseTabMentions = (text: string): TabMention[] => {
    const mentions: TabMention[] = [];
    const regex = new RegExp(TAB_MENTION_REGEX);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const tabId = parseInt(match[1]);
      const title = match[2];
      const tab = availableTabs.find(t => t.id === tabId);
      if (tab) {
        mentions.push({
          id: tabId,
          title: title || tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl
        });
      }
    }
    return mentions;
  };

  // Extract tab IDs from mentions in text
  const extractTabIds = (text: string): number[] => {
    const tabIds: number[] = [];
    const regex = new RegExp(TAB_MENTION_REGEX);
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const tabId = parseInt(match[1]);
      if (!isNaN(tabId)) {
        tabIds.push(tabId);
      }
    }
    return tabIds;
  };

  // Effects
  useEffect(() => {
    setIsVisible(true);
    inputRef.current?.focus();
  }, []);

  // Initialize messaging system to receive updates from controller
  useEffect(() => {
    // Listen for current tab response
    const cleanupTabHandler = portManager.current.addIframeHandler<IframeCurrentTabResponseMsg>('IFRAME_CURRENT_TAB_RESPONSE', (message) => {
      setCurrentTabId(message.tabId);
      setPageUrl(message.url);
    });

    // Request current tab info on mount
    const getCurrentTabMsg: IframeGetCurrentTabMsg = { type: 'IFRAME_GET_CURRENT_TAB' };
    portManager.current.sendToParent(getCurrentTabMsg);

    return () => {
      cleanupTabHandler();
    };
  }, []);

  // Load available tabs for tab chips (this is UI-specific, so can stay here)
  useEffect(() => {
    const loadAvailableTabs = async () => {
      try {
        const tabs = await uiPortService.current.listTabs();
        const tabChips: TabChip[] = tabs.map(tab => ({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl
        }));
        setAvailableTabs(tabChips);
      } catch (error) {
        console.error('Sol AskBar: Failed to load available tabs:', error);
      }
    };

    loadAvailableTabs();
  }, []);

  // Auto-select current tab when available and no tabs selected
  useEffect(() => {
    if (currentTabId && selectedTabIds.length === 0) {
      setSelectedTabIds([currentTabId]);
    }
  }, [currentTabId]);

  // Sync mentioned tabs with selected tabs
  useEffect(() => {
    const mentionedTabIds = mentionedTabs.map(tab => tab.id);
    if (mentionedTabIds.length > 0) {
      const newSelectedTabIds = [...new Set([...selectedTabIds, ...mentionedTabIds])];
      if (newSelectedTabIds.length !== selectedTabIds.length) {
        setSelectedTabIds(newSelectedTabIds);
      }
    }
  }, [mentionedTabs]);

  // Position and resize logic (UI-specific)
  useLayoutEffect(() => {
    const sendBounds = () => {
      if (askBarRef.current) {
        const rect = askBarRef.current.getBoundingClientRect();
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
        // Initialize state from controller
        if (event.data.position) {
          setPosition(event.data.position);
        }
        if (event.data.conversationHistory) {
          setConversationHistory(event.data.conversationHistory);
          setIsExpanded(event.data.conversationHistory.length > 0);
        }
        if (event.data.conversationId !== undefined) {
          setCurrentConversationId(event.data.conversationId);
        }
      } else if (event.data?.type === 'sol-state-update') {
        // Update state from controller
        if (event.data.conversationHistory) {
          setConversationHistory(event.data.conversationHistory);
          setIsExpanded(event.data.conversationHistory.length > 0);
        }
        if (event.data.conversationId !== undefined) {
          setCurrentConversationId(event.data.conversationId);
        }
      } else if (event.data?.type === 'sol-trigger-close') {
        // Trigger the same close animation as the X button
        handleClose();
      }
    };

    window.addEventListener('message', messageHandler);
    sendBounds();
    setTimeout(sendBounds, 100);

    return () => {
      observer.disconnect();
      window.removeEventListener('message', messageHandler);
    };
  }, [isExpanded, conversationHistory.length]);

  // Mouse interaction handlers for pointer events (UI-specific)
  useLayoutEffect(() => {
    const handleEnter = () => {
      window.parent.postMessage({ type: 'sol-pointer-lock', enabled: true }, '*');
    };

    const handleLeave = () => {
      window.parent.postMessage({ type: 'sol-pointer-lock', enabled: false }, '*');
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

  // Action dispatchers - send actions to controller instead of managing state
  const dispatchAction = (actionType: string, payload: any) => {
    const action: IframeActionMsg = {
      type: 'IFRAME_ACTION',
      action: { type: actionType as any, payload }
    };
    portManager.current.sendToParent(action);
  };

  const handleClose = () => {
    if (Date.now() - mountTimeRef.current < 200) return;
    
    setIsClosing(true);
    setIsVisible(false);
    
    setTimeout(() => {
      const closeMsg: IframeCloseMsg = { type: 'IFRAME_CLOSE' };
      portManager.current.sendToParent(closeMsg);
    }, 300);
  };

  const handleTabRemove = (tabId: number) => {
    setSelectedTabIds(prev => prev.filter(id => id !== tabId));
  };

  const insertTabMention = (tab: TabChip) => {
    if (mentionStartPos === -1) return;

    const before = input.substring(0, mentionStartPos);
    const after = input.substring(inputRef.current?.selectionStart || mentionStartPos);
    const mention = `@tab:${tab.id}:${tab.title}:`;
    const newValue = before + mention + after;
    
    setInput(newValue);
    setShowDropdown(false);
    setMentionStartPos(-1);
    
    setTimeout(() => {
      inputRef.current?.focus();
      const newPos = before.length + mention.length;
      inputRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleInputChange = (newValue: string) => {
    setInput(newValue);
    
    const newMentions = parseTabMentions(newValue);
    setMentionedTabs(newMentions);

    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const afterAt = textBeforeCursor.substring(atIndex + 1);
      
      if (!afterAt.includes(':')) {
        setMentionStartPos(atIndex);
        setShowDropdown(true);
        setDropdownSelectedIndex(0);
        
        const searchTerm = afterAt.toLowerCase();
        const filtered = availableTabs.filter(tab => 
          tab.title.toLowerCase().includes(searchTerm) ||
          tab.url.toLowerCase().includes(searchTerm)
        );
        setFilteredTabs(filtered);
      } else {
        setShowDropdown(false);
      }
    } else {
      setShowDropdown(false);
      setMentionStartPos(-1);
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();

    if (showDropdown && filteredTabs.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropdownSelectedIndex(prev => (prev + 1) % filteredTabs.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropdownSelectedIndex(prev => (prev - 1 + filteredTabs.length) % filteredTabs.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertTabMention(filteredTabs[dropdownSelectedIndex]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        setMentionStartPos(-1);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    // Get tab IDs from mentions and selected tabs
    const mentionedTabIds = extractTabIds(input);
    const allTabIds = [...new Set([...selectedTabIds, ...mentionedTabIds])];
    const tabsToUse = allTabIds.length > 0 ? allTabIds : (currentTabId ? [currentTabId] : []);
    
    // Update selected tabs to include mentions
    if (mentionedTabIds.length > 0) {
      setSelectedTabIds(allTabIds);
    }

    // Dispatch action to add user message - no local state management
    dispatchAction('ADD_USER_MESSAGE', {
      content: input.trim(),
      timestamp: Date.now()
    });

    try {
      await uiPortService.current.getContent(tabsToUse);
    } catch (err) {
      console.warn('Sol AskBar: getContent failed', err);
    }
    
    // Send message via chat system
    chatActions.sendMessage(input.trim(), tabsToUse, currentConversationId || 'new');

    // Clear input & expand
    setInput('');
    setIsExpanded(true);
    
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  const getPositionClasses = (pos: string) => {
    switch (pos) {
      case 'top-left': return 'top-4 left-4 origin-top-left';
      case 'top-right': return 'top-4 right-4 origin-top-right';
      case 'bottom-left': return 'bottom-4 left-4 origin-bottom-left';
      case 'bottom-right': return 'bottom-4 right-4 origin-bottom-right';
      default: return 'top-4 right-4 origin-top-right';
    }
  };

  const truncateTitle = (title: string, maxLength: number = 20): string => {
    return title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
  };

  // Get selected tab chips for display
  const selectedTabChips = availableTabs.filter(tab => selectedTabIds.includes(tab.id));

  return (
    <div 
      ref={askBarRef}
      className={`fixed z-[2147483647] transition-all duration-300 ease-in-out font-inter ${getPositionClasses(position)}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible && !isClosing ? 1 : 0.9}) translateY(${isVisible && !isClosing ? 0 : 10}px)`,
        maxWidth: '90vw',
        maxHeight: '90vh',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {isExpanded ? (
        // Expanded Mode - Full Conversation Container  
        <div 
          className="backdrop-blur-[16px] rounded-[28px] border-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out sol-conversation-shadow"
           style={{ 
            width: '436px',
            maxHeight: '600px',
            minHeight: '200px',
            height: 'auto',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          <div className="p-2"></div>

          {/* Conversation Messages */}
          <div className="px-[14px] pb-2 max-h-[400px] overflow-y-auto">
            <ConversationList
              messages={conversationHistory}
              copiedMessageIndex={copiedMessageIndex}
              onCopyMessage={handleCopyMessage}
              isStreaming={chatState.isStreaming}
            />
          </div>

          {/* Input Area within conversation container */}
          <div className="p-2">
            <div 
              className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow"
              style={{ 
                width: '420px',
                backgroundColor: 'white',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              <TabChipRow tabs={selectedTabChips} onRemove={handleTabRemove} />

              <div
                style={{
                  paddingTop: selectedTabChips.length > 0 ? '8px' : '16px',
                  paddingLeft: '16px',
                  paddingRight: '14px',
                  paddingBottom: '14px'
                }}
              >
                <InputArea
                  input={input}
                  onInputChange={handleInputChange}
                  onInputKeyDown={handleInputKeyDown}
                  inputRef={inputRef}
                  showDropdown={showDropdown}
                  filteredTabs={filteredTabs}
                  dropdownSelectedIndex={dropdownSelectedIndex}
                  insertTabMention={insertTabMention as any}
                  dropdownRef={dropdownRef}
                  setDropdownSelectedIndex={setDropdownSelectedIndex}
                  truncateTitle={truncateTitle}
                  onClose={handleClose}
                  onSubmit={handleSubmit}
                  isStreaming={chatState.isStreaming}
                />
                {chatState.error && (
                  <div className="mt-2 text-red-600 text-sm">{chatState.error}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div 
          className="rounded-[20px] border-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out transform sol-input-shadow-large"
          style={{ 
            width: '420px',
            backgroundColor: 'white',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          <TabChipRow tabs={selectedTabChips} onRemove={handleTabRemove} />

          <div
            style={{
              paddingTop: selectedTabChips.length > 0 ? '8px' : '16px',
              paddingLeft: '16px',
              paddingRight: '14px',
              paddingBottom: '14px'
            }}
          >
            <InputArea
              input={input}
              onInputChange={handleInputChange}
              onInputKeyDown={handleInputKeyDown}
              inputRef={inputRef}
              showDropdown={showDropdown}
              filteredTabs={filteredTabs}
              dropdownSelectedIndex={dropdownSelectedIndex}
              insertTabMention={insertTabMention as any}
              dropdownRef={dropdownRef}
              setDropdownSelectedIndex={setDropdownSelectedIndex}
              truncateTitle={truncateTitle}
              onClose={handleClose}
              onSubmit={handleSubmit}
              isStreaming={chatState.isStreaming}
            />
            {chatState.error && (
              <div className="mt-2 text-red-600 text-sm">{chatState.error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AskBar;