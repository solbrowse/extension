import '@src/utils/logger';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ConversationList, useCopyMessage, ChatHeader, useConversationService, useChatInput } from '@src/components/index';
import { PortManager } from '@src/services/messaging/portManager';
import { IframeCloseMsg, IframeGetCurrentTabMsg, IframeCurrentTabResponseMsg } from '@src/types/messaging';
import TabChipRow from '../../components/shared/TabChipRow';
import InputArea from '../../components/shared/InputArea';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@src/hooks/useTheme';

export const SideBar: React.FC = () => {
  // UI-specific state
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [position, setPosition] = useState<string>('left');

  // Refs
  const sideBarRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const portManager = useRef<PortManager>(PortManager.getInstance());

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();
  const conversationService = useConversationService();
  const { isDarkMode } = useTheme();
  
  // Consolidated chat input hook - handles all input, tabs, dropdown logic
  const chatInput = useChatInput();

  // Chat header handlers
  const handleNewConversation = async () => {
    try {
      await conversationService.createNewConversation();
    } catch (error) {
      console.error('Sol SideBar: Failed to create new conversation:', error);
    }
  };

  const handleConversationSelect = async (conversationId: string) => {
    try {
      await conversationService.switchToConversation(conversationId);
    } catch (error) {
      console.error('Sol SideBar: Failed to switch conversation:', error);
    }
  };

  // Effects
  useEffect(() => {
    setIsVisible(true);
    chatInput.inputRef.current?.focus();
  }, []);

  // Initialize messaging system
  useEffect(() => {
    const cleanupTabHandler = portManager.current.addIframeHandler<IframeCurrentTabResponseMsg>('IFRAME_CURRENT_TAB_RESPONSE', (message) => {
      setCurrentTabId(message.tabId);
      setPageUrl(message.url);
    });

    const getCurrentTabMsg: IframeGetCurrentTabMsg = { type: 'IFRAME_GET_CURRENT_TAB' };
    portManager.current.sendToParent(getCurrentTabMsg);

    return () => {
      cleanupTabHandler();
    };
  }, []);

  // Position and resize logic
  useLayoutEffect(() => {
    const sendBounds = () => {
      if (sideBarRef.current) {
        const rect = sideBarRef.current.getBoundingClientRect();
        window.parent.postMessage({
          type: 'sol-sidebar-bounds',
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          }
        }, '*');
      }
    };

    const observer = new ResizeObserver(sendBounds);
    if (sideBarRef.current) {
      observer.observe(sideBarRef.current);
    }

    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'sol-request-sidebar-bounds') {
        sendBounds();
      } else if (event.data?.type === 'sol-init') {
        if (event.data.position) {
          setPosition(event.data.position);
        }
      } else if (event.data?.type === 'sol-trigger-close') {
        handleClose();
      }
    };

    window.addEventListener('message', messageHandler);
    sendBounds();
    setTimeout(sendBounds, 100);

    return () => {
      observer.disconnect();
      window.removeEventListener('message', messageHandler);
    };
  }, [conversationService.messages.length]);

  const handleClose = () => {
    if (Date.now() - mountTimeRef.current < 200) return;
    
    setIsClosing(true);
    setIsVisible(false);
    
    setTimeout(() => {
      const closeMsg: IframeCloseMsg = { type: 'IFRAME_CLOSE' };
      portManager.current.sendToParent(closeMsg);
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
        width: '436px'
      }}
      tabIndex={0}
    >
      <div 
        className={`h-full backdrop-blur-[16px] border-r-[0.5px] ${isDarkMode ? 'border-white/10' : 'border-black/[0.07]'} transition-all duration-300 ease-in-out sol-conversation-shadow sol-font-inter flex flex-col`}
        style={{ 
          backgroundColor: isDarkMode ? 'rgba(31, 41, 55, 0.8)' : 'rgba(255, 255, 255, 0.8)'
        }}
      >
        {/* Header with close button */}
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-white/10' : 'border-black/[0.07]'}`}>
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-600"></div>
            <span className={`font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Sol Assistant</span>
          </div>
          <button
            onClick={handleClose}
            className={`p-1 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
          >
            <XMarkIcon className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        </div>

        {/* Chat Header */}
        <div className="px-4 pt-4">
          <ChatHeader
            conversations={conversationService.conversations}
            activeConversationId={conversationService.activeConversationId}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            showExpandButton={false}
            disableNewButton={chatInput.isStreaming}
          />
        </div>

        {/* Conversation Messages */}
        <div className="flex-1 px-4 py-2 overflow-y-auto">
          <ConversationList
            messages={conversationService.messages}
            copiedMessageIndex={copiedMessageIndex}
            onCopyMessage={handleCopyMessage}
            isStreaming={chatInput.isStreaming}
            availableTabs={chatInput.availableTabs}
            onTabReAdd={chatInput.handleTabReAdd}
          />
        </div>

        {/* Input Area */}
        <div className="p-4">
          <div 
            className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow sol-font-inter"
            style={{ 
              backgroundColor: 'white'
            }}
          >
            <TabChipRow tabs={chatInput.selectedTabChips} onRemove={chatInput.handleTabRemoveById} />

            <div
              style={{
                paddingTop: chatInput.selectedTabChips.length > 0 ? '8px' : '16px',
                paddingLeft: '16px',
                paddingRight: '14px',
                paddingBottom: '14px'
              }}
            >
              <InputArea
                input={chatInput.input}
                onInputChange={chatInput.handleInputChange}
                onInputKeyDown={chatInput.handleInputKeyDown}
                inputRef={chatInput.inputRef}
                showDropdown={chatInput.showDropdown}
                filteredTabs={chatInput.filteredTabs}
                dropdownSelectedIndex={chatInput.dropdownSelectedIndex}
                insertTabMention={chatInput.insertTabMention as any}
                dropdownRef={chatInput.dropdownRef}
                setDropdownSelectedIndex={chatInput.setDropdownSelectedIndex}
                truncateTitle={chatInput.truncateTitle}
                searchTerm={chatInput.searchTerm}
                onClose={handleClose}
                onSubmit={chatInput.handleSubmit}
                isStreaming={chatInput.isStreaming}
                showCloseButton={false}
              />
              {chatInput.error && (
                <div className="mt-2 text-red-600 text-sm">{chatInput.error}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SideBar; 