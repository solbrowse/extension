import React from 'react';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';

interface CopyButtonProps {
  content: string;
  onCopy?: (content: string) => void;
  isCopied: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CopyButton: React.FC<CopyButtonProps> = ({ 
  content, 
  onCopy, 
  isCopied, 
  className = '',
  size = 'md'
}) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      onCopy?.(content);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <button
      onClick={handleCopy}
      className={`
        ${sizeClasses[size]} flex items-center justify-center
        text-gray-400 hover:text-gray-600 hover:bg-black/5
        rounded transition-all duration-200
        opacity-0 group-hover:opacity-100
        ${className}
      `}
      title={isCopied ? "Copied!" : "Copy to clipboard"}
    >
      {isCopied ? (
        <CheckIcon className={`${iconSizes[size]} text-gray-600`} />
      ) : (
        <ClipboardDocumentIcon className={iconSizes[size]} />
      )}
    </button>
  );
};

export default CopyButton; 