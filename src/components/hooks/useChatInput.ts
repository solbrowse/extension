import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { UiPortService, TabInfo } from '@src/services/messaging/uiPortService';
import { useConversationService } from './useConversationService';
import { useSimpleChat } from './useSimpleChat';

export interface TabChip {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  isCollective?: boolean;
  searchTerm?: string;
  count?: number;
  tabIds?: number[];
}

// Simple inline mention patterns for text parsing
const INLINE_TAB_PATTERN = /🔗([^🔗]+)🔗/g;

export interface UseChatInputReturn {
  // Input state
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  
  // Tab chips state
  selectedTabChips: TabChip[];
  availableTabs: TabChip[];
  
  // Dropdown state
  showDropdown: boolean;
  filteredTabs: TabInfo[];
  dropdownSelectedIndex: number;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  searchTerm: string;
  
  // Chat state
  chatState: any;
  isStreaming: boolean;
  error: string | null;
  
  // Handlers
  handleInputChange: (newValue: string) => void;
  handleInputKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleSubmit: () => Promise<void>;
  handleTabRemoveById: (tabId: number) => void;
  handleTabReAdd: (tab: { id: number; title: string; url: string; favIconUrl?: string }) => void;
  insertTabMention: (tab: TabChip | { id: number; title: string; url: string; favIconUrl?: string }) => void;
  setDropdownSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  
  // Utility functions
  truncateTitle: (title: string, maxLength?: number) => string;
}

