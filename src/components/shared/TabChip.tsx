import React from 'react';
import { XMarkIcon, RectangleStackIcon } from '@heroicons/react/24/outline';

export interface TabChipData {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  isCollective?: boolean; // For collective chips like "All tabs" or "Tabs that match X"
  searchTerm?: string; // For collective search chips
  count?: number; // Number of tabs represented
}

interface TabChipProps {
  tab: TabChipData;
  onRemove?: (id: number) => void;
}

const getBaseDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
};

const truncateTitle = (title: string, maxLength: number = 20): string => {
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
};

const TabChip: React.FC<TabChipProps> = ({ tab, onRemove }) => {
  const handleClick = () => {
    if (onRemove) onRemove(tab.id);
  };

  const isCollective = tab.isCollective;

  return (
    <button
      onClick={handleClick}
      className={`flex-none w-[184px] h-[54px] sol-rounded-chip p-3 flex items-center hover:sol-bg-hover-chip sol-transition-colors relative group ${
        isCollective 
          ? 'sol-bg-chip-collective' 
          : 'sol-bg-chip'
      }`}
      title={isCollective ? `${tab.title} - ${tab.count} tabs` : tab.url}
    >
      {/* Favicon holder */}
      <div className="w-4 h-4 mr-3 flex-shrink-0 bg-gray-200 dark:bg-gray-600 rounded-sm flex items-center justify-center">
        {isCollective ? (
          <RectangleStackIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        ) : tab.favIconUrl ? (
          <img
            src={tab.favIconUrl}
            alt="Favicon"
            className="w-4 h-4 rounded-sm"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-[1px]"></div>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div
          className="text-black dark:text-white leading-tight text-left sol-text-truncate sol-font-inter sol-chip-title"
        >
          {truncateTitle(tab.title)}
        </div>
        <div
          className="text-black/55 dark:text-white/55 leading-tight text-left sol-text-truncate sol-font-inter sol-chip-subtitle"
        >
          {isCollective 
            ? (tab.count+" tabs")
            : getBaseDomain(tab.url)
          }
        </div>
      </div>

      {onRemove && (
        <div 
          className="absolute top-1 right-1 w-4 h-4 bg-black/20 dark:bg-white/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 sol-transition-opacity"
          title="Remove from context"
        >
          <XMarkIcon className="w-2.5 h-2.5 text-black/60 dark:text-white/60" />
        </div>
      )}
    </button>
  );
};

export default TabChip; 
