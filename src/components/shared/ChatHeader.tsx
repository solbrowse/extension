import React, { useState, useRef, useEffect } from 'react';
import { ClockIcon, PlusIcon, ArrowsPointingOutIcon, XMarkIcon, TrashIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Conversation } from '@src/services/storage';
import { useConversationService } from '../hooks/useConversation';

interface ChatHeaderProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  showExpandButton?: boolean;
  onExpand?: () => void;
  disableNewButton?: boolean;
  showCloseButton?: boolean;
  onClose?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversations,
  activeConversationId,
  onConversationSelect,
  onNewConversation,
  showExpandButton = false,
  onExpand,
  disableNewButton = false,
  showCloseButton = false,
  onClose
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const convService = useConversationService();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const handleHistoryClick = () => {
    setShowDropdown(!showDropdown);
    setDropdownSelectedIndex(0);
  };

  const handleConversationClick = (conversationId: string) => {
    onConversationSelect(conversationId);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    const totalOptions = conversations.length;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownSelectedIndex(prev => (prev + 1) % totalOptions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDropdownSelectedIndex(prev => prev === 0 ? totalOptions - 1 : prev - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (conversations.length > 0 && dropdownSelectedIndex < conversations.length) {
        handleConversationClick(conversations[dropdownSelectedIndex].id);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const truncateTitle = (title: string, maxLength: number = 35): string => {
    return title.length > maxLength ? `${title.substring(0, maxLength)}...` : title;
  };

  return (
    <div className="flex items-center justify-between p-4">
      {/* History Button */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={handleHistoryClick}
          onKeyDown={handleKeyDown}
          className="flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          aria-label="Conversation History"
        >
          <ClockIcon className="w-5 h-5" />
          <span className="text-sm font-medium">History</span>
        </button>

        {/* History Dropdown */}
        {showDropdown && (
          <div 
            className="absolute top-full left-0 mt-1 w-80 max-h-80 overflow-y-auto sol-rounded-dropdown border border-black/[0.04] dark:border-white/[0.08] sol-dropdown-shadow z-50 backdrop-blur-sm bg-white/80 dark:bg-gray-800/90 sol-bg-translucent"
          >
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                No conversations yet
              </div>
            ) : (
              <div className="py-1">
                {conversations.map((conversation, index) => (
                  <div
                    key={conversation.id}
                    onClick={() => handleConversationClick(conversation.id)}
                    className={`px-3 py-2 cursor-pointer flex items-center space-x-3 sol-dropdown-item-hover group ${
                      index === dropdownSelectedIndex ? 'sol-bg-selected' : 'hover:sol-bg-hover'
                    } ${conversation.id === activeConversationId ? 'bg-blue-50' : ''}`}
                    onMouseEnter={() => setDropdownSelectedIndex(index)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 dark:text-gray-100 sol-text-truncate text-sm font-medium">
                        {truncateTitle(conversation.title)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(conversation.updatedAt)}
                      </div>
                    </div>
                    {/* Action buttons (rename / delete) */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button
                        title="Rename"
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded"
                        onClick={async () => {
                          const newTitle = prompt('Rename conversation:', conversation.title);
                          if (newTitle && newTitle.trim() && newTitle !== conversation.title) {
                            await convService.renameConversation(conversation.id, newTitle.trim());
                          }
                        }}
                      >
                        <PencilSquareIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button
                        title="Delete"
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        onClick={async () => {
                          if (confirm('Delete this conversation?')) {
                            await convService.deleteConversation(conversation.id);
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-2">
        {/* Expand Button (AskBar only) */}
        {showExpandButton && onExpand && (
          <button
            onClick={onExpand}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Expand to SideBar"
          >
            <ArrowsPointingOutIcon className="w-5 h-5" />
          </button>
        )}
        
        {/* New Conversation Button */}
        <button
          onClick={disableNewButton ? undefined : onNewConversation}
          disabled={disableNewButton}
          className="flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="New Conversation"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="text-sm font-medium">New</span>
        </button>

        {/* Close Button */}
        {showCloseButton && onClose && (
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatHeader; 