export const useChatInput = (): UseChatInputReturn => {
  // Input state
  const [input, setInput] = useState('');
  const [selectedTabChips, setSelectedTabChips] = useState<TabChip[]>([]);
  const [availableTabs, setAvailableTabs] = useState<TabChip[]>([]);

  // @ mention UI state
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredTabs, setFilteredTabs] = useState<TabInfo[]>([]);
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');

  // Refs
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const uiPortService = useRef<UiPortService>(UiPortService.getInstance());

  // Services
  const conversationService = useConversationService();

  // Chat system for streaming responses
  const [chatState, chatActions] = useSimpleChat(
    (message) => {
      if (message.type === 'assistant') {
        conversationService.addAssistantMessage(message.content);
      }
    },
    (delta: string) => {
      conversationService.updateStreamingMessage(delta);
    },
    () => conversationService.messages
  );

  // Load available tabs
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
        console.error('Sol useChatInput: Failed to load available tabs:', error);
      }
    };

    loadAvailableTabs();
    
    const interval = showDropdown ? setInterval(loadAvailableTabs, 2000) : null;
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showDropdown]);

  // Helper functions
  const extractTabIdsFromText = (text: string): number[] => {
    const tabIds: number[] = [];
    
    selectedTabChips.forEach(chip => {
      if (chip.isCollective && chip.tabIds) {
        const chipText = `🔗${chip.title}🔗`;
        if (text.includes(chipText)) {
          tabIds.push(...chip.tabIds);
        }
      }
    });

    const matches = text.matchAll(INLINE_TAB_PATTERN);
    for (const match of matches) {
      const chipTitle = match[1];
      const tab = availableTabs.find(t => t.title === chipTitle);
      if (tab) {
        tabIds.push(tab.id);
      }
    }

    return [...new Set(tabIds)];
  };

  const extractInlineMentions = (text: string): string[] => {
    const mentions: string[] = [];
    const matches = text.matchAll(INLINE_TAB_PATTERN);
    for (const match of matches) {
      mentions.push(match[0]);
    }
    return mentions;
  };

  const insertTabMention = (tab: TabChip | { id: number; title: string; url: string; favIconUrl?: string }) => {
    if (mentionStartPos === -1) return;

    const before = input.substring(0, mentionStartPos);
    const after = input.substring(inputRef.current?.selectionStart || mentionStartPos);
    
    if (tab.id === -1) {
      const isSearching = searchTerm.trim().length > 0;
      const tabsToAdd = isSearching ? filteredTabs : availableTabs;
      
      const collectiveTitle = isSearching ? `Matching "${searchTerm}"` : 'All open tabs';
      const collectiveChip: TabChip = {
        id: Date.now(),
        title: collectiveTitle,
        url: '',
        isCollective: true,
        searchTerm: isSearching ? searchTerm : undefined,
        count: tabsToAdd.length,
        tabIds: tabsToAdd.map(t => t.id)
      };
      
      setSelectedTabChips(prev => [...prev, collectiveChip]);
      
      const inlineText = `🔗${collectiveTitle}🔗`;
      const newValue = before + inlineText + after;
      setInput(newValue);
    } else {
      const tabChip: TabChip = {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      };
      
      setSelectedTabChips(prev => [...prev, tabChip]);
      
      const inlineText = `🔗${tab.title}🔗`;
      const newValue = before + inlineText + after;
      setInput(newValue);
    }
    
    setShowDropdown(false);
    setMentionStartPos(-1);
    setSearchTerm('');
    
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleTabRemoveById = (tabId: number) => {
    const chipToRemove = selectedTabChips.find(chip => chip.id === tabId);
    if (chipToRemove) {
      setSelectedTabChips(prev => prev.filter(chip => chip.id !== chipToRemove.id));
      
      const chipText = `🔗${chipToRemove.title}🔗`;
      const updatedText = input.replace(chipText, '');
      setInput(updatedText);
    }
  };

  const handleTabReAdd = (tab: { id: number; title: string; url: string; favIconUrl?: string }) => {
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

  const handleInputChange = (newValue: string) => {
    const previousValue = input;
    setInput(newValue);

    if (previousValue !== newValue) {
      const previousMentions = extractInlineMentions(previousValue);
      const currentMentions = extractInlineMentions(newValue);
      
      const removedMentions = previousMentions.filter(prevMention => 
        !currentMentions.some(currMention => currMention === prevMention)
      );
      
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

  const handleInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown) {
      const totalOptions = filteredTabs.length + 1;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropdownSelectedIndex(prev => (prev + 1) % totalOptions);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropdownSelectedIndex(prev => prev === 0 ? 0 : prev - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dropdownSelectedIndex === 0) {
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
    }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const tabsToUse = extractTabIdsFromText(input);
    console.log('Sol ChatInput: Inline mentioned tabIds', tabsToUse);
    
    const chipTabIds = selectedTabChips.flatMap(chip => 
      chip.isCollective && chip.tabIds ? chip.tabIds : [chip.id]
    );
    const allTabIds = [...new Set([...tabsToUse, ...chipTabIds])];
    console.log('Sol ChatInput: All tabIds to send', allTabIds);

    let activeId = conversationService.activeConversationId;
    if (!activeId) {
      activeId = await conversationService.createNewConversation();
      console.log('Sol ChatInput: Created new conversation', activeId);
    }

    await conversationService.addUserMessage(
      input.trim(), 
      allTabIds.length > 0 ? allTabIds : undefined
    );

    if (allTabIds.length > 0) {
      try {
        const pages = await uiPortService.current.getContent(allTabIds);
        console.log('Sol ChatInput: getContent returned', pages.map(p => ({ id: p.tabId, title: p.title, contentLen: p.content.length })));
      } catch (err) {
        console.warn('Sol ChatInput: getContent failed', err);
      }
    }
    
    chatActions.sendMessage(input.trim(), allTabIds, activeId);

    setInput('');
    
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const truncateTitle = (title: string, maxLength: number = 20): string => {
    return title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
  };

  // Public methods for clearing state (useful for conversation switching)
  const clearInput = () => {
    setInput('');
    setSelectedTabChips([]);
  };

  // If conversationService eventually offers a subscription API, we can clear input on switches.
  // Currently, we skip this to avoid calling an undefined method and crashing.

  return {
    // Input state
    input,
    inputRef,
    
    // Tab chips state
    selectedTabChips,
    availableTabs,
    
    // Dropdown state
    showDropdown,
    filteredTabs,
    dropdownSelectedIndex,
    dropdownRef,
    searchTerm,
    
    // Chat state
    chatState,
    isStreaming: chatState.isStreaming,
    error: chatState.error,
    
    // Handlers
    handleInputChange,
    handleInputKeyDown,
    handleSubmit,
    handleTabRemoveById,
    handleTabReAdd,
    insertTabMention,
    setDropdownSelectedIndex,
    
    // Utility functions
    truncateTitle
  };
}; 