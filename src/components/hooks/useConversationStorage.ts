import { useCallback, useEffect } from 'react';
import { Message } from '../../services/storage';
import conversation from '../../services/conversation';

export const useConversationStorage = (
  conversationHistory: Message[],
  currentConversationId: string | null,
  setCurrentConversationId: (id: string | null) => void,
  pageUrl?: string
) => {
  const saveConversationToStorage = useCallback(async () => {
    try {
      const currentUrl = pageUrl || window.location.href;
      if (!currentConversationId) {
        // Create new conversation
        const title = conversationHistory[0]?.content.substring(0, 50) + '...' || 'New Conversation';
        const newId = await conversation.saveConversation({
          url: currentUrl,
          title,
          messages: conversationHistory
        });
        setCurrentConversationId(newId);
      } else {
        // Update existing conversation
        try {
          await conversation.updateConversation(currentConversationId, {
            messages: conversationHistory
          });
        } catch (updateError) {
          // If update fails (conversation not found), create a new one
          const title = conversationHistory[0]?.content.substring(0, 50) + '...' || 'New Conversation';
          const newId = await conversation.saveConversation({
            url: currentUrl,
            title,
            messages: conversationHistory
          });
          setCurrentConversationId(newId);
        }
      }
    } catch (error) {
      console.error('Sol: Failed to save conversation:', error);
    }
  }, [conversationHistory, currentConversationId, setCurrentConversationId, pageUrl]);

  // Auto-save conversation when history changes
  useEffect(() => {
    if (conversationHistory.length > 0) {
      const timeoutId = setTimeout(() => {
        saveConversationToStorage();
      }, 100); // Small delay to prevent rapid successive saves
      
      return () => clearTimeout(timeoutId);
    }
  }, [conversationHistory, saveConversationToStorage]);

  return {
    saveConversationToStorage
  };
};

export default useConversationStorage; 