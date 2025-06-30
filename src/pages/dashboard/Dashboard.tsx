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
import { StorageData, Conversation } from '../../services/storage';
import settingsService from '../../utils/settings';
import conversation from '../../services/conversation';
import exportService from '../../utils/export';
import { ApiService, PROVIDERS, Model } from '@src/services/api';
import { Button } from '@src/components/ui/button';
import { Input } from '@src/components/ui/input';
import { Label } from '@src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@src/components/ui/select';
import { Switch } from '@src/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@src/components/ui/tabs';
import logo from '@assets/img/logo.svg';

export default function Dashboard() {
  const [settings, setSettings] = useState<StorageData | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Handle URL hash routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['general', 'features', 'ai-provider', 'history'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    
    // Set initial tab from URL
    handleHashChange();
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.location.hash = value;
  };

  // Simplified data loading
  const loadData = useCallback(async () => {
    try {
      const [settingsData, conversationsData] = await Promise.all([
        settingsService.getAll(),
        conversation.getConversations()
      ]);
      
      setSettings(settingsData);
      setConversations(conversationsData);
      
      if (settingsData.apiKey && settingsData.provider) {
        loadModels(settingsData.provider, settingsData.apiKey, settingsData.customEndpoint, settingsData.model);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Simplified save handling
  useEffect(() => {
    if (!settings) return;
    
    setSaveStatus('syncing');
    const timeoutId = setTimeout(async () => {
      try {
        await settingsService.setAll(settings);
        setSaveStatus('synced');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (error) {
        console.error('Error saving settings:', error);
        setSaveStatus('idle');
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [settings]);

  // Simplified model loading
  const loadModels = async (provider: string, apiKey: string, endpoint?: string, savedModel?: string) => {
    if (!apiKey && provider !== 'custom') return;
    
    setIsLoadingModels(true);
    try {
      const fetchedModels = await ApiService.fetchModels(provider, apiKey, endpoint);
      setModels(fetchedModels);
      
      // Auto-select model if needed
      if (fetchedModels.length > 0 && (!savedModel || !fetchedModels.some(m => m.id === savedModel))) {
        setSettings(prev => prev ? { ...prev, model: fetchedModels[0].id } : null);
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setModels(ApiService.getDefaultModels(provider));
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Simplified handlers
  const updateSetting = (key: keyof StorageData, value: any) => {
    setSettings(prev => {
      if (!prev) return null;
      
      const newSettings = { ...prev, [key]: value };
      
      // Handle provider changes
      if (key === 'provider') {
        newSettings.model = ApiService.getDefaultModels(value)[0]?.id || '';
        setModels([]);
        if (newSettings.apiKey || value === 'custom') {
          loadModels(value, newSettings.apiKey, newSettings.customEndpoint);
        }
      }
      
      // Handle API key changes
      if (key === 'apiKey' && value) {
        loadModels(newSettings.provider, value, newSettings.customEndpoint, newSettings.model);
      }
      
      // Handle custom endpoint changes
      if (key === 'customEndpoint' && newSettings.provider === 'custom') {
        loadModels(newSettings.provider, newSettings.apiKey, value, newSettings.model);
      }
      
      return newSettings;
    });
  };

  const toggleFeature = (feature: keyof StorageData['features']) => {
    setSettings(prev => prev ? {
      ...prev,
      features: {
        ...prev.features,
        [feature]: {
          ...prev.features[feature],
          isEnabled: !prev.features[feature].isEnabled,
        },
      },
    } : null);
  };

  const updateFeatureConfig = (feature: keyof StorageData['features'], key: string, value: any) => {
    setSettings(prev => prev ? {
      ...prev,
      features: {
        ...prev.features,
        [feature]: {
          ...prev.features[feature],
          [key]: value,
        },
      },
    } : null);
  };

  // Simplified async handlers
  const deleteConversationHandler = async (id: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    
    try {
              await conversation.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const exportConversation = async (conversation: Conversation) => {
    try {
      const markdown = exportService.exportConversationToMarkdown(conversation);
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

  const exportAllConversations = async () => {
    try {
      const markdown = await exportService.exportAllConversationsToMarkdown();
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

  const copyConversation = async (conversation: Conversation) => {
    try {
      const markdown = exportService.exportConversationToMarkdown(conversation);
      await navigator.clipboard.writeText(markdown);
    } catch (error) {
      console.error('Error copying conversation:', error);
    }
  };

  const deleteAllConversationsHandler = async () => {
    if (!confirm('Are you sure you want to delete ALL conversations? This action cannot be undone.')) return;
    
    try {
              await conversation.deleteAllConversations();
      setConversations([]);
    } catch (error) {
      console.error('Error deleting all conversations:', error);
    }
  };

  const resetStorage = async () => {
    if (!confirm('Are you sure you want to reset ALL settings and conversations? This will clear everything and cannot be undone.')) return;
    
    try {
      await settingsService.resetToDefaults();
      window.location.reload();
    } catch (error) {
      console.error('Error resetting storage:', error);
    }
  };

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Fixed Save Indicator */}
      {saveStatus === 'syncing' && (
        <div className="sol-save-indicator syncing">
          Saving...
        </div>
      )}
      {saveStatus === 'synced' && (
        <div className="sol-save-indicator synced">
          <CheckCircleIcon className="w-4 h-4 inline mr-2" />
          Saved
        </div>
      )}

      {/* Big Logo Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col items-center">
            <img src={logo} alt="Sol" className="w-32 h-32" />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="general" className="text-sm font-medium">General</TabsTrigger>
            <TabsTrigger value="features" className="text-sm font-medium">Features</TabsTrigger>
            <TabsTrigger value="ai-provider" className="text-sm font-medium">AI Provider</TabsTrigger>
            <TabsTrigger value="history" className="text-sm font-medium">History</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            {/* Personalization */}
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Personalization</h2>
                  <p className="text-sm text-gray-600">Customize Sol to match your preferences</p>
                </div>
                <div className="text-center py-12 text-gray-500">
                  <p>Personalization settings coming soon...</p>
                </div>
              </div>
            </div>

            {/* Abilities */}
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Abilities</h2>
                  <p className="text-sm text-gray-600">Enhance Sol with additional capabilities</p>
                </div>
                <div className="text-center py-12 text-gray-500">
                  <p>Ability configuration coming soon...</p>
                </div>
              </div>
            </div>

            {/* Debug Mode */}
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-1">Debug Mode</h2>
                    <p className="text-sm text-gray-600">Enable verbose logging for troubleshooting</p>
                  </div>
                  <Switch
                    id="debug-toggle"
                    checked={settings.debug}
                    onCheckedChange={(value) => updateSetting('debug', value)}
                  />
                </div>
                {settings.debug && (
                  <p className="text-xs text-gray-500">Debug logs will now appear in the browser console.</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            {/* Features */}
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Features</h2>
                  <p className="text-sm text-gray-600">Configure Sol features</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="ask-toggle" className="text-base font-medium">Ask Bar</Label>
                      <Switch
                        id="ask-toggle"
                        checked={settings.features.askBar.isEnabled}
                        onCheckedChange={() => toggleFeature('askBar')}
                      />
                    </div>

                    {settings.features.askBar.isEnabled && (
                      <div className="space-y-4 pl-4 border-l-2 border-gray-100">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="shortcut">Shortcut Key</Label>
                            <Input
                              id="shortcut"
                              value={settings.features.askBar.keybind}
                              onChange={(e) => updateFeatureConfig('askBar', 'keybind', e.target.value)}
                              placeholder="e.g., Cmd/Ctrl+F"
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="position">Position</Label>
                            <Select
                              value={settings.features.askBar.position}
                              onValueChange={(value) => updateFeatureConfig('askBar', 'position', value)}
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
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ai-provider" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Configuration</h2>
                  <p className="text-sm text-gray-600">Configure your AI provider and model settings</p>
                </div>

                {/* Provider & API Key */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="provider">Provider</Label>
                    <Select value={settings.provider} onValueChange={(value) => updateSetting('provider', value)}>
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
                        onChange={(e) => updateSetting('apiKey', e.target.value)}
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
                        {isApiKeyVisible ? <EyeSlashIcon className="w-4 h-4" title="Hide API key" /> : <EyeIcon className="w-4 h-4" title="Show API key" />}
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
                      onChange={(e) => updateSetting('customEndpoint', e.target.value)}
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
                            onClick={() => updateSetting('model', model.id)}
                            className={`h-auto p-4 text-left justify-start rounded-lg font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                              settings.model === model.id 
                                ? 'bg-black text-white hover:bg-gray-800' 
                                : 'text-gray-900 hover:bg-black/10'
                            }`}
                            style={settings.model !== model.id ? { backgroundColor: 'rgba(0, 0, 0, 0.05)' } : {}}
                          >
                            <span className="text-sm font-medium truncate">{model.name}</span>
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
                      onValueChange={(value) => updateSetting('model', value)}
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
              </div>
            </div>

            {/* Get API Key */}
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Get API Key</h2>
                  <p className="text-sm text-gray-600">Get your OpenAI API key</p>
                </div>
                <Button asChild className="sol-button-external w-full">
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
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Conversation History</h2>
                    <p className="text-sm text-gray-600">Manage your past conversations</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={exportAllConversations}
                      disabled={conversations.length === 0}
                      className="sol-button-small"
                    >
                      <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
                      Export All
                    </Button>
                    <Button
                      onClick={deleteAllConversationsHandler}
                      disabled={conversations.length === 0}
                      className="sol-button-danger"
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
                      <div key={conversation.id} className="border border-gray-200/60 rounded-lg p-4 hover:bg-gray-50/50 hover:border-gray-300/60 transition-all duration-200 hover:shadow-sm">
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
                              onClick={() => copyConversation(conversation)}
                              className="h-8 w-8 p-0 text-gray-600 hover:bg-black/5 rounded-lg transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] truncate"
                              style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
                              title="Copy conversation"
                            >
                              <ClipboardDocumentIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => exportConversation(conversation)}
                              className="h-8 w-8 p-0 text-gray-600 hover:bg-black/5 rounded-lg transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] truncate"
                              style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
                              title="Export conversation as Markdown"
                            >
                              <DocumentArrowDownIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => deleteConversationHandler(conversation.id)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 rounded-lg transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] truncate"
                              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                              title="Delete conversation"
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

            {/* Help & Settings for History Tab */}
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Help & Settings</h2>
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
                  onClick={resetStorage}
                  className="sol-button-danger w-full"
                >
                  Reset All Settings
                </Button>
                <p className="text-xs text-red-500">This will clear all settings and conversations</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
