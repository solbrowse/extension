import "@src/utils/logger";
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  MemoisedMessages,
  useCopyMessage,
  ChatHeader,
  useConversationService,
  useChatInput,
} from "@src/components/index";
import { PortManager } from "@src/services/messaging/portManager";
import {
  IframeCloseMsg,
  IframeGetCurrentTabMsg,
  IframeCurrentTabResponseMsg,
} from "@src/types/messaging";
import TabChipRow from "../../components/shared/TabChipRow";
import InputArea from "../../components/shared/InputArea";

export const AskBar: React.FC = () => {
  // UI-specific state (not handled by useChatInput)
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasAutoAddedCurrentTab, setHasAutoAddedCurrentTab] = useState(false);
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState<string>("");
  const [position, setPosition] = useState<string>("top-right");

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
      console.error("Sol AskBar: Failed to create new conversation:", error);
    }
  };

  const handleConversationSelect = async (conversationId: string) => {
    try {
      await conversationService.switchToConversation(conversationId);
    } catch (error) {
      console.error("Sol AskBar: Failed to switch conversation:", error);
    }
  };

  const handleExpandToSideBar = () => {
    // Send message to parent window to open SideBar
    window.parent.postMessage(
      {
        type: "sol-open-sidebar",
      },
      "*",
    );
  };

  // Effects
  useEffect(() => {
    setIsVisible(true);
    chatInput.inputRef.current?.focus();
  }, []);

  // Initialize messaging system to receive updates from controller
  useEffect(() => {
    const cleanupTabHandler =
      portManager.current.addIframeHandler<IframeCurrentTabResponseMsg>(
        "IFRAME_CURRENT_TAB_RESPONSE",
        (message) => {
          setCurrentTabId(message.tabId);
          setPageUrl(message.url);
        },
      );

    const getCurrentTabMsg: IframeGetCurrentTabMsg = {
      type: "IFRAME_GET_CURRENT_TAB",
    };
    portManager.current.sendToParent(getCurrentTabMsg);

    return () => {
      cleanupTabHandler();
    };
  }, []);

  // Auto-add current tab when Ask Bar opens (only once)
  useEffect(() => {
    if (
      currentTabId &&
      chatInput.availableTabs.length > 0 &&
      !hasAutoAddedCurrentTab
    ) {
      const currentTab = chatInput.availableTabs.find(
        (tab) => tab.id === currentTabId,
      );
      if (currentTab) {
        chatInput.handleTabReAdd(currentTab);
        setHasAutoAddedCurrentTab(true);
      }
    }
  }, [currentTabId, chatInput.availableTabs, hasAutoAddedCurrentTab]);

  // Expand once first message sent
  useEffect(() => {
    if (conversationService.messages.length > 0) {
      setIsExpanded(true);
    }
  }, [conversationService.messages.length]);

  // Position and resize logic (UI-specific)
  useLayoutEffect(() => {
    const sendBounds = () => {
      if (askBarRef.current) {
        const rect = askBarRef.current.getBoundingClientRect();
        window.parent.postMessage(
          {
            type: "sol-askbar-bounds",
            bounds: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          },
          "*",
        );
      }
    };

    const observer = new ResizeObserver(sendBounds);
    if (askBarRef.current) {
      observer.observe(askBarRef.current);
    }

    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === "sol-request-askbar-bounds") {
        sendBounds();
      } else if (event.data?.type === "sol-init") {
        // Initialize state from controller
        if (event.data.position) {
          setPosition(event.data.position);
        }
        // Apply colour-scheme so UA paints scrollbars and form controls correctly
        if (event.data.colorScheme) {
          (document.documentElement as HTMLElement).style.colorScheme =
            event.data.colorScheme;
          (document.documentElement as HTMLElement).style.background =
            "transparent";
          (document.body as HTMLElement).style.background = "transparent";
        }
        // Conversation state is now managed by ConversationService
        // Just expand if there are messages
        if (
          event.data.conversationHistory &&
          event.data.conversationHistory.length > 0
        ) {
          setIsExpanded(true);
        }
      } else if (event.data?.type === "sol-state-update") {
        // Conversation state updates are now handled by ConversationService
        // Just expand if there are messages
        if (
          event.data.conversationHistory &&
          event.data.conversationHistory.length > 0
        ) {
          setIsExpanded(true);
        }
      } else if (event.data?.type === "sol-trigger-close") {
        // Trigger the same close animation as the X button
        handleClose();
      }
    };

    window.addEventListener("message", messageHandler);
    sendBounds();
    setTimeout(sendBounds, 100);

    return () => {
      observer.disconnect();
      window.removeEventListener("message", messageHandler);
    };
  }, [isExpanded, conversationService.messages.length]);

  // Mouse interaction handlers for pointer events (UI-specific)
  useLayoutEffect(() => {
    const handleEnter = () => {
      window.parent.postMessage(
        { type: "sol-pointer-lock", enabled: true },
        "*",
      );
    };

    const handleLeave = () => {
      window.parent.postMessage(
        { type: "sol-pointer-lock", enabled: false },
        "*",
      );
    };

    const askBar = askBarRef.current;
    if (askBar) {
      askBar.addEventListener("mouseenter", handleEnter);
      askBar.addEventListener("mouseleave", handleLeave);
      return () => {
        askBar.removeEventListener("mouseenter", handleEnter);
        askBar.removeEventListener("mouseleave", handleLeave);
      };
    }
  }, []);

  const handleClose = () => {
    if (Date.now() - mountTimeRef.current < 200) return;

    setIsClosing(true);
    setIsVisible(false);

    setTimeout(() => {
      // Use direct message like expand button instead of portManager
      window.parent.postMessage(
        {
          type: "sol-close-askbar",
        },
        "*",
      );
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  const getPositionClasses = (pos: string) => {
    switch (pos) {
      case "top-left":
        return "top-4 left-4 origin-top-left";
      case "top-right":
        return "top-4 right-4 origin-top-right";
      case "bottom-left":
        return "bottom-4 left-4 origin-bottom-left";
      case "bottom-right":
        return "bottom-4 right-4 origin-bottom-right";
      default:
        return "top-4 right-4 origin-top-right";
    }
  };

  return (
    <div
      ref={askBarRef}
      className={`fixed z-[2147483647] transition-all duration-300 ease-in-out sol-font-inter ${getPositionClasses(position)}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `scale(${isVisible && !isClosing ? 1 : 0.9}) translateY(${isVisible && !isClosing ? 0 : 10}px)`,
        maxWidth: "90vw",
        maxHeight: "90vh",
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {isExpanded ? (
        // Expanded Mode - Full Conversation Container with proper flexbox
        <div
          className="backdrop-blur-[16px] rounded-[28px] border-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out sol-conversation-shadow sol-font-inter flex flex-col"
          style={{
            width: "436px",
            height: "600px", // Fixed height instead of auto
            backgroundColor: "rgba(255, 255, 255, 0.8)",
          }}
        >
          <div className="p-2 flex-shrink-0"></div>

          {/* Chat Header - fixed at top */}
          <div className="flex-shrink-0">
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
          <div className="flex-grow overflow-hidden px-[14px] pb-0 sol-fade-mask">
            <div className="h-full overflow-y-auto">
              <MemoisedMessages
                messages={conversationService.messages}
                copiedMessageIndex={copiedMessageIndex}
                onCopyMessage={handleCopyMessage}
                isStreaming={chatInput.isStreaming}
                availableTabs={chatInput.availableTabs}
                onTabReAdd={chatInput.handleTabReAdd}
                activeConversationId={conversationService.activeConversationId}
              />
            </div>
          </div>

          {/* Input Area - fixed at bottom */}
          <div className="flex-shrink-0 p-2 pt-0">
            <div
              className="rounded-[20px] border-[0.5px] border-black/[0.07] sol-input-shadow sol-font-inter overflow-hidden"
              style={{
                width: "420px",
                maxWidth: "420px",
                backgroundColor: "white",
              }}
            >
              <div style={{ maxWidth: "420px", overflow: "hidden" }}>
                <TabChipRow
                  tabs={chatInput.selectedTabChips}
                  onRemove={chatInput.handleTabRemoveById}
                />
              </div>

              <div
                style={{
                  paddingTop:
                    chatInput.selectedTabChips.length > 0 ? "8px" : "16px",
                  paddingLeft: "16px",
                  paddingRight: "14px",
                  paddingBottom: "14px",
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
                  <div className="mt-2 text-red-600 text-sm">
                    {chatInput.error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-[20px] border-[0.5px] border-black/[0.07] transition-all duration-300 ease-in-out transform sol-input-shadow-large sol-font-inter overflow-hidden"
          style={{
            width: "420px",
            maxWidth: "420px",
            backgroundColor: "white",
          }}
        >
          <div style={{ maxWidth: "420px", overflow: "hidden" }}>
            <TabChipRow
              tabs={chatInput.selectedTabChips}
              onRemove={chatInput.handleTabRemoveById}
            />
          </div>

          <div
            style={{
              paddingTop:
                chatInput.selectedTabChips.length > 0 ? "8px" : "16px",
              paddingLeft: "16px",
              paddingRight: "14px",
              paddingBottom: "14px",
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
            />
            {chatInput.error && (
              <div className="mt-2 text-red-600 text-sm">{chatInput.error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AskBar;
