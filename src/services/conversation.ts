import browser from 'webextension-polyfill';
import unifiedStorage, { Message, Conversation, DbMessage, MessagePart, SyncListener } from './storage';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ConversationAction {
  type: 'ADD_USER_MESSAGE' | 'ADD_ASSISTANT_MESSAGE' | 'CLEAR_CONVERSATION' | 'UPDATE_CONVERSATION_ID' | 'SET_CONVERSATION' | 'UPDATE_STREAMING_MESSAGE';
  payload: any;
}

export interface ConversationState {
  activeConversationId: string | null;
  messages: Message[];
  conversations: Conversation[];
}

export interface TabConversation {
  messages: Message[];
  conversationId: string | null;
  tabId: string;
  url: string;
  host: string;
}

export type ConversationListener = (state: ConversationState) => void;
export type TabConversationListener = (state: TabConversation) => void;

export type ConversationContext = 'global' | 'tab';

// ============================================================================
// UNIFIED CONVERSATION SERVICE
// ============================================================================

export class conversation {
  private static instance: conversation;
  
  // Global conversation state
  private globalState: ConversationState = {
    activeConversationId: null,
    messages: [],
    conversations: []
  };
  
  // Tab conversation states (keyed by tab ID)
  private tabStates: Map<string, TabConversation> = new Map();
  
  // Listeners
  private globalListeners: ConversationListener[] = [];
  private tabListeners: Map<string, TabConversationListener[]> = new Map();
  
  // Services
  private storage = unifiedStorage;
  private syncUnsubscribe?: () => void;
  
  // Navigation handlers for tab contexts
  private navigationHandlers: Map<string, (() => void)[]> = new Map();

  private constructor() {
    this.initializeStorage();
    this.setupSyncListener();
    this.setupNavigationListeners();
  }

  static getInstance(): conversation {
    if (!this.instance) {
      this.instance = new conversation();
    }
    return this.instance;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private async initializeStorage(): Promise<void> {
    try {
      await this.loadGlobalConversations();
      console.log('Sol conversation: Storage initialized');
    } catch (error) {
      console.error('Sol conversation: Storage initialization failed:', error);
    }
  }

  private setupSyncListener(): void {
    this.syncUnsubscribe = this.storage.addSyncListener((message) => {
      // Handle cross-tab sync updates
      switch (message.type) {
        case 'CONVERSATION_UPDATED':
        case 'CONVERSATION_DELETED':
          this.loadGlobalConversations();
          break;
        case 'MESSAGE_ADDED':
        case 'MESSAGE_UPDATED':
          // Reload messages if this is the active conversation
          if (message.convId === this.globalState.activeConversationId) {
            this.loadActiveGlobalConversationMessages();
          }
          break;
      }
    });
  }

  private setupNavigationListeners(): void {
    // This will be called from tab contexts to set up navigation detection
    if (typeof window !== 'undefined') {
      const handleNavigation = () => {
        const newUrl = window.location.href;
        const newHost = window.location.hostname;
        
        // Clear all tab conversations on navigation
        this.tabStates.forEach((state, tabId) => {
          if (state.url !== newUrl || state.host !== newHost) {
            this.clearTabConversation(tabId);
            
            // Notify navigation handlers
            const handlers = this.navigationHandlers.get(tabId) || [];
            handlers.forEach(handler => {
              try {
                handler();
              } catch (error) {
                console.error('Sol conversation: Error in navigation handler:', error);
              }
            });
          }
        });
      };

      // Listen for navigation changes
      window.addEventListener('popstate', handleNavigation);
      
      // Override pushState and replaceState to catch programmatic navigation
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        setTimeout(handleNavigation, 0);
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        setTimeout(handleNavigation, 0);
      };
    }
  }

  // ============================================================================
  // GLOBAL CONVERSATION MANAGEMENT
  // ============================================================================

  async loadGlobalConversations(): Promise<void> {
    try {
      const conversations = await this.storage.getConversations();
      this.globalState.conversations = conversations;
      this.notifyGlobalListeners();
    } catch (error) {
      console.error('Sol conversation: Failed to load global conversations:', error);
      this.globalState.conversations = [];
      this.notifyGlobalListeners();
    }
  }

  private async loadActiveGlobalConversationMessages(): Promise<void> {
    if (!this.globalState.activeConversationId) return;

    try {
      const conversation = await this.storage.getConversation(this.globalState.activeConversationId);
      this.globalState.messages = conversation?.messages || [];
      this.notifyGlobalListeners();
    } catch (error) {
      console.error('Sol conversation: Failed to load active conversation messages:', error);
    }
  }

  async createNewGlobalConversation(): Promise<string> {
    try {
      const newConversation = {
        title: 'New Conversation',
        url: browser.tabs ? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.url || '' : '',
        messages: []
      };

      const conversationId = await this.storage.saveConversation(newConversation);
      
      // Update global state
      this.globalState.activeConversationId = conversationId;
      this.globalState.messages = [];
      
      // Reload conversations to get the new one
      await this.loadGlobalConversations();
      
      return conversationId;
    } catch (error) {
      console.error('Sol conversation: Failed to create new global conversation:', error);
      throw error;
    }
  }

