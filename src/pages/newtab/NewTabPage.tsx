import '@src/utils/logger';
import React, { useState, useEffect } from 'react';
import { useCopyMessage, ChatHeader, useConversationService, useChatInput } from '@src/components/index';
import { MemoisedMessages } from '@src/components/chat/MemoisedMessages';
import { useStickToBottom } from '@src/components/hooks/useStickToBottom';
import TabChipRow from '../../components/shared/TabChipRow';
import InputArea from '../../components/shared/InputArea';
import { useTheme } from '@src/hooks/useTheme';

export const NewTabPage: React.FC = () => {
  const [isConversationMode, setIsConversationMode] = useState(false);

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();
  const conversationService = useConversationService();
  const { isDarkMode } = useTheme();
  
  // Consolidated chat input hook - handles all input, tabs, dropdown logic
  const chatInput = useChatInput();

  // Scroll management for conversation mode
  const { scrollRef, scrollToBottom } = useStickToBottom({
    enabled: isConversationMode,
    threshold: 100,
    behavior: 'smooth'
  });

  // Switch to conversation mode when we have messages
  useEffect(() => {
    const hasMessages = conversationService.messages.length > 0;
    setIsConversationMode(hasMessages);
  }, [conversationService.messages.length]);

  // Auto-scroll when new messages arrive or streaming updates
  useEffect(() => {
    if (isConversationMode && (conversationService.messages.length > 0 || chatInput.isStreaming)) {
      scrollToBottom();
    }
  }, [conversationService.messages.length, chatInput.isStreaming, isConversationMode, scrollToBottom]);

  // Chat header handlers
  const handleNewConversation = async () => {
    try {
      await conversationService.createNewConversation();
    } catch (error) {
      console.error('Sol NewTab: Failed to create new conversation:', error);
    }
  };

  const handleConversationSelect = async (conversationId: string) => {
    try {
      await conversationService.switchToConversation(conversationId);
    } catch (error) {
      console.error('Sol NewTab: Failed to switch conversation:', error);
    }
  };

  // Effects
  useEffect(() => {
    chatInput.inputRef.current?.focus();
  }, []);

  // Centered input mode (when no conversation)
  if (!isConversationMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8 sol-font-inter">
        <div className="w-full max-w-3xl min-w-[480px]">
          {/* Input container */}
          <div 
            className="rounded-[20px] border-[0.5px] border-black/[0.07] dark:border-white/[0.08] sol-input-shadow-large sol-font-inter w-full bg-white dark:bg-gray-800"
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
                  onClose={() => {}}
                  onSubmit={chatInput.handleSubmit}
                  isStreaming={chatInput.isStreaming}
                  showCloseButton={false}
                />
              {chatInput.error && (
                <div className="mt-2 text-red-600 dark:text-red-400 text-sm">{chatInput.error}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Conversation mode (full chat interface)
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex flex-col sol-font-inter">
      {/* Header */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-black/[0.07] dark:border-white/[0.08] p-4 relative z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <ChatHeader
            conversations={conversationService.conversations}
            activeConversationId={conversationService.activeConversationId}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            showExpandButton={false}
            disableNewButton={chatInput.isStreaming}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-6">
        {/* Conversation Messages with optimized rendering */}
        <div 
          ref={scrollRef}
          className="flex-1 mb-6 overflow-y-auto"
        >
          <MemoisedMessages
            messages={conversationService.messages}
            copiedMessageIndex={copiedMessageIndex}
            onCopyMessage={(content: string, index: number) => handleCopyMessage(content, index)}
            isStreaming={chatInput.isStreaming}
            availableTabs={chatInput.availableTabs}
            onTabReAdd={chatInput.handleTabReAdd}
          />
        </div>

        {/* Input Area */}
        <div className="sticky bottom-0">
          <div 
            className="rounded-[20px] border-[0.5px] border-black/[0.07] dark:border-white/[0.08] sol-input-shadow sol-font-inter bg-white dark:bg-gray-800"
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
                onClose={() => {}}
                onSubmit={chatInput.handleSubmit}
                isStreaming={chatInput.isStreaming}
                showCloseButton={false}
              />
              {chatInput.error && (
                <div className="mt-2 text-red-600 dark:text-red-400 text-sm">{chatInput.error}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewTabPage; 