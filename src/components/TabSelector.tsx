import React, { useState, useEffect } from 'react';
import { UiPortService, TabInfo } from '@src/services/messaging/uiPortService';

interface TabSelectorProps {
  selectedTabIds: number[];
  onTabsChange: (tabIds: number[]) => void;
  maxTabs?: number;
  className?: string;
}

export const TabSelector: React.FC<TabSelectorProps> = ({
  selectedTabIds,
  onTabsChange,
  maxTabs = 5,
  className = ''
}) => {
  const [availableTabs, setAvailableTabs] = useState<TabInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const uiPortService = UiPortService.getInstance();

  useEffect(() => {
    loadTabs();
  }, []);

  const loadTabs = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const tabs = await uiPortService.listTabs();
      setAvailableTabs(tabs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tabs');
      console.error('Sol TabSelector: Failed to load tabs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTab = (tabId: number) => {
    const isSelected = selectedTabIds.includes(tabId);
    
    if (isSelected) {
      // Remove tab
      onTabsChange(selectedTabIds.filter(id => id !== tabId));
    } else {
      // Add tab (up to max limit)
      if (selectedTabIds.length < maxTabs) {
        onTabsChange([...selectedTabIds, tabId]);
      }
    }
  };

  const getCurrentTab = () => {
    // Get current tab (this would need to be passed from the parent or detected)
    return availableTabs.find(tab => tab.url === window.location.href);
  };

  const getSelectedTabs = () => {
    return availableTabs.filter(tab => selectedTabIds.includes(tab.id));
  };

  const formatTabTitle = (title: string, maxLength: number = 30) => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  if (error) {
    return (
      <div className={`tab-selector-error ${className}`}>
        <div className="text-red-600 text-sm mb-2">
          Failed to load tabs: {error}
        </div>
        <button 
          onClick={loadTabs}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`tab-selector ${className}`}>
      {/* Selected tabs display */}
      {selectedTabIds.length > 0 && (
        <div className="selected-tabs mb-2">
          <div className="text-xs text-gray-600 mb-1">
            Selected tabs ({selectedTabIds.length}/{maxTabs}):
          </div>
          <div className="flex flex-wrap gap-1">
            {getSelectedTabs().map(tab => (
              <div
                key={tab.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
              >
                {tab.favIconUrl && (
                  <img 
                    src={tab.favIconUrl} 
                    alt="" 
                    className="w-3 h-3"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <span>{formatTabTitle(tab.title, 20)}</span>
                <button
                  onClick={() => toggleTab(tab.id)}
                  className="ml-1 text-blue-600 hover:text-blue-800"
                  title="Remove tab"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab selector button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
      >
        <span>
          {isLoading ? 'Loading tabs...' : 
           selectedTabIds.length > 0 ? `Add more tabs (${availableTabs.length - selectedTabIds.length} available)` : 
           `Select tabs (${availableTabs.length} available)`}
        </span>
        <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Tab list dropdown */}
      {isExpanded && (
        <div className="mt-2 border border-gray-300 rounded bg-white shadow-lg max-h-64 overflow-y-auto">
          {availableTabs.length === 0 && !isLoading ? (
            <div className="p-3 text-gray-500 text-sm">
              No tabs available
            </div>
          ) : (
            availableTabs.map(tab => {
              const isSelected = selectedTabIds.includes(tab.id);
              const canSelect = !isSelected && selectedTabIds.length < maxTabs;
              
              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                    isSelected ? 'bg-blue-50' : canSelect ? '' : 'opacity-50 cursor-not-allowed'
                  }`}
                  onClick={() => canSelect || isSelected ? toggleTab(tab.id) : undefined}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Handled by parent div click
                    disabled={!canSelect && !isSelected}
                    className="rounded"
                  />
                  
                  {tab.favIconUrl && (
                    <img 
                      src={tab.favIconUrl} 
                      alt="" 
                      className="w-4 h-4 flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {formatTabTitle(tab.title)}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {tab.url}
                    </div>
                  </div>
                  
                  {isSelected && (
                    <span className="text-blue-600 text-sm">✓</span>
                  )}
                </div>
              );
            })
          )}
          
          {/* Quick actions */}
          <div className="border-t border-gray-200 p-2 bg-gray-50">
            <div className="flex gap-2">
              <button
                onClick={() => onTabsChange([])}
                disabled={selectedTabIds.length === 0}
                className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Clear all
              </button>
              <button
                onClick={loadTabs}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 