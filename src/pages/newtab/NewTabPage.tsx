import '@src/utils/logger';
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useCopyMessage, ChatHeader, useConversationService, useChatInput } from '@src/components/index';
import { MemoisedMessages } from '@src/components/shared/MemoisedMessages';
import TabChipRow from '../../components/shared/TabChipRow';
import InputArea from '../../components/shared/InputArea';

export const NewTabPage: React.FC = () => {
  const [isConversationMode, setIsConversationMode] = useState(false);

  // Custom hooks
  const { copiedMessageIndex, handleCopyMessage } = useCopyMessage();
  const conversationService = useConversationService();
  
  // Consolidated chat input hook - handles all input, tabs, dropdown logic
  const chatInput = useChatInput();

  // Switch to conversation mode when we have messages
  useEffect(() => {
    const hasMessages = conversationService.messages.length > 0;
    setIsConversationMode(hasMessages);
  }, [conversationService.messages.length]);

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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8 sol-font-inter relative">

        {/* History / New Conversation header (top-left) */}
        <div className="absolute top-4 left-4">
          <ChatHeader
            conversations={conversationService.conversations}
            activeConversationId={conversationService.activeConversationId}
            onConversationSelect={handleConversationSelect}
            onNewConversation={handleNewConversation}
            showExpandButton={false}
            disableNewButton={chatInput.isStreaming}
          />
        </div>

        <div className="w-full max-w-3xl min-w-[480px]">
          {/* Input container */}
          <div 
            className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow-large sol-font-inter w-full"
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
                  onClose={() => {}}
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
    );
  }

  // Conversation mode (full chat interface)
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col sol-font-inter">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-black/[0.07] p-4 sticky top-0 left-0 z-50">
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

      {/* Messages Area */}
      <div 
        className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full pb-32"
      >
        <MemoisedMessages
          messages={conversationService.messages}
          copiedMessageIndex={copiedMessageIndex}
          onCopyMessage={(content: string, index: number) => handleCopyMessage(content, index)}
          isStreaming={chatInput.isStreaming}
          availableTabs={chatInput.availableTabs}
          onTabReAdd={chatInput.handleTabReAdd}
          activeConversationId={conversationService.activeConversationId}
        />
      </div>

      {/* Sticky Bottom Navbar with Input */}
      <div className="sticky bottom-0 left-0 right-0 p-6 bg-transparent">
        <div className="max-w-4xl mx-auto">
          <div 
            className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow sol-font-inter bg-white"
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
                <div className="mt-2 text-red-600 text-sm">{chatInput.error}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewTabPage; 