import React, { KeyboardEvent, useEffect, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ArrowUpIcon } from '@heroicons/react/20/solid';
import { RectangleStackIcon } from '@heroicons/react/24/outline';
import { TabInfo } from '@src/services/messaging/uiPortService';
import { TabChipData } from './TabChip';

interface Props {
  input: string;
  onInputChange: (val: string) => void;
  onInputKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;

  // Dropdown state
  showDropdown: boolean;
  filteredTabs: TabInfo[];
  dropdownSelectedIndex: number;
  insertTabMention: (tab: TabChipData) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  setDropdownSelectedIndex: (index: number) => void;
  truncateTitle: (title: string, max?: number) => string;
  searchTerm: string;

  // Buttons / actions
  onClose?: () => void;
  onSubmit: () => void;
  isStreaming: boolean;
  showCloseButton?: boolean;
}

const InputArea: React.FC<Props> = ({
  input,
  onInputChange,
  onInputKeyDown,
  inputRef,
  showDropdown,
  filteredTabs,
  dropdownSelectedIndex,
  insertTabMention,
  dropdownRef,
  setDropdownSelectedIndex,
  truncateTitle,
  searchTerm,
  onClose = () => {},
  onSubmit,
  isStreaming,
  showCloseButton = true
}) => {
  // Simple auto-resize - let the browser do the work.
  const autoResize = useCallback(() => {
    if (inputRef.current) {
      const textarea = inputRef.current;
      textarea.style.height = 'auto'; // Reset height
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`; // Set to content height
    }
  }, [inputRef]);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const isSearching = searchTerm.trim().length > 0;

  return (
    <div className="relative">
      {/* Single, smart layout with flex-wrap */}
      <div className="flex flex-wrap items-center gap-[14px]">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Ask a question about this page..."
          rows={1}
          className="flex-grow border-none resize-none bg-transparent sol-font-inter sol-input-text placeholder:text-black/40 dark:placeholder:text-white/40 placeholder:font-medium focus:outline-none p-0 text-black dark:text-white"
          style={{
            lineHeight: input ? '1.5' : '24px',
            minWidth: '50px' // Ensure it doesn't collapse completely
          }}
        />
        
        {/* Button group that won't shrink */}
        <div className="flex items-center gap-[8px] flex-shrink-0">
          {showCloseButton && (
            <button
              onClick={onClose}
              className="w-8 h-8 hover:bg-black/5 dark:hover:bg-white/10 rounded-md flex items-center justify-center transition-colors"
              title="Close chat"
            >
              <XMarkIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          
          <button
            onClick={onSubmit}
            disabled={!input.trim() || isStreaming}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isStreaming
                ? 'bg-black/5 dark:bg-white/10 cursor-not-allowed animate-pulse'
                : input.trim()
                ? 'bg-black dark:bg-white hover:bg-black/80 dark:hover:bg-white/80'
                : 'bg-black/5 dark:bg-white/10'
            }`}
            title={isStreaming ? "Submitting..." : (input.trim() ? "Submit" : "Enter a question to submit")}
          >
            <ArrowUpIcon
              className={`w-5 h-5 ${
                isStreaming || !input.trim() ? 'text-gray-500 dark:text-gray-400' : 'text-white dark:text-black'
              }`}
            />
          </button>
        </div>
      </div>

      {/* @ Mention Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full top-full mt-1 backdrop-blur-sm sol-rounded-dropdown border border-black/[0.04] dark:border-white/10 sol-dropdown-shadow max-h-60 overflow-y-auto sol-bg-translucent sol-font-apple sol-dropdown-enter"
        >
          {/* All tabs/visible results option */}
                      <div
            className={`px-3 py-1.5 cursor-pointer flex items-center space-x-2 sol-dropdown-item-hover ${
              dropdownSelectedIndex === 0
                ? 'sol-bg-selected'
                : 'hover:sol-bg-hover'
            }`}
            onClick={() => insertTabMention({
              id: -1, // Special ID for "all tabs"
              title: isSearching ? 'All visible results' : 'All open tabs',
              url: '',
              favIconUrl: undefined
            })}
            onMouseEnter={() => setDropdownSelectedIndex(0)}
          >
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <RectangleStackIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-gray-900 dark:text-gray-100 sol-text-truncate sol-font-apple-clean sol-dropdown-item"
              >
                {isSearching ? `All visible results (${filteredTabs.length})` : `All open tabs (${filteredTabs.length})`}
              </div>
            </div>
          </div>

          {filteredTabs.length > 0 ? (
            filteredTabs.map((tab, index) => (
              <div
                key={tab.id}
                className={`px-3 py-1.5 cursor-pointer flex items-center space-x-2 sol-dropdown-item-hover ${
                  index + 1 === dropdownSelectedIndex // +1 because "All tabs" is at index 0
                    ? 'sol-bg-selected'
                    : 'hover:sol-bg-hover'
                }`}
                onClick={() => insertTabMention({
                  id: tab.id,
                  title: tab.title || 'Untitled',
                  url: tab.url || '',
                  favIconUrl: tab.favIconUrl
                })}
                onMouseEnter={() => setDropdownSelectedIndex(index + 1)}
              >
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {tab.favIconUrl ? (
                    <img
                      src={tab.favIconUrl}
                      alt=""
                      className="w-4 h-4 rounded-sm"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-4 h-4 bg-gray-200 dark:bg-gray-600 rounded-sm"></div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className="text-gray-900 dark:text-gray-100 sol-text-truncate sol-font-apple-clean sol-dropdown-secondary"
                  >
                    {truncateTitle(tab.title || 'Untitled', 50)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              className="px-3 py-2 text-gray-500 dark:text-gray-400 text-center sol-font-apple-clean sol-dropdown-item"
            >
              No matching tabs found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InputArea;
