import { Message } from '../services/storage';

export interface TabConversation {
  messages: Message[];
  conversationId: string | null;
}

export interface ConversationAction {
  type: 'ADD_USER_MESSAGE' | 'ADD_ASSISTANT_MESSAGE' | 'CLEAR_CONVERSATION' | 'UPDATE_CONVERSATION_ID' | 'SET_CONVERSATION' | 'UPDATE_STREAMING_MESSAGE';
  payload: any;
}

export class TabConversationManager {
  private static instance: TabConversationManager;
  private tabId: string;
  private conversationKey: string;
  private currentUrl: string;
  private currentHost: string;
  private navigationHandlers: (() => void)[] = [];
  private stateChangeHandlers: ((state: TabConversation) => void)[] = [];

  private constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.conversationKey = `sol-tab-conversation-${this.tabId}`;
    this.currentUrl = window.location.href;
    this.currentHost = window.location.hostname;
    this.setupNavigationListeners();
  }

  static getInstance(): TabConversationManager {
    if (!this.instance) {
      this.instance = new TabConversationManager();
    }
    return this.instance;
  }

  getConversation(): TabConversation {
    try {
      const stored = sessionStorage.getItem(this.conversationKey);
      return stored ? JSON.parse(stored) : { messages: [], conversationId: null };
    } catch {
      return { messages: [], conversationId: null };
    }
  }

  setConversation(messages: Message[], conversationId: string | null): void {
    try {
      const newState = { messages, conversationId };
      sessionStorage.setItem(this.conversationKey, JSON.stringify(newState));
      this.notifyStateChange(newState);
    } catch (error) {
      console.error('Sol: Failed to save tab conversation:', error);
    }
  }

  // New action-based state management
  dispatch(action: ConversationAction): void {
    const currentState = this.getConversation();
    const newState = this.reduceAction(currentState, action);
    
    try {
      sessionStorage.setItem(this.conversationKey, JSON.stringify(newState));
      this.notifyStateChange(newState);
    } catch (error) {
      console.error('Sol: Failed to save tab conversation after action:', error);
    }
  }

  private reduceAction(state: TabConversation, action: ConversationAction): TabConversation {
    switch (action.type) {
      case 'ADD_USER_MESSAGE':
        return {
          ...state,
          messages: [...state.messages, {
            type: 'user',
            content: action.payload.content,
            timestamp: action.payload.timestamp || Date.now()
          }]
        };
      
      case 'ADD_ASSISTANT_MESSAGE':
        return {
          ...state,
          messages: [...state.messages, {
            type: 'assistant',
            content: action.payload.content,
            timestamp: action.payload.timestamp || Date.now()
          }]
        };
      
      case 'UPDATE_STREAMING_MESSAGE':
        return {
          ...state,
          messages: state.messages.map((msg, index) => {
            // Update the last assistant message with streaming content
            if (index === state.messages.length - 1 && msg.type === 'assistant') {
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
            state.messages.length === 0 || state.messages[state.messages.length - 1].type !== 'assistant'
              ? [{
                  type: 'assistant' as const,
                  content: action.payload.content,
                  timestamp: action.payload.timestamp || Date.now()
                }]
              : []
          )
        };
      
      case 'CLEAR_CONVERSATION':
        return {
          messages: [],
          conversationId: null
        };
      
      case 'UPDATE_CONVERSATION_ID':
        return {
          ...state,
          conversationId: action.payload
        };
      
      case 'SET_CONVERSATION':
        return {
          messages: action.payload.messages || [],
          conversationId: action.payload.conversationId || null
        };
      
      default:
        return state;
    }
  }

  clearConversation(): void {
    this.dispatch({ type: 'CLEAR_CONVERSATION', payload: null });
  }

  addNavigationHandler(handler: () => void): () => void {
    this.navigationHandlers.push(handler);
    
    // Return cleanup function
    return () => {
      const index = this.navigationHandlers.indexOf(handler);
      if (index > -1) {
        this.navigationHandlers.splice(index, 1);
      }
    };
  }

  addStateChangeHandler(handler: (state: TabConversation) => void): () => void {
    this.stateChangeHandlers.push(handler);
    
    // Return cleanup function
    return () => {
      const index = this.stateChangeHandlers.indexOf(handler);
      if (index > -1) {
        this.stateChangeHandlers.splice(index, 1);
      }
    };
  }

  private notifyStateChange(newState: TabConversation): void {
    this.stateChangeHandlers.forEach(handler => {
      try {
        handler(newState);
      } catch (error) {
        console.error('Sol: Error in state change handler:', error);
      }
    });
  }

  private setupNavigationListeners(): void {
    const handleNavigation = () => {
      const newUrl = window.location.href;
      const newHost = window.location.hostname;
      
      // Simple navigation detection
      if (newUrl !== this.currentUrl || newHost !== this.currentHost) {
        this.currentUrl = newUrl;
        this.currentHost = newHost;
        this.clearConversation();
        
        // Notify all handlers
        this.navigationHandlers.forEach(handler => {
          try {
            handler();
          } catch (error) {
            console.error('Sol: Error in navigation handler:', error);
          }
        });
      }
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

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  getCurrentHost(): string {
    return this.currentHost;
  }

  getTabId(): string {
    return this.tabId;
  }
} 