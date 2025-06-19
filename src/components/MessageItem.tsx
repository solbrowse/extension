import React from 'react';
import { Message } from '../services/storage';
import MessageRenderer from './MessageRenderer';
import CopyButton from './CopyButton';

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
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  index,
  isStreaming = false,
  isLastMessage = false,
  copiedMessageIndex,
  onCopy,
  className = '',
  showCopyButton = true,
  mountTime = 0
}) => {
  const isNew = message.timestamp > mountTime;
  const isCopied = copiedMessageIndex === index;
  
  const handleCopy = (content: string) => {
    onCopy(content, index);
  };

  if (message.type === 'user') {
    return (
      <div
        className={`
          mb-3 last:mb-0 relative group
          ${isNew ? 'opacity-0 translate-y-2 animate-in' : ''}
          transition-all duration-300 ease-out
          text-right
          ${className}
        `}
      >
        <div className="text-black font-medium text-base leading-relaxed text-right pr-0">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        mb-3 last:mb-0 relative group
        ${isNew ? 'opacity-0 translate-y-2 animate-in' : ''}
        transition-all duration-300 ease-out
        text-left
        ${className}
      `}
    >
      <div 
        className={`
          text-black text-base font-normal leading-relaxed pb-4 text-left
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