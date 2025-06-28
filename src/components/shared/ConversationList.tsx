import React, { useRef, useEffect } from 'react';
import { Message } from '../../services/storage';
import MessageItem from './MessageItem';

interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

interface ConversationListProps {
  messages: Message[];
  isStreaming?: boolean;
  copiedMessageIndex: number | null;
  onCopyMessage: (content: string, index: number) => void;
  className?: string;
  showCopyButtons?: boolean;
  autoScroll?: boolean;
  mountTime?: number;
  availableTabs?: TabInfo[]; // Available tabs for resolving tab history
  onTabReAdd?: (tab: TabInfo) => void; // Callback to re-add a tab
}

export const ConversationList: React.FC<ConversationListProps> = ({
  messages,
  isStreaming = false,
  copiedMessageIndex,
  onCopyMessage,
  className = '',
  showCopyButtons = true,
  autoScroll = true,
  mountTime = Date.now(),
  availableTabs = [],
  onTabReAdd
}) => {
  const conversationRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (autoScroll && conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  return (
    <div
      ref={conversationRef}
      className={`
        overflow-y-auto scroll-smooth
        ${className}
      `}
    >
      {messages.map((message, index) => (
        <MessageItem
          key={index}
          message={message}
          index={index}
          isStreaming={isStreaming}
          isLastMessage={index === messages.length - 1}
          copiedMessageIndex={copiedMessageIndex}
          onCopy={onCopyMessage}
          showCopyButton={showCopyButtons}
          mountTime={mountTime}
          availableTabs={availableTabs}
          onTabReAdd={onTabReAdd}
        />
      ))}
    </div>
  );
};

export default ConversationList; 