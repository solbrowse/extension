import React, { KeyboardEvent, useEffect, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ArrowUpIcon } from '@heroicons/react/20/solid';
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

  // Buttons / actions
  onClose: () => void;
  onSubmit: () => void;
  isStreaming: boolean;
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
  onClose,
  onSubmit,
  isStreaming
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

  return (
    <div className="relative">
      {/* Single, smart layout with flex-wrap */}
      <div className="flex flex-wrap items-end gap-[14px]">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Ask a question about this page..."
          disabled={isStreaming}
          rows={1}
          className="flex-grow border-none resize-none bg-transparent text-base placeholder:text-black/40 placeholder:font-medium focus:outline-none p-0"
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '16px',
            fontWeight: 500,
            lineHeight: input ? '1.5' : '24px',
            minWidth: '50px' // Ensure it doesn't collapse completely
          }}
        />
        
        {/* Button group that won't shrink */}
        <div className="flex items-center gap-[14px] flex-shrink-0">
          <button
            onClick={onClose}
            className="w-5 h-5 hover:bg-black/10 rounded-full flex items-center justify-center transition-colors"
            title="Close chat"
          >
            <XMarkIcon className="w-5 h-5 text-gray-600" />
          </button>
          
          <button
            onClick={onSubmit}
            disabled={!input.trim() || isStreaming}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isStreaming
                ? 'bg-gray-300 cursor-not-allowed animate-pulse'
                : input.trim()
                ? 'bg-black hover:bg-gray-800'
                : 'bg-black/5'
            }`}
            title={isStreaming ? "Submitting..." : (input.trim() ? "Submit" : "Enter a question first to submit")}
          >
            <ArrowUpIcon
              className={`w-5 h-5 ${
                isStreaming || !input.trim() ? 'text-gray-500' : 'text-white'
              }`}
            />
          </button>
        </div>
      </div>

      {/* @ Mention Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredTabs.length > 0 ? (
            filteredTabs.map((tab, index) => (
              <div
                key={tab.id}
                className={`p-3 cursor-pointer flex items-center space-x-3 border-b border-gray-100 last:border-b-0 ${
                  index === dropdownSelectedIndex
                    ? 'bg-blue-50 border-blue-200'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => insertTabMention({
                  id: tab.id,
                  title: tab.title || 'Untitled',
                  url: tab.url || '',
                  favIconUrl: tab.favIconUrl
                })}
                onMouseEnter={() => setDropdownSelectedIndex(index)}
              >
                {tab.favIconUrl && (
                  <img
                    src={tab.favIconUrl}
                    alt=""
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div
                    className="font-medium text-gray-900 truncate"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {truncateTitle(tab.title || 'Untitled', 40)}
                  </div>
                  <div
                    className="text-xs text-gray-500 truncate"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    {tab.url}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              className="p-3 text-gray-500 text-center"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              No tabs found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InputArea;
