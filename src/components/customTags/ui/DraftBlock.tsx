import React from 'react';

interface DraftBlockProps {
  content: string;
}

const DraftBlockBase: React.FC<DraftBlockProps> = ({ content }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy draft text', error);
    }
  };

  return (
    <div className="sol-draft-block bg-gray-50 border border-gray-200 rounded-md p-3 my-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600">Draft</span>
        <button
          onClick={handleCopy}
          className="text-xs text-blue-600 hover:underline focus:outline-none"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words text-sm font-sans" style={{ fontFamily: 'inherit' }}>{content}</pre>
    </div>
  );
};

export default React.memo(DraftBlockBase); 