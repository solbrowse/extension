import React from 'react';

interface QuickAnswerBannerProps {
  text: string;
}

const QuickAnswerBannerBase: React.FC<QuickAnswerBannerProps> = ({ text }) => {
  return (
    <div className="sol-quick-answer bg-yellow-100 border border-yellow-300 text-yellow-900 rounded-md px-3 py-2 my-3 font-medium">
      {text}
    </div>
  );
};

export default React.memo(QuickAnswerBannerBase); 