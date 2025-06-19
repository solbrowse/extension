import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';
import { get, set, StorageData, getConversations, deleteConversation, deleteAllConversations, exportConversationToMarkdown, exportAllConversationsToMarkdown, Conversation, resetToDefaults } from '../../services/storage';
import { ApiService, PROVIDERS, Model } from '@src/services/api';
import { Button } from '@src/components/ui/button';
import { Input } from '@src/components/ui/input';
import { Label } from '@src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@src/components/ui/select';
import { Switch } from '@src/components/ui/switch';
import logo from '@assets/img/logo.svg';
import './Dashboard.css';

export default function Dashboard() {
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
        await loadModels(data.provider, data.apiKey, data.customEndpoint, data.model);
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

  const loadModels = async (provider: string, apiKey: string, endpoint?: string, savedModel?: string) => {
    // For custom endpoints, API key may not be required (e.g., Ollama)
    if (!apiKey && provider !== 'custom') return;
    console.log(`Sol Dashboard: Loading models for ${provider}...`);
    setIsLoadingModels(true);
    try {
      const fetchedModels = await ApiService.fetchModels(provider, apiKey, endpoint);
      console.log(`Sol Dashboard: Loaded ${fetchedModels.length} models for ${provider}:`, fetchedModels);
      setModels(fetchedModels);
      
      // Only auto-select first model if no model is saved AND no valid saved model exists
      const savedModelExists = savedModel && fetchedModels.some(m => m.id === savedModel);
      if (fetchedModels.length > 0 && !savedModel && !savedModelExists) {
        console.log('Sol Dashboard: Auto-selecting first model:', fetchedModels[0].id);
        setSettings(prev => prev ? { ...prev, model: fetchedModels[0].id } : null);
      } else if (savedModel && !savedModelExists) {
        // If saved model doesn't exist in fetched models, select first available
        console.log('Sol Dashboard: Saved model not found, selecting first available:', fetchedModels[0].id);
        setSettings(prev => prev ? { ...prev, model: fetchedModels[0].id } : null);
      }
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
        // Auto-load models for custom endpoints or when API key is available
        if (newSettings.apiKey || value === 'custom') {
          loadModels(value, newSettings.apiKey, newSettings.customEndpoint);
        }
      }
      if (key === 'apiKey' && value) {
        loadModels(newSettings.provider, value, newSettings.customEndpoint, newSettings.model);
      }
      if (key === 'customEndpoint' && newSettings.provider === 'custom') {
        // Auto-load models when custom endpoint changes
        loadModels(newSettings.provider, newSettings.apiKey, value, newSettings.model);
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
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <div className="flex flex-col items-center space-y-4">
            <img src={logo} alt="Sol" className="w-20 h-20" />
            <div className="text-center">
              <h1 className="text-2xl font-light text-gray-900">Sol Dashboard</h1>
              <p className="text-sm text-gray-500">Alpha Build 3</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* AI Configuration */}
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">AI Configuration</h2>
                  <p className="text-sm text-gray-600">Configure your AI provider and model settings</p>
                </div>

                {/* Provider & API Key */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="provider">Provider</Label>
                    <Select value={settings.provider} onValueChange={(value) => handleInputChange('provider', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDERS.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-3">
                    <Label htmlFor="apikey">API Key</Label>
                    <div className="relative">
                      <Input
                        id="apikey"
                        type={isApiKeyVisible ? 'text' : 'password'}
                        value={settings.apiKey}
                        onChange={(e) => handleInputChange('apiKey', e.target.value)}
                        placeholder="Enter your API key"
                        className="pr-10 font-mono text-sm"
                        autoComplete="new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      >
                        {isApiKeyVisible ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Custom Endpoint URL */}
                {settings.provider === 'custom' && (
                  <div className="space-y-3">
                    <Label htmlFor="endpoint">Custom Endpoint URL</Label>
                    <Input
                      id="endpoint"
                      type="url"
                      value={settings.customEndpoint || ''}
                      onChange={(e) => handleInputChange('customEndpoint', e.target.value)}
                      placeholder="https://your-api-endpoint.com"
                    />
                    <p className="text-xs text-gray-500">
                      Enter the base URL for your OpenAI-compatible API endpoint. Check our{' '}
                      <a href="https://solbrowse.notion.site/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                        help center
                      </a>{' '}
                      for detailed setup instructions.
                    </p>
                  </div>
                )}

                {/* Model Selection */}
                <div className="space-y-4">
                  <div>
                    <Label>Model Selection</Label>
                    <p className="text-sm text-gray-600">Choose the AI model to use for conversations</p>
                  </div>
                  
                  {/* Recommended Models */}
                  {ApiService.getDefaultModels(settings.provider).length > 0 && (
                    <div>
                      <Label className="text-xs font-medium text-gray-500 mb-3 block">Recommended</Label>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {ApiService.getDefaultModels(settings.provider).map((model) => (
                          <Button
                            key={model.id}
                            onClick={() => handleInputChange('model', model.id)}
                            variant={settings.model === model.id ? "default" : "outline"}
                            className="h-auto p-4 text-left justify-start"
                          >
                            <span className="text-sm font-medium">{model.name}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All Models Dropdown */}
                  <div className="space-y-3">
                    <Label className="text-xs font-medium text-gray-500">All Models</Label>
                    <Select 
                      value={settings.model} 
                      onValueChange={(value) => handleInputChange('model', value)}
                      disabled={models.length === 0 || (settings.provider !== 'custom' && !settings.apiKey)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          models.length === 0 
                            ? (settings.provider === 'custom' ? 'Configure your endpoint to load models' : 'Add your API key to load models')
                            : 'Select a model'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isLoadingModels && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading models...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Status */}
                <div className="flex justify-end">
                  <div className="text-sm text-gray-500">
                    {saveStatus === 'syncing' && <span>Saving...</span>}
                    {saveStatus === 'synced' && (
                      <span className="flex items-center space-x-2 text-green-600">
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>Saved</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Conversations Section */}
            <div className="bg-white rounded-2xl border border-gray-100 p-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Conversation History</h2>
                    <p className="text-sm text-gray-600">Manage your past conversations</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleExportAllConversations}
                      disabled={conversations.length === 0}
                      variant="outline"
                      size="sm"
                    >
                      <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                      Export All
                    </Button>
                    <Button
                      onClick={handleDeleteAllConversations}
                      disabled={conversations.length === 0}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      Delete All
                    </Button>
                  </div>
                </div>

                {isLoadingConversations ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No conversations yet. Start using Sol to see your conversation history here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conversations.map((conversation) => (
                      <div key={conversation.id} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 space-y-2">
                            <h3 className="font-medium text-gray-900 truncate">{conversation.title}</h3>
                            <p className="text-sm text-gray-500 truncate">{conversation.url}</p>
                            <div className="flex items-center space-x-4 text-xs text-gray-400">
                              <span>{conversation.messages.length} messages</span>
                              <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 ml-4">
                            <Button
                              onClick={() => handleCopyConversation(conversation)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <ClipboardDocumentIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => handleExportConversation(conversation)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <DocumentArrowDownIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => handleDeleteConversation(conversation.id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Features */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Features</h3>
                  <p className="text-sm text-gray-600">Configure Sol features</p>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ask-toggle" className="text-base font-medium">Ask Bar</Label>
                      <Switch
                        id="ask-toggle"
                        checked={settings.features.askBar.isEnabled}
                        onCheckedChange={() => handleFeatureToggle('askBar')}
                      />
                    </div>
                    
                    {settings.features.askBar.isEnabled && (
                      <div className="space-y-4 pl-4 border-l-2 border-gray-100">
                        <div className="space-y-2">
                          <Label htmlFor="shortcut">Shortcut Key</Label>
                          <Input
                            id="shortcut"
                            value={settings.features.askBar.keybind}
                            onChange={(e) => handleFeatureConfigChange('askBar', 'keybind', e.target.value)}
                            placeholder="e.g., Cmd+J"
                            className="text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="position">Position</Label>
                          <Select 
                            value={settings.features.askBar.position} 
                            onValueChange={(value) => handleFeatureConfigChange('askBar', 'position', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top-left">Top Left</SelectItem>
                              <SelectItem value="top-right">Top Right</SelectItem>
                              <SelectItem value="bottom-left">Bottom Left</SelectItem>
                              <SelectItem value="bottom-right">Bottom Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Get API Key */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Get API Key</h3>
                  <p className="text-sm text-gray-600">Get your OpenAI API key</p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2"
                  >
                    <span>OpenAI Platform</span>
                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Help & Settings */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Help & Settings</h3>
                  <p className="text-sm text-gray-600">Information and advanced options</p>
                </div>
                
                <div className="space-y-4 text-sm text-gray-600">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">Keyboard Shortcut</h4>
                    <p>Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono border border-gray-200">{settings.features.askBar.keybind}</kbd> on any webpage to open Sol</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">Privacy</h4>
                    <p>All settings are stored locally in your browser. Sol never sees your API keys or data.</p>
                  </div>
                </div>
                
                <Button
                  onClick={handleResetStorage}
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50"
                >
                  Reset All Settings
                </Button>
                <p className="text-xs text-red-500">This will clear all settings and conversations</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
