import { useRef, useEffect, useCallback } from 'react';

interface UseStickToBottomOptions {
  enabled?: boolean;
  threshold?: number; // pixels from bottom to consider "at bottom"
  behavior?: ScrollBehavior;
}

interface UseStickToBottomReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
  setEnabled: (enabled: boolean) => void;
}

export function useStickToBottom(
  options: UseStickToBottomOptions = {}
): UseStickToBottomReturn {
  const {
    enabled = true,
    threshold = 100,
    behavior = 'smooth'
  } = options;

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const enabledRef = useRef(enabled);
  const lastScrollTime = useRef(0);

  // Update enabled state
  const setEnabled = useCallback((newEnabled: boolean) => {
    enabledRef.current = newEnabled;
  }, []);

  // Check if we're at the bottom
  const checkIfAtBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return false;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, [threshold]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollTo({
      top: element.scrollHeight,
      behavior
    });
    isAtBottomRef.current = true;
  }, [behavior]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTime.current;
    
    // Throttle scroll checks to 16ms (60fps)
    if (timeSinceLastScroll < 16) return;
    
    lastScrollTime.current = now;
    isAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  // Auto-scroll on content changes
  useEffect(() => {
    if (!enabledRef.current || !isAtBottomRef.current) return;

    const element = scrollRef.current;
    if (!element) return;

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  });

  // Set up scroll listener
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Initialize bottom state
  useEffect(() => {
    isAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  return {
    scrollRef,
    isAtBottom: isAtBottomRef.current,
    scrollToBottom,
    setEnabled
  };
} 