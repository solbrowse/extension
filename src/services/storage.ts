import browser from 'webextension-polyfill';
import Dexie, { Table } from 'dexie';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Legacy message format (for compatibility)
export interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tabIds?: number[];
}

// Legacy conversation format (for compatibility)
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
  darkMode: boolean;
  conversations: Conversation[]; // Legacy storage
  dbVersion?: number;
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

const SCHEMA_VERSION = 1;

function getDefaultKeybind(key: string): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = userAgent.includes('mac') || userAgent.includes('darwin');
  return isMac ? `Cmd+${key}` : `Ctrl+${key}`;
}

export const DEFAULT_STORAGE: Readonly<StorageData> = {
  version: '2.5.0',
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
  darkMode: false,
  conversations: [],
};

// ============================================================================
// DATABASE LAYER
// ============================================================================

class SolChatDB extends Dexie {
  conversations!: Table<DbConversation>;
  messages!: Table<DbMessage>;

  constructor() {
    super('sol_chat_v1');
    
    this.version(SCHEMA_VERSION).stores({
      conversations: 'id, title, updatedAt',
      messages: 'id, convId, idx, timestamp, [convId+idx]'
    });
  }
}

// ============================================================================
// UNIFIED STORAGE SERVICE
// ============================================================================

export class UnifiedStorageService {
  private static instance: UnifiedStorageService;
  private db: SolChatDB;
  private useIndexedDB = false;
  
  // Sync properties
  private channel: BroadcastChannel | null = null;
  private listeners: SyncListener[] = [];
  private useStorageEvents = false;

  private constructor() {
    this.db = new SolChatDB();
    this.initializeSync();
    this.initializeStorage();
  }

