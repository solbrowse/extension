import { useState, useCallback, useRef } from 'react';
import { UiPortService } from '@src/services/messaging/uiPortService';
import { Message, getConversation, updateConversation } from '@src/services/storage';
import { ConversationService } from '@src/services/conversationService';

export interface SimpleChatState {
  isStreaming: boolean;
  currentResponse: string;
  error: string | null;
}

export interface SimpleChatActions {
  sendMessage: (message: string, tabIds: number[], conversationId: string) => Promise<void>;
  clearError: () => void;
}

export const useSimpleChat = (
  onMessageComplete?: (message: Message) => void,
  onStreamingDelta?: (delta: string) => void,
  getConversationHistory?: () => Message[]
): [SimpleChatState, SimpleChatActions] => {
  const [state, setState] = useState<SimpleChatState>({
    isStreaming: false,
    currentResponse: '',
    error: null
  });

  const uiPortService = UiPortService.getInstance();
  const currentResponseRef = useRef<string>('');

  // Helper to handle errors consistently
  const handleError = useCallback((error: string | Error) => {
    const errorMessage = error instanceof Error ? error.message : error;
    console.error('Sol useSimpleChat: Error:', errorMessage);
    
    setState(prev => ({
      ...prev,
      isStreaming: false,
      error: errorMessage,
      currentResponse: ''
    }));
    
    currentResponseRef.current = '';
  }, []);

  const sendMessage = useCallback(async (message: string, tabIds: number[], conversationId: string) => {
    setState(prev => ({
      ...prev,
      isStreaming: true,
      currentResponse: '',
      error: null
    }));

    currentResponseRef.current = '';

    try {
      console.log('Sol useSimpleChat: Sending message to tabs:', tabIds);

      // Get conversation history for context
      const conversationHistory = getConversationHistory?.()?.map(msg => ({
        role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
        timestamp: msg.timestamp
      }));

      await uiPortService.askQuestion(
        message,
        tabIds,
        conversationId,
        {
          onDelta: async (delta: string) => {
            currentResponseRef.current += delta;
            setState(prev => ({
              ...prev,
              currentResponse: currentResponseRef.current
            }));
            
            // Update the conversation tied to this stream, even if user switches away
            const convService = ConversationService.getInstance();
            if (convService.getActiveConversationId() === conversationId) {
              onStreamingDelta?.(delta); // Maintain existing behaviour for active conv
            } else {
              // Update storage directly for background conversation
              try {
                const conv = await getConversation(conversationId);
                if (conv) {
                  let msgs = conv.messages;
                  // Update last assistant message or push new
                  if (msgs.length > 0 && msgs[msgs.length-1].type === 'assistant') {
                    const prevContent = msgs[msgs.length-1].content;
                    const newContent = delta.startsWith(prevContent) ? delta : prevContent + delta;
                    msgs[msgs.length-1] = { ...msgs[msgs.length-1], content: newContent };
                  } else {
                    msgs = [...msgs, { type: 'assistant' as const, content: delta, timestamp: Date.now() }];
                  }
                  await updateConversation(conversationId, { messages: msgs });
                }
              } catch(err) {
                console.warn('Sol useSimpleChat: failed to update background conversation during stream', err);
              }
            }
          },
          
          onComplete: async (fullResponse: string) => {
            console.log('Sol useSimpleChat: Streaming complete');
            
            setState(prev => ({
              ...prev,
              isStreaming: false,
              currentResponse: fullResponse
            }));

            // Create response message in the correct conversation
            try {
              const convService = ConversationService.getInstance();
              if (convService.getActiveConversationId() === conversationId) {
                onMessageComplete?.({ type: 'assistant', content: fullResponse, timestamp: Date.now() });
              } else {
                const conv = await getConversation(conversationId);
                if (conv) {
                  const updatedMsgs = [...conv.messages, { type: 'assistant' as const, content: fullResponse, timestamp: Date.now() }];
                  await updateConversation(conversationId, { messages: updatedMsgs });
                }
              }
            } catch(err) {
              console.warn('Sol useSimpleChat: failed to finalize background conversation', err);
            }
            
            currentResponseRef.current = '';
          },
          
          onError: handleError
        },
        conversationHistory
      );

    } catch (error) {
      handleError(error instanceof Error ? error : 'Failed to send message');
    }
  }, [onMessageComplete, onStreamingDelta, getConversationHistory, handleError]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return [
    state,
    {
      sendMessage,
      clearError
    }
  ];
}; 