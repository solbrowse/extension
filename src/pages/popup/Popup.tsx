import React, { useState, useEffect } from 'react';
import { HiCog6Tooth } from 'react-icons/hi2';
import browser from 'webextension-polyfill';
import { get, set } from '@src/utils/storage';
import logo from '@assets/img/logo.svg';

export default function Popup() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [keybind, setKeybind] = useState('');
  const [needsPermissions, setNeedsPermissions] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await get();
      setIsEnabled(data.features.askBar.isEnabled);
      setIsConfigured(!!data.apiKey || data.provider === 'custom');
      setKeybind(data.features.askBar.keybind);

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

  const handleToggle = async () => {
    try {
      const newState = !isEnabled;
      const currentSettings = await get();
      await set({ 
        features: { 
          ...currentSettings.features,
          askBar: {
            ...currentSettings.features.askBar,
            isEnabled: newState 
          }
        } 
      });
      setIsEnabled(newState);
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const openDashboard = () => {
    browser.tabs.create({ url: browser.runtime.getURL('src/pages/options/index.html') });
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
      <div className="w-80 flex flex-col relative overflow-hidden">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-80 flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="relative flex items-center justify-between p-6">
        <img src={logo} alt="Sol" className="w-16 h-16" />
        <button
          onClick={openDashboard}
          className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-all duration-200 ease-out"
          title="Settings"
        >
          <HiCog6Tooth className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1 px-8 pb-12 flex flex-col justify-center">
        {needsPermissions ? (
          <div className="text-center space-y-6">
            <h2 className="text-2xl font-light text-gray-900 tracking-tight">
              Permission Required
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Firefox requires explicit permission for Sol to work on all websites. Click below to grant access.
            </p>
            <button
              onClick={requestPermissions}
              className="w-full py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium"
            >
              Grant Permissions
            </button>
          </div>
        ) : isConfigured ? (
            <div className="text-center space-y-8">
                <div className="space-y-3">
                    <h2 className="text-3xl font-light text-gray-900 tracking-tight">
                    Ask
                    </h2>
                    <p className="text-sm text-gray-500 leading-relaxed px-4">
                    Press <kbd className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-mono border border-gray-200 shadow-sm">{keybind}</kbd> to ask questions about any webpage
                    </p>
                </div>

                {/* Toggle Switch */}
                <div className="flex items-center justify-center">
                    <button
                    onClick={handleToggle}
                    className={`relative inline-flex h-10 w-16 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white ${
                        isEnabled 
                        ? 'bg-gray-900' 
                        : 'bg-gray-200'
                    }`}
                    >
                    <span
                        className={`inline-block h-7 w-7 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-in-out ${
                        isEnabled ? 'translate-x-8' : 'translate-x-1.5'
                        }`}
                    />
                    <span className="sr-only">Toggle Ask</span>
                    </button>
                </div>
            </div>
        ) : (
            <div className="text-center space-y-6">
                <h2 className="text-2xl font-light text-gray-900 tracking-tight">
                    Setup Required
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                    Please configure your AI provider in the dashboard to begin using Sol.
                </p>
                <button
                    onClick={openDashboard}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-medium"
                >
                    Go to Settings
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