  async switchToGlobalConversation(conversationId: string): Promise<void> {
    try {
      const conversation = await this.storage.getConversation(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      this.globalState.activeConversationId = conversationId;
      this.globalState.messages = conversation.messages;
      this.notifyGlobalListeners();
    } catch (error) {
      console.error('Sol conversation: Failed to switch global conversation:', error);
      throw error;
    }
  }

  async globalDispatch(action: ConversationAction): Promise<void> {
    try {
      const newMessages = this.reduceAction(this.globalState.messages, action);
      this.globalState.messages = newMessages;

      // Update storage if we have an active conversation
      if (this.globalState.activeConversationId) {
        await this.storage.updateConversation(this.globalState.activeConversationId, { 
          messages: newMessages 
        });
      }

      this.notifyGlobalListeners();
    } catch (error) {
      console.error('Sol conversation: Failed to dispatch global action:', error);
      throw error;
    }
  }

  // ============================================================================
  // TAB CONVERSATION MANAGEMENT
  // ============================================================================

  getTabConversation(tabId: string): TabConversation {
    if (!this.tabStates.has(tabId)) {
      // Initialize tab conversation
      this.tabStates.set(tabId, {
        messages: [],
        conversationId: null,
        tabId,
        url: typeof window !== 'undefined' ? window.location.href : '',
        host: typeof window !== 'undefined' ? window.location.hostname : ''
      });
    }
    return this.tabStates.get(tabId)!;
  }

  setTabConversation(tabId: string, messages: Message[], conversationId: string | null): void {
    const currentState = this.getTabConversation(tabId);
    const newState: TabConversation = {
      ...currentState,
      messages,
      conversationId
    };
    
    this.tabStates.set(tabId, newState);
    this.notifyTabListeners(tabId, newState);
  }

  tabDispatch(tabId: string, action: ConversationAction): void {
    const currentState = this.getTabConversation(tabId);
    const newMessages = this.reduceAction(currentState.messages, action);
    
    const newState: TabConversation = {
      ...currentState,
      messages: newMessages
    };
    
    this.tabStates.set(tabId, newState);
    this.notifyTabListeners(tabId, newState);
  }

  clearTabConversation(tabId: string): void {
    this.tabDispatch(tabId, { type: 'CLEAR_CONVERSATION', payload: null });
  }

  // ============================================================================
  // SHARED ACTION REDUCER
  // ============================================================================

  private reduceAction(messages: Message[], action: ConversationAction): Message[] {
    switch (action.type) {
      case 'ADD_USER_MESSAGE':
        return [...messages, {
          type: 'user' as const,
          content: action.payload.content,
          timestamp: Date.now(),
          tabIds: action.payload.tabIds
        }];

      case 'ADD_ASSISTANT_MESSAGE':
        return [...messages, {
          type: 'assistant' as const,
          content: action.payload.content,
          timestamp: Date.now()
        }];

      case 'UPDATE_STREAMING_MESSAGE':
        // Update the last assistant message (streaming) or create one if it doesn't exist
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0 && messages[lastIndex].type === 'assistant') {
          // Update existing assistant message
          const updatedMessages = [...messages];
          updatedMessages[lastIndex] = {
            ...updatedMessages[lastIndex],
            content: action.payload.content
          };
          return updatedMessages;
        } else {
          // Create new assistant message for streaming
          return [...messages, {
            type: 'assistant' as const,
            content: action.payload.content,
            timestamp: Date.now()
          }];
        }

      case 'CLEAR_CONVERSATION':
        return [];

      case 'UPDATE_CONVERSATION_ID':
        // This doesn't affect messages, handled at the state level
        return messages;

      case 'SET_CONVERSATION':
        return action.payload.messages || [];

      default:
        return messages;
    }
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  subscribeToGlobal(listener: ConversationListener): () => void {
    this.globalListeners.push(listener);
    
    return () => {
      const index = this.globalListeners.indexOf(listener);
      if (index > -1) {
        this.globalListeners.splice(index, 1);
      }
    };
  }

  subscribeToTab(tabId: string, listener: TabConversationListener): () => void {
    if (!this.tabListeners.has(tabId)) {
      this.tabListeners.set(tabId, []);
    }
    
    this.tabListeners.get(tabId)!.push(listener);
    
    return () => {
      const listeners = this.tabListeners.get(tabId);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  addTabNavigationHandler(tabId: string, handler: () => void): () => void {
    if (!this.navigationHandlers.has(tabId)) {
      this.navigationHandlers.set(tabId, []);
    }
    
    this.navigationHandlers.get(tabId)!.push(handler);
    
    return () => {
      const handlers = this.navigationHandlers.get(tabId);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  private notifyGlobalListeners(): void {
    this.globalListeners.forEach(listener => {
      try {
        listener({ ...this.globalState });
      } catch (error) {
        console.error('Sol conversation: Error in global listener:', error);
      }
    });
  }

  private notifyTabListeners(tabId: string, state: TabConversation): void {
    const listeners = this.tabListeners.get(tabId);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          console.error('Sol conversation: Error in tab listener:', error);
        }
      });
    }
  }

  // ============================================================================
  // PUBLIC API METHODS
  // ============================================================================

  // Global API
  getGlobalState(): ConversationState {
    return { ...this.globalState };
  }

  getGlobalActiveConversationId(): string | null {
    return this.globalState.activeConversationId;
  }

  getGlobalMessages(): Message[] {
    return [...this.globalState.messages];
  }

  getGlobalConversations(): Conversation[] {
    return [...this.globalState.conversations];
  }

  async addGlobalUserMessage(content: string, tabIds?: number[]): Promise<void> {
    await this.globalDispatch({
      type: 'ADD_USER_MESSAGE',
      payload: { content, tabIds }
    });
  }

  async addGlobalAssistantMessage(content: string): Promise<void> {
    await this.globalDispatch({
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { content }
    });
  }

  async updateGlobalStreamingMessage(content: string): Promise<void> {
    await this.globalDispatch({
      type: 'UPDATE_STREAMING_MESSAGE',
      payload: { content }
    });
  }

  async clearGlobalConversation(): Promise<void> {
    await this.globalDispatch({ type: 'CLEAR_CONVERSATION', payload: {} });
  }

  async deleteGlobalConversation(conversationId: string): Promise<void> {
    try {
      await this.storage.deleteConversation(conversationId);
      
      // If we deleted the active conversation, clear the state
      if (this.globalState.activeConversationId === conversationId) {
        this.globalState.activeConversationId = null;
        this.globalState.messages = [];
      }
      
      await this.loadGlobalConversations();
    } catch (error) {
      console.error('Sol conversation: Failed to delete global conversation:', error);
      throw error;
    }
  }

  async renameGlobalConversation(conversationId: string, title: string): Promise<void> {
    try {
      await this.storage.updateConversation(conversationId, { title });
      await this.loadGlobalConversations();
    } catch (error) {
      console.error('Sol conversation: Failed to rename global conversation:', error);
      throw error;
    }
  }

  // Tab API
  getTabState(tabId: string): TabConversation {
    return this.getTabConversation(tabId);
  }

  addTabUserMessage(tabId: string, content: string, tabIds?: number[]): void {
    this.tabDispatch(tabId, {
      type: 'ADD_USER_MESSAGE',
      payload: { content, tabIds }
    });
  }

  addTabAssistantMessage(tabId: string, content: string): void {
    this.tabDispatch(tabId, {
      type: 'ADD_ASSISTANT_MESSAGE',
      payload: { content }
    });
  }

  updateTabStreamingMessage(tabId: string, content: string): void {
    this.tabDispatch(tabId, {
      type: 'UPDATE_STREAMING_MESSAGE',
      payload: { content }
    });
  }

  setTabConversationId(tabId: string, conversationId: string | null): void {
    const currentState = this.getTabConversation(tabId);
    const newState: TabConversation = {
      ...currentState,
      conversationId
    };
    
    this.tabStates.set(tabId, newState);
    this.notifyTabListeners(tabId, newState);
  }

  // ============================================================================
  // CONTEXT SWITCHING API
  // ============================================================================

  async syncTabToGlobal(tabId: string): Promise<string | null> {
    const tabState = this.getTabConversation(tabId);
    
    if (tabState.messages.length === 0) {
      return null;
    }

    try {
      // Create or update global conversation
      let conversationId = tabState.conversationId;
      
      if (!conversationId) {
        // Create new global conversation
        conversationId = await this.createNewGlobalConversation();
        this.setTabConversationId(tabId, conversationId);
      }

      // Update global conversation with tab messages
      await this.storage.updateConversation(conversationId, {
        messages: tabState.messages
      });

      // Switch to this conversation globally
      await this.switchToGlobalConversation(conversationId);

      return conversationId;
    } catch (error) {
      console.error('Sol conversation: Failed to sync tab to global:', error);
      throw error;
    }
  }

  async syncGlobalToTab(tabId: string, conversationId?: string): Promise<void> {
    try {
      const targetId = conversationId || this.globalState.activeConversationId;
      if (!targetId) return;

      const conversation = await this.storage.getConversation(targetId);
      if (!conversation) return;

      this.setTabConversation(tabId, conversation.messages, targetId);
    } catch (error) {
      console.error('Sol conversation: Failed to sync global to tab:', error);
      throw error;
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  disconnect(): void {
    if (this.syncUnsubscribe) {
      this.syncUnsubscribe();
    }
    
    // Clear all listeners
    this.globalListeners = [];
    this.tabListeners.clear();
    this.navigationHandlers.clear();
    
    // Clear tab states
    this.tabStates.clear();
  }

  cleanupTab(tabId: string): void {
    this.tabStates.delete(tabId);
    this.tabListeners.delete(tabId);
    this.navigationHandlers.delete(tabId);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export default conversation.getInstance(); 