import React, { memo, useMemo } from 'react';
import { Message } from '@src/services/storage';
import { ConversationList } from '../shared/ConversationList';

// Throttle hook for streaming updates
function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastExecuted = React.useRef(Date.now());

  React.useEffect(() => {
    // If delay is 0, return value immediately (no throttling)
    if (delay === 0) {
      setThrottledValue(value);
      return;
    }

    const now = Date.now();
    const timeSinceLastExecution = now - lastExecuted.current;

    if (timeSinceLastExecution >= delay) {
      setThrottledValue(value);
      lastExecuted.current = now;
    } else {
      const timeoutId = setTimeout(() => {
        setThrottledValue(value);
        lastExecuted.current = Date.now();
      }, delay - timeSinceLastExecution);

      return () => clearTimeout(timeoutId);
    }
  }, [value, delay]);

  return throttledValue;
}

interface MemoisedMessagesProps {
  messages: Message[];
  copiedMessageIndex: number | null;
  onCopyMessage: (content: string, index: number) => void;
  isStreaming: boolean;
  availableTabs: any[];
  onTabReAdd: (tab: any) => void;
  activeConversationId?: string | null;
  className?: string;
}

// Main memoized messages component
export const MemoisedMessages = memo<MemoisedMessagesProps>(
  ({ 
    messages, 
    copiedMessageIndex, 
    onCopyMessage, 
    isStreaming, 
    availableTabs, 
    onTabReAdd,
    className = ''
  }) => {
    // Always call useThrottle to avoid hooks rule violations
    const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : '';
    const throttledContent = useThrottle(lastMessageContent, isStreaming ? 50 : 0);

    // Apply throttling to the last message content if streaming
    const throttledMessages = useMemo(() => {
      if (!isStreaming || messages.length === 0) {
        return messages;
      }

      const lastIndex = messages.length - 1;
      
      return messages.map((msg, index) => 
        index === lastIndex 
          ? { ...msg, content: throttledContent }
          : msg
      );
    }, [messages, isStreaming, throttledContent]);

    // Use existing ConversationList with throttled messages
    return (
      <ConversationList
        messages={throttledMessages}
        copiedMessageIndex={copiedMessageIndex}
        onCopyMessage={onCopyMessage}
        isStreaming={isStreaming}
        availableTabs={availableTabs}
        onTabReAdd={onTabReAdd}
        className={className}
      />
    );
  },
  (prevProps, nextProps) => {
    // Re-render if the active conversation has changed
    if (prevProps.activeConversationId !== nextProps.activeConversationId) {
      return false;
    }
    // Only re-render if messages array length changed or streaming state changed
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }
    
    if (prevProps.isStreaming !== nextProps.isStreaming) {
      return false;
    }
    
    // If streaming, check if last message content changed
    if (nextProps.isStreaming && nextProps.messages.length > 0) {
      const prevLastMsg = prevProps.messages[prevProps.messages.length - 1];
      const nextLastMsg = nextProps.messages[nextProps.messages.length - 1];
      return prevLastMsg?.content === nextLastMsg?.content;
    }
    
    return true;
  }
);

MemoisedMessages.displayName = 'MemoisedMessages'; 