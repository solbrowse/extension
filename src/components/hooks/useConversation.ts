import { useState, useEffect, useCallback } from 'react';
import conversation, { ConversationState } from '@src/services/conversation';
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

  // Subscribe to global conversation service state changes
  useEffect(() => {
    // Get initial state
    setState(conversation.getGlobalState());
    setIsLoading(false);

    // Subscribe to updates
    const unsubscribe = conversation.subscribeToGlobal((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Action handlers
  const createNewConversation = useCallback(async (): Promise<string> => {
    return await conversation.createNewGlobalConversation();
  }, []);

  const switchToConversation = useCallback(async (conversationId: string): Promise<void> => {
    await conversation.switchToGlobalConversation(conversationId);
  }, []);

  const addUserMessage = useCallback(async (content: string, tabIds?: number[]): Promise<void> => {
    await conversation.addGlobalUserMessage(content, tabIds);
  }, []);

  const addAssistantMessage = useCallback(async (content: string): Promise<void> => {
    await conversation.addGlobalAssistantMessage(content);
  }, []);

  const updateStreamingMessage = useCallback(async (content: string): Promise<void> => {
    await conversation.updateGlobalStreamingMessage(content);
  }, []);

  const clearCurrentConversation = useCallback(async (): Promise<void> => {
    await conversation.clearGlobalConversation();
  }, []);

  const renameConversation = useCallback(async (conversationId: string, title: string): Promise<void> => {
    await conversation.renameGlobalConversation(conversationId, title);
  }, []);

  const deleteConversation = useCallback(async (conversationId: string): Promise<void> => {
    await conversation.deleteGlobalConversation(conversationId);
  }, []);

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