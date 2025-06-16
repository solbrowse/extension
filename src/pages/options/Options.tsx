import React, { useState, useEffect, useCallback } from 'react';
import { 
  HiCheckCircle,
  HiArrowTopRightOnSquare,
  HiEye,
  HiEyeSlash,
  HiTrash,
  HiDocumentArrowDown,
  HiClipboardDocument
} from 'react-icons/hi2';
import { get, set, StorageData, getConversations, deleteConversation, deleteAllConversations, exportConversationToMarkdown, exportAllConversationsToMarkdown, Conversation, resetToDefaults } from '@src/utils/storage';
import { ApiService, PROVIDERS, Model } from '@src/services/api';
import logo from '@assets/img/logo.svg';
import '@pages/options/Options.css';

export default function Options() {
  const [settings, setSettings] = useState<StorageData | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await get();
      setSettings(data);
      if (data.apiKey && data.provider) {
        await loadModels(data.provider, data.apiKey, data.customEndpoint);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      console.log('Sol Dashboard: Loading conversations...');
      const convs = await getConversations();
      console.log('Sol Dashboard: Loaded conversations:', convs.length, convs);
      setConversations(convs);
    } catch (error) {
      console.error('Sol Dashboard: Error loading conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadConversations();
  }, [loadSettings, loadConversations]);

  useEffect(() => {
    if (settings) {
      setSaveStatus('syncing');
      const handler = setTimeout(() => {
        set(settings).then(() => {
          setSaveStatus('synced');
          setTimeout(() => setSaveStatus('idle'), 2000);
        });
      }, 500);

      return () => {
        clearTimeout(handler);
      };
    }
  }, [settings]);

  const loadModels = async (provider: string, apiKey: string, endpoint?: string) => {
    if (!apiKey) return;
    console.log(`Sol Dashboard: Loading models for ${provider}...`);
    setIsLoadingModels(true);
    try {
      const fetchedModels = await ApiService.fetchModels(provider, apiKey, endpoint);
      console.log(`Sol Dashboard: Loaded ${fetchedModels.length} models for ${provider}:`, fetchedModels);
      setModels(fetchedModels);
    } catch (error) {
      console.error(`Sol Dashboard: Error loading models for ${provider}:`, error);
      // Show default models as fallback
      const defaultModels = ApiService.getDefaultModels(provider);
      console.log(`Sol Dashboard: Using ${defaultModels.length} default models for ${provider}:`, defaultModels);
      setModels(defaultModels);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleInputChange = (key: keyof StorageData, value: any) => {
    setSettings(prev => {
      if (!prev) return null;
      const newSettings = { ...prev, [key]: value };
      if (key === 'provider') {
        newSettings.model = ApiService.getDefaultModels(value)[0]?.id || '';
        setModels([]);
        if (newSettings.apiKey) {
          loadModels(newSettings.provider, newSettings.apiKey, newSettings.customEndpoint);
        }
      }
      if (key === 'apiKey' && value) {
        loadModels(newSettings.provider, value, newSettings.customEndpoint);
      }
      return newSettings;
    });
  };

  const handleFeatureToggle = (feature: keyof StorageData['features']) => {
    setSettings(prev => {
      if (!prev) return null;
      return {
        ...prev,
        features: {
          ...prev.features,
          [feature]: {
            ...prev.features[feature],
            isEnabled: !prev.features[feature].isEnabled,
          },
        },
      };
    });
  };

  const handleFeatureConfigChange = (feature: keyof StorageData['features'], key: string, value: any) => {
    setSettings(prev => {
      if (!prev) return null;
      return {
        ...prev,
        features: {
          ...prev.features,
          [feature]: {
            ...prev.features[feature],
            [key]: value,
          },
        },
      };
    });
  };

  const testConnection = async () => {
    if (!settings?.apiKey || !settings?.provider) return;
    await loadModels(settings.provider, settings.apiKey, settings.customEndpoint);
  };

  const handleDeleteConversation = async (id: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      try {
        await deleteConversation(id);
        await loadConversations();
      } catch (error) {
        console.error('Error deleting conversation:', error);
      }
    }
  };

  const handleExportConversation = async (conversation: Conversation) => {
    try {
      const markdown = exportConversationToMarkdown(conversation);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sol-conversation-${conversation.id}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting conversation:', error);
    }
  };

  const handleExportAllConversations = async () => {
    try {
      const markdown = await exportAllConversationsToMarkdown();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sol-all-conversations-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting all conversations:', error);
    }
  };

  const handleCopyConversation = async (conversation: Conversation) => {
    try {
      const markdown = exportConversationToMarkdown(conversation);
      await navigator.clipboard.writeText(markdown);
      // You could add a toast notification here
    } catch (error) {
      console.error('Error copying conversation:', error);
    }
  };

  const handleDeleteAllConversations = async () => {
    if (confirm('Are you sure you want to delete ALL conversations? This action cannot be undone.')) {
      try {
        await deleteAllConversations();
        await loadConversations();
      } catch (error) {
        console.error('Error deleting all conversations:', error);
      }
    }
  };

  const handleResetStorage = async () => {
    if (confirm('Are you sure you want to reset ALL settings and conversations? This will clear everything and cannot be undone.')) {
      try {
        await resetToDefaults();
        window.location.reload();
      } catch (error) {
        console.error('Error resetting storage:', error);
      }
    }
  };

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-8 py-2">
          <div className="flex flex-col justify-center items-center">
            <img src={logo} alt="Sol" className="w-24 h-24" />
            <p className="text-sm text-gray-500">Alpha Build 2</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          <div className="lg:col-span-3 space-y-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 space-y-8">
              
              {/* --- Unified AI Configuration --- */}
              
              <div className="pb-4 border-b border-gray-100">
                  <h2 className="text-xl font-medium text-gray-900">AI Configuration</h2>
              </div>

              {/* Provider & API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Provider and API Key
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                      <select
                        value={settings.provider}
                        onChange={(e) => handleInputChange('provider', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-gray-50 hover:bg-white disabled:opacity-50 appearance-none"
                      >
                        {PROVIDERS.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                  </div>
                  <div className="relative">
                      <input
                        type={isApiKeyVisible ? 'text' : 'password'}
                        value={settings.apiKey}
                        onChange={(e) => handleInputChange('apiKey', e.target.value)}
                        placeholder="Enter your API key"
                        className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-gray-50 hover:bg-white font-mono text-sm"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-gray-400 hover:text-gray-600 rounded-r-xl"
                        aria-label="Toggle API key visibility"
                      >
                        {isApiKeyVisible ? <HiEyeSlash className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                      </button>
                  </div>
                </div>
              </div>

              {/* Custom Endpoint URL - Only show when Custom provider is selected */}
              {settings.provider === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Custom Endpoint URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={settings.customEndpoint || ''}
                      onChange={(e) => handleInputChange('customEndpoint', e.target.value)}
                      placeholder="https://your-api-endpoint.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-gray-50 hover:bg-white text-sm"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Enter the base URL for your OpenAI-compatible API endpoint (e.g., for local models, Ollama, or other providers)
                  </p>
                </div>
              )}

              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                    Model Selection
                </label>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">
                            Recommended
                        </label>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {ApiService.getDefaultModels(settings.provider).map((model) => (
                            <button
                              key={model.id}
                              onClick={() => handleInputChange('model', model.id)}
                              className={`p-3 border rounded-xl text-left transition-all ${
                                settings.model === model.id
                                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                                  : 'bg-white hover:bg-gray-100 border-gray-200'
                              }`}
                            >
                              <span className="text-sm font-medium">{model.name}</span>
                            </button>
                          ))}
                        </div>
                    </div>
                     <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">
                            All Models
                        </label>
                        <div className="relative">
                          <select
                            value={settings.model}
                            onChange={(e) => handleInputChange('model', e.target.value)}
                            disabled={!settings.apiKey || models.length === 0}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white disabled:opacity-50 appearance-none"
                          >
                            {models.length === 0 ? (
                              <option>Test connection to load all models</option>
                            ) : (
                              models.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.name}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                    </div>
                </div>
              </div>

              {/* Save & Test Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  onClick={testConnection}
                  disabled={!settings.apiKey || isLoadingModels}
                  className="flex items-center space-x-2 px-6 py-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 border border-gray-200 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                >
                  {isLoadingModels ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                      <span>Testing...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>
                 <div className="text-sm text-gray-500">
                  {saveStatus === 'syncing' && <span>Saving...</span>}
                  {saveStatus === 'synced' && <span className="flex items-center space-x-2 text-green-600"><HiCheckCircle className="w-5 h-5" /> <span>Saved</span></span>}
                </div>
              </div>
            </div>

            {/* Conversations Section */}
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
                <h2 className="text-xl font-medium text-gray-900">Conversation History</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportAllConversations}
                    disabled={conversations.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                  >
                    <HiDocumentArrowDown className="w-4 h-4" />
                    <span>Export All</span>
                  </button>
                  <button
                    onClick={handleDeleteAllConversations}
                    disabled={conversations.length === 0}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                  >
                    <HiTrash className="w-4 h-4" />
                    <span>Delete All</span>
                  </button>
                </div>
              </div>

              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No conversations yet. Start using Sol AI Search to see your conversation history here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversations.map((conversation) => (
                    <div key={conversation.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{conversation.title}</h3>
                          <p className="text-sm text-gray-500 truncate mt-1">{conversation.url}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                            <span>{conversation.messages.length} messages</span>
                            <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleCopyConversation(conversation)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Copy to clipboard"
                          >
                            <HiClipboardDocument className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExportConversation(conversation)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Export as Markdown"
                          >
                            <HiDocumentArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteConversation(conversation.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete conversation"
                          >
                            <HiTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Features</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">Ask</span>
                  <button
                    onClick={() => handleFeatureToggle('askBar')}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 ${
                      settings.features.askBar.isEnabled ? 'bg-gray-900' : 'bg-gray-200'
                    }`}
                  >
                    <span className="sr-only">Enable or disable AI Features</span>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out ${
                      settings.features.askBar.isEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                <div className="pl-4 border-l-2 border-gray-100">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Shortcut Key
                  </label>
                  <input
                    type="text"
                    value={settings.features.askBar.keybind}
                    onChange={(e) => handleFeatureConfigChange('askBar', 'keybind', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-gray-50 text-sm"
                    placeholder="e.g., Cmd+J"
                  />
                </div>
                <div className="pl-4 border-l-2 border-gray-100">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Ask Bar Position
                  </label>
                  <select
                    value={settings.features.askBar.position}
                    onChange={(e) => handleFeatureConfigChange('askBar', 'position', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-gray-50 text-sm appearance-none"
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Get API Key</h3>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-all flex items-center justify-center space-x-2 border border-gray-200"
              >
                <span>OpenAI</span>
                <HiArrowTopRightOnSquare className="w-4 h-4" />
              </a>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Help</h3>
              <div className="space-y-4 text-sm text-gray-600">
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">Keyboard Shortcut</h4>
                  <p>Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono border border-gray-200">{settings.features.askBar.keybind}</kbd> on any webpage to open Sol search</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">Privacy</h4>
                  <p>All settings are stored locally in your browser. Sol never sees your API keys or data.</p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleResetStorage}
                    className="w-full py-2 px-4 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-all text-sm border border-red-200"
                  >
                    Reset All Settings
                  </button>
                  <p className="text-xs text-red-500 mt-1">This will clear all settings and conversations</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
