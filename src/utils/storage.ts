import browser from 'webextension-polyfill';

export interface Message {
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
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
function getDefaultKeybind(): string {
  // Detect platform
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = userAgent.includes('mac') || userAgent.includes('darwin');
  
  return isMac ? 'Cmd+F' : 'Ctrl+F';
}

export interface StorageData {
  features: {
    aiSearch: {
      isEnabled: boolean;
      keybind: string;
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    };
  };
  provider: string;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  conversations: Conversation[];
}

/**
 * Defaults kept **readonly** so they are never mutated at runtime,
 * yet still usable as a value-typed template for `get`.
 */
export const DEFAULT_STORAGE: Readonly<StorageData> = {
  features: {
    aiSearch: {
      isEnabled: true,
      keybind: getDefaultKeybind(),
      position: 'top-right',
    },
  },
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  customEndpoint: '',
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
  // `get(null)` tells the API "give me everything".
  // Cast to Partial<StorageData> so we can merge safely.
  const stored =
    (await browser.storage.local.get(null)) as Partial<StorageData>;

  return withDefaults(DEFAULT_STORAGE, stored);
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
  const data = await get();
  return data.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
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