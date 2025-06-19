# Sol AI Components Library

A collection of reusable React components and hooks for building AI chat interfaces in the Sol extension.

## 🧩 Components

### `MessageRenderer`

Renders markdown content with consistent styling.

```tsx
import { MessageRenderer } from "@src/components";

<MessageRenderer content="**Hello** world!" className="my-custom-class" />;
```

### `CopyButton`

A button with copy-to-clipboard functionality and visual feedback.

```tsx
import { CopyButton } from "@src/components";

<CopyButton
  content="Text to copy"
  onCopy={(content) => console.log("Copied:", content)}
  isCopied={false}
  size="md"
/>;
```

### `MessageItem`

Individual message component for both user and assistant messages.

```tsx
import { MessageItem } from "@src/components";

<MessageItem
  message={message}
  index={0}
  isStreaming={false}
  copiedMessageIndex={null}
  onCopy={(content, index) => handleCopy(content, index)}
/>;
```

### `ConversationList`

Scrollable list of messages with auto-scroll functionality.

```tsx
import { ConversationList } from "@src/components";

<ConversationList
  messages={conversationHistory}
  isStreaming={isStreaming}
  copiedMessageIndex={copiedMessageIndex}
  onCopyMessage={handleCopyMessage}
  autoScroll={true}
/>;
```

### `ChatInput`

Input field with submit button and keyboard shortcuts.

```tsx
import { ChatInput } from "@src/components";

<ChatInput
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  onClose={handleClose}
  placeholder="Ask a question..."
  isStreaming={isStreaming}
/>;
```

## 🪝 Hooks

### `useCopyMessage`

Manages copy-to-clipboard functionality with timeout.

```tsx
import { useCopyMessage } from "@src/components";

const { copiedMessageIndex, handleCopyMessage, resetCopyState } =
  useCopyMessage(2000);
```

### `useConversationStorage`

Handles automatic conversation persistence to storage.

```tsx
import { useConversationStorage } from "@src/components";

useConversationStorage(
  conversationHistory,
  currentConversationId,
  setCurrentConversationId,
  pageUrl
);
```

### `useStreamingChat`

Manages streaming chat functionality with the background script.

```tsx
import { useStreamingChat } from "@src/components";

const { isStreaming, handleSubmit } = useStreamingChat({
  conversationHistory,
  setConversationHistory,
  scrapedContent,
  pageUrl,
  pageTitle,
  onConversationStart: () => setIsExpanded(true),
});
```

## 🏗️ Usage Example

See `src/components/examples/RefactoredAskBar.tsx` for a complete implementation that uses all components together.

```tsx
import {
  ConversationList,
  ChatInput,
  useCopyMessage,
  useConversationStorage,
  useStreamingChat,
} from "@src/components";

// Your component implementation...
```

## 🎨 Benefits

- **Reusable**: Components work in both AskBar and Sidebar
- **Consistent**: Unified styling and behavior
- **Maintainable**: Single source of truth for each feature
- **Type-safe**: Full TypeScript support
- **Testable**: Easy to unit test individual components

## 🔄 Migration Guide

To migrate existing code:

1. Replace custom message rendering with `MessageRenderer`
2. Replace copy buttons with `CopyButton`
3. Replace message lists with `ConversationList`
4. Replace input areas with `ChatInput`
5. Extract streaming logic using `useStreamingChat`
6. Extract copy logic using `useCopyMessage`
7. Extract storage logic using `useConversationStorage`

This modular approach makes it easy to build new AI interfaces while maintaining consistency across the extension.
