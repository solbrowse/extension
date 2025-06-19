import React, { useState, useEffect } from 'react';
import { Cog6ToothIcon, FaceSmileIcon, VariableIcon } from '@heroicons/react/24/outline';
import browser from 'webextension-polyfill';
import { get, set } from '@src/services/storage';
import { Button } from '@src/components/ui/button';
import { Switch } from '@src/components/ui/switch';
import logo from '@assets/img/logo.svg';

export default function Popup() {
  const [askEnabled, setAskEnabled] = useState(false);
  const [sideEnabled, setSideEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [askKeybind, setAskKeybind] = useState('');
  const [needsPermissions, setNeedsPermissions] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await get();
      setAskEnabled(data.features.askBar.isEnabled);
      setSideEnabled(data.features.sideBar?.isEnabled || false);
      setIsConfigured(!!data.apiKey || data.provider === 'custom');
      setAskKeybind(data.features.askBar.keybind);

      // Check if permissions are granted (Firefox MV3 fix)
      try {
        const hasPermissions = await browser.permissions.contains({
          origins: ['<all_urls>']
        });
        setNeedsPermissions(!hasPermissions);
      } catch (err) {
        console.log('Permission check failed:', err);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskToggle = async (enabled: boolean) => {
    try {
      const currentSettings = await get();
      await set({ 
        features: { 
          ...currentSettings.features,
          askBar: {
            ...currentSettings.features.askBar,
            isEnabled: enabled 
          }
        } 
      });
      setAskEnabled(enabled);
    } catch (error) {
      console.error('Error updating Ask settings:', error);
    }
  };

  const handleSideToggle = async (enabled: boolean) => {
    try {
      const currentSettings = await get();
      await set({ 
        features: { 
          ...currentSettings.features,
          sideBar: {
            ...currentSettings.features.sideBar,
            isEnabled: enabled 
          }
        } 
      });
      setSideEnabled(enabled);
    } catch (error) {
      console.error('Error updating Side settings:', error);
    }
  };

  const openDashboard = () => {
    browser.tabs.create({ url: browser.runtime.getURL('src/pages/dashboard/index.html') });
    window.close();
  };

  const requestPermissions = async () => {
    try {
      const granted = await browser.permissions.request({
        origins: ['<all_urls>']
      });
      if (granted) {
        setNeedsPermissions(false);
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="w-80 h-96 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (needsPermissions) {
    return (
      <div className="w-80 h-96 p-8 flex flex-col justify-center">
        <div className="text-center space-y-6">
          <img src={logo} alt="Sol" className="w-16 h-16 mx-auto mb-6" />
          <h2 className="text-2xl font-light text-gray-900 tracking-tight">
            Permission Required
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Firefox requires explicit permission for Sol to work on all websites. Click below to grant access.
          </p>
          <Button
            onClick={requestPermissions}
            className="w-full h-12 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all font-medium"
          >
            Grant Permissions
          </Button>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="w-80 h-96 p-8 flex flex-col justify-center">
        <div className="text-center space-y-6">
          <img src={logo} alt="Sol" className="w-16 h-16 mx-auto mb-6" />
          <h2 className="text-2xl font-light text-gray-900 tracking-tight">
            Setup Required
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Please configure your AI provider in the dashboard to begin using Sol.
          </p>
          <Button
            onClick={openDashboard}
            className="w-full h-12 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all font-medium"
          >
            Go to Settings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 min-h-96 p-8 flex flex-col">
      {/* Header with Logo */}
      <div className="flex justify-center mb-8">
        <img src={logo} alt="Sol" className="w-16 h-16" />
      </div>

      {/* Feature Sections */}
      <div className="flex-1 space-y-6">
        {/* Ask Feature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-light text-gray-900 tracking-tight">
              Ask
            </h2>
            <Switch
              checked={askEnabled}
              onCheckedChange={handleAskToggle}
            />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Press <kbd className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-mono border border-gray-200 shadow-sm">{askKeybind}</kbd> to ask questions about a website
          </p>
        </div>

        {/* Side Feature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-light text-gray-900 tracking-tight">
              Side
            </h2>
            <Switch
              checked={sideEnabled}
              onCheckedChange={handleSideToggle}
            />
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Press enter on an Ask Bar or <kbd className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-mono border border-gray-200 shadow-sm">Cmd+Soon!</kbd> to chat with multiple tabs
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 space-y-3">
        <Button
          onClick={openDashboard}
          variant="outline"
          className="w-full h-12 rounded-2xl border-gray-200 hover:bg-gray-50 transition-all font-medium flex items-center justify-center gap-3"
        >
          <FaceSmileIcon className="w-5 h-5" />
          Personalize
        </Button>
        
        <Button
          onClick={openDashboard}
          variant="outline"
          className="w-full h-12 rounded-2xl border-gray-200 hover:bg-gray-50 transition-all font-medium flex items-center justify-center gap-3"
        >
          <VariableIcon className="w-5 h-5" />
          Abilities
        </Button>
        
        <Button
          onClick={openDashboard}
          className="w-full h-12 rounded-2xl bg-gray-900 text-white hover:bg-gray-800 transition-all font-medium flex items-center justify-center gap-3"
        >
          <Cog6ToothIcon className="w-5 h-5" />
          Dashboard
        </Button>
      </div>
    </div>
  );
}
