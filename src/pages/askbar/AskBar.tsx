import '@src/utils/logger';
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { MemoisedMessages, useCopyMessage, ChatHeader, useConversationService, useChatInput } from '@src/components/index';
import { PortManager } from '@src/services/messaging/portManager';
import TabChipRow from '../../components/shared/TabChipRow';
import InputArea from '../../components/shared/InputArea';

export const AskBar: React.FC = () => {
  // UI-specific state (not handled by useChatInput)
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasAutoAddedCurrentTab, setHasAutoAddedCurrentTab] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [position, setPosition] = useState<string>('top-right');

  // Refs
  const askBarRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const portManager = useRef<PortManager>(PortManager.getInstance());

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();
  const conversationService = useConversationService();
  
  // Consolidated chat input hook - handles all input, tabs, dropdown logic
  const chatInput = useChatInput();

  // Chat header handlers
  const handleNewConversation = async () => {
    try {
      await conversationService.createNewConversation();
    } catch (error) {
      console.error('Sol AskBar: Failed to create new conversation:', error);
    }
  };

  const handleConversationSelect = async (conversationId: string) => {
    try {
      await conversationService.switchToConversation(conversationId);
    } catch (error) {
      console.error('Sol AskBar: Failed to switch conversation:', error);
    }
  };

  const handleExpandToSideBar = () => {
    // Send message through shadow DOM event system
    const hostElement = document.querySelector('#sol-askbar-container');
    if (hostElement) {
      hostElement.dispatchEvent(new CustomEvent('sol-shadow-message', {
        detail: { type: 'sol-open-sidebar' },
        bubbles: false,
        composed: false
      }));
    }
  };

  // Effects
  useEffect(() => {
    setIsVisible(true);
    chatInput.inputRef.current?.focus();
  }, []);

  // Initialize messaging system to receive updates from controller
  useEffect(() => {
    // For shadow DOM, we'll handle tab info through the shadow host element
    const handleShadowMessage = (event: CustomEvent) => {
      const message = event.detail;
      if (message.type === 'TAB_INFO_RESPONSE') {
        setCurrentTabId(message.tabId);
        setPageUrl(message.url);
      }
    };

    // Get the shadow host element and listen for custom events
    const shadowHost = document.querySelector('sol-overlay-container') as HTMLElement;
    if (shadowHost) {
      shadowHost.addEventListener('sol-shadow-message', handleShadowMessage as EventListener);
      
      // Request current tab info through shadow event
      shadowHost.dispatchEvent(new CustomEvent('sol-shadow-message', {
        detail: { type: 'GET_CURRENT_TAB', requestId: 'askbar-init' },
        bubbles: false,
        composed: false
      }));
    }

    return () => {
      if (shadowHost) {
        shadowHost.removeEventListener('sol-shadow-message', handleShadowMessage as EventListener);
      }
    };
  }, []);

  // Auto-add current tab when Ask Bar opens (only once)
  useEffect(() => {
    if (currentTabId && chatInput.availableTabs.length > 0 && !hasAutoAddedCurrentTab) {
      const currentTab = chatInput.availableTabs.find(tab => tab.id === currentTabId);
      if (currentTab) {
        chatInput.handleTabReAdd(currentTab);
        setHasAutoAddedCurrentTab(true);
      }
    }
  }, [currentTabId, chatInput.availableTabs, hasAutoAddedCurrentTab]);

  // Shadow DOM message handling
  useLayoutEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'sol-init') {
        // Initialize state from controller
        if (event.data.position) {
          setPosition(event.data.position);
        }
        // Apply colour-scheme so UA paints scrollbars and form controls correctly
        if (event.data.colorScheme) {
          (document.documentElement as HTMLElement).style.colorScheme = event.data.colorScheme;
          (document.documentElement as HTMLElement).style.background = 'transparent';
          (document.body as HTMLElement).style.background = 'transparent';
        }
        // Conversation state is now managed by ConversationService
        // Just expand if there are messages
        if (event.data.conversationHistory && event.data.conversationHistory.length > 0) {
          // setIsExpanded(true);
        }
      } else if (event.data?.type === 'sol-state-update') {
        // Conversation state updates are now handled by ConversationService
        // Just expand if there are messages
        if (event.data.conversationHistory && event.data.conversationHistory.length > 0) {
          // setIsExpanded(true);
        }
      } else if (event.data?.type === 'sol-trigger-close') {
        // Trigger the same close animation as the X button
        handleClose();
      }
    };

    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  // Note: Shadow DOM doesn't need pointer-events management like iframes

  const handleClose = () => {
    if (Date.now() - mountTimeRef.current < 200) return;
    
    setIsClosing(true);
    setIsVisible(false);
    
    setTimeout(() => {
      // Send message through shadow DOM event system
      const hostElement = document.querySelector('#sol-askbar-container');
      if (hostElement) {
        hostElement.dispatchEvent(new CustomEvent('sol-shadow-message', {
          detail: { type: 'sol-close-askbar' },
          bubbles: false,
          composed: false
        }));
      }
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  const getPositionClasses = (pos: string) => {
    switch (pos) {
      case 'top-left': return 'top-4 left-4 origin-top-left';
      case 'top-right': return 'top-4 right-4 origin-top-right';
      case 'bottom-left': return 'bottom-4 left-4 origin-bottom-left';
      case 'bottom-right': return 'bottom-4 right-4 origin-bottom-right';
      default: return 'top-4 right-4 origin-top-right';
    }
  };

  return (
    <div 
      ref={askBarRef}
      className={`fixed z-[2147483647] transition-all duration-300 ease-in-out sol-font-inter ${getPositionClasses(position)}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible && !isClosing ? 1 : 0.9}) translateY(${isVisible && !isClosing ? 0 : 10}px)`,
        maxWidth: '90vw',
        maxHeight: '90vh'
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="w-[436px] h-[600px] bg-white/80 backdrop-blur-lg rounded-[28px] border border-black/10 transition-all duration-300 ease-in-out sol-conversation-shadow sol-font-inter flex flex-col"
      >

        {/* Chat Header - fixed at top */}
        <div className="flex-shrink-0 p-4">
          <ChatHeader
            conversations={conversationService.conversations}
            activeConversationId={conversationService.activeConversationId}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            showExpandButton={true}
            onExpand={handleExpandToSideBar}
            disableNewButton={chatInput.isStreaming}
            showCloseButton={true}
            onClose={handleClose}
          />
        </div>

        {/* Conversation Messages - flex-grow with internal scroll */}
        <div className="flex-grow overflow-hidden px-[14px] pb-2 sol-fade-mask">
          <div className="h-full overflow-y-auto">
            <MemoisedMessages
              messages={conversationService.messages}
              copiedMessageIndex={copiedMessageIndex}
              onCopyMessage={handleCopyMessage}
              isStreaming={chatInput.isStreaming}
              availableTabs={chatInput.availableTabs}
              onTabReAdd={chatInput.handleTabReAdd}
              activeConversationId={conversationService.activeConversationId}
              className="mt-4"
            />
          </div>
        </div>

        {/* Input Area - fixed at bottom */}
        <div className="flex-shrink-0 p-2">
          <div 
            className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow sol-font-inter w-full bg-white"
          >
            <div className="w-full overflow-hidden">
              <TabChipRow tabs={chatInput.selectedTabChips} onRemove={chatInput.handleTabRemoveById} />
            </div>
            <div className="pt-2 pl-4 pr-4 pb-4">
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

export default AskBar; 
