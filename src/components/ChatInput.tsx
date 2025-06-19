import React, { useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ArrowUpIcon } from '@heroicons/react/20/solid';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  showCloseButton?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  onClose,
  placeholder = "Ask a question...",
  disabled = false,
  isStreaming = false,
  showCloseButton = true,
  autoFocus = true,
  className = ''
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  };

  const handleSubmit = () => {
    if (isStreaming || !value.trim() || disabled) return;
    onSubmit();
  };

  const canSubmit = !isStreaming && value.trim().length > 0 && !disabled;

  return (
    <div className={`flex justify-between items-center ${className}`}>
      <div className="flex-1 flex justify-start items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            flex-1 bg-transparent border-none outline-none
            text-base font-medium font-inter min-w-0 transition-all duration-150
            ${value.trim() 
              ? 'text-black tracking-[0%]' 
              : 'text-black/40 placeholder-black/40 tracking-[-0.4%]'
            }
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
        />
      </div>
      
      <div className="flex justify-start items-center" style={{ gap: '14px' }}>
        {showCloseButton && onClose && (
          <button
            onClick={onClose}
            className="
              w-5 h-5 flex items-center justify-center
              text-black/40 hover:text-black/60
              transition-all duration-150
            "
            title="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
        
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`
            w-8 h-8 rounded-2xl p-1.5
            transition-all duration-200 flex items-center justify-center
            disabled:cursor-not-allowed
            ${canSubmit
              ? 'bg-black hover:bg-black/90' 
              : 'bg-black/5'
            }
          `}
          title={isStreaming ? "Streaming..." : canSubmit ? "Send message" : "Enter a message"}
        >
          <ArrowUpIcon className={`w-5 h-5 transition-all duration-200 ${
            canSubmit
              ? 'text-white' 
              : 'text-black/30'
          }`} />
        </button>
      </div>
    </div>
  );
};

export default ChatInput; 