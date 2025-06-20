import React, { useState, useEffect } from 'react';
import { Cog6ToothIcon, FaceSmileIcon, VariableIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
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

  const openDashboard = (hash?: string) => {
    const baseUrl = browser.runtime.getURL('src/pages/dashboard/index.html');
    const url = hash ? `${baseUrl}#${hash}` : baseUrl;
    browser.tabs.create({ url });
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
      <div className="h-96 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (needsPermissions) {
    return (
      <div className="h-96 p-6 flex flex-col justify-center">
        <div className="text-center space-y-5">
          <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center bg-amber-50 rounded-xl">
            <img src={logo} alt="Sol" className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              Permission Required
            </h2>
            <p className="text-[13px] text-gray-600 leading-relaxed px-2">
              Firefox requires explicit permission for Sol to work on all websites. Click below to grant access.
            </p>
          </div>
          <Button
            onClick={requestPermissions}
            className="sol-button-primary sol-large-button w-full h-11"
          >
            Grant Permissions
          </Button>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="h-96 p-6 flex flex-col justify-center">
        <div className="text-center space-y-5">
          <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center bg-blue-50 rounded-xl">
            <img src={logo} alt="Sol" className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              Setup Required
            </h2>
            <p className="text-[13px] text-gray-600 leading-relaxed px-2">
              Please configure your AI provider in the dashboard to begin using Sol.
            </p>
          </div>
          <Button
            onClick={() => openDashboard('ai-provider')}
            className="sol-button-primary sol-large-button w-full h-11"
          >
            Setup AI Provider
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-96 p-6 flex flex-col">
      {/* Header with Logo */}
      <div className="flex items-center justify-center mb-8">
        <img src={logo} alt="Sol" className="w-20 h-20" />
      </div>

      {/* Feature Sections */}
      <div className="flex-1 space-y-6">
        {/* Ask Feature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Ask
            </h2>
            <Switch
              checked={askEnabled}
              onCheckedChange={handleAskToggle}
            />
          </div>
          <p className="text-[14px] text-gray-600 leading-relaxed">
            Press <kbd className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-[12px] font-mono border border-gray-200 mx-1">{askKeybind}</kbd> to ask questions about a website
          </p>
        </div>

        {/* Side Feature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Side
            </h2>
            <Switch
              checked={sideEnabled}
              onCheckedChange={handleSideToggle}
            />
          </div>
          <p className="text-[14px] text-gray-600 leading-relaxed">
            Press enter on an Ask Bar or <kbd className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-[12px] font-mono border border-gray-200 mx-1">cmd+enter</kbd> for more...
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => openDashboard('general')}
            className="sol-button-secondary sol-large-button h-12 font-medium text-[14px] flex items-center justify-center gap-2"
          >
            <FaceSmileIcon className="w-4 h-4" />
            Personalize
          </Button>
          
          <Button
            onClick={() => openDashboard('general')}
            className="sol-button-secondary sol-large-button h-12 font-medium text-[14px] flex items-center justify-center gap-2"
          >
            <VariableIcon className="w-4 h-4" />
            Abilities
          </Button>
        </div>
        
        <Button
          onClick={() => openDashboard()}
          className="sol-button-primary sol-large-button w-full h-12 font-medium text-[14px] flex items-center justify-center gap-2"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          Dashboard
        </Button>
      </div>
    </div>
  );
}
