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
  isCollective?: boolean; // For collective chips like "All tabs" or "Matching X"
  searchTerm?: string; // For collective search chips
  count?: number; // Number of tabs represented
  tabIds?: number[]; // For collective chips, the actual tab IDs they represent
}

interface InlineChip {
  id: string; // Unique identifier for the chip
  tabId?: number; // For individual tab chips
  type: 'tab' | 'collective';
  title: string;
  favIconUrl?: string;
  searchTerm?: string; // For collective chips
  tabIds?: number[]; // For collective chips
}

interface TabMention {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

// Simple inline mention patterns for text parsing
const INLINE_TAB_PATTERN = /🔗([^🔗]+)🔗/g;

export const AskBar: React.FC = () => {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedTabChips, setSelectedTabChips] = useState<TabChip[]>([]);
  const [availableTabs, setAvailableTabs] = useState<TabChip[]>([]);
  const [hasAutoAddedCurrentTab, setHasAutoAddedCurrentTab] = useState(false);

  // @ mention UI state
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredTabs, setFilteredTabs] = useState<TabInfo[]>([]);
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');

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

  // Helper functions
  const extractTabIdsFromText = (text: string): number[] => {
    const tabIds: number[] = [];
    
    // Find collective chips in selected chips that have tabIds
    selectedTabChips.forEach(chip => {
      if (chip.isCollective && chip.tabIds) {
        const chipText = `🔗${chip.title}🔗`;
        if (text.includes(chipText)) {
          tabIds.push(...chip.tabIds);
        }
      }
    });

    // Find individual tab mentions in text
    const matches = text.matchAll(INLINE_TAB_PATTERN);
    for (const match of matches) {
      const chipTitle = match[1];
      const tab = availableTabs.find(t => t.title === chipTitle);
      if (tab) {
        tabIds.push(tab.id);
      }
    }

    return [...new Set(tabIds)]; // Remove duplicates
  };

  const insertTabMention = (tab: TabChip | { id: number; title: string; url: string; favIconUrl?: string }) => {
    if (mentionStartPos === -1) return;

    const before = input.substring(0, mentionStartPos);
    const after = input.substring(inputRef.current?.selectionStart || mentionStartPos);
    
    if (tab.id === -1) {
      // Special case for "All tabs" or "All visible results"
      const isSearching = searchTerm.trim().length > 0;
      const tabsToAdd = isSearching ? filteredTabs : availableTabs;
      
      // Create ONE collective chip
      const collectiveTitle = isSearching ? `Matching "${searchTerm}"` : 'All open tabs';
      const collectiveChip: TabChip = {
        id: Date.now(), // Unique ID for collective chip
        title: collectiveTitle,
        url: '',
        isCollective: true,
        searchTerm: isSearching ? searchTerm : undefined,
        count: tabsToAdd.length,
        tabIds: tabsToAdd.map(t => t.id)
      };
      
      setSelectedTabChips(prev => [...prev, collectiveChip]);
      
      // Insert just ONE inline mention for the collective chip
      const inlineText = `🔗${collectiveTitle}🔗`;
      const newValue = before + inlineText + after;
      setInput(newValue);
      
    } else {
      // Individual tab selection
      const tabChip: TabChip = {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      };
      
      setSelectedTabChips(prev => [...prev, tabChip]);
      
      // Insert inline mention
      const inlineText = `🔗${tab.title}🔗`;
      const newValue = before + inlineText + after;
      setInput(newValue);
    }
    
    setShowDropdown(false);
    setMentionStartPos(-1);
    setSearchTerm('');
    
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  // Handle removing tab chips by ID (wrapper for TabChipRow interface)
  const handleTabRemoveById = (tabId: number) => {
    const chipToRemove = selectedTabChips.find(chip => chip.id === tabId);
    if (chipToRemove) {
      // Remove from tab chips
      setSelectedTabChips(prev => prev.filter(chip => chip.id !== chipToRemove.id));
      
      // Remove corresponding inline mention from text
      const chipText = `🔗${chipToRemove.title}🔗`;
      const updatedText = input.replace(chipText, '');
      setInput(updatedText);
    }
  };

  // Handle re-adding tabs from message history
  const handleTabReAdd = (tab: { id: number; title: string; url: string; favIconUrl?: string }) => {
    // Check if tab is already selected
    const isAlreadySelected = selectedTabChips.some(chip => chip.id === tab.id);
    if (!isAlreadySelected) {
      const tabChip: TabChip = {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      };
      setSelectedTabChips(prev => [...prev, tabChip]);
    }
  };

  // Effects
  useEffect(() => {
    setIsVisible(true);
    inputRef.current?.focus();
  }, []);

  // Initialize messaging system to receive updates from controller
  useEffect(() => {
    const cleanupTabHandler = portManager.current.addIframeHandler<IframeCurrentTabResponseMsg>('IFRAME_CURRENT_TAB_RESPONSE', (message) => {
      setCurrentTabId(message.tabId);
      setPageUrl(message.url);
    });

    const getCurrentTabMsg: IframeGetCurrentTabMsg = { type: 'IFRAME_GET_CURRENT_TAB' };
    portManager.current.sendToParent(getCurrentTabMsg);

    return () => {
      cleanupTabHandler();
    };
  }, []);

  // Load available tabs for tab chips and auto-update
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
    
    // Auto-update tabs every 2 seconds when dropdown is visible
    const interval = showDropdown ? setInterval(loadAvailableTabs, 2000) : null;
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showDropdown]);

  // Auto-add current tab when Ask Bar opens (only once)
  useEffect(() => {
    if (currentTabId && availableTabs.length > 0 && !hasAutoAddedCurrentTab) {
      const currentTab = availableTabs.find(tab => tab.id === currentTabId);
      if (currentTab) {
        const currentTabChip: TabChip = {
          id: currentTab.id,
          title: currentTab.title,
          url: currentTab.url,
          favIconUrl: currentTab.favIconUrl
        };
        setSelectedTabChips([currentTabChip]);
        setHasAutoAddedCurrentTab(true); // Mark as auto-added, never do it again
      }
    }
  }, [currentTabId, availableTabs, hasAutoAddedCurrentTab]);

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

  const handleInputChange = (newValue: string) => {
    const previousValue = input;
    setInput(newValue);

    // Check for removed inline mentions and sync tab chips
    if (previousValue !== newValue) {
      const previousMentions = extractInlineMentions(previousValue);
      const currentMentions = extractInlineMentions(newValue);
      
      // Find mentions that were removed
      const removedMentions = previousMentions.filter(prevMention => 
        !currentMentions.some(currMention => currMention === prevMention)
      );
      
      // Remove corresponding tab chips
      if (removedMentions.length > 0) {
        setSelectedTabChips(prev => prev.filter(chip => {
          const chipText = `🔗${chip.title}🔗`;
          return !removedMentions.includes(chipText);
        }));
      }
    }

    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const afterAt = textBeforeCursor.substring(atIndex + 1);
      
      if (!afterAt.includes(' ') && afterAt.length >= 0) {
        setMentionStartPos(atIndex);
        setShowDropdown(true);
        setDropdownSelectedIndex(0);
        
        const searchTermValue = afterAt.toLowerCase();
        setSearchTerm(searchTermValue);
        const filtered = availableTabs.filter(tab => tab.title.toLowerCase().includes(searchTermValue));
        setFilteredTabs(filtered);
      } else {
        setShowDropdown(false);
        setSearchTerm('');
      }
    } else {
      setShowDropdown(false);
      setMentionStartPos(-1);
      setSearchTerm('');
    }
  };

  // Helper function to extract inline mentions from text
  const extractInlineMentions = (text: string): string[] => {
    const mentions: string[] = [];
    const matches = text.matchAll(INLINE_TAB_PATTERN);
    for (const match of matches) {
      mentions.push(match[0]); // The full match including 🔗🔗
    }
    return mentions;
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();

    if (showDropdown) {
      const totalOptions = filteredTabs.length + 1; // +1 for "All tabs"
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropdownSelectedIndex(prev => (prev + 1) % totalOptions);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropdownSelectedIndex(prev => prev === 0 ? 0 : prev - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dropdownSelectedIndex === 0) {
          // "All tabs" option
          insertTabMention({
            id: -1,
            title: searchTerm ? `Matching "${searchTerm}"` : 'All open tabs',
            url: '',
            favIconUrl: undefined
          });
        } else if (filteredTabs.length > 0 && dropdownSelectedIndex - 1 < filteredTabs.length) {
          insertTabMention(filteredTabs[dropdownSelectedIndex - 1]);
        }
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

    // Use selected tab IDs
    const tabsToUse = extractTabIdsFromText(input);
    
    // Add any selected chips that aren't in the text
    const chipTabIds = selectedTabChips.flatMap(chip => 
      chip.isCollective && chip.tabIds ? chip.tabIds : [chip.id]
    );
    const allTabIds = [...new Set([...tabsToUse, ...chipTabIds])];

    // Dispatch action to add user message with tab context (can be empty)
    dispatchAction('ADD_USER_MESSAGE', {
      content: input.trim(),
      timestamp: Date.now(),
      tabIds: allTabIds.length > 0 ? allTabIds : undefined // Only include tabIds if there are tabs
    });

    // Only scrape content if we have tabs to scrape
    if (allTabIds.length > 0) {
      try {
        await uiPortService.current.getContent(allTabIds);
      } catch (err) {
        console.warn('Sol AskBar: getContent failed', err);
      }
    }
    
    // Send message via chat system (empty array is fine)
    chatActions.sendMessage(input.trim(), allTabIds, currentConversationId || 'new');

    // Clear input but KEEP tab chips for persistent context
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

  return (
    <div 
      ref={askBarRef}
      className={`fixed z-[2147483647] transition-all duration-300 ease-in-out sol-font-inter ${getPositionClasses(position)}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible && !isClosing ? 1 : 0.9}) translateY(${isVisible && !isClosing ? 0 : 10}px)`,
        maxWidth: '90vw',
        maxHeight: '90vh'
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {isExpanded ? (
        // Expanded Mode - Full Conversation Container  
        <div 
          className="backdrop-blur-[16px] rounded-[28px] border-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out sol-conversation-shadow sol-font-inter"
           style={{ 
            width: '436px',
            maxHeight: '600px',
            height: 'auto',
            backgroundColor: 'rgba(255, 255, 255, 0.8)'
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
              availableTabs={availableTabs}
              onTabReAdd={handleTabReAdd}
            />
          </div>

          {/* Input Area within conversation container */}
          <div className="p-2">
            <div 
              className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow sol-font-inter"
              style={{ 
                width: '420px',
                backgroundColor: 'white'
              }}
            >
              <TabChipRow tabs={selectedTabChips} onRemove={handleTabRemoveById} />

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
                  searchTerm={searchTerm}
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
          className="rounded-[20px] border-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out transform sol-input-shadow-large sol-font-inter"
          style={{ 
            width: '420px',
            backgroundColor: 'white'
          }}
        >
          <TabChipRow tabs={selectedTabChips} onRemove={handleTabRemoveById} />

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
              searchTerm={searchTerm}
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