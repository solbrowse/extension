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
      const conversationHistory = getConversationHistory ? 
        getConversationHistory().map(msg => ({
          role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
          timestamp: msg.timestamp
        })) : undefined;

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

            // Call external delta handler
            if (onStreamingDelta) {
              onStreamingDelta(delta);
            }
          },
          
          onComplete: (fullResponse: string) => {
            console.log('Sol useSimpleChat: Streaming complete');
            
            setState(prev => ({
              ...prev,
              isStreaming: false,
              currentResponse: fullResponse
            }));

            // Create a message object for the response
            if (onMessageComplete) {
              const responseMessage: Message = {
                type: 'assistant',
                content: fullResponse,
                timestamp: Date.now()
              };
              onMessageComplete(responseMessage);
            }

            // Reset current response for next message
            currentResponseRef.current = '';
          },
          
          onError: (error: string) => {
            console.error('Sol useSimpleChat: Streaming error:', error);
            
            setState(prev => ({
              ...prev,
              isStreaming: false,
              error: error,
              currentResponse: ''
            }));

            currentResponseRef.current = '';
          }
        },
        conversationHistory
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('Sol useSimpleChat: Error sending message:', error);
      
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
        currentResponse: ''
      }));

      currentResponseRef.current = '';
    }
  }, [onMessageComplete, onStreamingDelta, getConversationHistory]);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null
    }));
  }, []);

  return [
    state,
    {
      sendMessage,
      clearError
    }
  ];
}; 