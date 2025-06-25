import React, { useRef, useEffect } from 'react';
import { Message } from '../../../services/storage';
import MessageItem from './MessageItem';

interface ConversationListProps {
  messages: Message[];
  isStreaming?: boolean;
  copiedMessageIndex: number | null;
  onCopyMessage: (content: string, index: number) => void;
  className?: string;
  showCopyButtons?: boolean;
  autoScroll?: boolean;
  mountTime?: number;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  messages,
  isStreaming = false,
  copiedMessageIndex,
  onCopyMessage,
  className = '',
  showCopyButtons = true,
  autoScroll = true,
  mountTime = Date.now()
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
        />
      ))}
      
      {messages.length === 0 && (
        <div className="text-gray-500 text-center py-8">
          No messages yet. Start a conversation!
        </div>
      )}
    </div>
  );
};

export default ConversationList; 