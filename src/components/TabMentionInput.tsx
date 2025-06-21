import React, { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { UiPortService, TabInfo } from '@src/services/messaging/uiPortService';

interface TabMention {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

interface TabMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectedTabsChange: (tabIds: number[]) => void;
  initialSelectedTabs?: number[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const TabMentionInput: React.FC<TabMentionInputProps> = ({
  value,
  onChange,
  onSubmit,
  onSelectedTabsChange,
  initialSelectedTabs = [],
  placeholder = "Ask about this page or type @ to include other tabs...",
  disabled = false,
  className = ''
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<TabInfo[]>([]);
  const [filteredTabs, setFilteredTabs] = useState<TabInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);
  const [mentionedTabs, setMentionedTabs] = useState<TabMention[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const uiPortService = UiPortService.getInstance();

  // Load tabs when component mounts
  useEffect(() => {
    loadTabs();
  }, []);

  // Add event listener for tab refreshes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sol-refresh-tabs') {
        loadTabs();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Update parent with selected tab IDs (debounced to prevent performance issues)
  useEffect(() => {
    const timer = setTimeout(() => {
      const mentionedTabIds = mentionedTabs.map(tab => tab.id);
      // Combine mentioned tabs with initial selected tabs (without duplicates)
      const allSelectedIds = [...new Set([...initialSelectedTabs, ...mentionedTabIds])];
      onSelectedTabsChange(allSelectedIds);
    }, 100); // Reduced debounce for better responsiveness
    
    return () => clearTimeout(timer);
  }, [mentionedTabs, initialSelectedTabs]);

  const loadTabs = async () => {
    setIsLoadingTabs(true);
    try {
      const tabs = await uiPortService.listTabs();
      setAvailableTabs(tabs);
    } catch (error) {
      console.error('Sol TabMentionInput: Failed to load tabs:', error);
    } finally {
      setIsLoadingTabs(false);
    }
  };

  const parseTabMentions = (text: string): TabMention[] => {
    const mentions: TabMention[] = [];
    const mentionRegex = /@tab:(\d+):([^@]*?):/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
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

  // NEW: Function to render value with inline visual tags
  const renderValueWithInlineTags = (rawValue: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const mentionRegex = /@tab:(\d+):([^@]*?):/g;
    let match;

    while ((match = mentionRegex.exec(rawValue)) !== null) {
      const [fullMatch, tabIdStr, title] = match;
      const tabId = parseInt(tabIdStr);
      const tab = availableTabs.find(t => t.id === tabId);
      
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`} className="text-gray-900">
            {rawValue.substring(lastIndex, match.index)}
          </span>
        );
      }

      // Add beautiful inline tag chip (like in the image)
      if (tab) {
        const truncatedTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
        parts.push(
          <span
            key={`mention-${tabId}-${match.index}`}
            className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer text-sm font-medium pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Inline tag clicked, removing tab:', tabId);
              removeMention(tabId);
              // Focus back to textarea
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
            title={`${tab.title} - Click to remove`}
          >
            {tab.favIconUrl && (
              <img 
                src={tab.favIconUrl} 
                alt="" 
                className="w-3 h-3 mr-1 rounded-sm flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <span className="font-medium">{truncatedTitle}</span>
          </span>
        );
      } else {
        // If tab not found, just show the text
        parts.push(
          <span key={`unknown-${match.index}`} className="text-gray-400">
            {fullMatch}
          </span>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < rawValue.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="text-gray-900">
          {rawValue.substring(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  const handleInputChange = (newValue: string) => {
    // Update parent immediately
    onChange(newValue);
    
    // Update mentioned tabs
    const newMentions = parseTabMentions(newValue);
    setMentionedTabs(newMentions);

    // Check for @ mentions - FIXED: Show dropdown on just "@"
    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = newValue.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const afterAt = textBeforeCursor.substring(atIndex + 1);
      
      // FIXED: Show dropdown on just "@" or "@" + search term
      if (!afterAt.includes(' ') && !afterAt.includes('@')) {
        setMentionStartPos(atIndex);
        
        // Refresh tabs when user starts typing @ (in case new tabs were opened)
        if (afterAt === '') {
          loadTabs();
        }
        
        // Filter tabs based on what's typed after @
        const searchTerm = afterAt.toLowerCase();
        const filtered = availableTabs.filter(tab => 
          searchTerm === '' || // Show all tabs for just "@"
          tab.title.toLowerCase().includes(searchTerm) ||
          tab.url.toLowerCase().includes(searchTerm)
        );
        
        setFilteredTabs(filtered);
        setSelectedIndex(0);
        setShowDropdown(true);
      } else {
        setShowDropdown(false);
      }
    } else {
      setShowDropdown(false);
    }
  };

  const insertTabMention = (tab: TabInfo) => {
    if (mentionStartPos === -1) return;

    const beforeMention = value.substring(0, mentionStartPos);
    const afterCursor = value.substring(inputRef.current?.selectionStart || 0);
    
    // Create a mention tag: @tab:id:title:
    const mention = `@tab:${tab.id}:${tab.title}:`;
    const newValue = beforeMention + mention + ' ' + afterCursor;
    
    onChange(newValue);
    setShowDropdown(false);
    setMentionStartPos(-1);
    
    // Focus back to input and position cursor after the mention
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = beforeMention.length + mention.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % filteredTabs.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev === 0 ? filteredTabs.length - 1 : prev - 1);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredTabs[selectedIndex]) {
            insertTabMention(filteredTabs[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          break;
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const removeMention = (tabId: number) => {
    console.log('Removing mention for tab:', tabId);
    const regex = new RegExp(`@tab:${tabId}:[^:]*?:`, 'g');
    const newValue = value.replace(regex, '').replace(/\s+/g, ' ').trim();
    console.log('Old value:', value);
    console.log('New value:', newValue);
    onChange(newValue);
  };

  const formatTabTitle = (title: string, maxLength: number = 30) => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  // Get all selected tabs (mentioned + initial auto-selected)
  const getAllSelectedTabs = (): TabMention[] => {
    const mentionedTabIds = new Set(mentionedTabs.map(tab => tab.id));
    const autoSelectedTabs: TabMention[] = [];
    
    // Add initial selected tabs that aren't already mentioned
    for (const tabId of initialSelectedTabs) {
      if (!mentionedTabIds.has(tabId)) {
        const tab = availableTabs.find(t => t.id === tabId);
        if (tab) {
          autoSelectedTabs.push({
            id: tab.id,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl
          });
        }
      }
    }
    
    return [...mentionedTabs, ...autoSelectedTabs];
  };

  const allSelectedTabs = getAllSelectedTabs();

  return (
    <div className={`tab-mention-input relative ${className}`}>
      {/* Selected tabs display (mentioned + auto-selected) */}
      {allSelectedTabs.length > 0 && (
        <div className="mentioned-tabs mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-xs text-blue-700 mb-2 font-medium">
            Including content from {allSelectedTabs.length} tab{allSelectedTabs.length > 1 ? 's' : ''}:
          </div>
          <div className="flex flex-wrap gap-2">
            {allSelectedTabs.map((tab, index) => {
              const isMentioned = mentionedTabs.some(m => m.id === tab.id);
              const colorClass = `hue-rotate-${(index * 60) % 360}`;
              const bgColor = isMentioned ? 'bg-blue-100' : 'bg-green-100';
              const borderColor = isMentioned ? 'border-blue-300' : 'border-green-300';
              return (
                <div
                  key={tab.id}
                  className={`inline-flex items-center ${bgColor} border ${borderColor} rounded-full px-3 py-1 text-sm shadow-sm hover:shadow-md transition-shadow group`}
                >
                  {/* Favicon */}
                  {tab.favIconUrl && (
                    <img 
                      src={tab.favIconUrl} 
                      alt="" 
                      className="w-4 h-4 mr-2 rounded-sm flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  
                  {/* Tab title (truncated) */}
                  <span className="text-gray-700 max-w-[200px] truncate">
                    {formatTabTitle(tab.title, 30)}
                  </span>
                  
                  {/* Remove button - handle both mentioned and auto-selected tabs */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMentioned) {
                        removeMention(tab.id);
                      } else {
                        // For auto-selected tabs, notify parent to remove from selection
                        const newSelectedIds = initialSelectedTabs.filter(id => id !== tab.id);
                        onSelectedTabsChange(newSelectedIds);
                      }
                    }}
                    className="ml-2 w-4 h-4 rounded-full bg-gray-200 hover:bg-red-200 flex items-center justify-center text-gray-500 hover:text-red-600 transition-colors flex-shrink-0"
                    title={`Remove ${tab.title}`}
                  >
                    <span className="text-xs leading-none">×</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Input area with enhanced inline rendering */}
      <div className="relative">
        {/* Interactive overlay div for inline tag rendering */}
        <div 
          className="absolute inset-0 w-full min-h-[44px] max-h-32 p-3 border border-transparent rounded-lg 
                     whitespace-pre-wrap break-words overflow-hidden leading-[1.4] z-20 pointer-events-none"
          style={{ 
            fontFamily: inputRef.current?.style.fontFamily || 'inherit',
            fontSize: inputRef.current?.style.fontSize || 'inherit',
            lineHeight: '1.4',
            wordWrap: 'break-word'
          }}
        >
          {renderValueWithInlineTags(value)}
        </div>

        {/* Actual textarea (underlying functionality) */}
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            relative w-full min-h-[44px] max-h-32 p-3 border border-gray-300 rounded-lg 
            resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:bg-gray-100 disabled:cursor-not-allowed bg-white
            ${disabled ? 'opacity-50' : ''}
          `}
          style={{ 
            lineHeight: '1.4',
            color: 'transparent', // Make text invisible so overlay shows through
            zIndex: 1,
            caretColor: '#374151' // Keep caret visible
          }}
        />

        {/* Dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {isLoadingTabs && (
              <div className="p-3 text-gray-500 text-center">
                Loading tabs...
              </div>
            )}
            
            {!isLoadingTabs && filteredTabs.length > 0 && filteredTabs.map((tab, index) => (
              <div
                key={tab.id}
                className={`
                  p-3 cursor-pointer flex items-center space-x-3 border-b border-gray-100 last:border-b-0
                  ${index === selectedIndex ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}
                `}
                onClick={() => insertTabMention(tab)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {/* Favicon */}
                {tab.favIconUrl && (
                  <img 
                    src={tab.favIconUrl} 
                    alt="" 
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                
                <div className="flex-1 min-w-0">
                  {/* Tab title */}
                  <div className="font-medium text-gray-900 truncate">
                    {formatTabTitle(tab.title, 40)}
                  </div>
                  
                  {/* Tab URL */}
                  <div className="text-xs text-gray-500 truncate">
                    {tab.url}
                  </div>
                </div>
                
                {/* Tab ID badge */}
                <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
                  #{tab.id}
                </div>
              </div>
            ))}
            
            {!isLoadingTabs && filteredTabs.length === 0 && (
              <div className="p-3 text-gray-500 text-center">
                No tabs found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="mt-1 text-xs text-gray-500 flex items-center justify-between">
        <span>
          Type <code className="bg-gray-100 px-1 rounded">@</code> to include other tabs
        </span>
        {allSelectedTabs.length > 0 && (
          <span className="text-blue-600 font-medium">
            {allSelectedTabs.length} tab{allSelectedTabs.length > 1 ? 's' : ''} selected
          </span>
        )}
      </div>
    </div>
  );
}; 