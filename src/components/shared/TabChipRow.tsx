import React from 'react';
import TabChip, { TabChipData } from './TabChip';

interface Props {
  tabs: TabChipData[];
  onRemove?: (id: number) => void;
}

const TabChipRow: React.FC<Props> = ({ tabs, onRemove }) => {
  if (tabs.length === 0) return null;

  return (
    <div className="pt-4 px-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <TabChip key={tab.id} tab={tab} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
};

export default TabChipRow; 