  static getInstance(): UnifiedStorageService {
    if (!this.instance) {
      this.instance = new UnifiedStorageService();
    }
    return this.instance;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private async initializeStorage(): Promise<void> {
    try {
      if (await this.needsDbMigration()) {
        console.log('Sol Storage: Running IndexedDB migration...');
        await this.migrateFromChromeStorage();
      }
      
      this.useIndexedDB = true;
      console.log('Sol Storage: Using IndexedDB storage');
    } catch (error) {
      console.error('Sol Storage: IndexedDB initialization failed, falling back to chrome.storage:', error);
      this.useIndexedDB = false;
    }
  }

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

  // ============================================================================
  // SETTINGS MANAGEMENT (Legacy storage.ts functionality)
  // ============================================================================

  async get(): Promise<StorageData> {
    try {
      const stored = (await browser.storage.local.get(null)) as Partial<StorageData>;
      
      if (stored.conversations && !Array.isArray(stored.conversations)) {
        console.warn('Sol Storage: Invalid conversations data detected, resetting');
        stored.conversations = [];
      }

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

  async needsSchemaReset(): Promise<boolean> {
    try {
      const stored = await browser.storage.local.get(null) as any;
      
      if (!stored || Object.keys(stored).length === 0) {
        return false;
      }
      
      if (!stored.version || stored.version !== DEFAULT_STORAGE.version) {
        console.log('Sol Storage: Version mismatch detected', { 
          stored: stored.version, 
          expected: DEFAULT_STORAGE.version 
        });
        return true;
      }
      
      if (stored.features && stored.features.aiSearch && !stored.features.askBar) {
        console.log('Sol Storage: Old schema detected (features.aiSearch found)');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Sol Storage: Error checking schema:', error);
      return true;
    }
  }

  async resetToDefaults(): Promise<void> {
    await browser.storage.local.clear();
    await browser.storage.local.set({ ...DEFAULT_STORAGE });
  }

  // Convenience methods for specific settings
  async getApiKey(): Promise<string> {
    const data = await this.get();
    return data.apiKey;
  }

  async setApiKey(apiKey: string): Promise<void> {
    const cleanApiKey = apiKey.trim();
    await this.set({ apiKey: cleanApiKey });
  }

  async getProvider(): Promise<string> {
    const data = await this.get();
    return data.provider;
  }

  async setProvider(provider: string): Promise<void> {
    await this.set({ provider });
  }

  async getModel(): Promise<string> {
    const data = await this.get();
    return data.model;
  }

  async setModel(model: string): Promise<void> {
    await this.set({ model });
  }

  // ============================================================================
  // CONVERSATION MANAGEMENT (Hybrid IndexedDB + chrome.storage)
  // ============================================================================

  async getConversations(): Promise<Conversation[]> {
    try {
      if (this.useIndexedDB) {
        const dbConversations = await this.db.conversations.orderBy('updatedAt').reverse().toArray();
        return await Promise.all(
          dbConversations.map(async (dbConv) => {
            try {
              const messages = await this.getMessages(dbConv.id);
              return this.dbConversationToLegacy(dbConv, messages);
            } catch (msgError) {
              console.warn(`Sol Storage: Failed to load messages for conversation ${dbConv.id}:`, msgError);
              return this.dbConversationToLegacy(dbConv, []);
            }
          })
        );
      } else {
        const settings = await this.get();
        return settings.conversations;
      }
    } catch (error) {
      console.error('Sol Storage: Failed to get conversations:', error);
      return [];
    }
  }

  async getConversation(id: string): Promise<Conversation | null> {
    try {
      if (this.useIndexedDB) {
        const dbConv = await this.db.conversations.get(id);
        if (!dbConv) return null;
        
        const messages = await this.getMessages(id);
        return this.dbConversationToLegacy(dbConv, messages);
      } else {
        const settings = await this.get();
        return settings.conversations.find(c => c.id === id) || null;
      }
    } catch (error) {
      console.error('Sol Storage: Failed to get conversation:', error);
      return null;
    }
  }

  async saveConversation(conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = Date.now();
      const id = `conv_${now}_${Math.random().toString(36).substr(2, 9)}`;
      
      if (this.useIndexedDB) {
        const dbConv: DbConversation = {
          id,
          title: conversation.title,
          url: conversation.url,
          createdAt: now,
          updatedAt: now
        };

        await this.db.conversations.add(dbConv);
        this.broadcastConversationUpdated(id);
        return id;
      } else {
        // Fallback to chrome.storage
        const settings = await this.get();
        const newConv: Conversation = {
          ...conversation,
          id,
          createdAt: now,
          updatedAt: now
        };

        settings.conversations.push(newConv);
        await this.set({ conversations: settings.conversations });
        return id;
      }
    } catch (error) {
      console.error('Sol Storage: Failed to save conversation:', error);
      throw error;
    }
  }

  async updateConversation(id: string, updates: Partial<Pick<Conversation, 'messages' | 'title'>>): Promise<void> {
    try {
      if (this.useIndexedDB) {
        await this.db.conversations.update(id, {
          title: updates.title,
          updatedAt: Date.now()
        });
        this.broadcastConversationUpdated(id);
      } else {
        const settings = await this.get();
        const convIndex = settings.conversations.findIndex(c => c.id === id);
        if (convIndex >= 0) {
          settings.conversations[convIndex] = {
            ...settings.conversations[convIndex],
            ...updates,
            updatedAt: Date.now()
          };
          await this.set({ conversations: settings.conversations });
        }
      }
    } catch (error) {
      console.error('Sol Storage: Failed to update conversation:', error);
      throw error;
    }
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      if (this.useIndexedDB) {
        await this.db.transaction('rw', this.db.conversations, this.db.messages, async () => {
          await this.db.conversations.delete(id);
          await this.db.messages.where('convId').equals(id).delete();
        });
        this.broadcastConversationDeleted(id);
      } else {
        const settings = await this.get();
        settings.conversations = settings.conversations.filter(c => c.id !== id);
        await this.set({ conversations: settings.conversations });
      }
    } catch (error) {
      console.error('Sol Storage: Failed to delete conversation:', error);
      throw error;
    }
  }

  async deleteAllConversations(): Promise<void> {
    try {
      if (this.useIndexedDB) {
        await this.db.transaction('rw', this.db.conversations, this.db.messages, async () => {
          await this.db.conversations.clear();
          await this.db.messages.clear();
        });
      } else {
        await this.set({ conversations: [] });
      }
    } catch (error) {
      console.error('Sol Storage: Failed to delete all conversations:', error);
      throw error;
    }
  }

  // ============================================================================
  // MESSAGE MANAGEMENT (IndexedDB with chrome.storage fallback)
  // ============================================================================

  async getMessages(convId: string, limit?: number): Promise<DbMessage[]> {
    try {
      if (this.useIndexedDB) {
        let query = this.db.messages.where('[convId+idx]').between([convId, 0], [convId, Infinity]);
        if (limit) {
          query = query.limit(limit);
        }
        return await query.toArray();
      } else {
        // Fallback: convert legacy messages to DbMessage format
        const settings = await this.get();
        const conv = settings.conversations.find(c => c.id === convId);
        if (!conv) return [];
        
        let messages = conv.messages.map((msg, idx) => ({
          id: `${convId}_msg_${idx}`,
          convId,
          idx,
          type: msg.type,
          parts: [{ type: 'text', text: msg.content }] as MessagePart[],
          timestamp: msg.timestamp,
          tabIds: msg.tabIds
        }));

        if (limit) {
          messages = messages.slice(0, limit);
        }

        return messages;
      }
    } catch (error) {
      console.error('Sol Storage: Failed to get messages:', error);
      return [];
    }
  }

  async addMessage(convId: string, message: Omit<DbMessage, 'id' | 'idx' | 'convId'>): Promise<string> {
    try {
      if (this.useIndexedDB) {
        const lastMsg = await this.db.messages
          .where('[convId+idx]')
          .between([convId, 0], [convId, Infinity])
          .reverse()
          .first();
        
        const idx = lastMsg ? lastMsg.idx + 1 : 0;
        const id = `${convId}_msg_${idx}`;

        const dbMsg: DbMessage = {
          ...message,
          id,
          convId,
          idx
        };

        await this.db.messages.add(dbMsg);
        await this.db.conversations.update(convId, { updatedAt: Date.now() });
        this.broadcastMessageAdded(convId);
        return id;
      } else {
        // Fallback to chrome.storage - convert to legacy format
        const settings = await this.get();
        const convIndex = settings.conversations.findIndex(c => c.id === convId);
        if (convIndex >= 0) {
          const textPart = message.parts.find(p => p.type === 'text');
          const legacyMsg: Message = {
            type: message.type,
            content: textPart?.text || '',
            timestamp: message.timestamp,
            tabIds: message.tabIds
          };
          
          settings.conversations[convIndex].messages.push(legacyMsg);
          settings.conversations[convIndex].updatedAt = Date.now();
          await this.set({ conversations: settings.conversations });
          return `${convId}_msg_${settings.conversations[convIndex].messages.length - 1}`;
        }
        throw new Error(`Conversation ${convId} not found`);
      }
    } catch (error) {
      console.error('Sol Storage: Failed to add message:', error);
      throw error;
    }
  }

  async updateMessage(id: string, updates: Partial<Pick<DbMessage, 'parts' | 'streamId'>>): Promise<void> {
    try {
      if (this.useIndexedDB) {
        await this.db.messages.update(id, updates);
      } else {
        // For chrome.storage fallback, we'd need to parse the ID and update the specific message
        // This is more complex for legacy storage, so we'll keep it simple for now
        console.warn('Sol Storage: Message updates not fully supported in chrome.storage fallback mode');
      }
    } catch (error) {
      console.error('Sol Storage: Failed to update message:', error);
      throw error;
    }
  }

  // ============================================================================
  // MIGRATION & UTILITIES
  // ============================================================================

  private async needsDbMigration(): Promise<boolean> {
    try {
      const settings = await this.get();
      const dbVersion = settings.dbVersion || 0;
      return dbVersion < SCHEMA_VERSION;
    } catch (error) {
      console.error('Sol Storage: Error checking migration needs:', error);
      return true;
    }
  }

  private async migrateFromChromeStorage(): Promise<void> {
    try {
      const settings = await this.get();
      const legacyConversations = settings.conversations || [];
      
      if (legacyConversations.length === 0) {
        await this.set({ dbVersion: SCHEMA_VERSION });
        return;
      }

      const dbConversations: DbConversation[] = [];
      const dbMessages: DbMessage[] = [];

      for (const legacyConv of legacyConversations) {
        const dbConv: DbConversation = {
          id: legacyConv.id,
          title: legacyConv.title,
          url: legacyConv.url || '',
          createdAt: legacyConv.createdAt,
          updatedAt: legacyConv.updatedAt,
          metadata: { lastMessageIdx: legacyConv.messages.length - 1 }
        };
        dbConversations.push(dbConv);

        legacyConv.messages.forEach((msg: Message, idx: number) => {
          const dbMsg: DbMessage = {
            id: `${legacyConv.id}_msg_${idx}`,
            convId: legacyConv.id,
            idx,
            type: msg.type,
            parts: [{ type: 'text', text: msg.content }],
            timestamp: msg.timestamp,
            tabIds: msg.tabIds
          };
          dbMessages.push(dbMsg);
        });
      }

      await this.db.transaction('rw', this.db.conversations, this.db.messages, async () => {
        await this.db.conversations.bulkAdd(dbConversations);
        await this.db.messages.bulkAdd(dbMessages);
      });

      await this.set({ dbVersion: SCHEMA_VERSION });
      console.log(`Sol Storage: Migrated ${dbConversations.length} conversations, ${dbMessages.length} messages`);
    } catch (error) {
      console.error('Sol Storage: Migration failed:', error);
      throw error;
    }
  }

  private dbConversationToLegacy(dbConv: DbConversation, messages: DbMessage[]): Conversation {
    return {
      id: dbConv.id,
      url: dbConv.url,
      title: dbConv.title,
      messages: messages.map(msg => {
        const textPart = msg.parts.find(p => p.type === 'text');
        return {
          type: msg.type,
          content: textPart?.text || '',
          timestamp: msg.timestamp,
          tabIds: msg.tabIds
        };
      }),
      createdAt: dbConv.createdAt,
      updatedAt: dbConv.updatedAt
    };
  }

  // ============================================================================
  // SYNC FUNCTIONALITY (Cross-tab synchronization)
  // ============================================================================

  addSyncListener(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
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

  private broadcast(message: Omit<SyncMessage, 'timestamp'>): void {
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

  private broadcastConversationUpdated(convId: string, data?: any): void {
    this.broadcast({ type: 'CONVERSATION_UPDATED', convId, data });
  }

  private broadcastConversationDeleted(convId: string): void {
    this.broadcast({ type: 'CONVERSATION_DELETED', convId });
  }

  private broadcastMessageAdded(convId: string, data?: any): void {
    this.broadcast({ type: 'MESSAGE_ADDED', convId, data });
  }

  private broadcastMessageUpdated(convId: string, data?: any): void {
    this.broadcast({ type: 'MESSAGE_UPDATED', convId, data });
  }

  // ============================================================================
  // EXPORT UTILITIES (from storage.ts)
  // ============================================================================

  exportConversationToMarkdown(conversation: Conversation): string {
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `**Created:** ${new Date(conversation.createdAt).toLocaleString()}\n`;
    markdown += `**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}\n`;
    markdown += `**URL:** ${conversation.url}\n\n`;
    markdown += `---\n\n`;

    conversation.messages.forEach((message, index) => {
      const role = message.type === 'user' ? '👤 **User**' : '🤖 **Assistant**';
      markdown += `## ${role}\n\n`;
      markdown += `${message.content}\n\n`;
      
      if (index < conversation.messages.length - 1) {
        markdown += `---\n\n`;
      }
    });

    return markdown;
  }

  async exportAllConversationsToMarkdown(): Promise<string> {
    const conversations = await this.getConversations();
    let markdown = `# Sol Conversations Export\n\n`;
    markdown += `**Exported:** ${new Date().toLocaleString()}\n`;
    markdown += `**Total Conversations:** ${conversations.length}\n\n`;
    markdown += `---\n\n`;

    conversations.forEach((conversation, index) => {
      markdown += this.exportConversationToMarkdown(conversation);
      
      if (index < conversations.length - 1) {
        markdown += `\n\n---\n\n`;
      }
    });

    return markdown;
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
// SINGLETON EXPORT & COMPATIBILITY
// ============================================================================

const unifiedStorage = UnifiedStorageService.getInstance();

// Export the singleton instance as default
export default unifiedStorage;

// Export compatibility functions for existing code
export const get = () => unifiedStorage.get();
export const set = (data: Partial<StorageData>) => unifiedStorage.set(data);
export const reset = () => unifiedStorage.reset();
export const getApiKey = () => unifiedStorage.getApiKey();
export const setApiKey = (apiKey: string) => unifiedStorage.setApiKey(apiKey);
export const getProvider = () => unifiedStorage.getProvider();
export const setProvider = (provider: string) => unifiedStorage.setProvider(provider);
export const getModel = () => unifiedStorage.getModel();
export const setModel = (model: string) => unifiedStorage.setModel(model);
export const needsSchemaReset = () => unifiedStorage.needsSchemaReset();
export const resetToDefaults = () => unifiedStorage.resetToDefaults();

// Conversation functions
export const getConversations = () => unifiedStorage.getConversations();
export const getConversation = (id: string) => unifiedStorage.getConversation(id);
export const saveConversation = (conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>) => 
  unifiedStorage.saveConversation(conversation);
export const updateConversation = (id: string, updates: Partial<Pick<Conversation, 'messages' | 'title'>>) => 
  unifiedStorage.updateConversation(id, updates);
export const deleteConversation = (id: string) => unifiedStorage.deleteConversation(id);
export const deleteAllConversations = () => unifiedStorage.deleteAllConversations();

// Export utilities
export const exportConversationToMarkdown = (conversation: Conversation) => 
  unifiedStorage.exportConversationToMarkdown(conversation);
export const exportAllConversationsToMarkdown = () => unifiedStorage.exportAllConversationsToMarkdown(); 