import { useState, useCallback, useRef } from 'react';
import { UiPortService } from '@src/services/messaging/uiPortService';
import { Message } from '@src/services/storage';

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
          onDelta: (delta: string) => {
            currentResponseRef.current += delta;
            setState(prev => ({
              ...prev,
              currentResponse: currentResponseRef.current
            }));
            
            onStreamingDelta?.(delta);
          },
          
          onComplete: (fullResponse: string) => {
            console.log('Sol useSimpleChat: Streaming complete');
            
            setState(prev => ({
              ...prev,
              isStreaming: false,
              currentResponse: fullResponse
            }));

            // Create response message
            if (onMessageComplete) {
              onMessageComplete({
                type: 'assistant',
                content: fullResponse,
                timestamp: Date.now()
              });
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