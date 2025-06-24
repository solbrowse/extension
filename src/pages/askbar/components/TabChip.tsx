import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface TabChipData {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
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

  return (
    <button
      onClick={handleClick}
      className="flex-none w-[184px] h-[54px] bg-black/[0.06] rounded-[12px] p-3 flex items-center hover:bg-black/[0.1] transition-colors relative group"
      title={tab.url}
    >
      {/* Favicon holder */}
      <div className="w-4 h-4 mr-3 flex-shrink-0 bg-gray-200 rounded-sm flex items-center justify-center">
        {tab.favIconUrl ? (
          <img
            src={tab.favIconUrl}
            alt=""
            className="w-4 h-4 rounded-sm"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-2 h-2 bg-gray-400 rounded-[1px]"></div>
        )}
      </div>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <div
          className="text-xs font-medium text-black leading-tight text-left overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500 }}
        >
          {truncateTitle(tab.title)}
        </div>
        <div
          className="text-xs text-black/55 leading-tight text-left overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400 }}
        >
          {getBaseDomain(tab.url)}
        </div>
      </div>

      {onRemove && (
        <div 
          className="absolute top-1 right-1 w-4 h-4 bg-black/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove site from context"
        >
          <XMarkIcon className="w-2.5 h-2.5 text-black/60" />
        </div>
      )}
    </button>
  );
};

export default TabChip; 
