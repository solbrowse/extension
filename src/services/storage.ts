import browser from 'webextension-polyfill';

export interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tabIds?: number[]; // Optional tab context for the message
}

export interface Conversation {
  id: string;
  url: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Get platform-specific default keybind
 */
function getDefaultKeybind(key: string): string {
  // Detect platform
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = userAgent.includes('mac') || userAgent.includes('darwin');
  
  return isMac ? `Cmd+${key}` : `Ctrl+${key}`;
}

export interface StorageData {
  version: string;
  features: {
    askBar: {
      isEnabled: boolean;
      keybind: string;
      position: '' | 'top-right' | 'bottom-left' | 'btop-leftottom-right';
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
  /** General debug flag enabling verbose logging across the extension */
  debug: boolean;
  conversations: Conversation[];
}

/**
 * Defaults kept **readonly** so they are never mutated at runtime,
 * yet still usable as a value-typed template for `get`.
 */
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
  conversations: [],
};

/* ---------- helpers ------------------------------------------------------ */

/**
 * Generic helper that merges partial data returned from storage
 * with a set of defaults, returning a fully-typed object.
 */
function withDefaults<T>(
  defaults: T,
  partial: Partial<T> | undefined
): T {
  return { ...defaults, ...partial } as T;
}

/* ---------- public API --------------------------------------------------- */

/**
 * Read everything from storage and fall back to `DEFAULT_STORAGE`
 * for any missing keys.
 */
export async function get(): Promise<StorageData> {
  try {
    // `get(null)` tells the API "give me everything".
    // Cast to Partial<StorageData> so we can merge safely.
    const stored =
      (await browser.storage.local.get(null)) as Partial<StorageData>;

    // Ensure conversations is always an array
    if (stored.conversations && !Array.isArray(stored.conversations)) {
      console.warn('Sol Storage: Invalid conversations data detected, resetting');
      stored.conversations = [];
    }

    return withDefaults(DEFAULT_STORAGE, stored);
  } catch (error) {
    console.error('Sol Storage: Error getting data:', error);
    // Return defaults if storage fails
    return DEFAULT_STORAGE;
  }
}

/**
 * Check if stored data has incompatible schema and needs reset
 */
export async function needsSchemaReset(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(null) as any;
    
    // No data at all - fresh install, no reset needed
    if (!stored || Object.keys(stored).length === 0) {
      return false;
    }
    
    // Check version mismatch
    if (!stored.version || stored.version !== DEFAULT_STORAGE.version) {
      console.log('Sol Storage: Version mismatch detected', { 
        stored: stored.version, 
        expected: DEFAULT_STORAGE.version 
      });
      return true;
    }
    
    // Check for old schema (features.aiSearch instead of features.askBar)
    if (stored.features && stored.features.aiSearch && !stored.features.askBar) {
      console.log('Sol Storage: Old schema detected (features.aiSearch found)');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Sol Storage: Error checking schema:', error);
    return true; // Reset on error to be safe
  }
}

/**
 * Clear all storage and reset to defaults
 */
export async function resetToDefaults(): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.local.set({ ...DEFAULT_STORAGE });
}

/**
 * Persist (part of) the settings.  Accepts either
 * a full `StorageData` or just the keys you want to update.
 */
export async function set(data: Partial<StorageData>): Promise<void> {
  const trimmedData = { ...data };
  if (trimmedData.apiKey) {
    trimmedData.apiKey = trimmedData.apiKey.trim();
  }
  await browser.storage.local.set(trimmedData);
}

/**
 * Convenience wrapper to reset everything in one call.
 */
export async function reset(): Promise<void> {
  await browser.storage.local.set({ ...DEFAULT_STORAGE });
}

export async function getApiKey(): Promise<string> {
  const data = await get();
  return data.apiKey;
}

export async function setApiKey(apiKey: string): Promise<void> {
  const cleanApiKey = apiKey.trim();
  await set({ apiKey: cleanApiKey });
}

export async function getProvider(): Promise<string> {
  const data = await get();
  return data.provider;
}

export async function setProvider(provider: string): Promise<void> {
  await set({ provider });
}

export async function getModel(): Promise<string> {
  const data = await get();
  return data.model;
}

export async function setModel(model: string): Promise<void> {
  await set({ model });
}

export async function setSecureApiKey(apiKey: string, provider: string): Promise<void> {
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Invalid API key format');
  }
  
