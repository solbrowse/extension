import { useState, useEffect, useCallback } from 'react';
import { ConversationService, ConversationState } from '@src/services/conversationService';
import { Message, Conversation } from '@src/services/storage';

export interface UseConversationServiceReturn {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  
  // Actions
  createNewConversation: () => Promise<string>;
  switchToConversation: (conversationId: string) => Promise<void>;
  addUserMessage: (content: string, tabIds?: number[]) => Promise<void>;
  addAssistantMessage: (content: string) => Promise<void>;
  updateStreamingMessage: (content: string) => Promise<void>;
  clearCurrentConversation: () => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
}

export const useConversationService = (): UseConversationServiceReturn => {
  const [state, setState] = useState<ConversationState>({
    activeConversationId: null,
    messages: [],
    conversations: []
  });
  const [isLoading, setIsLoading] = useState(true);

  const conversationService = ConversationService.getInstance();

  // Subscribe to conversation service state changes
  useEffect(() => {
    // Get initial state
    setState(conversationService.getState());
    setIsLoading(false);

    // Subscribe to updates
    const unsubscribe = conversationService.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [conversationService]);

  // Action handlers
  const createNewConversation = useCallback(async (): Promise<string> => {
    return await conversationService.createNewConversation();
  }, [conversationService]);

  const switchToConversation = useCallback(async (conversationId: string): Promise<void> => {
    await conversationService.switchToConversation(conversationId);
  }, [conversationService]);

  const addUserMessage = useCallback(async (content: string, tabIds?: number[]): Promise<void> => {
    await conversationService.dispatch({
      type: 'ADD_USER_MESSAGE',
      payload: {
        content,
        timestamp: Date.now(),
        tabIds
      }
    });
  }, [conversationService]);

  const addAssistantMessage = useCallback(async (content: string): Promise<void> => {
    await conversationService.dispatch({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: {
        content,
        timestamp: Date.now()
      }
    });
  }, [conversationService]);

  const updateStreamingMessage = useCallback(async (content: string): Promise<void> => {
    await conversationService.dispatch({
      type: 'UPDATE_STREAMING_MESSAGE',
      payload: {
        content,
        timestamp: Date.now()
      }
    });
  }, [conversationService]);

  const clearCurrentConversation = useCallback(async (): Promise<void> => {
    await conversationService.clearCurrentConversation();
  }, [conversationService]);

  const renameConversation = useCallback(async (conversationId: string, title: string): Promise<void> => {
    await conversationService.renameConversation(conversationId, title);
  }, [conversationService]);

  const deleteConversation = useCallback(async (conversationId: string): Promise<void> => {
    await conversationService.deleteConversation(conversationId);
  }, [conversationService]);

  return {
    // State
    conversations: state.conversations,
    activeConversationId: state.activeConversationId,
    messages: state.messages,
    isLoading,
    
    // Actions
    createNewConversation,
    switchToConversation,
    addUserMessage,
    addAssistantMessage,
    updateStreamingMessage,
    clearCurrentConversation,
    renameConversation,
    deleteConversation
  };
}; 