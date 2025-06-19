import { useState, useCallback } from 'react';

export const useCopyMessage = (timeout: number = 2000) => {
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);

  const handleCopyMessage = useCallback(async (content: string, messageIndex: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(messageIndex);
      setTimeout(() => setCopiedMessageIndex(null), timeout);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }, [timeout]);

  const resetCopyState = useCallback(() => {
    setCopiedMessageIndex(null);
  }, []);

  return {
    copiedMessageIndex,
    handleCopyMessage,
    resetCopyState
  };
};

export default useCopyMessage; 