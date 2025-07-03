import browser from 'webextension-polyfill';
import Dexie, { Table } from 'dexie';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Legacy interfaces for backward compatibility
export interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tabIds?: number[];
}

export interface Conversation {
  id: string;
  url: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// Modern message part types for rich content
export interface MessagePart {
  type: 'text' | 'reasoning' | 'tool-invocation' | 'file';
  text?: string;
  reasoning?: string;
  toolInvocation?: {
    toolName: string;
    args: any;
    result?: any;
  };
  data?: string;
  filename?: string;
  mimeType?: string;
}

// Modern denormalized message schema
export interface DbMessage {
  id: string;
  convId: string;
  idx: number;
  type: 'user' | 'assistant';
  parts: MessagePart[];
  timestamp: number;
  streamId?: string;
  tabIds?: number[];
}

// Modern conversation schema
export interface DbConversation {
  id: string;
  title: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  metadata?: {
    activeStreamId?: string;
    lastMessageIdx?: number;
  };
}

// Extension settings interface
export interface StorageData {
  version: string;
  features: {
    askBar: {
      isEnabled: boolean;
      keybind: string;
      position: '' | 'top-right' | 'bottom-left' | 'bottom-right';
    };
    sideBar: {
      isEnabled: boolean;
      keybind: string;
      position: 'left' | 'right';
    };
  };
  provider: string;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  debug: boolean;
}

// Sync message interface
export interface SyncMessage {
  type: 'CONVERSATION_UPDATED' | 'CONVERSATION_DELETED' | 'MESSAGE_ADDED' | 'MESSAGE_UPDATED';
  convId: string;
  data?: any;
  timestamp: number;
}

export type SyncListener = (message: SyncMessage) => void;

// ============================================================================
// CONSTANTS & DEFAULTS
// ============================================================================

function getDefaultKeybind(key: string): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = userAgent.includes('mac') || userAgent.includes('darwin');
  return isMac ? `Cmd+${key}` : `Ctrl+${key}`;
}

export const DEFAULT_STORAGE: Readonly<StorageData> = {
  version: '2.6.0',
  features: {
    askBar: {
      isEnabled: true,
      keybind: getDefaultKeybind("F"),
      position: 'top-right',
    },
    sideBar: {
      isEnabled: true,
      keybind: getDefaultKeybind("Enter"),
      position: 'left',
    }
  },
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  customEndpoint: '',
  debug: false,
};

// ============================================================================
// DATABASE LAYER
// ============================================================================

class SolChatDB extends Dexie {
  conversations!: Table<DbConversation>;
  messages!: Table<DbMessage>;

  constructor() {
    super('sol_chat_v1');
    
    this.version(1).stores({
      conversations: 'id, title, updatedAt',
      messages: 'id, convId, idx, timestamp, [convId+idx]'
    });
  }
}

// ============================================================================
// STORAGE SERVICE
// ============================================================================

export class StorageService {
  private static instance: StorageService;
  private db: SolChatDB;
  
  // Sync properties
  private channel: BroadcastChannel | null = null;
  private listeners: SyncListener[] = [];
  private useStorageEvents = false;

  private constructor() {
    this.db = new SolChatDB();
    this.initializeSync();
  }

  static getInstance(): StorageService {
    if (!this.instance) {
      this.instance = new StorageService();
    }
    return this.instance;
  }

  // ============================================================================
  // DATABASE ACCESS
  // ============================================================================

  get database(): SolChatDB {
    return this.db;
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  async get(): Promise<StorageData> {
    try {
      const stored = (await browser.storage.local.get(null)) as Partial<StorageData>;
      return { ...DEFAULT_STORAGE, ...stored } as StorageData;
    } catch (error) {
      console.error('Sol Storage: Error getting settings:', error);
      return DEFAULT_STORAGE;
    }
  }

  async set(data: Partial<StorageData>): Promise<void> {
    const trimmedData = { ...data };
    if (trimmedData.apiKey) {
      trimmedData.apiKey = trimmedData.apiKey.trim();
    }
    await browser.storage.local.set(trimmedData);
  }

  async reset(): Promise<void> {
    await browser.storage.local.clear();
    await browser.storage.local.set({ ...DEFAULT_STORAGE });
  }

  // ============================================================================
  // SYNC FUNCTIONALITY
  // ============================================================================

  private initializeSync(): void {
    try {
      this.channel = new BroadcastChannel('sol_chat_sync');
      this.channel.addEventListener('message', this.handleBroadcastMessage.bind(this));
      console.log('Sol Sync: Using BroadcastChannel');
    } catch (error) {
      console.log('Sol Sync: BroadcastChannel not available, using storage events');
      this.useStorageEvents = true;
      browser.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    }
  }

  addSyncListener(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  broadcast(message: Omit<SyncMessage, 'timestamp'>): void {
    const fullMessage: SyncMessage = {
      ...message,
      timestamp: Date.now()
    };

    try {
      if (this.channel) {
        this.channel.postMessage(fullMessage);
      } else if (this.useStorageEvents) {
        browser.storage.local.set({ syncMessage: fullMessage });
      }
    } catch (error) {
      console.error('Sol Sync: Failed to broadcast message:', error);
    }
  }

  private handleBroadcastMessage(event: MessageEvent<SyncMessage>): void {
    this.notifyListeners(event.data);
  }

  private handleStorageChange(changes: any, areaName: string): void {
    if (areaName !== 'local' || !changes.syncMessage) return;
    
    const syncMessage = changes.syncMessage.newValue;
    if (syncMessage) {
      this.notifyListeners(syncMessage);
      setTimeout(() => {
        browser.storage.local.remove('syncMessage');
      }, 100);
    }
  }

  private notifyListeners(message: SyncMessage): void {
    this.listeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('Sol Sync: Error in listener:', error);
      }
    });
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners = [];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

const storage = StorageService.getInstance();
export default storage; 