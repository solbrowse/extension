import '@src/utils/logger';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export const SideBar: React.FC = () => {
  // UI-specific state
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [position, setPosition] = useState<string>('left');

  // Refs
  const sideBarRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());
  
  // Effects
  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Position logic
  useLayoutEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'sol-init') {
        if (event.data.position) {
          setPosition(event.data.position);
        }
        if (event.data.colorScheme) {
          (document.documentElement as HTMLElement).style.colorScheme = event.data.colorScheme;
          (document.documentElement as HTMLElement).style.background = 'transparent';
          (document.body as HTMLElement).style.background = 'transparent';
        }
      } else if (event.data?.type === 'sol-trigger-close') {
        handleClose();
      }
    };

    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  const handleClose = () => {
    if (Date.now() - mountTimeRef.current < 200) return;
    
    setIsClosing(true);
    setIsVisible(false);
    
    setTimeout(() => {
      // Send message through shadow DOM event system
      const hostElement = document.querySelector('#sol-sidebar-container');
      if (hostElement) {
        hostElement.dispatchEvent(new CustomEvent('sol-shadow-message', {
          detail: { type: 'sol-close-sidebar' },
          bubbles: false,
          composed: false
        }));
      }
    }, 300);
  };

  const getPositionClasses = (pos: string) => {
    switch (pos) {
      case 'left': return 'left-0 top-0 origin-left';
      case 'right': return 'right-0 top-0 origin-right';
      default: return 'left-0 top-0 origin-left';
    }
  };

  return (
    <div 
      ref={sideBarRef}
      className={`fixed z-[2147483647] h-screen transition-all duration-300 ease-in-out sol-font-inter ${getPositionClasses(position)}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible && !isClosing ? 1 : 0.95}) translateX(${isVisible && !isClosing ? 0 : position === 'left' ? '-20px' : '20px'})`,
        width: '300px'
      }}
      tabIndex={0}
    >
      <div 
        className="h-full backdrop-blur-[16px] border-r-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out sol-conversation-shadow sol-font-inter flex flex-col relative"
        style={{ 
          backgroundColor: 'rgba(255, 255, 255, 0.8)'
        }}
      >
        {/* X button at top right */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-black/5 transition-colors z-10"
        >
          <XMarkIcon className="w-6 h-6 text-gray-600" />
        </button>

        {/* Coming Soon Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-black" style={{ opacity: 0.5 }}>Coming Soon</h2>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SideBar; 