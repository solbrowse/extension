import browser from 'webextension-polyfill';
import { Message, Conversation, saveConversation, updateConversation, getConversations, getConversation, deleteConversation } from './storage';

export interface ConversationAction {
  type: 'ADD_USER_MESSAGE' | 'ADD_ASSISTANT_MESSAGE' | 'CLEAR_CONVERSATION' | 'UPDATE_CONVERSATION_ID' | 'SET_CONVERSATION' | 'UPDATE_STREAMING_MESSAGE';
  payload: any;
}

export interface ConversationState {
  activeConversationId: string | null;
  messages: Message[];
  conversations: Conversation[];
}

export type ConversationListener = (state: ConversationState) => void;

export class ConversationService {
  private static instance: ConversationService;
  private state: ConversationState = {
    activeConversationId: null,
    messages: [],
    conversations: []
  };
  private listeners: ConversationListener[] = [];

  private constructor() {
    this.loadConversations();
  }

  static getInstance(): ConversationService {
    if (!this.instance) {
      this.instance = new ConversationService();
    }
    return this.instance;
  }

  // State management
  getState(): ConversationState {
    return { ...this.state };
  }

  subscribe(listener: ConversationListener): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('Sol ConversationService: Error in listener:', error);
      }
    });
  }

  // Conversation management
  async loadConversations(): Promise<void> {
    try {
      const conversations = await getConversations();
      this.state.conversations = conversations;
      this.notifyListeners();
    } catch (error) {
      console.error('Sol ConversationService: Failed to load conversations:', error);
    }
  }

  async createNewConversation(): Promise<string> {
    try {
      // Save the new conversation to storage
      const conversationId = await saveConversation({
        url: window.location?.href || '',
        title: 'New Conversation',
        messages: []
      });

      // Set as active conversation
      this.state.activeConversationId = conversationId;
      this.state.messages = [];
      
      // Reload conversations list to include the new one
      await this.loadConversations();
      
      return conversationId;
    } catch (error) {
      console.error('Sol ConversationService: Failed to create conversation:', error);
      throw error;
    }
  }

  async switchToConversation(conversationId: string): Promise<void> {
    try {
      const conversation = await getConversation(conversationId);
      if (!conversation) {
        console.warn('Sol ConversationService: Conversation not found:', conversationId);
        return;
      }

      this.state.activeConversationId = conversationId;
      this.state.messages = conversation.messages;
      this.notifyListeners();
    } catch (error) {
      console.error('Sol ConversationService: Failed to switch conversation:', error);
    }
  }

  async updateConversationTitle(conversationId: string, title: string): Promise<void> {
    try {
      await updateConversation(conversationId, { title });
      await this.loadConversations();
    } catch (error) {
      console.error('Sol ConversationService: Failed to update title:', error);
    }
  }

  // Action-based state management (similar to TabConversationManager)
  async dispatch(action: ConversationAction): Promise<void> {
    const newMessages = this.reduceAction(this.state.messages, action);
    this.state.messages = newMessages;

    // Auto-generate conversation title from first user message
    if (action.type === 'ADD_USER_MESSAGE' && this.state.activeConversationId) {
      const conversation = this.state.conversations.find(c => c.id === this.state.activeConversationId);
      if (conversation && conversation.title === 'New Conversation' && newMessages.length === 1) {
        const title = this.generateTitleFromMessage(action.payload.content);
        await this.updateConversationTitle(this.state.activeConversationId, title);
      }
    }

    // Save messages to storage if we have an active conversation
    if (this.state.activeConversationId) {
      try {
        await updateConversation(this.state.activeConversationId, { messages: newMessages });
      } catch (error) {
        console.error('Sol ConversationService: Failed to save messages:', error);
      }
    }

    this.notifyListeners();
  }

  private reduceAction(messages: Message[], action: ConversationAction): Message[] {
    switch (action.type) {
      case 'ADD_USER_MESSAGE':
        return [...messages, {
          type: 'user',
          content: action.payload.content,
          timestamp: action.payload.timestamp || Date.now(),
          tabIds: action.payload.tabIds
        }];
      
      case 'ADD_ASSISTANT_MESSAGE':
        return [...messages, {
          type: 'assistant',
          content: action.payload.content,
          timestamp: action.payload.timestamp || Date.now()
        }];
      
      case 'UPDATE_STREAMING_MESSAGE':
        return messages.map((msg, index) => {
          // Update the last assistant message with streaming content
          if (index === messages.length - 1 && msg.type === 'assistant') {
            const prevContent = msg.content;
            const delta = action.payload.content;
            
            // Detect if delta is cumulative or incremental
            if (delta.startsWith(prevContent)) {
              return { ...msg, content: delta };
            } else {
              return { ...msg, content: prevContent + delta };
            }
          }
          return msg;
        }).concat(
          // If no assistant message exists, create one
          messages.length === 0 || messages[messages.length - 1].type !== 'assistant'
            ? [{
                type: 'assistant' as const,
                content: action.payload.content,
                timestamp: action.payload.timestamp || Date.now()
              }]
            : []
        );
      
      case 'CLEAR_CONVERSATION':
        return [];
      
      case 'SET_CONVERSATION':
        return action.payload.messages || [];
      
      default:
        return messages;
    }
  }

  private generateTitleFromMessage(content: string): string {
    // Extract first line or first 50 characters for the title
    const firstLine = content.split('\n')[0];
    const title = firstLine.length > 50 ? `${firstLine.substring(0, 47)}...` : firstLine;
    return title || 'New Conversation';
  }

  // Convenience methods
  getActiveConversationId(): string | null {
    return this.state.activeConversationId;
  }

  getMessages(): Message[] {
    return [...this.state.messages];
  }

  getConversations(): Conversation[] {
    return [...this.state.conversations];
  }

  async clearCurrentConversation(): Promise<void> {
    await this.dispatch({ type: 'CLEAR_CONVERSATION', payload: null });
  }

  // Convenience dispatch wrappers for components/hooks
  async addUserMessage(content: string, tabIds?: number[]): Promise<void> {
    await this.dispatch({
      type: 'ADD_USER_MESSAGE',
      payload: { content, tabIds, timestamp: Date.now() }
    });
  }

  async addAssistantMessage(content: string): Promise<void> {
    await this.dispatch({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { content, timestamp: Date.now() }
    });
  }

  async updateStreamingMessage(content: string): Promise<void> {
    await this.dispatch({
      type: 'UPDATE_STREAMING_MESSAGE',
      payload: { content, timestamp: Date.now() }
    });
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    await this.updateConversationTitle(conversationId, title);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await deleteConversation(conversationId);
      // Remove from local state
      this.state.conversations = this.state.conversations.filter(c => c.id !== conversationId);
      // If deleted conversation was active, clear messages and active id
      if (this.state.activeConversationId === conversationId) {
        this.state.activeConversationId = null;
        this.state.messages = [];
      }
      this.notifyListeners();
    } catch (error) {
      console.error('Sol ConversationService: Failed to delete conversation:', error);
    }
  }
} 