  const validationRules = {
    openai: /^sk-[a-zA-Z0-9]{48,}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9\-_]{95,}$/,
    gemini: /^[a-zA-Z0-9\-_]{39}$/,
  };
  
  const rule = validationRules[provider as keyof typeof validationRules];
  if (rule && !rule.test(apiKey)) {
    console.warn(`API key format may be invalid for provider: ${provider}`);
  }
  
  await setApiKey(apiKey);
}

export async function clear(): Promise<void> {
  await browser.storage.local.clear();
}

/* ---------- conversation management -------------------------------------- */

/**
 * Generate a unique conversation ID
 */
function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save a conversation to storage
 */
export async function saveConversation(conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const data = await get();
  const now = Date.now();
  const newConversation: Conversation = {
    ...conversation,
    id: generateConversationId(),
    createdAt: now,
    updatedAt: now,
  };
  
  const updatedConversations = [...data.conversations, newConversation];
  await set({ conversations: updatedConversations });
  
  return newConversation.id;
}

/**
 * Update an existing conversation
 */
export async function updateConversation(id: string, updates: Partial<Pick<Conversation, 'messages' | 'title'>>): Promise<void> {
  const data = await get();
  const conversationIndex = data.conversations.findIndex(conv => conv.id === id);
  
  if (conversationIndex === -1) {
    throw new Error(`Conversation with id ${id} not found`);
  }
  
  const updatedConversation = {
    ...data.conversations[conversationIndex],
    ...updates,
    updatedAt: Date.now(),
  };
  
  const updatedConversations = [...data.conversations];
  updatedConversations[conversationIndex] = updatedConversation;
  
  await set({ conversations: updatedConversations });
}

/**
 * Get all conversations
 */
export async function getConversations(): Promise<Conversation[]> {
  try {
    const data = await get();
    
    // Ensure conversations is an array (Chrome compatibility)
    if (!Array.isArray(data.conversations)) {
      console.warn('Sol Storage: conversations is not an array, resetting to empty array');
      await set({ conversations: [] });
      return [];
    }
    
    // Filter out any invalid conversations and sort
    const validConversations = data.conversations.filter(conv => 
      conv && 
      typeof conv === 'object' && 
      conv.id && 
      Array.isArray(conv.messages) &&
      typeof conv.updatedAt === 'number'
    );
    
    if (validConversations.length !== data.conversations.length) {
      console.warn(`Sol Storage: Found ${data.conversations.length - validConversations.length} invalid conversations, cleaning up`);
      await set({ conversations: validConversations });
    }
    
    return validConversations.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    console.error('Sol Storage: Error getting conversations:', error);
    // Reset conversations on error to prevent recurring issues
    await set({ conversations: [] });
    return [];
  }
}

/**
 * Get a specific conversation by ID
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  const data = await get();
  return data.conversations.find(conv => conv.id === id) || null;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(id: string): Promise<void> {
  const data = await get();
  const updatedConversations = data.conversations.filter(conv => conv.id !== id);
  await set({ conversations: updatedConversations });
}

/**
 * Delete all conversations
 */
export async function deleteAllConversations(): Promise<void> {
  await set({ conversations: [] });
}

/**
 * Export conversation to markdown
 */
export function exportConversationToMarkdown(conversation: Conversation): string {
  const date = new Date(conversation.createdAt).toLocaleString();
  let markdown = `# ${conversation.title}\n\n`;
  markdown += `**URL:** ${conversation.url}\n`;
  markdown += `**Date:** ${date}\n\n`;
  markdown += `---\n\n`;
  
  conversation.messages.forEach((message, index) => {
    const role = message.type === 'user' ? '**You**' : '**Sol**';
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    markdown += `## ${role} (${timestamp})\n\n`;
    markdown += `${message.content}\n\n`;
    if (index < conversation.messages.length - 1) {
      markdown += `---\n\n`;
    }
  });
  
  return markdown;
}

/**
 * Export all conversations to markdown
 */
export async function exportAllConversationsToMarkdown(): Promise<string> {
  const conversations = await getConversations();
  let markdown = `# Sol AI Search - All Conversations\n\n`;
  markdown += `**Exported:** ${new Date().toLocaleString()}\n`;
  markdown += `**Total Conversations:** ${conversations.length}\n\n`;
  markdown += `---\n\n`;
  
  conversations.forEach((conversation, index) => {
    markdown += exportConversationToMarkdown(conversation);
    if (index < conversations.length - 1) {
      markdown += `\n\n---\n\n`;
    }
  });
  
  return markdown;
} 