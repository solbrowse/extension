import React from 'react';
import { Message } from '../../services/storage';
import MessageRenderer from './MessageRenderer';
import CopyButton from './CopyButton';

interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

interface MessageItemProps {
  message: Message;
  index: number;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  copiedMessageIndex: number | null;
  onCopy: (content: string, index: number) => void;
  className?: string;
  showCopyButton?: boolean;
  mountTime?: number;
  availableTabs?: TabInfo[]; // Available tabs for resolving tab history
  onTabReAdd?: (tab: TabInfo) => void; // Callback to re-add a tab
}

// Mini tab chip component for message history
const TabHistoryChip: React.FC<{ tab: TabInfo; onClick: () => void }> = ({ tab, onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1 px-2 py-1 sol-bg-chip-history rounded sol-tab-history hover:sol-bg-hover-chip sol-transition-colors mr-1 mb-1"
    title={`Re-add ${tab.title} to context`}
  >
    {tab.favIconUrl && (
      <img
        src={tab.favIconUrl}
        alt=""
        className="w-3 h-3 rounded-sm"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    )}
    <span className="text-gray-800 dark:text-gray-200 max-w-[100px] sol-text-truncate">
      {tab.title.length > 15 ? `${tab.title.substring(0, 15)}...` : tab.title}
    </span>
  </button>
);

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  index,
  isStreaming = false,
  isLastMessage = false,
  copiedMessageIndex,
  onCopy,
  className = '',
  showCopyButton = true,
  mountTime = 0,
  availableTabs = [],
  onTabReAdd
}) => {
  const isNew = message.timestamp > mountTime;
  const isCopied = copiedMessageIndex === index;
  
  const handleCopy = (content: string) => {
    onCopy(content, index);
  };

  // Get tabs that were used in this message
  const messageTabs = message.tabIds 
    ? availableTabs.filter(tab => message.tabIds!.includes(tab.id))
    : [];

  if (message.type === 'user') {
    return (
      <div
        className={`
          mb-3 last:mb-0 relative group
          ${isNew ? 'opacity-0 translate-y-2 animate-in' : ''}
          sol-transition-colors
          text-right
          ${className}
        `}
      >
        <div className="text-black dark:text-white font-medium text-base leading-relaxed text-right pr-0 mb-2">
          {message.content}
        </div>
        
        {/* Show tab chips for user messages if tabs were used */}
        {messageTabs.length > 0 && onTabReAdd && (
          <div className="flex flex-wrap justify-end gap-1 mb-1">
            {messageTabs.map(tab => (
              <TabHistoryChip
                key={tab.id}
                tab={tab}
                onClick={() => onTabReAdd(tab)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`
        mb-3 last:mb-0 relative group
        ${isNew ? 'opacity-0 translate-y-2 animate-in' : ''}
        sol-transition-colors
        text-left
        ${className}
      `}
    >
      <div 
        className={`
          text-black dark:text-white text-base font-normal leading-relaxed pb-4 text-left
          ${isStreaming && isLastMessage ? 'sol-streaming' : ''}
        `}
      >
        <MessageRenderer content={message.content} />
      </div>
      
      {message.content && showCopyButton && (
        <CopyButton
          content={message.content}
          onCopy={handleCopy}
          isCopied={isCopied}
          className="absolute bottom-1 right-1"
          size="md"
        />
      )}
    </div>
  );
};

export default MessageItem; 